export interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profileImage?: string;
  userType: 'customer' | 'provider' | 'admin';
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Provider extends User {
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
  };
  serviceRadius: number;
  rating: number;
  totalReviews: number;
  portfolioImages: string[];
  isBackgroundChecked: boolean;
  isInsured: boolean;
  availableHours: {
    [key: string]: {
      start: string;
      end: string;
      available: boolean;
    };
  };
}

export interface Booking {
  id: string;
  customerId: string;
  providerId: string;
  serviceType: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  scheduledDate: Date;
  estimatedDuration: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  totalAmount: number;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  specialInstructions?: string;
  createdAt: Date;
  updatedAt: Date;
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
  validUntil: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  breakdown?: {
    labor: number;
    materials: number;
    other: number;
  };
  createdAt: Date;
  updatedAt: Date;
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
  };
  preferredDate?: Date;
  budget?: {
    min: number;
    max: number;
  };
  images?: string[];
  urgency: 'low' | 'medium' | 'high';
  status: 'open' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  message: string;
  messageType: 'text' | 'image' | 'file';
  attachments?: string[];
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  rating: number;
  comment?: string;
  images?: string[];
  response?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  amount: number;
  fee: number;
  currency: string;
  paymentMethod: string;
  stripePaymentIntentId?: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface JwtPayload {
  userId: string;
  email: string;
  userType: 'customer' | 'provider' | 'admin';
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export interface LocationSearchParams {
  latitude: number;
  longitude: number;
  radius: number;
  serviceType?: string;
}

export interface ProviderSearchResult extends Provider {
  distance: number;
  averageResponseTime: number;
  completionRate: number;
}

export interface CreateProviderRequest {
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
  };
  serviceRadius?: number;
  availableHours: {
    monday: { start: string; end: string; available: boolean };
    tuesday: { start: string; end: string; available: boolean };
    wednesday: { start: string; end: string; available: boolean };
    thursday: { start: string; end: string; available: boolean };
    friday: { start: string; end: string; available: boolean };
    saturday: { start: string; end: string; available: boolean };
    sunday: { start: string; end: string; available: boolean };
  };
  pricing?: {
    baseRate: number;
    currency: string;
    rateType: 'hourly' | 'fixed' | 'quote';
  };
  certifications?: Array<{
    name: string;
    issuer: string;
    dateObtained: Date;
    expiryDate?: Date;
    documentUrl?: string;
  }>;
  insurance?: {
    provider: string;
    policyNumber: string;
    coverage: number;
    expiryDate: Date;
    documentUrl?: string;
  };
  portfolioImages?: string[];
}

export interface UpdateProviderRequest {
  businessName?: string;
  description?: string;
  services?: string[];
  location?: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  serviceRadius?: number;
  availableHours?: {
    monday: { start: string; end: string; available: boolean };
    tuesday: { start: string; end: string; available: boolean };
    wednesday: { start: string; end: string; available: boolean };
    thursday: { start: string; end: string; available: boolean };
    friday: { start: string; end: string; available: boolean };
    saturday: { start: string; end: string; available: boolean };
    sunday: { start: string; end: string; available: boolean };
  };
  pricing?: {
    baseRate: number;
    currency: string;
    rateType: 'hourly' | 'fixed' | 'quote';
  };
  certifications?: Array<{
    name: string;
    issuer: string;
    dateObtained: Date;
    expiryDate?: Date;
    documentUrl?: string;
  }>;
  insurance?: {
    provider: string;
    policyNumber: string;
    coverage: number;
    expiryDate: Date;
    documentUrl?: string;
  };
  portfolioImages?: string[];
}

export interface ProviderSearchQuery {
  services?: string[];
  latitude?: number;
  longitude?: number;
  radius?: number;
  minRating?: number;
  isInsured?: boolean;
  isBackgroundChecked?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'distance' | 'rating' | 'price';
}

export interface CreateQuoteRequestRequest {
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
  preferredDate?: Date;
  budget?: {
    min: number;
    max: number;
    currency: string;
  };
  images?: string[];
  urgency?: 'low' | 'medium' | 'high' | 'urgent';
  requirements?: Array<{
    category: string;
    requirement: string;
    mandatory: boolean;
  }>;
  availability?: Array<{
    date: Date;
    timeSlots: Array<{
      start: string;
      end: string;
    }>;
  }>;
  searchRadius?: number;
  expiresAt?: Date;
}

export interface UpdateQuoteRequestRequest {
  serviceType?: string;
  description?: string;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  preferredDate?: Date;
  budget?: {
    min: number;
    max: number;
    currency: string;
  };
  images?: string[];
  urgency?: 'low' | 'medium' | 'high' | 'urgent';
  requirements?: Array<{
    category: string;
    requirement: string;
    mandatory: boolean;
  }>;
  availability?: Array<{
    date: Date;
    timeSlots: Array<{
      start: string;
      end: string;
    }>;
  }>;
  searchRadius?: number;
  expiresAt?: Date;
}

export interface CreateQuoteRequest {
  requestId: string;
  serviceType: string;
  description: string;
  estimatedPrice: number;
  estimatedDuration: number;
  validUntil: Date;
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
}

export interface UpdateQuoteRequest {
  serviceType?: string;
  description?: string;
  estimatedPrice?: number;
  estimatedDuration?: number;
  validUntil?: Date;
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
}

export interface QuoteRequestSearchQuery {
  customerId?: string;
  serviceType?: string;
  status?: 'open' | 'closed' | 'cancelled';
  urgency?: 'low' | 'medium' | 'high' | 'urgent';
  minBudget?: number;
  maxBudget?: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
  page?: number;
  limit?: number;
  sortBy?: 'date' | 'budget' | 'urgency' | 'created';
  sortOrder?: 'asc' | 'desc';
}

export interface QuoteSearchQuery {
  requestId?: string;
  providerId?: string;
  customerId?: string;
  status?: 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';
  serviceType?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'date' | 'created';
  sortOrder?: 'asc' | 'desc';
}

// Messaging System Types
export interface CreateConversationRequest {
  participantIds: string[];
  title?: string;
  description?: string;
  type?: 'direct' | 'group' | 'support';
  metadata?: {
    bookingId?: string;
    quoteRequestId?: string;
    serviceType?: string;
    [key: string]: any;
  };
}

export interface SendMessageRequest {
  conversationId: string;
  message: string;
  messageType?: 'text' | 'image' | 'file';
  attachments?: string[];
  replyToMessageId?: string;
}

export interface UpdateMessageRequest {
  message?: string;
  attachments?: string[];
}

export interface ConversationSearchQuery {
  userId?: string;
  type?: 'direct' | 'group' | 'support';
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'lastMessage' | 'created' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface MessageSearchQuery {
  conversationId?: string;
  senderId?: string;
  receiverId?: string;
  messageType?: 'text' | 'image' | 'file';
  isRead?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'created';
  sortOrder?: 'asc' | 'desc';
}

// Review System Types
export interface CreateReviewRequest {
  bookingId: string;
  rating: number;
  comment?: string;
  images?: string[];
  criteria?: {
    quality: number;
    timeliness: number;
    communication: number;
    professionalism: number;
    valueForMoney: number;
  };
}

export interface UpdateReviewRequest {
  rating?: number;
  comment?: string;
  images?: string[];
  criteria?: {
    quality: number;
    timeliness: number;
    communication: number;
    professionalism: number;
    valueForMoney: number;
  };
}

export interface ReviewSearchQuery {
  providerId?: string;
  customerId?: string;
  bookingId?: string;
  minRating?: number;
  maxRating?: number;
  hasResponse?: boolean;
  isFlagged?: boolean;
  isVerified?: boolean;
  searchTerm?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'rating' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}
