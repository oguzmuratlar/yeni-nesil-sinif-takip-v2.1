import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Production'da aynı origin kullan, development'ta .env'den al
const getBaseUrl = () => {
  if (window.location.hostname !== 'localhost' && 
      !window.location.hostname.includes('preview.emergentagent.com')) {
    return window.location.origin + '/api';
  }
  return (process.env.REACT_APP_BACKEND_URL || '') + '/api';
};

const API_URL = getBaseUrl();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username,
        password
      });
      const { access_token, user_type, teacher_id } = response.data;
      setToken(access_token);
      localStorage.setItem('token', access_token);
      setUser({ username, user_type, teacher_id });
      // Her login'de planlama uyarısı gösterilmesi için flag'i temizle
      sessionStorage.removeItem('planning_warning_shown');
      return { success: true, user_type, teacher_id };
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    // Logout'ta da temizle
    sessionStorage.removeItem('planning_warning_shown');
  };

  const getAuthHeader = () => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, getAuthHeader }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
