'use client';

import { useState, useEffect } from 'react';

export default function AddIntegrationModal({
  isOpen,
  onClose,
  onSave,
  availableIntegrations,
  categories
}) {
  const [selectedIntegrationType, setSelectedIntegrationType] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    apiKey: '',
    endpointUrl: '',
    isActive: true
  });
  const [errors, setErrors] = useState({});

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedIntegrationType(null);
      setFormData({
        name: '',
        description: '',
        category: '',
        apiKey: '',
        endpointUrl: '',
        isActive: true
      });
      setErrors({});
    }
  }, [isOpen]);

  // Update form data when integration type is selected
  useEffect(() => {
    if (selectedIntegrationType) {
      setFormData(prev => ({
        ...prev,
        name: selectedIntegrationType.name,
        description: selectedIntegrationType.description,
        category: selectedIntegrationType.category,
        endpointUrl: selectedIntegrationType.defaultEndpoint
      }));
    }
  }, [selectedIntegrationType]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!selectedIntegrationType) {
      newErrors.integration = 'Please select an integration type';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Integration name is required';
    }

    if (!formData.apiKey.trim()) {
      newErrors.apiKey = 'API key is required';
    }

    if (!formData.endpointUrl.trim()) {
      newErrors.endpointUrl = 'Endpoint URL is required';
    } else {
      try {
        new URL(formData.endpointUrl);
      } catch {
        newErrors.endpointUrl = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handleSelectIntegration = (integration) => {
    setSelectedIntegrationType(integration);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Background overlay */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Add New Integration
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

          </div>

          {/* Content */}
          <div className="px-6 py-4">
            <div className="space-y-4">
              {/* Integration Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Integration Type *
                </label>
                <div className="space-y-2">
                  {availableIntegrations.map((integration) => (
                    <label
                      key={integration.name}
                      className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedIntegrationType === integration
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="integrationType"
                        checked={selectedIntegrationType === integration}
                        onChange={() => handleSelectIntegration(integration)}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{integration.name}</div>
                        <div className="text-xs text-gray-500">{integration.description}</div>
                      </div>
                      {selectedIntegrationType === integration && (
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </label>
                  ))}
                </div>
                {errors.integration && (
                  <p className="mt-1 text-xs text-red-600">{errors.integration}</p>
                )}
              </div>

              {/* Configuration Fields */}
              {selectedIntegrationType && (
                <div className="space-y-4">
                  {/* Integration Name */}
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Integration Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 ${
                        errors.name ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter a custom name for this integration"
                    />
                    {errors.name && (
                      <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                    )}
                  </div>

                  {/* Category */}
                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <select
                      id="category"
                      value={formData.category}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    >
                      <option value="">Select Category</option>
                      {categories && categories.filter(cat => cat !== 'All Categories').map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>

                  {/* API Key */}
                  <div>
                    <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
                      API Key / Secret *
                    </label>
                    <input
                      type="password"
                      id="apiKey"
                      value={formData.apiKey}
                      onChange={(e) => handleInputChange('apiKey', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 ${
                        errors.apiKey ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter your API key or secret token"
                    />
                    {errors.apiKey && (
                      <p className="mt-1 text-xs text-red-600">{errors.apiKey}</p>
                    )}
                  </div>

                  {/* Endpoint URL */}
                  <div>
                    <label htmlFor="endpointUrl" className="block text-sm font-medium text-gray-700 mb-1">
                      Endpoint URL *
                    </label>
                    <input
                      type="url"
                      id="endpointUrl"
                      value={formData.endpointUrl}
                      onChange={(e) => handleInputChange('endpointUrl', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 ${
                        errors.endpointUrl ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="https://api.example.com/v1"
                    />
                    {errors.endpointUrl && (
                      <p className="mt-1 text-xs text-red-600">{errors.endpointUrl}</p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="Optional description for this integration"
                    />
                  </div>

                  {/* Status Toggle */}
                  <div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => handleInputChange('isActive', e.target.checked)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      When disabled, this integration will not be used by the application
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Add Integration
            </button>
          </div>
        </div>
      </div>
  );
}