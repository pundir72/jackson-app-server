'use client';

import { useState, useEffect } from 'react';
import BiometricSettingsScreen from './BiometricSettingsScreen';
import GDPRLegalScreen from './GDPRLegalScreen';

const TABS = [
  { id: 'biometric', label: 'Biometric & Retry Settings', icon: '🔐' },
  { id: 'gdpr', label: 'GDPR & Legal Compliance', icon: '📋' }
];

export default function SecurityComplianceModule({ userData = [] }) {
  const [activeTab, setActiveTab] = useState('biometric');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Mock API calls - replace with actual API endpoints
  const handleSaveBiometricSettings = async (data) => {
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock API endpoint: POST /admin/security/update-settings
      console.log('Saving biometric settings:', data);
      
      // EXCLUDED: Audit-trail entry for security/legal config changes not supported per requirements
      // const auditEntry = {
      //   action: 'UPDATE_BIOMETRIC_SETTINGS',
      //   userId: 'admin_user', // Should come from auth context
      //   timestamp: new Date().toISOString(),
      //   changes: data,
      //   ipAddress: 'xxx.xxx.xxx.xxx'
      // };
      // console.log('Audit trail entry:', auditEntry);
      
      setNotification({
        type: 'success',
        message: 'Biometric settings saved successfully!'
      });
      
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Failed to save biometric settings. Please try again.'
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGDPRSettings = async (data) => {
    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock API endpoint: POST /admin/legal/update-config
      console.log('Saving GDPR settings:', data);
      
      // EXCLUDED: Audit-trail entry for security/legal config changes not supported per requirements
      // const auditEntry = {
      //   action: 'UPDATE_GDPR_SETTINGS',
      //   userId: 'admin_user', // Should come from auth context
      //   timestamp: new Date().toISOString(),
      //   changes: data,
      //   ipAddress: 'xxx.xxx.xxx.xxx'
      // };
      // console.log('Audit trail entry:', auditEntry);
      
      setNotification({
        type: 'success',
        message: 'GDPR settings saved successfully!'
      });
      
    } catch (error) {
      setNotification({
        type: 'error',
        message: 'Failed to save GDPR settings. Please try again.'
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'biometric':
        return (
          <BiometricSettingsScreen 
            onSave={handleSaveBiometricSettings}
          />
        );
      case 'gdpr':
        return (
          <GDPRLegalScreen 
            onSave={handleSaveGDPRSettings}
            userData={userData}
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
        <h1 className="text-2xl font-semibold text-gray-900">Security, Consent & Compliance</h1>
        <p className="text-gray-600 mt-1">
          Manage biometric authentication, retry settings, GDPR compliance, and legal disclosures
        </p>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className={`rounded-lg p-4 ${
          notification.type === 'success' 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center">
            <div className="flex-shrink-0">
              {notification.type === 'success' ? (
                <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${
                notification.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {notification.message}
              </p>
            </div>
            <div className="ml-auto pl-3">
              <div className="-mx-1.5 -my-1.5">
                <button
                  onClick={() => setNotification(null)}
                  className={`inline-flex rounded-md p-1.5 ${
                    notification.type === 'success' 
                      ? 'text-green-500 hover:bg-green-100' 
                      : 'text-red-500 hover:bg-red-100'
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
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

        {/* Tab Content */}
        <div className="p-6">
          {isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
                <svg className="animate-spin h-5 w-5 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-gray-700">Saving changes...</span>
              </div>
            </div>
          )}
          
          {renderTabContent()}
        </div>
      </div>

      
    </div>
  );
}