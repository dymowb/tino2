import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthResponse, apiService } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    userType: 'customer' | 'provider';
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!user;

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const storedUser = apiService.getStoredUser();
      if (storedUser && apiService.isAuthenticated()) {
        // Verify token is still valid by fetching profile
        const currentUser = await apiService.getProfile();
        setUser(currentUser);
        apiService.setStoredUser(currentUser);
      } else {
        // Clear any stale data
        await logout();
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      await logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      const authResponse: AuthResponse = await apiService.login(email, password);
      setUser(authResponse.user);
      apiService.setStoredUser(authResponse.user);
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    userType: 'customer' | 'provider';
  }) => {
    try {
      setLoading(true);
      const authResponse: AuthResponse = await apiService.register(userData);
      setUser(authResponse.user);
      apiService.setStoredUser(authResponse.user);
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  const updateUser = async (updates: Partial<User>) => {
    try {
      const updatedUser = await apiService.updateProfile(updates);
      setUser(updatedUser);
      apiService.setStoredUser(updatedUser);
    } catch (error) {
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;