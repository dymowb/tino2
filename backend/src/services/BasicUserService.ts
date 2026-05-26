import { Repository } from 'typeorm';
import { BasicUser, UserType } from '@/models/BasicUser';
import { AppDataSource } from '@/config/database';
import { passwordService } from '@/utils/password';
import { jwtService } from '@/utils/jwt';
import logger from '@/config/logger';

export class BasicUserService {
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

      return await this.userRepository.save(user);
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
          'phone',
          'userType',
          'isActive',
        ],
      });

      if (!user) {
        throw new Error('Invalid email or password');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      const isValidPassword = await passwordService.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      const { accessToken, refreshToken } = await jwtService.generateTokens({
        userId: user.id,
        id: user.id,
        email: user.email,
        userType: user.userType as 'customer' | 'provider' | 'admin',
      });

      // Remove password from user object
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _password, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword as BasicUser,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error('Authentication error:', error);
      throw error;
    }
  }

  async refreshToken(userId: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const { accessToken, refreshToken } = await jwtService.generateTokens({
        userId: user.id,
        id: user.id,
        email: user.email,
        userType: user.userType as 'customer' | 'provider' | 'admin',
      });

      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<BasicUser | null> {
    try {
      return await this.userRepository.findOne({
        where: { id },
      });
    } catch (error) {
      logger.error('Error getting user by ID:', error);
      throw error;
    }
  }

  async createDemoUsers(): Promise<void> {
    try {
      // Create customer demo user
      const customerExists = await this.userRepository.findOne({
        where: { email: 'customer@demo.com' },
      });

      if (!customerExists) {
        await this.createUser({
          email: 'customer@demo.com',
          password: 'Demo123!',
          firstName: 'Demo',
          lastName: 'Customer',
          phone: '(555) 123-4567',
          userType: UserType.CUSTOMER,
        });
        logger.info('Created demo customer user');
      }

      // Create provider demo user
      const providerExists = await this.userRepository.findOne({
        where: { email: 'provider@demo.com' },
      });

      if (!providerExists) {
        await this.createUser({
          email: 'provider@demo.com',
          password: 'Demo123!',
          firstName: 'Demo',
          lastName: 'Provider',
          phone: '(555) 987-6543',
          userType: UserType.PROVIDER,
        });
        logger.info('Created demo provider user');
      }
    } catch (error) {
      logger.error('Error creating demo users:', error);
    }
  }
}

export const basicUserService = new BasicUserService();
