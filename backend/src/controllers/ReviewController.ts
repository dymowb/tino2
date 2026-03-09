import { Request, Response } from 'express';
import { ReviewService } from '../services/ReviewService';
import providerService from '../services/ProviderService';
import {
  CreateReviewRequest,
  UpdateReviewRequest,
  ReviewSearchQuery,
  AuthenticatedRequest
} from '../types';
import { reviewResponseAgent } from '../agents/review-response.agent';

class ReviewController {
  private reviewService: ReviewService;

  constructor() {
    this.reviewService = new ReviewService();
  }

  createReview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const customerId = req.user!.userId;
      const reviewData: CreateReviewRequest = req.body;

      const review = await this.reviewService.createReview(customerId, reviewData);

      res.status(201).json({
        success: true,
        data: review,
        message: 'Review created successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create review'
      });
    }
  };

  getReviewById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as AuthenticatedRequest).user?.userId;

      const review = await this.reviewService.getReviewById(id, userId);

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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get review'
      });
    }
  };

  updateReview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const customerId = req.user!.userId;
      const updateData: UpdateReviewRequest = req.body;

      const review = await this.reviewService.updateReview(id, customerId, updateData);

      res.json({
        success: true,
        data: review,
        message: 'Review updated successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update review'
      });
    }
  };

  deleteReview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const customerId = req.user!.userId;

      await this.reviewService.deleteReview(id, customerId);

      res.json({
        success: true,
        message: 'Review deleted successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete review'
      });
    }
  };

  addProviderResponse = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const providerId = req.user!.userId;
      const { response } = req.body;

      if (!response || typeof response !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Response text is required'
        });
        return;
      }

      const review = await this.reviewService.addProviderResponse(id, providerId, response);

      res.json({
        success: true,
        data: review,
        message: 'Response added successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add response'
      });
    }
  };

  draftReviewResponse = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const review = await this.reviewService.getReviewById(id);
      if (!review) {
        res.status(404).json({ success: false, error: 'Review not found' });
        return;
      }

      const draft = await reviewResponseAgent.execute({
        reviewText: review.comment || '',
        rating: Number(review.rating),
        serviceName: review.booking?.serviceType?.replace(/_/g, ' ') || 'Home Service',
      });

      res.json({ success: true, data: draft });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate draft'
      });
    }
  };

  getProviderReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;
      const query: ReviewSearchQuery = req.query as any;

      const result = await this.reviewService.getProviderReviews(providerId, query);

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get provider reviews'
      });
    }
  };

  getCustomerReviews = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const customerId = req.user!.userId;
      const query: ReviewSearchQuery = req.query as any;

      const result = await this.reviewService.getCustomerReviews(customerId, query);

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get customer reviews'
      });
    }
  };

  flagReview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { reason } = req.body;

      if (!reason || typeof reason !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Flag reason is required'
        });
        return;
      }

      const review = await this.reviewService.flagReview(id, userId, reason);

      res.json({
        success: true,
        data: review,
        message: 'Review flagged successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to flag review'
      });
    }
  };

  getReviewAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;

      const analytics = await this.reviewService.getReviewAnalytics(providerId);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get review analytics'
      });
    }
  };

  searchReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const query: ReviewSearchQuery = req.query as any;

      const result = await this.reviewService.searchReviews(query);

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search reviews'
      });
    }
  };

  getMyProviderReviews = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const query: ReviewSearchQuery = req.query as any;

      // Get provider record using providerService
      const provider = await providerService.getProviderByUserId(userId);

      if (!provider) {
        res.status(404).json({
          success: false,
          message: 'Provider profile not found'
        });
        return;
      }

      const result = await this.reviewService.getProviderReviews(provider.id, query);

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get provider reviews'
      });
    }
  };

  getMyCustomerReviews = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const customerId = req.user!.userId;
      const query: ReviewSearchQuery = req.query as any;

      const result = await this.reviewService.getCustomerReviews(customerId, query);

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get customer reviews'
      });
    }
  };
}

export default new ReviewController();