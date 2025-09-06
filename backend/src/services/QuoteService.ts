import { Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { QuoteRequest, QuoteRequestStatus, UrgencyLevel } from '@/models/QuoteRequest';
import { Quote, QuoteStatus } from '@/models/Quote';
import { User } from '@/models/User';
import { Provider } from '@/models/Provider';
import logger from '@/config/logger';
import { 
  CreateQuoteRequestRequest, 
  UpdateQuoteRequestRequest, 
  CreateQuoteRequest, 
  UpdateQuoteRequest,
  QuoteRequestSearchQuery,
  QuoteSearchQuery
} from '@/types';

export class QuoteService {
  private quoteRequestRepository: Repository<QuoteRequest>;
  private quoteRepository: Repository<Quote>;
  private userRepository: Repository<User>;
  private providerRepository: Repository<Provider>;

  constructor() {
    this.quoteRequestRepository = AppDataSource.getRepository(QuoteRequest);
    this.quoteRepository = AppDataSource.getRepository(Quote);
    this.userRepository = AppDataSource.getRepository(User);
    this.providerRepository = AppDataSource.getRepository(Provider);
  }

  // Quote Request Management
  async createQuoteRequest(customerId: string, requestData: CreateQuoteRequestRequest): Promise<QuoteRequest> {
    try {
      // Verify customer exists
      const customer = await this.userRepository.findOne({
        where: { id: customerId, userType: 'customer', isActive: true },
      });

      if (!customer) {
        throw new Error('Customer not found or inactive');
      }

      // Set expiration date if not provided (default 7 days)
      const expiresAt = requestData.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Create quote request
      const quoteRequest = this.quoteRequestRepository.create({
        customerId,
        serviceType: requestData.serviceType,
        description: requestData.description,
        location: requestData.location,
        preferredDate: requestData.preferredDate,
        budget: requestData.budget,
        images: requestData.images || [],
        urgency: requestData.urgency || UrgencyLevel.MEDIUM,
        requirements: requestData.requirements || [],
        availability: requestData.availability || [],
        searchRadius: requestData.searchRadius || 25.0,
        expiresAt,
        status: QuoteRequestStatus.OPEN,
      });

      const savedRequest = await this.quoteRequestRepository.save(quoteRequest);
      logger.info('Quote request created', { 
        quoteRequestId: savedRequest.id, 
        customerId, 
        serviceType: requestData.serviceType 
      });

      return savedRequest;
    } catch (error) {
      logger.error('Error creating quote request:', error);
      throw error;
    }
  }

  async getQuoteRequestById(requestId: string, userId?: string): Promise<QuoteRequest | null> {
    try {
      const queryBuilder = this.quoteRequestRepository
        .createQueryBuilder('quoteRequest')
        .leftJoinAndSelect('quoteRequest.customer', 'customer')
        .leftJoinAndSelect('quoteRequest.quotes', 'quotes')
        .leftJoinAndSelect('quotes.provider', 'provider')
        .leftJoinAndSelect('provider.user', 'providerUser')
        .where('quoteRequest.id = :requestId', { requestId });

      // If userId is provided, ensure access control
      if (userId) {
        queryBuilder.andWhere('quoteRequest.customerId = :userId', { userId });
      }

      return await queryBuilder.getOne();
    } catch (error) {
      logger.error('Error fetching quote request by ID:', error);
      throw error;
    }
  }

  async updateQuoteRequest(
    requestId: string, 
    customerId: string, 
    updateData: UpdateQuoteRequestRequest
  ): Promise<QuoteRequest> {
    try {
      const quoteRequest = await this.quoteRequestRepository.findOne({
        where: { id: requestId, customerId },
      });

      if (!quoteRequest) {
        throw new Error('Quote request not found or access denied');
      }

      // Only allow updates if request is still open
      if (quoteRequest.status !== QuoteRequestStatus.OPEN) {
        throw new Error('Cannot update quote request in current status');
      }

      // Update fields
      Object.assign(quoteRequest, updateData);
      quoteRequest.updatedAt = new Date();

      const updatedRequest = await this.quoteRequestRepository.save(quoteRequest);
      logger.info('Quote request updated', { requestId, customerId });

      return updatedRequest;
    } catch (error) {
      logger.error('Error updating quote request:', error);
      throw error;
    }
  }

  async closeQuoteRequest(
    requestId: string, 
    customerId: string, 
    reason?: string
  ): Promise<QuoteRequest> {
    try {
      const quoteRequest = await this.quoteRequestRepository.findOne({
        where: { id: requestId, customerId },
      });

      if (!quoteRequest) {
        throw new Error('Quote request not found or access denied');
      }

      if (quoteRequest.status !== QuoteRequestStatus.OPEN) {
        throw new Error('Quote request is already closed');
      }

      quoteRequest.status = QuoteRequestStatus.CLOSED;
      quoteRequest.closedAt = new Date();
      quoteRequest.closureReason = reason || 'Closed by customer';
      quoteRequest.updatedAt = new Date();

      const closedRequest = await this.quoteRequestRepository.save(quoteRequest);
      logger.info('Quote request closed', { requestId, customerId, reason });

      return closedRequest;
    } catch (error) {
      logger.error('Error closing quote request:', error);
      throw error;
    }
  }

  async searchQuoteRequests(query: QuoteRequestSearchQuery): Promise<{
    quoteRequests: QuoteRequest[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const {
        customerId,
        serviceType,
        status,
        urgency,
        minBudget,
        maxBudget,
        latitude,
        longitude,
        radius = 25,
        page = 1,
        limit = 20,
        sortBy = 'created',
        sortOrder = 'desc',
      } = query;

      let queryBuilder = this.quoteRequestRepository
        .createQueryBuilder('quoteRequest')
        .leftJoinAndSelect('quoteRequest.customer', 'customer')
        .leftJoinAndSelect('quoteRequest.quotes', 'quotes');

      // Filter by customer
      if (customerId) {
        queryBuilder = queryBuilder.andWhere('quoteRequest.customerId = :customerId', { customerId });
      }

      // Filter by service type
      if (serviceType) {
        queryBuilder = queryBuilder.andWhere('quoteRequest.serviceType = :serviceType', { serviceType });
      }

      // Filter by status
      if (status) {
        queryBuilder = queryBuilder.andWhere('quoteRequest.status = :status', { status });
      }

      // Filter by urgency
      if (urgency) {
        queryBuilder = queryBuilder.andWhere('quoteRequest.urgency = :urgency', { urgency });
      }

      // Filter by budget range
      if (minBudget) {
        queryBuilder = queryBuilder.andWhere(
          'JSON_EXTRACT(quoteRequest.budget, "$.max") >= :minBudget', 
          { minBudget }
        );
      }

      if (maxBudget) {
        queryBuilder = queryBuilder.andWhere(
          'JSON_EXTRACT(quoteRequest.budget, "$.min") <= :maxBudget', 
          { maxBudget }
        );
      }

      // Filter by location (simplified for SQLite)
      if (latitude && longitude) {
        const latDiff = 0.009 * radius;
        const lngDiff = 0.009 * radius;
        queryBuilder = queryBuilder.andWhere(
          'JSON_EXTRACT(quoteRequest.location, "$.latitude") BETWEEN :minLat AND :maxLat',
          { minLat: latitude - latDiff, maxLat: latitude + latDiff }
        ).andWhere(
          'JSON_EXTRACT(quoteRequest.location, "$.longitude") BETWEEN :minLng AND :maxLng',
          { minLng: longitude - lngDiff, maxLng: longitude + lngDiff }
        );
      }

      // Apply sorting
      const sortField = 
        sortBy === 'date' ? 'quoteRequest.preferredDate' :
        sortBy === 'budget' ? 'JSON_EXTRACT(quoteRequest.budget, "$.max")' :
        sortBy === 'urgency' ? 'quoteRequest.urgency' :
        'quoteRequest.createdAt';

      queryBuilder = queryBuilder.orderBy(sortField, sortOrder.toUpperCase() as 'ASC' | 'DESC');

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder = queryBuilder.skip(offset).take(limit);

      const [quoteRequests, total] = await queryBuilder.getManyAndCount();

      logger.info('Quote requests search completed', {
        total,
        page,
        limit,
        filters: { customerId, serviceType, status, urgency },
      });

      return {
        quoteRequests,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error searching quote requests:', error);
      throw error;
    }
  }

  // Quote Management
  async createQuote(userIdOrProviderId: string, quoteData: CreateQuoteRequest): Promise<Quote> {
    try {
      // Verify the quote request exists and is open
      const quoteRequest = await this.quoteRequestRepository.findOne({
        where: { id: quoteData.requestId, status: QuoteRequestStatus.OPEN },
        relations: ['customer'],
      });

      if (!quoteRequest) {
        throw new Error('Quote request not found or not accepting quotes');
      }

      // Try to find provider by ID first, then by user ID
      let provider = await this.providerRepository.findOne({
        where: { id: userIdOrProviderId, isActive: true },
        relations: ['user'],
      });

      // If not found by provider ID, try to find by user ID
      if (!provider) {
        provider = await this.providerRepository.findOne({
          where: { userId: userIdOrProviderId, isActive: true },
          relations: ['user'],
        });
      }

      if (!provider || !provider.user.isActive) {
        throw new Error('Provider not found or inactive');
      }

      const providerId = provider.id;

      // Check if provider already submitted a quote for this request
      const existingQuote = await this.quoteRepository.findOne({
        where: { requestId: quoteData.requestId, providerId },
      });

      if (existingQuote) {
        throw new Error('Quote already submitted for this request');
      }

      // Create quote
      const quote = this.quoteRepository.create({
        requestId: quoteData.requestId,
        providerId,
        customerId: quoteRequest.customerId,
        serviceType: quoteData.serviceType,
        description: quoteData.description,
        estimatedPrice: quoteData.estimatedPrice,
        estimatedDuration: quoteData.estimatedDuration,
        validUntil: quoteData.validUntil,
        breakdown: quoteData.breakdown,
        terms: quoteData.terms,
        notes: quoteData.notes,
        attachments: quoteData.attachments || [],
        status: QuoteStatus.PENDING,
      });

      const savedQuote = await this.quoteRepository.save(quote);

      // Update quote request quote count
      quoteRequest.quotesReceived += 1;
      await this.quoteRequestRepository.save(quoteRequest);

      logger.info('Quote created', { 
        quoteId: savedQuote.id, 
        providerId, 
        requestId: quoteData.requestId 
      });

      return savedQuote;
    } catch (error) {
      logger.error('Error creating quote:', error);
      throw error;
    }
  }

  async getQuoteById(quoteId: string, userId?: string): Promise<Quote | null> {
    try {
      const queryBuilder = this.quoteRepository
        .createQueryBuilder('quote')
        .leftJoinAndSelect('quote.request', 'request')
        .leftJoinAndSelect('quote.provider', 'provider')
        .leftJoinAndSelect('provider.user', 'providerUser')
        .leftJoinAndSelect('quote.customer', 'customer')
        .where('quote.id = :quoteId', { quoteId });

      // If userId is provided, ensure access control
      if (userId) {
        queryBuilder.andWhere(
          '(quote.customerId = :userId OR quote.providerId = :userId)',
          { userId }
        );
      }

      return await queryBuilder.getOne();
    } catch (error) {
      logger.error('Error fetching quote by ID:', error);
      throw error;
    }
  }

  async updateQuote(
    quoteId: string, 
    providerId: string, 
    updateData: UpdateQuoteRequest
  ): Promise<Quote> {
    try {
      const quote = await this.quoteRepository.findOne({
        where: { id: quoteId, providerId },
      });

      if (!quote) {
        throw new Error('Quote not found or access denied');
      }

      // Only allow updates if quote is still pending
      if (quote.status !== QuoteStatus.PENDING) {
        throw new Error('Cannot update quote in current status');
      }

      // Update fields
      Object.assign(quote, updateData);
      quote.updatedAt = new Date();

      const updatedQuote = await this.quoteRepository.save(quote);
      logger.info('Quote updated', { quoteId, providerId });

      return updatedQuote;
    } catch (error) {
      logger.error('Error updating quote:', error);
      throw error;
    }
  }

  async updateQuoteStatus(
    quoteId: string, 
    userId: string, 
    newStatus: QuoteStatus, 
    userRole: 'customer' | 'provider',
    reason?: string
  ): Promise<Quote> {
    try {
      const quote = await this.quoteRepository.findOne({
        where: { id: quoteId },
        relations: ['request'],
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      // Validate access
      if (userRole === 'customer' && quote.customerId !== userId) {
        throw new Error('Access denied');
      }
      if (userRole === 'provider' && quote.providerId !== userId) {
        throw new Error('Access denied');
      }

      // Validate status transitions
      const isValidTransition = this.validateQuoteStatusTransition(
        quote.status,
        newStatus,
        userRole
      );

      if (!isValidTransition) {
        throw new Error(`Invalid status transition from ${quote.status} to ${newStatus} for ${userRole}`);
      }

      // Update quote status
      quote.status = newStatus;
      quote.updatedAt = new Date();

      if (newStatus === QuoteStatus.ACCEPTED) {
        quote.acceptedAt = new Date();
        // Close the quote request when a quote is accepted
        quote.request.status = QuoteRequestStatus.CLOSED;
        quote.request.closedAt = new Date();
        quote.request.closureReason = 'Quote accepted';
        await this.quoteRequestRepository.save(quote.request);
      } else if (newStatus === QuoteStatus.REJECTED) {
        quote.rejectedAt = new Date();
        quote.rejectionReason = reason;
      }

      const updatedQuote = await this.quoteRepository.save(quote);
      logger.info('Quote status updated', { quoteId, newStatus, userId, userRole });

      return updatedQuote;
    } catch (error) {
      logger.error('Error updating quote status:', error);
      throw error;
    }
  }

  async searchQuotes(query: QuoteSearchQuery): Promise<{
    quotes: Quote[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const {
        requestId,
        providerId,
        customerId,
        status,
        serviceType,
        minPrice,
        maxPrice,
        page = 1,
        limit = 20,
        sortBy = 'created',
        sortOrder = 'desc',
      } = query;

      let queryBuilder = this.quoteRepository
        .createQueryBuilder('quote')
        .leftJoinAndSelect('quote.request', 'request')
        .leftJoinAndSelect('quote.provider', 'provider')
        .leftJoinAndSelect('provider.user', 'providerUser')
        .leftJoinAndSelect('quote.customer', 'customer');

      // Filter by request ID
      if (requestId) {
        queryBuilder = queryBuilder.andWhere('quote.requestId = :requestId', { requestId });
      }

      // Filter by provider
      if (providerId) {
        queryBuilder = queryBuilder.andWhere('quote.providerId = :providerId', { providerId });
      }

      // Filter by customer
      if (customerId) {
        queryBuilder = queryBuilder.andWhere('quote.customerId = :customerId', { customerId });
      }

      // Filter by status
      if (status) {
        queryBuilder = queryBuilder.andWhere('quote.status = :status', { status });
      }

      // Filter by service type
      if (serviceType) {
        queryBuilder = queryBuilder.andWhere('quote.serviceType = :serviceType', { serviceType });
      }

      // Filter by price range
      if (minPrice) {
        queryBuilder = queryBuilder.andWhere('quote.estimatedPrice >= :minPrice', { minPrice });
      }

      if (maxPrice) {
        queryBuilder = queryBuilder.andWhere('quote.estimatedPrice <= :maxPrice', { maxPrice });
      }

      // Apply sorting
      const sortField = 
        sortBy === 'price' ? 'quote.estimatedPrice' :
        sortBy === 'date' ? 'quote.validUntil' :
        'quote.createdAt';

      queryBuilder = queryBuilder.orderBy(sortField, sortOrder.toUpperCase() as 'ASC' | 'DESC');

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder = queryBuilder.skip(offset).take(limit);

      const [quotes, total] = await queryBuilder.getManyAndCount();

      logger.info('Quotes search completed', {
        total,
        page,
        limit,
        filters: { requestId, providerId, customerId, status },
      });

      return {
        quotes,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error searching quotes:', error);
      throw error;
    }
  }

  async withdrawQuote(quoteId: string, providerId: string): Promise<Quote> {
    try {
      const quote = await this.quoteRepository.findOne({
        where: { id: quoteId, providerId },
      });

      if (!quote) {
        throw new Error('Quote not found or access denied');
      }

      if (quote.status !== QuoteStatus.PENDING) {
        throw new Error('Can only withdraw pending quotes');
      }

      quote.status = QuoteStatus.WITHDRAWN;
      quote.updatedAt = new Date();

      const withdrawnQuote = await this.quoteRepository.save(quote);
      logger.info('Quote withdrawn', { quoteId, providerId });

      return withdrawnQuote;
    } catch (error) {
      logger.error('Error withdrawing quote:', error);
      throw error;
    }
  }

  private validateQuoteStatusTransition(
    currentStatus: QuoteStatus,
    newStatus: QuoteStatus,
    userRole: 'customer' | 'provider'
  ): boolean {
    const transitions: Record<QuoteStatus, Record<string, QuoteStatus[]>> = {
      [QuoteStatus.PENDING]: {
        customer: [QuoteStatus.ACCEPTED, QuoteStatus.REJECTED],
        provider: [QuoteStatus.WITHDRAWN],
      },
      [QuoteStatus.ACCEPTED]: {
        customer: [],
        provider: [],
      },
      [QuoteStatus.REJECTED]: {
        customer: [],
        provider: [],
      },
      [QuoteStatus.EXPIRED]: {
        customer: [],
        provider: [],
      },
      [QuoteStatus.WITHDRAWN]: {
        customer: [],
        provider: [],
      },
    };

    return transitions[currentStatus]?.[userRole]?.includes(newStatus) || false;
  }

  async expireOldQuotes(): Promise<void> {
    try {
      const expiredQuotes = await this.quoteRepository
        .createQueryBuilder()
        .update(Quote)
        .set({ 
          status: QuoteStatus.EXPIRED,
          updatedAt: new Date()
        })
        .where('status = :status', { status: QuoteStatus.PENDING })
        .andWhere('validUntil < :now', { now: new Date() })
        .execute();

      logger.info(`Expired ${expiredQuotes.affected} old quotes`);
    } catch (error) {
      logger.error('Error expiring old quotes:', error);
    }
  }

  async expireOldQuoteRequests(): Promise<void> {
    try {
      const expiredRequests = await this.quoteRequestRepository
        .createQueryBuilder()
        .update(QuoteRequest)
        .set({ 
          status: QuoteRequestStatus.CLOSED,
          closedAt: new Date(),
          closureReason: 'Expired',
          updatedAt: new Date()
        })
        .where('status = :status', { status: QuoteRequestStatus.OPEN })
        .andWhere('expiresAt < :now', { now: new Date() })
        .execute();

      logger.info(`Expired ${expiredRequests.affected} old quote requests`);
    } catch (error) {
      logger.error('Error expiring old quote requests:', error);
    }
  }
}

export default new QuoteService();