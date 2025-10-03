'use client';

import { useState, useMemo } from 'react';
import { MOCK_USERS } from '../data/users';

export const useUsers = () => {
  const [users] = useState(MOCK_USERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const filterUsers = useMemo(() => {
    return (searchTerm, filters) => {
      return users.filter(user => {
        const matchesSearch = !searchTerm || 
          user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.phone.includes(searchTerm) ||
          user.location.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesTier = !filters.tierLevel || user.tier === filters.tierLevel;
        const matchesStatus = !filters.status || user.status === filters.status;
        const matchesLocation = !filters.location || user.location === filters.location;
        const matchesGender = !filters.gender || user.gender === filters.gender;
        const matchesAgeRange = !filters.ageRange || user.age === filters.ageRange;
        
        let matchesMemberSince = true;
        if (filters.memberSince) {
          const now = new Date();
          const memberSinceDate = new Date('2025-01-01');
          const daysDiff = Math.floor((now - memberSinceDate) / (1000 * 60 * 60 * 24));
          
          switch (filters.memberSince) {
            case 'Last 30 days':
              matchesMemberSince = daysDiff <= 30;
              break;
            case 'Last 3 months':
              matchesMemberSince = daysDiff <= 90;
              break;
            case 'Last 6 months':
              matchesMemberSince = daysDiff <= 180;
              break;
            case 'Last year':
              matchesMemberSince = daysDiff <= 365;
              break;
            default:
              matchesMemberSince = true;
          }
        }
        
        return matchesSearch && matchesTier && matchesStatus && 
               matchesLocation && matchesGender && matchesAgeRange && matchesMemberSince;
      });
    };
  }, [users]);

  const updateUser = async (userId, userData) => {
    setLoading(true);
    try {
      console.log('Updating user:', userId, userData);
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const suspendUser = async (userId, suspendData) => {
    setLoading(true);
    try {
      console.log('Suspending user:', userId, suspendData);
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  // EXCLUDED: Bulk actions not supported per requirements - actions can only be taken on single users
  const bulkAction = async (userIds, action) => {
    console.log('Bulk actions are disabled per requirements');
    throw new Error('Bulk actions are not supported. Actions can only be taken on individual users.');

    /* ORIGINAL CODE - COMMENTED OUT
    setLoading(true);
    try {
      console.log(`Bulk ${action} for users:`, userIds);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
    */
  };

  return {
    users,
    loading,
    error,
    filterUsers,
    updateUser,
    suspendUser,
    bulkAction,
  };
};