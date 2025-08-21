export interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profileImage?: string;
  userType: 'customer' | 'provider';
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
  userType: 'customer' | 'provider';
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
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
