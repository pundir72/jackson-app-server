'use client';

import { useState, useMemo } from 'react';
import { MOCK_REMOTE_CONFIGS, MOCK_PID_REWARDS } from '../data/remoteConfig';

export const useRemoteConfig = () => {
  const [configs] = useState(MOCK_REMOTE_CONFIGS);
  const [pidRewards] = useState(MOCK_PID_REWARDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const filterConfigs = useMemo(() => {
    return (searchTerm, filters) => {
      return configs.filter(config => {
        const matchesSearch = !searchTerm || 
          config.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          config.keyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          config.segment.toLowerCase().includes(searchTerm.toLowerCase()) ||
          config.configId.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesType = !filters.type || config.type === filters.type;
        const matchesStatus = !filters.status || config.status === filters.status;
        const matchesSegment = !filters.segment || config.segment === filters.segment;
        
        let matchesDateRange = true;
        if (filters.dateRange) {
          const configDate = new Date(config.updatedAt);
          const now = new Date();
          const daysDiff = Math.floor((now - configDate) / (1000 * 60 * 60 * 24));
          
          switch (filters.dateRange) {
            case 'Last 7 days':
              matchesDateRange = daysDiff <= 7;
              break;
            case 'Last 30 days':
              matchesDateRange = daysDiff <= 30;
              break;
            case 'Last 3 months':
              matchesDateRange = daysDiff <= 90;
              break;
            default:
              matchesDateRange = true;
          }
        }
        
        return matchesSearch && matchesType && matchesStatus && 
               matchesSegment && matchesDateRange;
      });
    };
  }, [configs]);

  const filterPidRewards = useMemo(() => {
    return (searchTerm, filters) => {
      return pidRewards.filter(pid => {
        const matchesSearch = !searchTerm || 
          pid.pidCampaignId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pid.segment.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesSegment = !filters.segment || pid.segment === filters.segment;
        const matchesStatus = !filters.status || pid.status === filters.status;
        
        return matchesSearch && matchesSegment && matchesStatus;
      });
    };
  }, [pidRewards]);

  const createConfig = async (configData) => {
    setLoading(true);
    try {
      console.log('Creating config:', configData);
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true, configId: `RC-${Date.now()}` };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const updateConfig = async (configId, configData) => {
    setLoading(true);
    try {
      console.log('Updating config:', configId, configData);
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const deleteConfig = async (configId) => {
    setLoading(true);
    try {
      console.log('Deleting config:', configId);
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const updatePidReward = async (pidId, rewardData) => {
    setLoading(true);
    try {
      console.log('Updating PID reward:', pidId, rewardData);
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const getConfigById = (configId) => {
    return configs.find(config => config.configId === configId);
  };

  const toggleConfigStatus = async (configId) => {
    setLoading(true);
    try {
      console.log('Toggling config status:', configId);
      await new Promise(resolve => setTimeout(resolve, 300));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  return {
    configs,
    pidRewards,
    loading,
    error,
    filterConfigs,
    filterPidRewards,
    createConfig,
    updateConfig,
    deleteConfig,
    updatePidReward,
    getConfigById,
    toggleConfigStatus,
  };
};