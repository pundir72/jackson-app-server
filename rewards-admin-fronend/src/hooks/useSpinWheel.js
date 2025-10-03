'use client';

import { useState, useCallback } from 'react';

// Mock data for development
const mockRewards = [
  {
    id: 1,
    label: '100 Coins',
    type: 'Coins',
    amount: 100,
    probability: 25,
    tierVisibility: ['All Tiers'],
    icon: null,
    active: true,
    order: 1
  },
  {
    id: 2,
    label: '50 XP',
    type: 'XP',
    amount: 50,
    probability: 30,
    tierVisibility: ['Bronze', 'Platinum'],
    icon: null,
    active: true,
    order: 2
  },
  {
    id: 3,
    label: '10% Discount Coupon',
    type: 'Coupons',
    amount: 10,
    probability: 15,
    tierVisibility: ['Gold'],
    icon: null,
    active: true,
    order: 3
  },
  {
    id: 4,
    label: '500 Coins Bonus',
    type: 'Coins',
    amount: 500,
    probability: 5,
    tierVisibility: ['Gold'],
    icon: null,
    active: false,
    order: 4
  }
];

const mockSettings = {
  spinMode: 'free',
  cooldownPeriod: 6, // in hours
  maxSpinsPerDay: 3,
  eligibleTiers: ['All Tiers'],
  startDate: '',
  endDate: ''
};

export function useSpinWheel() {
  const [rewards, setRewards] = useState(mockRewards);
  const [settings, setSettings] = useState(mockSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Simulate API delay
  const simulateDelay = (ms = 1000) => new Promise(resolve => setTimeout(resolve, ms));

  // Fetch all rewards (mock)
  const fetchRewards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await simulateDelay(500);
      setRewards(mockRewards);
    } catch (err) {
      setError(err.message || 'Failed to fetch rewards');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch spin settings (mock)
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await simulateDelay(500);
      setSettings(mockSettings);
    } catch (err) {
      setError(err.message || 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Add new reward (mock)
  const addReward = useCallback(async (rewardData) => {
    try {
      setLoading(true);
      setError(null);
      await simulateDelay(800);
      
      const newReward = {
        ...rewardData,
        id: Date.now() // Simple ID generation for mock
      };
      
      setRewards(prev => [...prev, newReward]);
      return newReward;
    } catch (err) {
      setError(err.message || 'Failed to add reward');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update existing reward (mock)
  const updateReward = useCallback(async (id, rewardData) => {
    try {
      setLoading(true);
      setError(null);
      await simulateDelay(800);
      
      const updatedReward = { ...rewardData, id };
      setRewards(prev => prev.map(reward => 
        reward.id === id ? updatedReward : reward
      ));
      return updatedReward;
    } catch (err) {
      setError(err.message || 'Failed to update reward');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete reward (mock)
  const deleteReward = useCallback(async (id) => {
    try {
      setLoading(true);
      setError(null);
      await simulateDelay(500);
      
      setRewards(prev => prev.filter(reward => reward.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to delete reward');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update spin settings (mock)
  const updateSettings = useCallback(async (settingsData) => {
    try {
      setLoading(true);
      setError(null);
      await simulateDelay(800);
      
      setSettings(settingsData);
      return settingsData;
    } catch (err) {
      setError(err.message || 'Failed to update settings');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Reorder rewards
  const reorderRewards = useCallback(async (startIndex, endIndex) => {
    try {
      setLoading(true);
      setError(null);
      await simulateDelay(300);
      
      const newRewards = Array.from(rewards);
      const [reorderedItem] = newRewards.splice(startIndex, 1);
      newRewards.splice(endIndex, 0, reorderedItem);
      
      // Update order property
      const updatedRewards = newRewards.map((reward, index) => ({
        ...reward,
        order: index + 1
      }));
      
      setRewards(updatedRewards);
      return updatedRewards;
    } catch (err) {
      setError(err.message || 'Failed to reorder rewards');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [rewards]);

  // Validate probability totals
  const validateProbabilities = useCallback((rewardsToValidate = rewards) => {
    const totalProbability = rewardsToValidate
      .filter(reward => reward.active)
      .reduce((sum, reward) => sum + (reward.probability || 0), 0);
    
    return {
      total: totalProbability,
      isValid: totalProbability <= 100,
      remaining: Math.max(0, 100 - totalProbability),
      exceeded: Math.max(0, totalProbability - 100)
    };
  }, [rewards]);

  return {
    // State
    rewards,
    settings,
    loading,
    error,
    
    // Actions
    fetchRewards,
    fetchSettings,
    addReward,
    updateReward,
    deleteReward,
    updateSettings,
    reorderRewards,
    
    // Utilities
    validateProbabilities,
    
    // Computed values
    totalProbability: validateProbabilities().total,
    probabilityValid: validateProbabilities().isValid,
    remainingProbability: validateProbabilities().remaining,
    activeRewards: rewards.filter(r => r.active),
    inactiveRewards: rewards.filter(r => !r.active)
  };
}