'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

// Public routes that don't require authentication
const publicRoutes = ['/login'];

export default function AuthGuard({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  useEffect(() => {
    // Don't redirect if we're still loading
    if (isLoading) return;
    
    const isPublicRoute = publicRoutes.includes(pathname);
    
    // If user is not authenticated and trying to access protected route
    if (!isAuthenticated && !isPublicRoute) {
      router.push('/login');
      return;
    }
    
    // If user is authenticated and trying to access login page
    if (isAuthenticated && pathname === '/login') {
      router.push('/');
      return;
    }
  }, [isAuthenticated, isLoading, pathname, router]);
  
  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          <div className="text-sm text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }
  
  // If not authenticated and not on a public route, don't render anything
  // (will be redirected to login)
  if (!isAuthenticated && !publicRoutes.includes(pathname)) {
    return null;
  }
  
  // If authenticated and on login page, don't render anything 
  // (will be redirected to dashboard)
  if (isAuthenticated && pathname === '/login') {
    return null;
  }
  
  return children;
}