import crypto from 'crypto';
import { Repository } from 'typeorm';
import { BasicUser, UserType } from '@/models/BasicUser';
import { AppDataSource } from '@/config/database';
import { passwordService } from '@/utils/password';
import { jwtService } from '@/utils/jwt';
import { redisClient } from '@/config/redis';
import logger from '@/config/logger';
import { JwtPayload } from '@/types';
import emailService from '@/services/EmailService';

export class UserService {
  private userRepository: Repository<BasicUser>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(BasicUser);
  }

  async createUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    userType: UserType;
  }): Promise<BasicUser> {
    try {
      const existingUser = await this.userRepository.findOne({
        where: { email: userData.email },
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const hashedPassword = await passwordService.hash(userData.password);

      const user = this.userRepository.create({
        ...userData,
        password: hashedPassword,
      });

      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = verificationToken;
      user.emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const savedUser = await this.userRepository.save(user);
      logger.info(`User created successfully: ${savedUser.id}`);

      // Fire-and-forget — a broken mail server should not fail registration
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const verificationUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
      emailService.sendEmailVerification(savedUser.email, {
        name: savedUser.firstName,
        verificationUrl,
        code: verificationToken.slice(0, 6).toUpperCase(),
      }).catch((err) => logger.warn('Failed to send verification email:', err));

      return savedUser;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  async authenticateUser(
    email: string,
    password: string
  ): Promise<{
    user: BasicUser;
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      const user = await this.userRepository.findOne({
        where: { email },
        select: [
          'id',
          'email',
          'password',
          'firstName',
          'lastName',
          'userType',
          'phone',
          'isActive',
          'isVerified',
          'createdAt',
          'updatedAt',
        ],
      });

      if (!user) {
        throw new Error('Invalid credentials');
      }

      if (!user.isActive) {
        throw new Error('Your account has been suspended. Please contact support.');
      }

      if (!user.isVerified) {
        const err = new Error('EMAIL_NOT_VERIFIED');
        (err as any).email = email;
        throw err;
      }

      const isPasswordValid = await passwordService.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
        userId: user.id,
        id: user.id,
        email: user.email,
        userType: user.userType,
      };

      const { accessToken, refreshToken } = jwtService.generateTokens(tokenPayload);

      // Note: lastLogin field not available in BasicUser

      if (process.env.REDIS_ENABLED === 'true') {
        await redisClient.setJson(
          `user:${user.id}:session`,
          {
            userId: user.id,
            lastActivity: new Date(),
          },
          24 * 60 * 60
        ); // 24 hours
      }

      logger.info(`User authenticated successfully: ${user.id}`);

      return { user, accessToken, refreshToken };
    } catch (error) {
      logger.error('Error authenticating user:', error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<BasicUser | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id, isActive: true },
      });

      return user;
    } catch (error) {
      logger.error('Error fetching user by ID:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<BasicUser | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { email, isActive: true },
      });

      return user;
    } catch (error) {
      logger.error('Error fetching user by email:', error);
      throw error;
    }
  }

  async updateUser(id: string, updates: Partial<BasicUser>): Promise<BasicUser> {
    try {
      const user = await this.getUserById(id);
      if (!user) {
        throw new Error('User not found');
      }

      const allowedUpdates = ['firstName', 'lastName', 'phone', 'profileImage', 'settings'];

      const sanitizedUpdates: any = {};
      Object.keys(updates).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          sanitizedUpdates[key] = (updates as any)[key];
        }
      });

      await this.userRepository.update(id, sanitizedUpdates);
      const updatedUser = await this.getUserById(id);

      logger.info(`User updated successfully: ${id}`);
      return updatedUser!;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { id },
        select: ['id', 'password'],
      });

      if (!user) {
        throw new Error('User not found');
      }

      const isCurrentPasswordValid = await passwordService.compare(currentPassword, user.password);

      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      const hashedNewPassword = await passwordService.hash(newPassword);

      await this.userRepository.update(id, {
        password: hashedNewPassword,
      });

      if (process.env.REDIS_ENABLED === 'true') {
        await redisClient.del(`user:${id}:session`);
      }

      logger.info(`Password changed successfully for user: ${id}`);
    } catch (error) {
      logger.error('Error changing password:', error);
      throw error;
    }
  }

  async deactivateUser(id: string): Promise<void> {
    try {
      const user = await this.getUserById(id);
      if (!user) {
        throw new Error('User not found');
      }

      await this.userRepository.update(id, {
        isActive: false,
      });

      if (process.env.REDIS_ENABLED === 'true') {
        await redisClient.del(`user:${id}:session`);
      }

      logger.info(`User deactivated successfully: ${id}`);
    } catch (error) {
      logger.error('Error deactivating user:', error);
      throw error;
    }
  }

  async verifyUser(id: string): Promise<void> {
    try {
      const user = await this.getUserById(id);
      if (!user) {
        throw new Error('User not found');
      }

      await this.userRepository.update(id, {
        isVerified: true,
      });

      logger.info(`User verified successfully: ${id}`);
    } catch (error) {
      logger.error('Error verifying user:', error);
      throw error;
    }
  }

  async refreshToken(userId: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
        userId: user.id,
        id: user.id,
        email: user.email,
        userType: user.userType,
      };

      const tokens = jwtService.generateTokens(tokenPayload);

      if (process.env.REDIS_ENABLED === 'true') {
        await redisClient.setJson(
          `user:${user.id}:session`,
          {
            userId: user.id,
            lastActivity: new Date(),
          },
          24 * 60 * 60
        );
      }

      logger.info(`Token refreshed successfully for user: ${userId}`);
      return tokens;
    } catch (error) {
      logger.error('Error refreshing token:', error);
      throw error;
    }
  }

  async logout(userId: string, token: string): Promise<void> {
    try {
      if (process.env.REDIS_ENABLED === 'true') {
        await redisClient.del(`user:${userId}:session`);

        const payload = jwtService.decodeToken(token);
        if (payload && payload.exp) {
          const ttl = payload.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            await redisClient.set(`blacklist:${token}`, '1', ttl);
          }
        }
      }

      logger.info(`User logged out successfully: ${userId}`);
    } catch (error) {
      logger.error('Error logging out user:', error);
      throw error;
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      throw new Error('Verification token has expired. Please request a new one.');
    }

    await this.userRepository.update(user.id, {
      isVerified: true,
      emailVerificationToken: undefined,
      emailVerificationExpiry: undefined,
    });

    logger.info(`Email verified for user: ${user.id}`);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      // Don't reveal whether the email exists
      return;
    }

    if (user.isVerified) {
      throw new Error('Email is already verified');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await this.userRepository.update(user.id, {
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const verificationUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
    await emailService.sendEmailVerification(user.email, {
      name: user.firstName,
      verificationUrl,
      code: verificationToken.slice(0, 6).toUpperCase(),
    });

    logger.info(`Verification email resent to: ${email}`);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    // Always succeed silently — don't reveal whether email exists
    if (!user) return;

    const token = crypto.randomBytes(32).toString('hex');
    await this.userRepository.update(user.id, {
      passwordResetToken: token,
      passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    emailService.sendPasswordResetEmail(user.email, {
      name: user.firstName,
      resetUrl,
      expiryHours: 1,
    }).catch((err) => logger.warn('Failed to send password reset email:', err));

    logger.info(`Password reset requested for: ${user.id}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { passwordResetToken: token } });

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      throw new Error('Reset token has expired. Please request a new one.');
    }

    const hashedPassword = await passwordService.hash(newPassword);
    await this.userRepository.update(user.id, {
      password: hashedPassword,
      passwordResetToken: undefined,
      passwordResetExpiry: undefined,
    });

    logger.info(`Password reset successfully for: ${user.id}`);
  }

  async getUsers(options: {
    page: number;
    limit: number;
    userType?: UserType;
    search?: string;
  }): Promise<{ users: BasicUser[]; total: number }> {
    try {
      const { page = 1, limit = 10, userType, search } = options;
      const skip = (page - 1) * limit;

      const queryBuilder = this.userRepository
        .createQueryBuilder('user')
        .where('user.isActive = :isActive', { isActive: true })
        .select([
          'user.id',
          'user.email',
          'user.firstName',
          'user.lastName',
          'user.phone',
          'user.profileImage',
          'user.userType',
          'user.isVerified',
          'user.createdAt',
        ]);

      if (userType) {
        queryBuilder.andWhere('user.userType = :userType', { userType });
      }

      if (search) {
        queryBuilder.andWhere(
          '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      const [users, total] = await queryBuilder
        .orderBy('user.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return { users, total };
    } catch (error) {
      logger.error('Error fetching users:', error);
      throw error;
    }
  }
}

export const userService = new UserService();
export default userService;
