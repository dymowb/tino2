import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Review } from '../models/Review';
import { Booking, BookingStatus } from '../models/Booking';
import { Provider } from '../models/Provider';
import { User } from '../models/User';
import notificationService from './NotificationService';
import { NotificationType } from '../models/Notification';
import { 
  CreateReviewRequest, 
  UpdateReviewRequest, 
  ReviewSearchQuery,
  PaginatedResponse 
} from '../types';

export class ReviewService {
  private reviewRepository: Repository<Review>;
  private bookingRepository: Repository<Booking>;
  private providerRepository: Repository<Provider>;
  private userRepository: Repository<User>;

  constructor() {
    this.reviewRepository = AppDataSource.getRepository(Review);
    this.bookingRepository = AppDataSource.getRepository(Booking);
    this.providerRepository = AppDataSource.getRepository(Provider);
    this.userRepository = AppDataSource.getRepository(User);
  }

  async createReview(
    customerId: string,
    reviewData: CreateReviewRequest
  ): Promise<Review> {
    // Verify booking exists and is completed
    const booking = await this.bookingRepository.findOne({
      where: { 
        id: reviewData.bookingId,
        customerId: customerId,
        status: BookingStatus.COMPLETED
      },
      relations: ['provider']
    });

    if (!booking) {
      throw new Error('Booking not found or not completed');
    }

    // Check if review already exists for this booking
    const existingReview = await this.reviewRepository.findOne({
      where: { bookingId: reviewData.bookingId }
    });

    if (existingReview) {
      throw new Error('Review already exists for this booking');
    }

    // Create the review
    const review = this.reviewRepository.create({
      bookingId: reviewData.bookingId,
      customerId: customerId,
      providerId: booking.providerId,
      rating: reviewData.rating,
      comment: reviewData.comment,
      images: reviewData.images || [],
      criteria: reviewData.criteria,
      isVerified: false,
      isFlagged: false
    });

    const savedReview = await this.reviewRepository.save(review);

    // Update provider rating statistics
    await this.updateProviderRating(booking.providerId);

    // Notify provider of new review
    notificationService.createNotification(booking.provider.userId, {
      type: NotificationType.REVIEW,
      title: 'New Review Received',
      message: `You received a ${reviewData.rating}-star review`,
      titleKey: 'titles.new_review',
      messageKey: 'body.new_review',
      i18nParams: { rating: reviewData.rating },
      actionUrl: `/reviews/${savedReview.id}`,
      metadata: { reviewId: savedReview.id, rating: reviewData.rating },
    }).catch(err => console.error('Failed to send review notification:', err));

    return savedReview;
  }

  async getReviewById(id: string, userId?: string): Promise<Review | null> {
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: ['booking', 'customer', 'provider']
    });

    if (!review) {
      return null;
    }

    // Check if user has permission to view this review
    if (userId && review.customerId !== userId && review.providerId !== userId) {
      // For public reviews, hide sensitive information
      delete review.customer.email;
      delete review.customer.phone;
    }

    return review;
  }

  async updateReview(
    id: string,
    customerId: string,
    updateData: UpdateReviewRequest
  ): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id, customerId }
    });

    if (!review) {
      throw new Error('Review not found or unauthorized');
    }

    // Only allow updates within 7 days of creation
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    if (review.createdAt < sevenDaysAgo) {
      throw new Error('Review can only be edited within 7 days of creation');
    }

    // Update review fields
    Object.assign(review, {
      rating: updateData.rating ?? review.rating,
      comment: updateData.comment ?? review.comment,
      images: updateData.images ?? review.images,
      criteria: updateData.criteria ?? review.criteria
    });

    const updatedReview = await this.reviewRepository.save(review);

    // Recalculate provider rating
    await this.updateProviderRating(review.providerId);

    return updatedReview;
  }

  async deleteReview(id: string, customerId: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id, customerId }
    });

    if (!review) {
      throw new Error('Review not found or unauthorized');
    }

    // Only allow deletion within 24 hours of creation
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    if (review.createdAt < twentyFourHoursAgo) {
      throw new Error('Review can only be deleted within 24 hours of creation');
    }

    await this.reviewRepository.remove(review);

    // Recalculate provider rating
    await this.updateProviderRating(review.providerId);
  }

  async addProviderResponse(
    id: string,
    providerUserId: string,
    response: string
  ): Promise<Review> {
    // `providerUserId` is the User id; review.providerId is the Provider entity id —
    // resolve the provider profile first, else a provider can never respond to their review.
    const provider = await this.providerRepository.findOne({ where: { userId: providerUserId } });
    if (!provider) {
      throw new Error('Review not found or unauthorized');
    }

    const review = await this.reviewRepository.findOne({
      where: { id, providerId: provider.id }
    });

    if (!review) {
      throw new Error('Review not found or unauthorized');
    }

    if (review.response) {
      throw new Error('Response already exists for this review');
    }

    review.response = response;
    review.respondedAt = new Date();

    return await this.reviewRepository.save(review);
  }

  async getProviderReviews(
    providerId: string,
    query: ReviewSearchQuery
  ): Promise<PaginatedResponse<Review>> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 10, 50);
    const skip = (page - 1) * limit;

    const queryBuilder = this.reviewRepository.createQueryBuilder('review')
      .leftJoinAndSelect('review.customer', 'customer')
      .leftJoinAndSelect('review.booking', 'booking')
      .where('review.providerId = :providerId', { providerId });

    // Apply filters
    if (query.minRating) {
      queryBuilder.andWhere('review.rating >= :minRating', { 
        minRating: query.minRating 
      });
    }

    if (query.maxRating) {
      queryBuilder.andWhere('review.rating <= :maxRating', { 
        maxRating: query.maxRating 
      });
    }

    if (query.hasResponse !== undefined) {
      if (query.hasResponse) {
        queryBuilder.andWhere('review.response IS NOT NULL');
      } else {
        queryBuilder.andWhere('review.response IS NULL');
      }
    }

    if (query.isFlagged !== undefined) {
      queryBuilder.andWhere('review.isFlagged = :isFlagged', { 
        isFlagged: query.isFlagged 
      });
    }

    // Apply sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    queryBuilder.orderBy(`review.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const reviews = await queryBuilder
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      success: true,
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getCustomerReviews(
    customerId: string,
    query: ReviewSearchQuery
  ): Promise<PaginatedResponse<Review>> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 10, 50);
    const skip = (page - 1) * limit;

    const queryBuilder = this.reviewRepository.createQueryBuilder('review')
      .leftJoinAndSelect('review.provider', 'provider')
      .leftJoinAndSelect('review.booking', 'booking')
      .where('review.customerId = :customerId', { customerId });

    // Apply sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    queryBuilder.orderBy(`review.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const reviews = await queryBuilder
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      success: true,
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async flagReview(
    id: string,
    userId: string,
    reason: string
  ): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id }
    });

    if (!review) {
      throw new Error('Review not found');
    }

    // Prevent users from flagging their own reviews
    if (review.customerId === userId) {
      throw new Error('Cannot flag your own review');
    }

    review.isFlagged = true;
    review.flagReason = reason;

    return await this.reviewRepository.save(review);
  }

  async getReviewAnalytics(providerId: string): Promise<{
    totalReviews: number;
    averageRating: number;
    ratingDistribution: { [key: number]: number };
    criteriaAverages: {
      quality: number;
      timeliness: number;
      communication: number;
      professionalism: number;
      valueForMoney: number;
    };
    responseRate: number;
    recentTrend: 'improving' | 'declining' | 'stable';
  }> {
    const reviews = await this.reviewRepository.find({
      where: { providerId },
      order: { createdAt: 'DESC' }
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

    // Rating distribution
    const ratingDistribution: { [key: number]: number } = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0
    };
    reviews.forEach(review => {
      ratingDistribution[Math.floor(review.rating)]++;
    });

    // Criteria averages
    const criteriaAverages = {
      quality: 0,
      timeliness: 0,
      communication: 0,
      professionalism: 0,
      valueForMoney: 0
    };

    const reviewsWithCriteria = reviews.filter(r => r.criteria);
    if (reviewsWithCriteria.length > 0) {
      Object.keys(criteriaAverages).forEach(key => {
        const sum = reviewsWithCriteria.reduce((sum, r) => sum + (r.criteria[key] || 0), 0);
        criteriaAverages[key] = sum / reviewsWithCriteria.length;
      });
    }

    // Response rate
    const reviewsWithResponse = reviews.filter(r => r.response).length;
    const responseRate = totalReviews > 0 ? (reviewsWithResponse / totalReviews) * 100 : 0;

    // Recent trend (last 30 days vs previous 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const recentReviews = reviews.filter(r => r.createdAt >= thirtyDaysAgo);
    const previousReviews = reviews.filter(r => r.createdAt >= sixtyDaysAgo && r.createdAt < thirtyDaysAgo);

    const recentAvg = recentReviews.length > 0 
      ? recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length
      : 0;
    const previousAvg = previousReviews.length > 0 
      ? previousReviews.reduce((sum, r) => sum + r.rating, 0) / previousReviews.length
      : 0;

    let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (recentAvg > previousAvg + 0.1) recentTrend = 'improving';
    else if (recentAvg < previousAvg - 0.1) recentTrend = 'declining';

    return {
      totalReviews,
      averageRating,
      ratingDistribution,
      criteriaAverages,
      responseRate,
      recentTrend
    };
  }

  private async updateProviderRating(providerId: string): Promise<void> {
    const reviews = await this.reviewRepository.find({
      where: { providerId }
    });

    if (reviews.length === 0) {
      await this.providerRepository.update(providerId, {
        rating: 0,
        totalReviews: 0
      });
      return;
    }

    const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

    await this.providerRepository.update(providerId, {
      rating: Math.round(averageRating * 100) / 100, // Round to 2 decimal places
      totalReviews: reviews.length
    });
  }

  async searchReviews(query: ReviewSearchQuery): Promise<PaginatedResponse<Review>> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 10, 50);
    const skip = (page - 1) * limit;

    const queryBuilder = this.reviewRepository.createQueryBuilder('review')
      .leftJoinAndSelect('review.customer', 'customer')
      .leftJoinAndSelect('review.provider', 'provider')
      .leftJoinAndSelect('review.booking', 'booking');

    // Apply filters
    if (query.providerId) {
      queryBuilder.andWhere('review.providerId = :providerId', { 
        providerId: query.providerId 
      });
    }

    if (query.customerId) {
      queryBuilder.andWhere('review.customerId = :customerId', { 
        customerId: query.customerId 
      });
    }

    if (query.minRating) {
      queryBuilder.andWhere('review.rating >= :minRating', { 
        minRating: query.minRating 
      });
    }

    if (query.maxRating) {
      queryBuilder.andWhere('review.rating <= :maxRating', { 
        maxRating: query.maxRating 
      });
    }

    if (query.searchTerm) {
      queryBuilder.andWhere(
        '(review.comment LIKE :searchTerm OR review.response LIKE :searchTerm)',
        { searchTerm: `%${query.searchTerm}%` }
      );
    }

    // Apply sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    queryBuilder.orderBy(`review.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const reviews = await queryBuilder
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      success: true,
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}
export default new ReviewService();
