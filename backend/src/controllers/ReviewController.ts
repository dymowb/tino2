import { Request, Response } from 'express';
import { getRepository } from 'typeorm';
import { validate } from 'class-validator';
import { Review } from '@/models/Review';
import { Booking } from '@/models/Booking';
import { Provider } from '@/models/Provider';
import logger from '@/config/logger';
import { AuthenticatedRequest } from '@/types';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

// Configure multer for review image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/reviews');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error, uploadPath);
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
    files: 5 // Max 5 images per review
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

class ReviewController {
  // GET /api/reviews - Get all reviews with filters
  public async getReviews(req: Request, res: Response): Promise<void> {
    try {
      const { providerId, customerId, rating, page = 1, limit = 10 } = req.query;
      const reviewRepository = getRepository(Review);

      const where: any = { isFlagged: false };
      if (providerId) where.providerId = providerId;
      if (customerId) where.customerId = customerId;
      if (rating) where.rating = Number(rating);

      const reviews = await reviewRepository.find({
        where,
        relations: ['customer', 'provider', 'booking'],
        order: { createdAt: 'DESC' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        select: {
          customer: ['id', 'firstName', 'lastName', 'profileImage'],
          provider: ['id', 'businessName', 'profileImage'],
          booking: ['id', 'serviceType', 'scheduledDate']
        }
      });

      const total = await reviewRepository.count({ where });

      res.json({
        success: true,
        data: {
          reviews,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });

      logger.info('Reviews retrieved successfully');
    } catch (error) {
      logger.error('Error retrieving reviews:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/reviews/:id - Get review by ID (FR-070)
  public async getReviewById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const reviewRepository = getRepository(Review);

      const review = await reviewRepository.findOne({
        where: { id, isFlagged: false },
        relations: ['customer', 'provider', 'booking'],
        select: {
          customer: ['id', 'firstName', 'lastName', 'profileImage'],
          provider: ['id', 'businessName', 'profileImage'],
          booking: ['id', 'serviceType', 'scheduledDate']
        }
      });

      if (!review) {
        res.status(404).json({
          success: false,
          error: 'Review not found'
        });
        return;
      }

      res.json({
        success: true,
        data: review
      });

      logger.info(`Review ${id} retrieved`);
    } catch (error) {
      logger.error('Error retrieving review:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // POST /api/reviews - Create new review (FR-066, FR-067, FR-068)
  public async createReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { 
        bookingId, 
        rating, 
        comment, 
        criteria 
      } = req.body;

      if (!bookingId || !rating) {
        res.status(400).json({
          success: false,
          error: 'Booking ID and rating are required'
        });
        return;
      }

      const bookingRepository = getRepository(Booking);
      const booking = await bookingRepository.findOne({
        where: { 
          id: bookingId, 
          customerId: req.user.id,
          status: 'completed' // Only allow reviews for completed bookings
        }
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          error: 'Booking not found or not eligible for review'
        });
        return;
      }

      // Check if review already exists
      const reviewRepository = getRepository(Review);
      const existingReview = await reviewRepository.findOne({
        where: { bookingId, customerId: req.user.id }
      });

      if (existingReview) {
        res.status(409).json({
          success: false,
          error: 'Review already exists for this booking'
        });
        return;
      }

      // Create review
      const review = reviewRepository.create({
        bookingId,
        customerId: req.user.id,
        providerId: booking.providerId,
        rating: Number(rating),
        comment,
        criteria: criteria ? {
          quality: criteria.quality || rating,
          timeliness: criteria.timeliness || rating,
          communication: criteria.communication || rating,
          professionalism: criteria.professionalism || rating,
          valueForMoney: criteria.valueForMoney || rating,
        } : undefined,
        images: [], // Will be populated if files are uploaded
        isVerified: true // Auto-verify since it's tied to a completed booking
      });

      // Validate review
      const errors = await validate(review);
      if (errors.length > 0) {
        const validationErrors = errors.map(error => Object.values(error.constraints || {})).flat();
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        });
        return;
      }

      await reviewRepository.save(review);

      // Update provider's overall rating (FR-070, FR-071)
      await this.updateProviderRating(booking.providerId);

      res.status(201).json({
        success: true,
        data: review
      });

      logger.info(`Review created: ${review.id} for booking ${bookingId}`);
    } catch (error) {
      logger.error('Error creating review:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // POST /api/reviews/:id/images - Upload review images (FR-068)
  public uploadReviewImages = upload.array('images', 5);

  public async handleReviewImageUpload(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No image files provided'
        });
        return;
      }

      const reviewRepository = getRepository(Review);
      const review = await reviewRepository.findOne({
        where: { id, customerId: req.user.id }
      });

      if (!review) {
        res.status(404).json({
          success: false,
          error: 'Review not found'
        });
        return;
      }

      // Add uploaded images to review
      const imagePaths = files.map(file => `/uploads/reviews/${file.filename}`);
      review.images = [...(review.images || []), ...imagePaths];

      await reviewRepository.save(review);

      res.json({
        success: true,
        data: {
          images: imagePaths,
          totalImages: review.images.length
        }
      });

      logger.info(`Images uploaded for review ${id}`);
    } catch (error) {
      logger.error('Error uploading review images:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // PUT /api/reviews/:id - Update review (customer can edit before provider responds)
  public async updateReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { rating, comment, criteria } = req.body;

      const reviewRepository = getRepository(Review);
      const review = await reviewRepository.findOne({
        where: { id, customerId: req.user.id }
      });

      if (!review) {
        res.status(404).json({
          success: false,
          error: 'Review not found'
        });
        return;
      }

      // Prevent editing if provider has already responded
      if (review.response && review.respondedAt) {
        res.status(403).json({
          success: false,
          error: 'Cannot edit review after provider has responded'
        });
        return;
      }

      // Update review fields
      if (rating !== undefined) review.rating = Number(rating);
      if (comment !== undefined) review.comment = comment;
      if (criteria) {
        review.criteria = {
          quality: criteria.quality || review.rating,
          timeliness: criteria.timeliness || review.rating,
          communication: criteria.communication || review.rating,
          professionalism: criteria.professionalism || review.rating,
          valueForMoney: criteria.valueForMoney || review.rating,
        };
      }

      // Validate updated review
      const errors = await validate(review);
      if (errors.length > 0) {
        const validationErrors = errors.map(error => Object.values(error.constraints || {})).flat();
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        });
        return;
      }

      await reviewRepository.save(review);

      // Recalculate provider rating
      await this.updateProviderRating(review.providerId);

      res.json({
        success: true,
        data: review
      });

      logger.info(`Review updated: ${id}`);
    } catch (error) {
      logger.error('Error updating review:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // DELETE /api/reviews/:id - Delete review (customer can delete their own review)
  public async deleteReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const reviewRepository = getRepository(Review);
      const review = await reviewRepository.findOne({
        where: { id, customerId: req.user.id }
      });

      if (!review) {
        res.status(404).json({
          success: false,
          error: 'Review not found'
        });
        return;
      }

      const providerId = review.providerId;

      // Delete review images from filesystem
      if (review.images && review.images.length > 0) {
        for (const imagePath of review.images) {
          try {
            const fullPath = path.join(__dirname, '../..', imagePath);
            await fs.unlink(fullPath);
          } catch (error) {
            logger.warn(`Failed to delete review image: ${imagePath}`);
          }
        }
      }

      await reviewRepository.remove(review);

      // Recalculate provider rating
      await this.updateProviderRating(providerId);

      res.json({
        success: true,
        message: 'Review deleted successfully'
      });

      logger.info(`Review deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting review:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // POST /api/reviews/:id/response - Provider response to review (FR-069)
  public async respondToReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { response } = req.body;

      if (!response || response.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Response text is required'
        });
        return;
      }

      const reviewRepository = getRepository(Review);
      const review = await reviewRepository.findOne({
        where: { id, providerId: req.user.id }
      });

      if (!review) {
        res.status(404).json({
          success: false,
          error: 'Review not found'
        });
        return;
      }

      // Update review with provider response
      review.response = response.trim();
      review.respondedAt = new Date();

      await reviewRepository.save(review);

      res.json({
        success: true,
        data: review
      });

      logger.info(`Provider response added to review ${id}`);
    } catch (error) {
      logger.error('Error responding to review:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/reviews/provider/:providerId - Get provider reviews (FR-071, FR-072)
  public async getProviderReviews(req: Request, res: Response): Promise<void> {
    try {
      const { providerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const reviewRepository = getRepository(Review);

      const reviews = await reviewRepository.find({
        where: { providerId, isFlagged: false },
        relations: ['customer', 'booking'],
        order: { createdAt: 'DESC' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        select: {
          customer: ['id', 'firstName', 'lastName', 'profileImage'],
          booking: ['id', 'serviceType', 'scheduledDate']
        }
      });

      const total = await reviewRepository.count({
        where: { providerId, isFlagged: false }
      });

      // Calculate rating statistics
      const ratingStats = await reviewRepository
        .createQueryBuilder('review')
        .select('AVG(review.rating)', 'averageRating')
        .addSelect('COUNT(review.id)', 'totalReviews')
        .addSelect('SUM(CASE WHEN review.rating >= 5 THEN 1 ELSE 0 END)', 'fiveStars')
        .addSelect('SUM(CASE WHEN review.rating >= 4 AND review.rating < 5 THEN 1 ELSE 0 END)', 'fourStars')
        .addSelect('SUM(CASE WHEN review.rating >= 3 AND review.rating < 4 THEN 1 ELSE 0 END)', 'threeStars')
        .addSelect('SUM(CASE WHEN review.rating >= 2 AND review.rating < 3 THEN 1 ELSE 0 END)', 'twoStars')
        .addSelect('SUM(CASE WHEN review.rating < 2 THEN 1 ELSE 0 END)', 'oneStar')
        .where('review.providerId = :providerId', { providerId })
        .andWhere('review.isFlagged = :isFlagged', { isFlagged: false })
        .getRawOne();

      res.json({
        success: true,
        data: {
          reviews,
          statistics: {
            averageRating: parseFloat(ratingStats.averageRating) || 0,
            totalReviews: parseInt(ratingStats.totalReviews) || 0,
            distribution: {
              5: parseInt(ratingStats.fiveStars) || 0,
              4: parseInt(ratingStats.fourStars) || 0,
              3: parseInt(ratingStats.threeStars) || 0,
              2: parseInt(ratingStats.twoStars) || 0,
              1: parseInt(ratingStats.oneStar) || 0,
            }
          },
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });

      logger.info(`Provider reviews retrieved for ${providerId}`);
    } catch (error) {
      logger.error('Error retrieving provider reviews:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/reviews/customer/:customerId - Get customer reviews
  public async getCustomerReviews(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;

      // Only allow users to access their own reviews or admin access
      if (req.user.id !== customerId && req.user.userType !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Unauthorized access'
        });
        return;
      }

      const reviewRepository = getRepository(Review);

      const reviews = await reviewRepository.find({
        where: { customerId },
        relations: ['provider', 'booking'],
        order: { createdAt: 'DESC' },
        select: {
          provider: ['id', 'businessName', 'profileImage'],
          booking: ['id', 'serviceType', 'scheduledDate']
        }
      });

      res.json({
        success: true,
        data: reviews
      });

      logger.info(`Customer reviews retrieved for ${customerId}`);
    } catch (error) {
      logger.error('Error retrieving customer reviews:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Private method to update provider's overall rating (FR-070, FR-071)
  private async updateProviderRating(providerId: string): Promise<void> {
    try {
      const reviewRepository = getRepository(Review);
      const providerRepository = getRepository(Provider);

      const ratingStats = await reviewRepository
        .createQueryBuilder('review')
        .select('AVG(review.rating)', 'averageRating')
        .addSelect('COUNT(review.id)', 'totalReviews')
        .where('review.providerId = :providerId', { providerId })
        .andWhere('review.isFlagged = :isFlagged', { isFlagged: false })
        .getRawOne();

      await providerRepository.update(
        { userId: providerId },
        {
          rating: parseFloat(ratingStats.averageRating) || 0,
          totalReviews: parseInt(ratingStats.totalReviews) || 0
        }
      );

      logger.info(`Provider rating updated for ${providerId}`);
    } catch (error) {
      logger.error('Error updating provider rating:', error);
    }
  }
}

export default new ReviewController();