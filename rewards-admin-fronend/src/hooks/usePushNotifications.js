'use client';

import { useState, useMemo, useCallback } from 'react';
import { 
  MOCK_CAMPAIGNS, 
  MOCK_AB_TESTS, 
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  FREQUENCY_RULES,
  CTA_ACTIONS,
  PUSH_NOTIFICATION_ROLES
} from '../data/pushNotifications';
import { 
  USER_SEGMENTS, 
  SEGMENT_CATEGORIES,
  SEGMENT_SIZE_LIMITS 
} from '../data/userSegments';
import { 
  CTA_ROUTING_CONFIG, 
  CTA_CATEGORIES,
  GAME_CONFIGS,
  OFFER_CONFIGS 
} from '../data/ctaRouting';

export const usePushNotifications = () => {
  // State management
  const [campaigns, setCampaigns] = useState(MOCK_CAMPAIGNS);
  const [abTests, setAbTests] = useState(MOCK_AB_TESTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Current user role (in real app, this would come from auth context)
  const [currentUserRole] = useState('super_admin'); // Default for demo

  // Filter campaigns
  const filterCampaigns = useCallback((searchTerm, filters = {}) => {
    return campaigns.filter(campaign => {
      const matchesSearch = !searchTerm || 
        campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        campaign.body.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = !filters.status || 
        filters.status === 'All Statuses' || 
        campaign.status === filters.status;

      return matchesSearch && matchesStatus;
    });
  }, [campaigns]);

  // Filter A/B tests
  const filterAbTests = useCallback((searchTerm, filters = {}) => {
    return abTests.filter(test => {
      const matchesSearch = !searchTerm || 
        test.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        test.baseMessage.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = !filters.status || 
        filters.status === 'All Statuses' || 
        test.status === filters.status;

      return matchesSearch && matchesStatus;
    });
  }, [abTests]);

  // Campaign CRUD operations
  const createCampaign = useCallback(async (campaignData) => {
    setLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Validate campaign data - relaxed validation for drafts
      if (!campaignData.name) {
        throw new Error('Campaign name is required');
      }

      // Full validation only for non-draft campaigns
      if (!campaignData.isDraft) {
        if (!campaignData.title || !campaignData.body) {
          throw new Error('Missing required fields: title and body are mandatory for publishing');
        }

        if (!campaignData.targetSegment || campaignData.targetSegment.length === 0) {
          throw new Error('Target segment is required for publishing');
        }

        if (!campaignData.frequencyRule) {
          throw new Error('Frequency rule is required for publishing');
        }

        if (!campaignData.ctaAction) {
          throw new Error('CTA action is required for publishing');
        }

        // Calculate estimated audience size only for complete campaigns
        const estimatedAudience = calculateAudienceSize(campaignData.targetSegment);
        
        if (estimatedAudience < SEGMENT_SIZE_LIMITS.minimum) {
          throw new Error(`Audience size too small (${estimatedAudience}). Minimum ${SEGMENT_SIZE_LIMITS.minimum} users required.`);
        }
      }

      const newCampaign = {
        id: `campaign-${Date.now()}`,
        ...campaignData,
        type: 'standard',
        status: campaignData.isDraft ? 'Draft' : (campaignData.scheduleTime ? 'Scheduled' : 'Draft'),
        createdBy: 'admin@jackson.com', // In real app, get from auth
        createdAt: new Date().toISOString(),
        sentAt: null,
        stats: null,
        // Set default values for draft campaigns
        title: campaignData.title || '',
        body: campaignData.body || '',
        targetSegment: campaignData.targetSegment || [],
        frequencyRule: campaignData.frequencyRule || '1 per user/day',
        ctaAction: campaignData.ctaAction || 'app_home',
        trackInFirebase: campaignData.trackInFirebase !== undefined ? campaignData.trackInFirebase : true
      };

      setCampaigns(prev => [newCampaign, ...prev]);
      
      return { success: true, campaign: newCampaign };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCampaign = useCallback(async (campaignId, updateData) => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      setCampaigns(prev => prev.map(campaign => 
        campaign.id === campaignId 
          ? { ...campaign, ...updateData }
          : campaign
      ));

      return { success: true };
    } catch (err) {
      setError('Failed to update campaign');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteCampaign = useCallback(async (campaignId) => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 600));

      setCampaigns(prev => prev.filter(campaign => campaign.id !== campaignId));
      
      return { success: true };
    } catch (err) {
      setError('Failed to delete campaign');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Send campaign
  const sendCampaign = useCallback(async (campaignId) => {
    setLoading(true);
    setError(null);

    try {
      // Simulate Firebase FCM call
      await new Promise(resolve => setTimeout(resolve, 2000));

      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Simulate success/failure based on campaign name
      const isSuccess = !campaign.name.toLowerCase().includes('fail');
      
      const updatedData = {
        status: isSuccess ? 'Sent' : 'Failed',
        sentAt: new Date().toISOString(),
        error: isSuccess ? null : 'Firebase FCM authentication failed',
        stats: isSuccess ? {
          sent: Math.floor(Math.random() * 10000) + 1000,
          delivered: 0, // Will be updated later
          opened: 0,
          clicked: 0,
          openRate: 0,
          ctr: 0
        } : {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          openRate: 0,
          ctr: 0
        }
      };

      setCampaigns(prev => prev.map(campaign => 
        campaign.id === campaignId 
          ? { ...campaign, ...updatedData }
          : campaign
      ));

      return { 
        success: isSuccess, 
        message: isSuccess ? 'Campaign sent successfully!' : 'Campaign failed to send',
        error: isSuccess ? null : updatedData.error
      };
    } catch (err) {
      setError('Failed to send campaign');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [campaigns]);

  // A/B Test operations
  const createAbTest = useCallback(async (testData) => {
    setLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Validate A/B test data
      if (!testData.name || !testData.baseMessage) {
        throw new Error('Name and base message are required');
      }

      if (!testData.variants.A.title || !testData.variants.A.body ||
          !testData.variants.B.title || !testData.variants.B.body) {
        throw new Error('Both variants must have title and body');
      }

      const estimatedAudience = calculateAudienceSize(testData.targetSegment);
      
      if (estimatedAudience < SEGMENT_SIZE_LIMITS.abTestMinimum) {
        throw new Error(`Audience size too small for A/B testing (${estimatedAudience}). Minimum ${SEGMENT_SIZE_LIMITS.abTestMinimum} users required.`);
      }

      const newAbTest = {
        id: `abtest-${Date.now()}`,
        ...testData,
        status: 'Running',
        launchedAt: new Date().toISOString(),
        createdBy: 'admin@jackson.com',
        stats: {
          variantA: {
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            openRate: 0,
            ctr: 0
          },
          variantB: {
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            openRate: 0,
            ctr: 0
          }
        },
        winner: null
      };

      setAbTests(prev => [newAbTest, ...prev]);
      
      return { success: true, abTest: newAbTest };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Utility functions
  const calculateAudienceSize = useCallback((segments) => {
    if (!segments || segments.length === 0) return 0;
    
    // Simple sum - in real app, this would call backend
    return segments.reduce((total, segmentName) => {
      const segment = USER_SEGMENTS.find(s => s.name === segmentName);
      return total + (segment ? segment.userCount : 0);
    }, 0);
  }, []);

  const getUserRolePermissions = useCallback(() => {
    const roleConfig = PUSH_NOTIFICATION_ROLES.find(r => r.role === currentUserRole);
    return roleConfig ? roleConfig.permissions : {};
  }, [currentUserRole]);

  // Computed values
  const stats = useMemo(() => {
    const totalCampaigns = campaigns.length;
    const sentCampaigns = campaigns.filter(c => c.status === 'Sent').length;
    const scheduledCampaigns = campaigns.filter(c => c.status === 'Scheduled').length;
    const failedCampaigns = campaigns.filter(c => c.status === 'Failed').length;
    const runningAbTests = abTests.filter(t => t.status === 'Running').length;

    // Calculate total sent messages
    const totalSent = campaigns.reduce((total, campaign) => {
      return total + (campaign.stats ? campaign.stats.sent : 0);
    }, 0);

    // Calculate average open rate
    const campaignsWithStats = campaigns.filter(c => c.stats && c.stats.sent > 0);
    const avgOpenRate = campaignsWithStats.length > 0 
      ? campaignsWithStats.reduce((sum, c) => sum + c.stats.openRate, 0) / campaignsWithStats.length 
      : 0;

    return {
      totalCampaigns,
      sentCampaigns,
      scheduledCampaigns,
      failedCampaigns,
      runningAbTests,
      totalSent,
      avgOpenRate: Math.round(avgOpenRate * 10) / 10
    };
  }, [campaigns, abTests]);

  // Return hook interface
  return {
    // Data
    campaigns,
    abTests,
    userSegments: USER_SEGMENTS,
    ctaRouting: CTA_ROUTING_CONFIG,
    stats,
    loading,
    error,
    currentUserRole,
    permissions: getUserRolePermissions(),

    // Constants
    campaignStatuses: CAMPAIGN_STATUSES,
    campaignTypes: CAMPAIGN_TYPES,
    frequencyRules: FREQUENCY_RULES,
    ctaActions: CTA_ACTIONS,
    segmentCategories: SEGMENT_CATEGORIES,
    ctaCategories: CTA_CATEGORIES,
    gameConfigs: GAME_CONFIGS,
    offerConfigs: OFFER_CONFIGS,

    // Campaign operations
    filterCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    sendCampaign,

    // A/B Test operations
    filterAbTests,
    createAbTest,

    // Utility functions
    calculateAudienceSize,
    getUserRolePermissions,

    // Utility
    clearError: () => setError(null)
  };
};