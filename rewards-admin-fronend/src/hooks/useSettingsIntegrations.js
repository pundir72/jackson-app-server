'use client';

import { useState, useMemo, useCallback } from 'react';
import { 
  MOCK_INTEGRATIONS, 
  INTEGRATION_CATEGORIES, 
  CONNECTION_STATUSES,
  AVAILABLE_INTEGRATIONS 
} from '../data/integrations';
import { 
  MOCK_NOTIFICATION_SETTINGS, 
  FIREBASE_FEATURES,
  TRIGGER_EVENTS,
  NOTIFICATION_ROLES 
} from '../data/notifications';

export const useSettingsIntegrations = () => {
  // State management
  const [integrations, setIntegrations] = useState(MOCK_INTEGRATIONS);
  const [notificationSettings, setNotificationSettings] = useState(MOCK_NOTIFICATION_SETTINGS);
  const [firebaseFeatures, setFirebaseFeatures] = useState(FIREBASE_FEATURES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter integrations
  const filterIntegrations = useCallback((searchTerm, filters = {}) => {
    return integrations.filter(integration => {
      const matchesSearch = !searchTerm || 
        integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        integration.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        integration.category.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = !filters.category || 
        filters.category === 'All Categories' || 
        integration.category === filters.category;

      const matchesStatus = !filters.status || 
        filters.status === 'All Statuses' || 
        integration.status === filters.status;

      const matchesActive = filters.activeOnly === undefined || 
        integration.isActive === filters.activeOnly;

      return matchesSearch && matchesCategory && matchesStatus && matchesActive;
    });
  }, [integrations]);

  // Integration CRUD operations
  const createIntegration = useCallback(async (integrationData) => {
    setLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newIntegration = {
        id: `${integrationData.name.toLowerCase()}-${Date.now()}`,
        ...integrationData,
        status: 'Untested',
        lastTested: null,
        lastUpdated: new Date().toISOString(),
        isActive: false
      };

      setIntegrations(prev => [...prev, newIntegration]);

      // EXCLUDED: Audit-trail logging of Settings actions not supported per requirements
      // Audit trail logging disabled per requirements

      return { success: true, integration: newIntegration };
    } catch (err) {
      setError('Failed to create integration');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateIntegration = useCallback(async (integrationId, updateData) => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      setIntegrations(prev => prev.map(integration => 
        integration.id === integrationId 
          ? { ...integration, ...updateData, lastUpdated: new Date().toISOString() }
          : integration
      ));

      return { success: true };
    } catch (err) {
      setError('Failed to update integration');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteIntegration = useCallback(async (integrationId) => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      setIntegrations(prev => prev.filter(integration => integration.id !== integrationId));
      
      return { success: true };
    } catch (err) {
      setError('Failed to delete integration');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Test connection
  const testConnection = useCallback(async (integrationId) => {
    setLoading(true);
    setError(null);

    try {
      // Simulate API test call
      await new Promise(resolve => setTimeout(resolve, 2000));

      const integration = integrations.find(i => i.id === integrationId);
      if (!integration) {
        throw new Error('Integration not found');
      }

      // Simulate success/failure based on integration name
      const isSuccess = !['intercom', 'failed'].some(term => 
        integration.name.toLowerCase().includes(term)
      );

      const status = isSuccess ? 'Connected' : 'Failed';
      const error = isSuccess ? null : 'Connection timeout - Please check your API key and endpoint';

      setIntegrations(prev => prev.map(integration => 
        integration.id === integrationId 
          ? { 
              ...integration, 
              status,
              error,
              lastTested: new Date().toISOString(),
              lastUpdated: new Date().toISOString()
            }
          : integration
      ));

      
      return { 
        success: isSuccess, 
        status, 
        error,
        message: isSuccess ? 'Connection successful!' : error
      };
    } catch (err) {
      setError('Failed to test connection');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [integrations]);

  // Toggle integration status
  const toggleIntegrationStatus = useCallback(async (integrationId) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration) return { success: false, error: 'Integration not found' };

    return await updateIntegration(integrationId, { 
      isActive: !integration.isActive 
    });
  }, [integrations, updateIntegration]);

  // EXCLUDED: Notification settings operations not supported per requirements
  const updateNotificationSettings = useCallback(async (settings) => {
    // Notification settings updates disabled per requirements
    console.log('Notification settings updates are disabled per requirements');
    return { success: false, error: 'Notification settings not supported' };

    /* ORIGINAL CODE - COMMENTED OUT
    setLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      setNotificationSettings(prev => ({
        ...prev,
        ...settings
      }));

      return { success: true };
    } catch (err) {
      setError('Failed to update notification settings');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
    */
  }, []);

  // EXCLUDED: Firebase A/B testing flags toggle not supported per requirements
  const toggleFirebaseFeature = useCallback(async (featureKey) => {
    // Firebase feature toggles disabled per requirements
    console.log('Firebase feature toggles are disabled per requirements');
    return { success: false, error: 'Firebase feature toggles not supported' };

    /* ORIGINAL CODE - COMMENTED OUT
    setLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      setFirebaseFeatures(prev => prev.map(feature =>
        feature.key === featureKey
          ? { ...feature, enabled: !feature.enabled }
          : feature
      ));

      return { success: true };
    } catch (err) {
      setError('Failed to toggle Firebase feature');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
    */
  }, []);

  // Computed values
  const stats = useMemo(() => {
    const total = integrations.length;
    const connected = integrations.filter(i => i.status === 'Connected').length;
    const active = integrations.filter(i => i.isActive).length;
    const failed = integrations.filter(i => i.status === 'Failed').length;

    return {
      total,
      connected,
      active,
      failed,
      connectionRate: total > 0 ? Math.round((connected / total) * 100) : 0
    };
  }, [integrations]);

  // Return hook interface
  return {
    // Data
    integrations,
    notificationSettings,
    firebaseFeatures,
    stats,
    loading,
    error,
    
    // Constants
    categories: INTEGRATION_CATEGORIES,
    statuses: CONNECTION_STATUSES,
    availableIntegrations: AVAILABLE_INTEGRATIONS,
    triggerEvents: TRIGGER_EVENTS,
    notificationRoles: NOTIFICATION_ROLES,

    // Integration operations
    filterIntegrations,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    testConnection,
    toggleIntegrationStatus,

    // Notification operations
    updateNotificationSettings,
    toggleFirebaseFeature,

    // Utility
    clearError: () => setError(null)
  };
};