import { Request, Response } from 'express';
import { userService } from '@/services/UserService';
import { ApiResponse } from '@/types';
import logger from '@/config/logger';
import { UserType } from '@/models/User';

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName, phone, userType } = req.body;

      const user = await userService.createUser({
        email,
        password,
        firstName,
        lastName,
        phone,
        userType: userType as UserType,
      });

      const response: ApiResponse = {
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        data: {
          email: user.email,
          firstName: user.firstName,
        },
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Registration error:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
      res.status(400).json(response);
    }
  }

  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.query;
      if (!token || typeof token !== 'string') {
        res.status(400).json({ success: false, error: 'Verification token is required' });
        return;
      }
      await userService.verifyEmail(token);
      res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      });
    }
  }

  async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, error: 'Email is required' });
        return;
      }
      await userService.resendVerification(email);
      // Always return success to avoid leaking whether the email exists
      res.json({ success: true, message: 'If this email is registered and unverified, a new verification link has been sent.' });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resend verification',
      });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      const { user, accessToken, refreshToken } = await userService.authenticateUser(
        email,
        password
      );

      const response: ApiResponse = {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            userType: user.userType,
            isActive: user.isActive,
            // profileImage: user.profileImage,
          },
          accessToken,
          refreshToken,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Login error:', error);
      if (error instanceof Error && error.message === 'EMAIL_NOT_VERIFIED') {
        res.status(403).json({
          success: false,
          error: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email address before logging in.',
          email: (error as any).email,
        });
        return;
      }
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
      res.status(401).json(response);
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
        return;
      }

      const tokens = await userService.refreshToken(req.user.userId);

      const response: ApiResponse = {
        success: true,
        message: 'Token refreshed successfully',
        data: tokens,
      };

      res.json(response);
    } catch (error) {
      logger.error('Token refresh error:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      };
      res.status(401).json(response);
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
        return;
      }

      const token = req.headers.authorization?.substring(7);
      if (token) {
        await userService.logout(req.user.userId, token);
      }

      const response: ApiResponse = {
        success: true,
        message: 'Logged out successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Logout error:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      };
      res.status(500).json(response);
    }
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
        return;
      }

      const user = await userService.getUserById(req.user.userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          userType: user.userType,
          // Note: isVerified, profileImage, settings not available in BasicUser
          createdAt: user.createdAt,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Get profile error:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get profile',
      };
      res.status(500).json(response);
    }
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
        return;
      }

      const updates = req.body;
      const updatedUser = await userService.updateUser(req.user.userId, updates);

      const response: ApiResponse = {
        success: true,
        message: 'Profile updated successfully',
        data: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone,
          userType: updatedUser.userType,
          isVerified: updatedUser.isVerified,
          profileImage: updatedUser.profileImage,
          settings: updatedUser.settings,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Update profile error:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update profile',
      };
      res.status(500).json(response);
    }
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      await userService.changePassword(req.user.userId, currentPassword, newPassword);

      const response: ApiResponse = {
        success: true,
        message: 'Password changed successfully',
      };

      res.json(response);
    } catch (error) {
      logger.error('Change password error:', error);
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to change password',
      };
      res.status(400).json(response);
    }
  }
}

export const authController = new AuthController();
export default authController;
