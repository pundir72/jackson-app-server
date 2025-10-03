'use client';

import { createContext, useContext, useReducer, useEffect } from 'react';
import authAPI from '../data/auth';

// Auth state
const initialState = {
  user: null,
  token: null,
  biometricRequired: false,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Action types
const AUTH_ACTIONS = {
  LOGIN_START: 'LOGIN_START',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_ERROR: 'LOGIN_ERROR',
  LOGOUT: 'LOGOUT',
  LOAD_USER: 'LOAD_USER',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_LOADING: 'SET_LOADING',
};

// Reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN_START:
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        biometricRequired: action.payload.biometricRequired,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    
    case AUTH_ACTIONS.LOGIN_ERROR:
      return {
        ...state,
        user: null,
        token: null,
        biometricRequired: false,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...initialState,
        isLoading: false,
      };
    
    case AUTH_ACTIONS.LOAD_USER:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        biometricRequired: action.payload.biometricRequired,
        isAuthenticated: true,
        isLoading: false,
      };
    
    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };
    
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext(null);

// Auth provider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Load user on mount
  useEffect(() => {
    const currentUser = authAPI.getCurrentUser();
    
    if (currentUser) {
      dispatch({
        type: AUTH_ACTIONS.LOAD_USER,
        payload: currentUser,
      });
    } else {
      dispatch({
        type: AUTH_ACTIONS.SET_LOADING,
        payload: false,
      });
    }
  }, []);

  // Login function
  const login = async (credentials) => {
    try {
      dispatch({ type: AUTH_ACTIONS.LOGIN_START });
      
      const response = await authAPI.login(credentials);
      
      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: response,
      });
      
      return response;
    } catch (error) {
      dispatch({
        type: AUTH_ACTIONS.LOGIN_ERROR,
        payload: error.message,
      });
      
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  };

  // Clear error function
  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  // Validate token periodically
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const validateToken = () => {
      try {
        const isValid = authAPI.validateToken();
        
        if (!isValid) {
          logout();
        }
      } catch (error) {
        console.error('Token validation error:', error);
        logout();
      }
    };

    // Validate immediately
    validateToken();

    // Set up periodic validation (every 5 minutes)
    const interval = setInterval(validateToken, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [state.isAuthenticated]);

  const value = {
    // State
    user: state.user,
    token: state.token,
    biometricRequired: state.biometricRequired,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    error: state.error,
    
    // Actions
    login,
    logout,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

export default AuthContext;