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
  userType: 'customer' | 'provider';
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
  };
  serviceRadius: number;
  rating: number;
  totalReviews: number;
  portfolioImages: string[];
  isBackgroundChecked: boolean;
  isInsured: boolean;
  isActive: boolean;
  pricing: {
    baseRate: number;
    currency: string;
    rateType: 'hourly' | 'fixed' | 'quote';
  };
  completedJobs: number;
  responseRate: number;
  averageResponseTime: number;
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
    city: string;
    state: string;
    zipCode: string;
  };
  scheduledDate: string;
  estimatedDuration: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  totalAmount: number;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  specialInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

class ApiService {
  private api: AxiosInstance;
  private baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';

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
  }): Promise<AuthResponse> {
    const response = await this.api.post<ApiResponse<AuthResponse>>('/auth/register', userData);
    const { accessToken, refreshToken } = response.data.data!;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    return response.data.data!;
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

  async cancelBooking(id: string, reason?: string): Promise<void> {
    await this.api.put(`/bookings/${id}/cancel`, { reason });
  }

  // Health check
  async healthCheck(): Promise<any> {
    const response = await this.api.get('/health');
    return response.data;
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
}

export const apiService = new ApiService();
export default apiService;