import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { toast } from 'react-hot-toast';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profileImage?: string;
  userType: 'customer' | 'provider' | 'admin';
  isVerified: boolean;
  settings?: {
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
    privacy: {
      showProfile: boolean;
      showLocation: boolean;
    };
  };
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Provider {
  id: string;
  userId: string;
  businessName: string;
  description: string;
  services: string[];
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  } | string;
  serviceRadius: number;
  rating: number;
  totalReviews: number;
  portfolioImages: string[];
  profileImage?: string;
  profileCompletion?: number;
  isBackgroundChecked: boolean;
  isInsured: boolean;
  isActive: boolean;
  pricing: {
    baseRate: number;
    currency: string;
    rateType: 'hourly' | 'fixed' | 'quote';
  };
  availableHours: {
    monday:    { start: string; end: string; available: boolean };
    tuesday:   { start: string; end: string; available: boolean };
    wednesday: { start: string; end: string; available: boolean };
    thursday:  { start: string; end: string; available: boolean };
    friday:    { start: string; end: string; available: boolean };
    saturday:  { start: string; end: string; available: boolean };
    sunday:    { start: string; end: string; available: boolean };
  };
  completedJobs: number;
  responseRate: number;
  averageResponseTime: number;
}

export interface Booking {
  id: string;
  customerId: string;
  providerId: string;
  provider: Provider;
  customer: User;
  serviceType: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  scheduledDate: string;
  estimatedDuration: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'pending_completion' | 'completed' | 'in_dispute' | 'cancelled';
  totalAmount: number;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteRequest {
  id: string;
  customerId: string;
  serviceType: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  preferredDate?: string;
  budget?: {
    min: number;
    max: number;
    currency: string;
  };
  images?: string[];
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'closed' | 'cancelled';
  requirements?: Array<{
    category: string;
    requirement: string;
    mandatory: boolean;
  }>;
  availability?: Array<{
    date: string;
    timeSlots: Array<{
      start: string;
      end: string;
    }>;
  }>;
  searchRadius: number;
  expiresAt?: string;
  quotesReceived: number;
  closedAt?: string;
  closureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  id: string;
  requestId: string;
  providerId: string;
  customerId: string;
  serviceType: string;
  description: string;
  estimatedPrice: number;
  estimatedDuration: number;
  validUntil: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';
  breakdown?: {
    labor: number;
    materials: number;
    equipment: number;
    other: number;
    tax: number;
  };
  terms?: Array<{
    item: string;
    description: string;
  }>;
  notes?: string;
  attachments?: string[];
  acceptedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  provider?: Provider;
}

export interface ProviderAnalysis {
  providerId: string;
  matchScore: number;
  strengths: string[];
  concerns: string[];
  reviewSentiment: string;
  uniqueValue?: string;
  riskFactors?: string[];
}

export interface Recommendation {
  rank: number;
  provider: {
    providerId: string;
    businessName: string;
    rating: number;
    totalReviews: number;
    services: string[];
    pricing?: { baseRate?: number; hourlyRate?: number; currency: string; rateType?: string } | null;
  };
  analysis: ProviderAnalysis;
  reasoning: string;
  tradeoffs?: string[];
  bestFor?: string;
}

export interface WorkflowProviderResult {
  providerId: string;
  providerName: string;
  businessName: string;
  services: string[];
  matchScore: number;
  rating: number;
  totalReviews: number;
  pricing: {
    baseRate: number;
    currency: string;
    rateType: string;
  } | null;
  location: {
    city: string;
    state: string;
  } | null;
  isBackgroundChecked: boolean;
  isInsured: boolean;
}

export interface VerificationCheckResult {
  passed: boolean;
  notes: string;
}

export interface VerificationReport {
  passed: boolean;
  qualityScore: number;
  requirementsCoverage: VerificationCheckResult;
  recommendationQuality: VerificationCheckResult;
  completeness: VerificationCheckResult;
  suggestions: string[];
  timedOut?: boolean;
}

export interface WorkflowData {
  id: string;
  userId: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled' | 'waiting_for_user';
  currentAgent: string | null;
  agentHistory: Array<{
    agentName: string;
    action: string;
    status: string;
    startTime: string;
    endTime?: string;
    durationMs?: number;
    output?: Record<string, unknown>;
  }>;
  context: {
    workflowId: string;
    userId: string;
    userRequest: string;
    createdAt: string;
    requirements?: {
      isComplete: boolean;
      followUpQuestion?: string;
      extractedFacts?: string[];
      missingInformation?: string[];
    };
    searchResults?: WorkflowProviderResult[];
    analysisResults?: ProviderAnalysis[];
    recommendations?: Recommendation[];
    verification?: VerificationReport;
  };
  error?: {
    message: string;
    code?: string;
    agentName?: string;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// VITE_API_URL is intentionally unset when frontend is served by the same Express server —
// relative /api/v1 URLs resolve correctly in that case.

class ApiService {
  private api: AxiosInstance;
  private baseURL = import.meta.env.VITE_API_URL || '/api/v1';

  constructor() {
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
              const response = await this.api.post('/auth/refresh', {
                refreshToken,
              });

              const { accessToken, refreshToken: newRefreshToken } = response.data.data;
              localStorage.setItem('accessToken', accessToken);
              localStorage.setItem('refreshToken', newRefreshToken);

              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              return this.api(originalRequest);
            }
          } catch (refreshError) {
            this.logout();
            window.location.href = '/login';
          }
        }

        if (error.response?.data?.error) {
          toast.error(error.response.data.error);
        } else if (error.message) {
          toast.error(error.message);
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async register(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    userType: 'customer' | 'provider';
  }): Promise<{ email: string; firstName: string }> {
    const response = await this.api.post<ApiResponse<{ email: string; firstName: string }>>('/auth/register', userData);
    return response.data.data!;
  }

  async verifyEmail(token: string): Promise<void> {
    await this.api.get('/auth/verify-email', { params: { token } });
  }

  async resendVerification(email: string): Promise<void> {
    await this.api.post('/auth/resend-verification', { email });
  }

  async forgotPassword(email: string): Promise<void> {
    await this.api.post('/auth/forgot-password', { email });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.api.post('/auth/reset-password', { token, password });
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.api.post<ApiResponse<AuthResponse>>('/auth/login', {
      email,
      password,
    });
    const { accessToken, refreshToken } = response.data.data!;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    return response.data.data!;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } catch (error) {
      // Continue with logout even if API call fails
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }

  async getProfile(): Promise<User> {
    const response = await this.api.get<ApiResponse<User>>('/auth/profile');
    return response.data.data!;
  }

  async updateProfile(updates: Partial<User>): Promise<User> {
    const response = await this.api.put<ApiResponse<User>>('/auth/profile', updates);
    return response.data.data!;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.api.put('/auth/password', {
      currentPassword,
      newPassword,
    });
  }

  async deleteAccount(): Promise<void> {
    await this.api.delete('/users/profile');
  }

  // Provider methods
  async getProviders(params?: {
    page?: number;
    limit?: number;
    latitude?: number;
    longitude?: number;
    radius?: number;
    serviceType?: string;
  }): Promise<PaginatedResponse<Provider>> {
    const response = await this.api.get<PaginatedResponse<Provider>>('/providers', {
      params,
    });
    return response.data;
  }

  async getProvider(id: string): Promise<Provider> {
    const response = await this.api.get<ApiResponse<Provider>>(`/providers/${id}`);
    return response.data.data!;
  }

  // Booking methods
  async getBookings(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<PaginatedResponse<Booking>> {
    const response = await this.api.get<PaginatedResponse<Booking>>('/bookings', {
      params,
    });
    return response.data;
  }

  async createBooking(bookingData: {
    providerId: string;
    serviceType: string;
    description: string;
    location: {
      latitude: number;
      longitude: number;
      address: string;
      city: string;
      state: string;
      zipCode: string;
    };
    scheduledDate: string;
    estimatedDuration: number;
    totalAmount: number;
    specialInstructions?: string;
  }): Promise<Booking> {
    const response = await this.api.post<ApiResponse<Booking>>('/bookings', bookingData);
    return response.data.data!;
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking> {
    const response = await this.api.put<ApiResponse<Booking>>(`/bookings/${id}`, updates);
    return response.data.data!;
  }

  async getBooking(id: string): Promise<Booking> {
    const response = await this.api.get<ApiResponse<Booking>>(`/bookings/${id}`);
    return response.data.data!;
  }

  async cancelBooking(id: string, reason?: string): Promise<void> {
    await this.api.delete(`/bookings/${id}`, { data: { reason } });
  }

  // Location and GPS methods
  async geocodeAddress(address: string): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/locations/geocode', {
      address,
    });
    return response.data.data;
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/locations/reverse-geocode', {
      latitude,
      longitude,
    });
    return response.data.data;
  }

  async searchProvidersGPS(params: {
    latitude: number;
    longitude: number;
    radius?: number;
    serviceTypes?: string[];
    sortBy?: 'distance' | 'rating' | 'price' | 'response_time';
    minRating?: number;
    maxPrice?: number;
    hasInsurance?: boolean;
    hasBackgroundCheck?: boolean;
    isAvailable?: boolean;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{
    providers: (Provider & { distance: number; distanceText: string; duration: number; durationText: string })[];
    totalCount: number;
    page: number;
    totalPages: number;
    searchParams: any;
  }>> {
    // TEMPORARY WORKAROUND: Use GET endpoint with query params instead of POST
    const queryParams = new URLSearchParams();
    queryParams.append('latitude', params.latitude.toString());
    queryParams.append('longitude', params.longitude.toString());
    if (params.radius) queryParams.append('radius', params.radius.toString());

    // Send service type if any are selected
    if (params.serviceTypes && params.serviceTypes.length > 0) {
      queryParams.append('serviceType', params.serviceTypes[0]);
    }

    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.minRating && params.minRating > 0) queryParams.append('minRating', params.minRating.toString());
    if (params.maxPrice) queryParams.append('maxRate', params.maxPrice.toString());

    // Only send boolean filters when they are TRUE (enabled)
    if (params.hasInsurance === true) queryParams.append('isInsured', 'true');
    if (params.hasBackgroundCheck === true) queryParams.append('isBackgroundChecked', 'true');
    if (params.isAvailable === true) queryParams.append('isVerified', 'true');

    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());

    const response = await this.api.get<ApiResponse<{
      providers: (Provider & { distance: number; distanceText: string; duration: number; durationText: string })[];
      totalCount: number;
      page: number;
      totalPages: number;
      searchParams: any;
    }>>(`/locations/providers/search?${queryParams.toString()}`);
    return response.data;
  }

  async calculateDistance(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number }
  ): Promise<{ distance: number; duration: number; route?: any }> {
    const response = await this.api.post<ApiResponse<any>>('/locations/distance', {
      origin,
      destination,
    });
    return response.data.data;
  }

  async searchNearbyPlaces(
    latitude: number,
    longitude: number,
    radius: number,
    type?: string
  ): Promise<any[]> {
    const response = await this.api.post<ApiResponse<any[]>>('/locations/nearby-search', {
      latitude,
      longitude,
      radius,
      type,
    });
    return response.data.data || [];
  }

  // Quote Request methods
  async createQuoteRequest(requestData: {
    serviceType: string;
    description: string;
    location: {
      latitude: number;
      longitude: number;
      address: string;
      city: string;
      state: string;
      zipCode: string;
    };
    preferredDate?: string;
    budget?: {
      min: number;
      max: number;
      currency: string;
    };
    images?: string[];
    urgency: 'low' | 'medium' | 'high' | 'urgent';
    requirements?: Array<{
      category: string;
      requirement: string;
      mandatory: boolean;
    }>;
    availability?: Array<{
      date: string;
      timeSlots: Array<{
        start: string;
        end: string;
      }>;
    }>;
    searchRadius?: number;
    expiresAt?: string;
  }): Promise<QuoteRequest> {
    const response = await this.api.post<ApiResponse<{ quoteRequest: QuoteRequest }>>('/quotes/requests', requestData);
    return response.data.data!.quoteRequest;
  }

  async getQuoteRequest(requestId: string): Promise<QuoteRequest> {
    const response = await this.api.get<ApiResponse<{ quoteRequest: QuoteRequest }>>(`/quotes/requests/${requestId}`);
    return response.data.data!.quoteRequest;
  }

  async updateQuoteRequest(requestId: string, updates: Partial<QuoteRequest>): Promise<QuoteRequest> {
    const response = await this.api.put<ApiResponse<{ quoteRequest: QuoteRequest }>>(`/quotes/requests/${requestId}`, updates);
    return response.data.data!.quoteRequest;
  }

  async closeQuoteRequest(requestId: string, reason?: string): Promise<QuoteRequest> {
    const response = await this.api.post<ApiResponse<{ quoteRequest: QuoteRequest }>>(`/quotes/requests/${requestId}/close`, { reason });
    return response.data.data!.quoteRequest;
  }

  async searchQuoteRequests(params?: {
    page?: number;
    limit?: number;
    serviceType?: string;
    status?: string;
    urgency?: string;
    minBudget?: number;
    maxBudget?: number;
    latitude?: number;
    longitude?: number;
    radius?: number;
  }): Promise<PaginatedResponse<QuoteRequest>> {
    const response = await this.api.get<ApiResponse<{ quoteRequests: QuoteRequest[]; total: number; page: number; limit: number }>>('/quotes/requests', { params });
    const d = response.data.data!;
    return { success: true, data: d.quoteRequests, pagination: { page: d.page, limit: d.limit, total: d.total, pages: Math.ceil(d.total / d.limit) } };
  }

  // Quote methods  
  async createQuote(quoteData: {
    requestId: string;
    serviceType: string;
    description: string;
    estimatedPrice: number;
    estimatedDuration: number;
    validUntil: string;
    breakdown?: {
      labor: number;
      materials: number;
      equipment: number;
      other: number;
      tax: number;
    };
    terms?: Array<{
      item: string;
      description: string;
    }>;
    notes?: string;
    attachments?: string[];
  }): Promise<Quote> {
    const response = await this.api.post<ApiResponse<{ quote: Quote }>>('/quotes', quoteData);
    return response.data.data!.quote;
  }

  async getQuote(quoteId: string): Promise<Quote> {
    const response = await this.api.get<ApiResponse<{ quote: Quote }>>(`/quotes/${quoteId}`);
    return response.data.data!.quote;
  }

  async updateQuote(quoteId: string, updates: Partial<Quote>): Promise<Quote> {
    const response = await this.api.put<ApiResponse<{ quote: Quote }>>(`/quotes/${quoteId}`, updates);
    return response.data.data!.quote;
  }

  async updateQuoteStatus(quoteId: string, status: 'accepted' | 'rejected' | 'withdrawn', reason?: string): Promise<Quote> {
    const response = await this.api.put<ApiResponse<{ quote: Quote }>>(`/quotes/${quoteId}/status`, { status, reason });
    return response.data.data!.quote;
  }

  async withdrawQuote(quoteId: string): Promise<Quote> {
    const response = await this.api.delete<ApiResponse<{ quote: Quote }>>(`/quotes/${quoteId}`);
    return response.data.data!.quote;
  }

  async getQuotesForRequest(requestId: string, params?: {
    page?: number;
    limit?: number;
    sortBy?: 'price' | 'rating' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Quote>> {
    const response = await this.api.get<PaginatedResponse<Quote>>(`/quotes/requests/${requestId}/quotes`, {
      params,
    });
    return response.data;
  }

  async searchQuotes(params?: {
    page?: number;
    limit?: number;
    status?: string;
    minPrice?: number;
    maxPrice?: number;
    serviceType?: string;
  }): Promise<PaginatedResponse<Quote>> {
    const response = await this.api.get<ApiResponse<{ quotes: Quote[]; total: number; page: number; limit: number }>>('/quotes', { params });
    const d = response.data.data!;
    return { success: true, data: d.quotes, pagination: { page: d.page, limit: d.limit, total: d.total, pages: Math.ceil(d.total / d.limit) } };
  }

  // Messaging methods
  async getConversations(params?: {
    type?: 'direct' | 'group' | 'support';
    isActive?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'lastMessage' | 'created' | 'title';
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>('/messages/conversations', {
      params,
    });
    return response.data;
  }

  async createConversation(conversationData: {
    participantIds: string[];
    title?: string;
    description?: string;
    type?: 'direct' | 'group' | 'support';
    metadata?: {
      bookingId?: string;
      quoteRequestId?: string;
      serviceType?: string;
    };
  }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/messages/conversations', conversationData);
    return response.data.data!;
  }

  async uploadMessageAttachment(file: File): Promise<{ url: string; originalName: string; mimeType: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.api.post<ApiResponse<{ url: string; originalName: string; mimeType: string; size: number }>>(
      '/messages/messages/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data.data!;
  }

  async getConversation(conversationId: string): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>(`/messages/conversations/${conversationId}`);
    return response.data.data!;
  }

  async sendMessage(messageData: {
    conversationId: string;
    message: string;
    messageType?: 'text' | 'image' | 'file';
    attachments?: string[];
    replyToMessageId?: string;
  }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/messages/messages', messageData);
    return response.data.data!;
  }

  async getMessages(conversationId: string, params?: {
    senderId?: string;
    receiverId?: string;
    messageType?: 'text' | 'image' | 'file';
    isRead?: boolean;
    page?: number;
    limit?: number;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>(`/messages/conversations/${conversationId}/messages`, {
      params,
    });
    return response.data;
  }

  async markMessagesAsRead(conversationId: string): Promise<void> {
    await this.api.patch(`/messages/conversations/${conversationId}/messages/read`);
  }

  async updateMessage(messageId: string, updates: {
    message?: string;
    attachments?: string[];
  }): Promise<any> {
    const response = await this.api.patch<ApiResponse<any>>(`/messages/messages/${messageId}`, updates);
    return response.data.data!;
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.api.delete(`/messages/messages/${messageId}`);
  }

  async getUnreadMessageCount(): Promise<{ count: number }> {
    const response = await this.api.get<ApiResponse<{ count: number }>>('/messages/messages/unread/count');
    return response.data.data!;
  }

  // Payment methods
  async getPayments(params?: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>('/payments', {
      params,
    });
    return response.data;
  }

  async getPayment(paymentId: string): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>(`/payments/${paymentId}`);
    return response.data.data!;
  }

  async createPaymentIntent(paymentData: {
    bookingId: string;
    amount: number;
    currency?: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/payments/intent', paymentData);
    return response.data.data!;
  }

  async confirmPayment(paymentId: string, paymentMethodId?: string): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>(`/payments/${paymentId}/confirm`, {
      paymentMethodId,
    });
    return response.data.data!;
  }

  async refundPayment(paymentId: string, refundData: {
    amount?: number;
    reason?: string;
    refundApplicationFee?: boolean;
    reverseTransfer?: boolean;
  }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>(`/payments/${paymentId}/refund`, refundData);
    return response.data.data!;
  }

  async getCustomerPayments(customerId: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>(`/payments/customer/${customerId}`, {
      params,
    });
    return response.data;
  }

  async getProviderPayments(providerId: string, params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>(`/payments/provider/${providerId}`, {
      params,
    });
    return response.data;
  }

  // AI Assistant Workflow methods
  async startWorkflow(initialMessage: string): Promise<{ workflowId: string; status: string }> {
    const response = await this.api.post<ApiResponse<{ workflowId: string; status: string }>>(
      '/agentic-assistant/workflows',
      { initialMessage },
      { timeout: 30000 } // LLM calls can take longer
    );
    return response.data.data!;
  }

  async getWorkflow(workflowId: string): Promise<WorkflowData> {
    const response = await this.api.get<ApiResponse<{ workflow: WorkflowData }>>(
      `/agentic-assistant/workflows/${workflowId}`
    );
    return response.data.data!.workflow;
  }

  async sendWorkflowMessage(workflowId: string, message: string): Promise<WorkflowData> {
    const response = await this.api.post<ApiResponse<{ workflow: WorkflowData }>>(
      `/agentic-assistant/workflows/${workflowId}/messages`,
      { message },
      { timeout: 30000 }
    );
    return response.data.data!.workflow;
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    await this.api.delete(`/agentic-assistant/workflows/${workflowId}`);
  }

  // Health check
  async healthCheck(): Promise<any> {
    const response = await this.api.get('/health');
    return response.data;
  }

  // Review methods
  async getReviews(params?: {
    providerId?: string;
    customerId?: string;
    bookingId?: string;
    rating?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>('/reviews', {
      params,
    });
    return response.data;
  }

  async getReview(reviewId: string): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>(`/reviews/${reviewId}`);
    return response.data.data!;
  }

  async createReview(reviewData: {
    bookingId: string;
    providerId: string;
    rating: number;
    title: string;
    comment: string;
    criteria?: {
      quality: number;
      timeliness: number;
      communication: number;
      professionalism: number;
      value: number;
    };
    photos?: string[];
    isAnonymous?: boolean;
  }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>('/reviews', reviewData);
    return response.data.data!;
  }

  async updateReview(reviewId: string, reviewData: {
    rating?: number;
    title?: string;
    comment?: string;
    criteria?: {
      quality?: number;
      timeliness?: number;
      communication?: number;
      professionalism?: number;
      value?: number;
    };
    photos?: string[];
    isAnonymous?: boolean;
  }): Promise<any> {
    const response = await this.api.put<ApiResponse<any>>(`/reviews/${reviewId}`, reviewData);
    return response.data.data!;
  }

  async deleteReview(reviewId: string): Promise<void> {
    await this.api.delete(`/reviews/${reviewId}`);
  }

  async addProviderResponse(reviewId: string, response: string): Promise<any> {
    const responseData = await this.api.post<ApiResponse<any>>(`/reviews/${reviewId}/response`, { response });
    return responseData.data.data!;
  }

  async draftProviderResponse(reviewId: string): Promise<{ draftResponse: string }> {
    const responseData = await this.api.post<ApiResponse<any>>(`/reviews/${reviewId}/draft-response`, {});
    return responseData.data.data!;
  }

  async getProviderReviews(providerId: string, params?: {
    page?: number;
    limit?: number;
    rating?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>(`/reviews/provider/${providerId}`, {
      params,
    });
    return response.data;
  }

  async getMyCustomerReviews(params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>('/reviews/customer/my', {
      params,
    });
    return response.data;
  }

  async getMyProviderReviews(params?: {
    page?: number;
    limit?: number;
    rating?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>('/reviews/provider/my', {
      params,
    });
    return response.data;
  }

  async flagReview(reviewId: string, reason: string, details?: string): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>(`/reviews/${reviewId}/flag`, {
      reason,
      details,
    });
    return response.data.data!;
  }

  async getReviewAnalytics(providerId: string): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>(`/reviews/analytics/${providerId}`);
    return response.data.data!;
  }

  async searchReviews(params?: {
    query?: string;
    providerId?: string;
    rating?: number;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<any>> {
    const response = await this.api.get<PaginatedResponse<any>>('/reviews/search', {
      params,
    });
    return response.data;
  }

  // Provider Dashboard methods
  async getProviderDashboardStats(period: string = 'month'): Promise<any> {
    const response = await this.api.get(`/providers/my/dashboard-stats?period=${period}`);
    return response.data;
  }

  async getProviderBookings(params: {
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.append('status', params.status);
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.limit) searchParams.append('limit', params.limit.toString());
    
    const response = await this.api.get(`/bookings/provider/my?${searchParams}`);
    return response.data;
  }

  async getProviderProfile(providerId: string): Promise<Provider> {
    const response = await this.api.get(`/providers/${providerId}`);
    return response.data;
  }

  async getMyProviderProfile(): Promise<ApiResponse<{provider: Provider}>> {
    const response = await this.api.get(`/providers/my`);
    return response.data;
  }

  async updateProviderProfile(providerId: string, data: Partial<Provider>): Promise<Provider> {
    const response = await this.api.put(`/providers/${providerId}`, data);
    return response.data;
  }

  async updateAvailability(availability: Provider['availableHours']): Promise<Provider['availableHours']> {
    const response = await this.api.patch<ApiResponse<Provider['availableHours']>>('/providers/availability', availability);
    return response.data.data!;
  }

  async getServiceCatalog(): Promise<string[]> {
    const response = await this.api.get<ApiResponse<{ services: string[] }>>('/providers/services/catalog');
    return response.data.data?.services ?? [];
  }


  async updateBookingStatus(bookingId: string, status: string): Promise<any> {
    const response = await this.api.put(`/bookings/${bookingId}/status`, { status });
    return response.data;
  }

  async startBooking(bookingId: string): Promise<any> {
    const response = await this.api.post(`/bookings/${bookingId}/start`, {});
    return response.data;
  }

  async markBookingComplete(bookingId: string): Promise<any> {
    const response = await this.api.post(`/bookings/${bookingId}/complete`, {});
    return response.data;
  }

  async confirmBookingCompletion(bookingId: string): Promise<any> {
    const response = await this.api.post(`/bookings/${bookingId}/confirm-completion`, {});
    return response.data;
  }

  async disputeBooking(bookingId: string, reason: string): Promise<any> {
    const response = await this.api.post(`/bookings/${bookingId}/dispute`, { reason });
    return response.data;
  }

  // Notification methods
  async getUserNotifications(params: {
    type?: string;
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  } = {}): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params.type) searchParams.append('type', params.type);
    if (params.page) searchParams.append('page', params.page.toString());
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.unreadOnly) searchParams.append('unreadOnly', 'true');
    
    const response = await this.api.get(`/notifications?${searchParams}`);
    return response.data;
  }

  async getUnreadNotificationCount(): Promise<{ unreadCount: number }> {
    const response = await this.api.get('/notifications/unread/count');
    return response.data?.data ?? response.data;
  }

  async markNotificationsRead(notificationIds: string[]): Promise<any> {
    const response = await this.api.patch('/notifications/read', { notificationIds });
    return response.data;
  }

  async markAllNotificationsRead(): Promise<any> {
    const response = await this.api.patch('/notifications/read-all');
    return response.data;
  }

  async deleteNotifications(notificationIds: string[]): Promise<any> {
    const response = await this.api.delete('/notifications', { 
      data: { notificationIds } 
    });
    return response.data;
  }

  async getNotificationPreferences(): Promise<any> {
    const response = await this.api.get('/notifications/preferences');
    return response.data?.data ?? response.data;
  }

  async updateNotificationPreferences(preferences: any): Promise<any> {
    const response = await this.api.put('/notifications/preferences', preferences);
    return response.data;
  }

  // ── Admin methods ──────────────────────────────────────────────────

  async getAdminDashboard(): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>('/admin/dashboard');
    return response.data.data!;
  }

  async getAdminUsers(params?: { page?: number; limit?: number; userType?: string; isActive?: boolean; search?: string }): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>('/admin/users', { params });
    return response.data.data!;
  }

  async updateUserStatus(userId: string, payload: {
    isActive: boolean;
    suspensionReason?: string;
    suspensionComment?: string;
    suspendedUntil?: string | null;
  }): Promise<any> {
    const response = await this.api.put<ApiResponse<any>>(`/admin/users/${userId}/status`, payload);
    return response.data.data!;
  }

  async getPendingProviders(params?: { page?: number; limit?: number }): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>('/admin/providers/pending', { params });
    return response.data.data!;
  }

  async verifyProvider(providerId: string, payload: { approved: boolean; notes?: string; isBackgroundChecked?: boolean; isInsured?: boolean }): Promise<any> {
    const response = await this.api.post<ApiResponse<any>>(`/admin/providers/${providerId}/verify`, payload);
    return response.data.data!;
  }

  async getFlaggedReviews(params?: { page?: number; limit?: number }): Promise<any> {
    const response = await this.api.get<ApiResponse<any>>('/admin/reviews/flagged', { params });
    return response.data.data!;
  }

  async moderateReview(reviewId: string, payload: { action: 'approve' | 'delete' | 'keep_flagged'; reason?: string }): Promise<any> {
    const response = await this.api.put<ApiResponse<any>>(`/admin/reviews/${reviewId}/moderate`, payload);
    return response.data.data!;
  }

  // Utility methods
  isAuthenticated(): boolean {
    return !!localStorage.getItem('accessToken');
  }

  getStoredUser(): User | null {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  setStoredUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  }

  clearStoredUser(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  // Generic HTTP methods for ad-hoc requests (admin pages, payment forms, etc.)
  get(path: string, config?: any) { return this.api.get(path, config); }
  post(path: string, data?: any, config?: any) { return this.api.post(path, data, config); }
  put(path: string, data?: any, config?: any) { return this.api.put(path, data, config); }
  patch(path: string, data?: any, config?: any) { return this.api.patch(path, data, config); }
  delete(path: string, config?: any) { return this.api.delete(path, config); }

  async voiceTranscribe(audioBlob: Blob, filename: string): Promise<string> {
    const form = new FormData();
    form.append('audio', audioBlob, filename);
    // Use fetch directly — axios instance default 'Content-Type: application/json' breaks
    // multipart uploads by overwriting the browser-generated boundary parameter
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${this.baseURL}/voice/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? res.statusText);
    }
    const json = await res.json();
    return json.data?.transcript ?? '';
  }

  async voiceSynthesize(text: string): Promise<Blob> {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${this.baseURL}/voice/synthesize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.blob();
  }
}

export const apiService = new ApiService();
export default apiService;