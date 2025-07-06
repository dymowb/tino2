const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'customer' | 'provider';
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface Provider {
  id: number;
  business_name: string;
  description: string;
  services: string[];
  hourly_rate: number;
  rating: number;
  total_reviews: number;
  latitude: number;
  longitude: number;
  first_name: string;
  last_name: string;
}

class ApiService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: this.getAuthHeaders(),
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'An error occurred');
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Auth endpoints
  async register(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    userType: 'customer' | 'provider';
    phone?: string;
  }): Promise<AuthResponse> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  // User endpoints
  async getProfile(): Promise<{ user: User }> {
    return this.request('/users/profile');
  }

  // Provider endpoints
  async getNearbyProviders(params: {
    lat: number;
    lng: number;
    radius?: number;
    service_type?: string;
  }): Promise<{ providers: Provider[] }> {
    const queryParams = new URLSearchParams({
      lat: params.lat.toString(),
      lng: params.lng.toString(),
      ...(params.radius && { radius: params.radius.toString() }),
      ...(params.service_type && { service_type: params.service_type })
    });

    return this.request(`/providers/nearby?${queryParams}`);
  }

  async getProvider(id: number): Promise<{ provider: Provider }> {
    return this.request(`/providers/${id}`);
  }

  // Test endpoint
  async testConnection() {
    const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
    return response.json();
  }
}

export const apiService = new ApiService();