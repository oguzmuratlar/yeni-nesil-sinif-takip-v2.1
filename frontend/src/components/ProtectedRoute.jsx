import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Yükleniyor...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.user_type !== requiredRole) {
    // Kullanıcıyı kendi paneline yönlendir
    const home = user.user_type === 'admin' ? '/admin/dashboard'
      : user.user_type === 'parent' ? '/veli'
      : user.user_type === 'teacher' ? '/teacher/dashboard'
      : '/login';
    return <Navigate to={home} replace />;
  }

  return children;
};

export default ProtectedRoute;
