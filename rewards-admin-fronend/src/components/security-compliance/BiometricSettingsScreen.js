'use client';

import { useState } from 'react';

const VERIFICATION_METHODS = ['Native', 'SDK'];
const RETRY_TYPES = ['OTP', 'PIN'];
// EXCLUDED: Biometric subtype selection (Face/Iris) not supported per requirements - default biometric is provided
// const VERIFICATION_TYPES = ['Face', 'Iris', 'Fingerprint'];
const USER_ROLES = ['Player', 'VIP', 'Guest', 'Premium'];
const SDK_PROVIDERS = ['FaceIO', 'RecognitionIO', 'BiometricAuth', 'SecureVision'];

export default function BiometricSettingsScreen({ onSave }) {
  const [formData, setFormData] = useState({
    verificationMethod: 'Native',
    sdkProvider: 'FaceIO',
    providerApiKey: '',
    retryType: 'OTP',
    retryLimit: 3,
    lockDuration: 10,
    // verificationType: 'Face', // EXCLUDED: Biometric subtype selection not supported
    userRole: 'Player',
    // dataCap: 150 // EXCLUDED: Role-based data cap enforcement not supported
  });

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  const validateForm = () => {
    const newErrors = {};

    if (formData.verificationMethod === 'SDK' && !formData.providerApiKey.trim()) {
      newErrors.providerApiKey = 'API Key is required when SDK is selected';
    }

    if (formData.verificationMethod === 'SDK' && !formData.sdkProvider) {
      newErrors.sdkProvider = 'SDK Provider is required';
    }

    if (formData.retryLimit < 1 || formData.retryLimit > 10) {
      newErrors.retryLimit = 'Retry limit must be between 1 and 10';
    }

    if (formData.lockDuration < 1) {
      newErrors.lockDuration = 'Lock duration must be at least 1 minute';
    }

    // EXCLUDED: Role-based data cap enforcement not supported
    // if (formData.dataCap < 1) {
    //   newErrors.dataCap = 'Data cap must be at least 1 MB';
    // }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave?.(formData);
      // Success notification would be handled by parent
    } catch (error) {
      console.error('Failed to save biometric settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
    
    // Clear connection status when API key or provider changes
    if (field === 'providerApiKey' || field === 'sdkProvider') {
      setConnectionStatus(null);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.providerApiKey.trim() || !formData.sdkProvider) {
      setErrors(prev => ({
        ...prev,
        providerApiKey: !formData.providerApiKey.trim() ? 'API Key is required for testing' : undefined,
        sdkProvider: !formData.sdkProvider ? 'SDK Provider is required for testing' : undefined
      }));
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus(null);
    
    try {
      // Simulate API call for testing SDK connection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock API endpoint: POST /admin/security/test-sdk
      console.log('Testing SDK connection:', {
        provider: formData.sdkProvider,
        apiKey: formData.providerApiKey
      });
      
      // Mock successful response (90% success rate)
      const isSuccess = Math.random() > 0.1;
      
      if (isSuccess) {
        setConnectionStatus({
          type: 'success',
          message: `Successfully connected to ${formData.sdkProvider} SDK`
        });
      } else {
        setConnectionStatus({
          type: 'error',
          message: `Failed to connect to ${formData.sdkProvider}. Please check your API key.`
        });
      }
      
    } catch (error) {
      setConnectionStatus({
        type: 'error',
        message: 'Connection test failed. Please try again.'
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Biometric Authentication & Retry Settings</h2>
        <p className="text-gray-600 text-sm mt-1">Configure biometric verification and retry logic for user authentication</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Verification Method & SDK Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Method <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.verificationMethod}
              onChange={(e) => handleInputChange('verificationMethod', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
            >
              {VERIFICATION_METHODS.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>

          {formData.verificationMethod === 'SDK' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SDK Provider <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.sdkProvider}
                onChange={(e) => handleInputChange('sdkProvider', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white ${
                  errors.sdkProvider ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                {SDK_PROVIDERS.map(provider => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
              {errors.sdkProvider && (
                <p className="mt-1 text-sm text-red-600">{errors.sdkProvider}</p>
              )}
            </div>
          )}
        </div>

        {/* EXCLUDED: Edit SDK credentials (API key, endpoint) functionality not supported per requirements
        {formData.verificationMethod === 'SDK' && (
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">SDK Configuration</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider API Key <span className="text-red-500">*</span>
                </label>
                <div className="flex space-x-3">
                  <input
                    type="password"
                    value={formData.providerApiKey}
                    onChange={(e) => handleInputChange('providerApiKey', e.target.value)}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                      errors.providerApiKey ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder={`Enter API Key for ${formData.sdkProvider}`}
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection || !formData.providerApiKey.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  >
                    {isTestingConnection && (
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    <span>{isTestingConnection ? 'Testing...' : 'Test Connection'}</span>
                  </button>
                </div>

                {errors.providerApiKey && (
                  <p className="mt-1 text-sm text-red-600">{errors.providerApiKey}</p>
                )}

                {connectionStatus && (
                  <div className={`mt-2 p-3 rounded-lg border ${
                    connectionStatus.type === 'success'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center">
                      {connectionStatus.type === 'success' ? (
                        <svg className="h-5 w-5 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      <p className={`text-sm font-medium ${
                        connectionStatus.type === 'success' ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {connectionStatus.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        */}

        {/* Retry Configuration */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Retry Logic Configuration</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Retry Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.retryType}
                onChange={(e) => handleInputChange('retryType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                {RETRY_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Retry Limit <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.retryLimit}
                onChange={(e) => handleInputChange('retryLimit', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.retryLimit ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="3"
              />
              {errors.retryLimit && (
                <p className="mt-1 text-sm text-red-600">{errors.retryLimit}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lock Duration (minutes) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={formData.lockDuration}
                onChange={(e) => handleInputChange('lockDuration', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.lockDuration ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="10"
              />
              {errors.lockDuration && (
                <p className="mt-1 text-sm text-red-600">{errors.lockDuration}</p>
              )}
            </div>
          </div>
        </div>

        {/* Biometric & User Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* EXCLUDED: Biometric subtype selection (Face/Iris) not supported per requirements - default biometric is provided
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Type <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.verificationType}
              onChange={(e) => handleInputChange('verificationType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
            >
              {VERIFICATION_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          */}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User Role <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.userRole}
              onChange={(e) => handleInputChange('userRole', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
            >
              {USER_ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          {/* EXCLUDED: Role-based data cap enforcement not supported per requirements
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Cap (MB) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={formData.dataCap}
              onChange={(e) => handleInputChange('dataCap', parseInt(e.target.value))}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                errors.dataCap ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="150"
            />
            {errors.dataCap && (
              <p className="mt-1 text-sm text-red-600">{errors.dataCap}</p>
            )}
          </div>
          */}
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isSaving && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}