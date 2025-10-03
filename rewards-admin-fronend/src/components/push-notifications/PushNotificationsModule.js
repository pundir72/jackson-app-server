'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import CampaignManager from './CampaignManager';
import ABTestingInterface from './ABTestingInterface';

const TABS = [
  { 
    id: 'campaigns', 
    label: 'Campaign Manager', 
    icon: '📢',
    description: 'Create, edit, schedule, and manage push notification campaigns'
  },
  { 
    id: 'ab-testing', 
    label: 'A/B Testing Interface', 
    icon: '🧪',
    description: 'Run A/B experiments with AI-generated variants and performance tracking'
  }
];

export default function PushNotificationsModule() {
  const [activeTab, setActiveTab] = useState('campaigns');
  const [notification, setNotification] = useState(null);
  
  const {
    campaigns,
    abTests,
    userSegments,
    ctaRouting,
    stats,
    loading,
    error,
    currentUserRole,
    permissions,
    campaignStatuses,
    campaignTypes,
    frequencyRules,
    ctaActions,
    segmentCategories,
    ctaCategories,
    gameConfigs,
    offerConfigs,
    filterCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    sendCampaign,
    filterAbTests,
    createAbTest,
    calculateAudienceSize,
    clearError
  } = usePushNotifications();

  // Show notification helper
  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // Error handling
  useEffect(() => {
    if (error) {
      showNotification(error, 'error');
      clearError();
    }
  }, [error, showNotification, clearError]);

  // Tab content renderer
  const renderTabContent = () => {
    switch (activeTab) {
      case 'campaigns':
        return (
          <CampaignManager
            campaigns={campaigns}
            stats={stats}
            userSegments={userSegments}
            ctaRouting={ctaRouting}
            campaignStatuses={campaignStatuses}
            campaignTypes={campaignTypes}
            frequencyRules={frequencyRules}
            ctaActions={ctaActions}
            segmentCategories={segmentCategories}
            ctaCategories={ctaCategories}
            gameConfigs={gameConfigs}
            offerConfigs={offerConfigs}
            permissions={permissions}
            loading={loading}
            filterCampaigns={filterCampaigns}
            onCreateCampaign={createCampaign}
            onUpdateCampaign={updateCampaign}
            onDeleteCampaign={deleteCampaign}
            onSendCampaign={sendCampaign}
            onCalculateAudienceSize={calculateAudienceSize}
            onShowNotification={showNotification}
          />
        );
      case 'ab-testing':
        return (
          <ABTestingInterface
            abTests={abTests}
            userSegments={userSegments}
            campaignStatuses={campaignStatuses}
            segmentCategories={segmentCategories}
            permissions={permissions}
            loading={loading}
            filterAbTests={filterAbTests}
            onCreateAbTest={createAbTest}
            onCalculateAudienceSize={calculateAudienceSize}
            onShowNotification={showNotification}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Push Notification Center</h1>
        <p className="text-gray-600 mt-2">
          Create, manage, test, and track push notification campaigns with Firebase integration and A/B testing
        </p>
      </div>

      {/* Stats Overview
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="p-2 bg-blue-50 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Total Campaigns</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalCampaigns}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="p-2 bg-green-50 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Messages Sent</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalSent.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="p-2 bg-purple-50 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Avg Open Rate</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.avgOpenRate}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="p-2 bg-orange-50 rounded-lg">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Running A/B Tests</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.runningAbTests}</p>
            </div>
          </div>
        </div>
      </div> */}


      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="flex items-center space-x-2">
                  <span className="text-lg">{tab.icon}</span>
                  <span>{tab.label}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Description */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-600">
            {TABS.find(tab => tab.id === activeTab)?.description}
          </p>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}