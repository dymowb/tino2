import React from 'react';                                                                                                                                 
import { Navigate } from 'react-router-dom';                                                                                                               
import { useAuth } from '../../contexts/AuthContext'; 


interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.userType !== 'admin') {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

export default AdminRoute;
