import { Request, Response } from 'express';
import { AppDataSource } from '@/config/database';
import { validate } from 'class-validator';
import bcrypt from 'bcrypt';
import { User, UserType } from '@/models/User';
import logger from '@/config/logger';
import { AuthenticatedRequest } from '@/types';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { userService } from '@/services/UserService';

// Configure multer for profile image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/profiles');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error as Error, uploadPath);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit (NFR-004)
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

class UserController {
  // GET /api/users/profile - Get current user profile (FR-006, FR-008)
  public async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: req.user.id },
        select: ['id', 'email', 'firstName', 'lastName', 'phone', 'profileImage', 'userType', 'settings', 'createdAt', 'updatedAt']
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      res.json({
        success: true,
        data: user
      });

      logger.info(`User profile retrieved for user ${req.user.id}`);
    } catch (error) {
      logger.error('Error retrieving user profile:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // PUT /api/users/profile - Update user profile (FR-006, FR-008)
  public async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { firstName, lastName, phone } = req.body;
      const userRepository = AppDataSource.getRepository(User);

      const user = await userRepository.findOne({ where: { id: req.user.id } });
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Update allowed fields
      if (firstName !== undefined) user.firstName = firstName;
      if (lastName !== undefined) user.lastName = lastName;
      if (phone !== undefined) user.phone = phone;

      // Validate the updated user
      const errors = await validate(user);
      if (errors.length > 0) {
        const validationErrors = errors.map(error => Object.values(error.constraints || {})).flat();
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        });
        return;
      }

      await userRepository.save(user);

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          profileImage: user.profileImage,
          userType: user.userType,
          settings: user.settings,
          updatedAt: user.updatedAt
        }
      });

      logger.info(`User profile updated for user ${req.user.id}`);
    } catch (error) {
      logger.error('Error updating user profile:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // DELETE /api/users/profile - Delete user account (SEC-018)
  public async deleteProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await userService.deactivateUser(req.user.userId);

      res.json({
        success: true,
        message: 'Account deactivated successfully'
      });
    } catch (error) {
      logger.error('Error deactivating user account:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  // POST /api/users/profile/image - Upload profile image (FR-007)
  public uploadProfileImage = upload.single('profileImage');

  public async handleProfileImageUpload(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No image file provided'
        });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: req.user.id } });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Delete old profile image if it exists
      if (user.profileImage) {
        try {
          const oldImagePath = path.join(__dirname, '../../uploads/profiles', path.basename(user.profileImage));
          await fs.unlink(oldImagePath);
        } catch (error) {
          logger.warn(`Failed to delete old profile image: ${error}`);
        }
      }

      // Save new image path
      user.profileImage = `/uploads/profiles/${req.file.filename}`;
      await userRepository.save(user);

      res.json({
        success: true,
        data: {
          profileImage: user.profileImage
        }
      });

      logger.info(`Profile image updated for user ${req.user.id}`);
    } catch (error) {
      logger.error('Error uploading profile image:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/users/:id - Get user by ID (public profile view)
  public async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userRepository = AppDataSource.getRepository(User);

      const user = await userRepository.findOne({
        where: { id, isActive: true },
        select: ['id', 'firstName', 'lastName', 'profileImage', 'userType', 'createdAt']
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Check privacy settings if they exist
      if (user.settings?.privacy?.showProfile === false) {
        res.status(403).json({
          success: false,
          error: 'Profile is private'
        });
        return;
      }

      res.json({
        success: true,
        data: user
      });

      logger.info(`Public user profile retrieved for user ${id}`);
    } catch (error) {
      logger.error('Error retrieving user by ID:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // PUT /api/users/settings - Update user settings (FR-010, FR-011)
  public async updateSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { notifications, privacy } = req.body;
      const userRepository = AppDataSource.getRepository(User);

      const user = await userRepository.findOne({ where: { id: req.user.id } });
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Initialize settings if not exists
      if (!user.settings) {
        user.settings = {
          notifications: {
            email: true,
            sms: true,
            push: true
          },
          privacy: {
            showProfile: true,
            showLocation: true
          }
        };
      }

      // Update notifications settings
      if (notifications) {
        if (notifications.email !== undefined) user.settings.notifications.email = notifications.email;
        if (notifications.sms !== undefined) user.settings.notifications.sms = notifications.sms;
        if (notifications.push !== undefined) user.settings.notifications.push = notifications.push;
      }

      // Update privacy settings
      if (privacy) {
        if (privacy.showProfile !== undefined) user.settings.privacy.showProfile = privacy.showProfile;
        if (privacy.showLocation !== undefined) user.settings.privacy.showLocation = privacy.showLocation;
      }

      await userRepository.save(user);

      res.json({
        success: true,
        data: {
          settings: user.settings
        }
      });

      logger.info(`User settings updated for user ${req.user.id}`);
    } catch (error) {
      logger.error('Error updating user settings:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

export default new UserController();