'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSettingsIntegrations } from '../../hooks/useSettingsIntegrations';
import SDKIntegrationPanel from './SDKIntegrationPanel';
import NotificationConfigPanel from './NotificationConfigPanel';

const TABS = [
  { 
    id: 'integrations', 
    label: 'SDK & Platform Integrations', 
    icon: '🔌',
    description: 'Manage third-party SDK credentials and test connections'
  },
  // EXCLUDED: Notification & A/B Testing functionality not supported per requirements
  // {
  //   id: 'notifications',
  //   label: 'Notification & A/B Testing',
  //   icon: '🔔',
  //   description: 'Configure alerts, recipients and Firebase features'
  // }
];

export default function SettingsIntegrationsModule() {
  const [activeTab, setActiveTab] = useState('integrations');
  const [notification, setNotification] = useState(null);
  
  const {
    integrations,
    notificationSettings,
    firebaseFeatures,
    stats,
    loading,
    error,
    categories,
    statuses,
    availableIntegrations,
    triggerEvents,
    notificationRoles,
    filterIntegrations,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    testConnection,
    toggleIntegrationStatus,
    updateNotificationSettings,
    toggleFirebaseFeature,
    clearError
  } = useSettingsIntegrations();

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
      case 'integrations':
        return (
          <SDKIntegrationPanel
            integrations={integrations}
            stats={stats}
            categories={categories}
            statuses={statuses}
            availableIntegrations={availableIntegrations}
            loading={loading}
            filterIntegrations={filterIntegrations}
            onCreateIntegration={createIntegration}
            onUpdateIntegration={updateIntegration}
            onDeleteIntegration={deleteIntegration}
            onTestConnection={testConnection}
            onToggleStatus={toggleIntegrationStatus}
            onShowNotification={showNotification}
          />
        );
      // EXCLUDED: Notification configuration not supported per requirements
      // case 'notifications':
      //   return (
      //     <NotificationConfigPanel
      //       notificationSettings={notificationSettings}
      //       firebaseFeatures={firebaseFeatures}
      //       triggerEvents={triggerEvents}
      //       notificationRoles={notificationRoles}
      //       loading={loading}
      //       onUpdateSettings={updateNotificationSettings}
      //       onToggleFirebaseFeature={toggleFirebaseFeature}
      //       onShowNotification={showNotification}
      //     />
      //   );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Settings & Integrations</h1>
        <p className="text-gray-600 mt-2">
          Manage third-party SDK credentials, test connections, configure notifications, and control Firebase features
        </p>
      </div>


      {/* Notification Banner */}
      {notification && (
        <div className={`rounded-lg p-4 ${
          notification.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : notification.type === 'error'
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-blue-50 border border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {notification.type === 'success' && (
                  <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {notification.type === 'error' && (
                  <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {notification.type === 'info' && (
                  <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setNotification(null)}
                className="inline-flex rounded-md p-1.5 hover:bg-white hover:bg-opacity-20 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

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
          {loading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
              <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
                <svg className="animate-spin h-5 w-5 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-gray-700">Processing...</span>
              </div>
            </div>
          )}
          
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}