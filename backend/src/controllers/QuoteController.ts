import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import quoteService from '@/services/QuoteService';
import logger from '@/config/logger';
import { ApiResponse, AuthenticatedRequest } from '@/types';
import { AppDataSource } from '@/config/database';
import { User } from '@/models/User';
import { QuoteStatus } from '@/models/Quote';

export class QuoteController {
  // Quote Request Endpoints
  createQuoteRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        };
        res.status(400).json(response);
        return;
      }

      const customerId = req.user?.userId;
      if (!customerId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Ensure user is a customer
      if (req.user?.userType !== 'customer') {
        const response: ApiResponse = {
          success: false,
          message: 'Customer access required',
        };
        res.status(403).json(response);
        return;
      }

      // Convert date fields from strings to Date objects
      const requestData = {
        ...req.body,
        preferredDate: req.body.preferredDate ? new Date(req.body.preferredDate) : undefined,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      };

      const quoteRequest = await quoteService.createQuoteRequest(customerId, requestData);

      const response: ApiResponse = {
        success: true,
        message: 'Quote request created successfully',
        data: { quoteRequest },
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in createQuoteRequest controller:', error);

      let message = 'Failed to create quote request';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('inactive')) {
          statusCode = 400;
          message = error.message;
        }
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  }

  getQuoteRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Customers can only see their own quote requests
      const userIdFilter = req.user?.userType === 'customer' ? userId : undefined;
      
      const quoteRequest = await quoteService.getQuoteRequestById(requestId, userIdFilter);

      if (!quoteRequest) {
        const response: ApiResponse = {
          success: false,
          message: 'Quote request not found or access denied',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { quoteRequest },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getQuoteRequest controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve quote request',
      };

      res.status(500).json(response);
    }
  }

  updateQuoteRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        };
        res.status(400).json(response);
        return;
      }

      const { requestId } = req.params;
      const customerId = req.user?.userId;

      if (!customerId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Ensure user is a customer
      if (req.user?.userType !== 'customer') {
        const response: ApiResponse = {
          success: false,
          message: 'Customer access required',
        };
        res.status(403).json(response);
        return;
      }

      // Convert date fields from strings to Date objects
      const updateData = { ...req.body };
      if (updateData.preferredDate) {
        updateData.preferredDate = new Date(updateData.preferredDate);
      }
      if (updateData.expiresAt) {
        updateData.expiresAt = new Date(updateData.expiresAt);
      }

      const updatedRequest = await quoteService.updateQuoteRequest(requestId, customerId, updateData);

      const response: ApiResponse = {
        success: true,
        message: 'Quote request updated successfully',
        data: { quoteRequest: updatedRequest },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in updateQuoteRequest controller:', error);

      let message = 'Failed to update quote request';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('Cannot update')) {
          statusCode = 400;
          message = error.message;
        }
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  }

  closeQuoteRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;
      const { reason } = req.body;
      const customerId = req.user?.userId;

      if (!customerId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Ensure user is a customer
      if (req.user?.userType !== 'customer') {
        const response: ApiResponse = {
          success: false,
          message: 'Customer access required',
        };
        res.status(403).json(response);
        return;
      }

      const closedRequest = await quoteService.closeQuoteRequest(requestId, customerId, reason);

      const response: ApiResponse = {
        success: true,
        message: 'Quote request closed successfully',
        data: { quoteRequest: closedRequest },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in closeQuoteRequest controller:', error);

      let message = 'Failed to close quote request';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('already closed')) {
          statusCode = 400;
          message = error.message;
        }
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  }

  searchQuoteRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const userType = req.user?.userType;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const query = req.query as any;

      // Parse query parameters
      if (query.page) query.page = parseInt(query.page);
      if (query.limit) query.limit = parseInt(query.limit);
      if (query.minBudget) query.minBudget = parseFloat(query.minBudget);
      if (query.maxBudget) query.maxBudget = parseFloat(query.maxBudget);
      if (query.latitude) query.latitude = parseFloat(query.latitude);
      if (query.longitude) query.longitude = parseFloat(query.longitude);
      if (query.radius) query.radius = parseFloat(query.radius);

      // Filter by user role
      if (userType === 'customer') {
        query.customerId = userId;
      }
      // Providers can see all open quote requests in their area (public search)

      const result = await quoteService.searchQuoteRequests(query);

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in searchQuoteRequests controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to search quote requests',
      };

      res.status(500).json(response);
    }
  }

  // Quote Endpoints
  createQuote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        };
        res.status(400).json(response);
        return;
      }

      const providerId = req.user?.userId;
      if (!providerId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Ensure user is a provider
      if (req.user?.userType !== 'provider') {
        const response: ApiResponse = {
          success: false,
          message: 'Provider access required',
        };
        res.status(403).json(response);
        return;
      }

      // Convert validUntil string to Date object
      const quoteData = {
        ...req.body,
        validUntil: new Date(req.body.validUntil),
      };

      const quote = await quoteService.createQuote(providerId, quoteData);

      const response: ApiResponse = {
        success: true,
        message: 'Quote created successfully',
        data: { quote },
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in createQuote controller:', error);

      let message = 'Failed to create quote';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('inactive') || error.message.includes('not accepting')) {
          statusCode = 400;
          message = error.message;
        } else if (error.message.includes('already submitted')) {
          statusCode = 409;
          message = error.message;
        }
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  }

  getQuote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { quoteId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const quote = await quoteService.getQuoteById(quoteId, userId);

      if (!quote) {
        const response: ApiResponse = {
          success: false,
          message: 'Quote not found or access denied',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { quote },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getQuote controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve quote',
      };

      res.status(500).json(response);
    }
  }

  updateQuote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        };
        res.status(400).json(response);
        return;
      }

      const { quoteId } = req.params;
      const providerId = req.user?.userId;

      if (!providerId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Ensure user is a provider
      if (req.user?.userType !== 'provider') {
        const response: ApiResponse = {
          success: false,
          message: 'Provider access required',
        };
        res.status(403).json(response);
        return;
      }

      // Convert validUntil string to Date object if present
      const updateData = { ...req.body };
      if (updateData.validUntil) {
        updateData.validUntil = new Date(updateData.validUntil);
      }

      const updatedQuote = await quoteService.updateQuote(quoteId, providerId, updateData);

      const response: ApiResponse = {
        success: true,
        message: 'Quote updated successfully',
        data: { quote: updatedQuote },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in updateQuote controller:', error);

      let message = 'Failed to update quote';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('Cannot update')) {
          statusCode = 400;
          message = error.message;
        }
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  }

  updateQuoteStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        };
        res.status(400).json(response);
        return;
      }

      const { quoteId } = req.params;
      const { status, reason } = req.body;
      const userId = req.user?.userId;
      const userType = req.user?.userType;

      if (!userId || !userType) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const updatedQuote = await quoteService.updateQuoteStatus(
        quoteId,
        userId,
        status,
        userType as 'customer' | 'provider',
        reason
      );

      // When a customer accepts a quote, tell the frontend whether they still need to set up a payment method
      let requiresPaymentSetup = false;
      if (status === QuoteStatus.ACCEPTED) {
        const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
        requiresPaymentSetup = !user?.stripePaymentMethodId;
      }

      const response: ApiResponse = {
        success: true,
        message: `Quote status updated to ${status}`,
        data: { quote: updatedQuote, requiresPaymentSetup },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in updateQuoteStatus controller:', error);

      let message = 'Failed to update quote status';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('Access denied')) {
          statusCode = 403;
          message = error.message;
        } else if (error.message.includes('Invalid status transition')) {
          statusCode = 400;
          message = error.message;
        }
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  }

  searchQuotes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const userType = req.user?.userType;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const query = req.query as any;

      // Parse query parameters
      if (query.page) query.page = parseInt(query.page);
      if (query.limit) query.limit = parseInt(query.limit);
      if (query.minPrice) query.minPrice = parseFloat(query.minPrice);
      if (query.maxPrice) query.maxPrice = parseFloat(query.maxPrice);

      // Filter by user role
      if (userType === 'customer') {
        query.customerId = userId;
      } else if (userType === 'provider') {
        query.providerId = userId;
      }

      const result = await quoteService.searchQuotes(query);

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in searchQuotes controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to search quotes',
      };

      res.status(500).json(response);
    }
  }

  withdrawQuote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { quoteId } = req.params;
      const providerId = req.user?.userId;

      if (!providerId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Ensure user is a provider
      if (req.user?.userType !== 'provider') {
        const response: ApiResponse = {
          success: false,
          message: 'Provider access required',
        };
        res.status(403).json(response);
        return;
      }

      const withdrawnQuote = await quoteService.withdrawQuote(quoteId, providerId);

      const response: ApiResponse = {
        success: true,
        message: 'Quote withdrawn successfully',
        data: { quote: withdrawnQuote },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in withdrawQuote controller:', error);

      let message = 'Failed to withdraw quote';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('Can only withdraw')) {
          statusCode = 400;
          message = error.message;
        }
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  }

  getQuotesForRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const sortBy = (req.query.sortBy as string) || 'price';
      const sortOrder = (req.query.sortOrder as string) || 'asc';

      const query: import('@/types').QuoteSearchQuery = {
        requestId,
        page,
        limit,
        sortBy: sortBy as 'price' | 'date' | 'created',
        sortOrder: sortOrder as 'asc' | 'desc',
      };

      // If user is a customer, ensure they can only see quotes for their requests
      if (req.user?.userType === 'customer') {
        query.customerId = userId;
      }

      const result = await quoteService.searchQuotes(query);

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getQuotesForRequest controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve quotes for request',
      };

      res.status(500).json(response);
    }
  }
}

export default new QuoteController();