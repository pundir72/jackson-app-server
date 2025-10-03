'use client';

import { useState, useEffect } from 'react';
import { SEGMENTS, CONFIG_TYPES } from '../../data/remoteConfig';

export function CreateConfigModal({ isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    title: '',
    segment: 'All Users',
    keyName: '',
    value: '',
    type: 'Toggle',
    enumOptions: []
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        title: '',
        segment: 'All Users',
        keyName: '',
        value: '',
        type: 'Toggle',
        enumOptions: []
      });
      setErrors({});
    }
  }, [isOpen]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.keyName.trim()) {
      newErrors.keyName = 'Key name is required';
    } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(formData.keyName)) {
      newErrors.keyName = 'Key name must start with letter and contain only letters, numbers, and underscores (alphanumeric)';
    }

    if (!formData.value.trim()) {
      newErrors.value = 'Value is required';
    } else if (formData.type === 'Toggle' && !['true', 'false'].includes(formData.value.toLowerCase())) {
      newErrors.value = 'Toggle value must be true or false (Boolean)';
    } else if (formData.type === 'Numeric' && isNaN(formData.value)) {
      newErrors.value = 'Numeric value must be a valid number';
    } else if (formData.type === 'Enum' && !formData.enumOptions.includes(formData.value)) {
      newErrors.value = 'Value must be one of the defined enum options';
    }

    // Validate Enum options
    if (formData.type === 'Enum') {
      if (formData.enumOptions.length === 0) {
        newErrors.enumOptions = 'At least one enum option is required';
      } else if (formData.enumOptions.some(opt => !opt.trim())) {
        newErrors.enumOptions = 'All enum options must have values';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handleTypeChange = (type) => {
    setFormData(prev => ({
      ...prev,
      type,
      value: type === 'Toggle' ? 'true' : '',
      enumOptions: type === 'Enum' ? ['option1', 'option2'] : []
    }));
  };

  const handleEnumOptionChange = (index, value) => {
    const newOptions = [...formData.enumOptions];
    newOptions[index] = value;
    setFormData(prev => ({ ...prev, enumOptions: newOptions }));
  };

  const addEnumOption = () => {
    setFormData(prev => ({ 
      ...prev, 
      enumOptions: [...prev.enumOptions, ''] 
    }));
  };

  const removeEnumOption = (index) => {
    const newOptions = formData.enumOptions.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, enumOptions: newOptions }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Create New Configuration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                errors.title ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., Coin Visibility Toggle"
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Segment <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.segment}
                onChange={(e) => setFormData(prev => ({ ...prev, segment: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                {SEGMENTS.map(segment => (
                  <option key={segment} value={segment} className="text-gray-900">{segment}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                {CONFIG_TYPES.map(type => (
                  <option key={type} value={type} className="text-gray-900">{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.keyName}
              onChange={(e) => setFormData(prev => ({ ...prev, keyName: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                errors.keyName ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., isCoinVisible"
            />
            {errors.keyName && <p className="mt-1 text-sm text-red-600">{errors.keyName}</p>}
          </div>

          {formData.type === 'Enum' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enum Options <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {formData.enumOptions.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleEnumOptionChange(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder={`Option ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeEnumOption(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEnumOption}
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                >
                  + Add Option
                </button>
              </div>
              {errors.enumOptions && <p className="mt-1 text-sm text-red-600">{errors.enumOptions}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Value <span className="text-red-500">*</span>
            </label>
            {formData.type === 'Toggle' ? (
              <select
                value={formData.value}
                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="true" className="text-gray-900">True</option>
                <option value="false" className="text-gray-900">False</option>
              </select>
            ) : formData.type === 'Enum' ? (
              <select
                value={formData.value}
                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="" className="text-gray-500">Select an option</option>
                {formData.enumOptions.filter(opt => opt.trim()).map((option, index) => (
                  <option key={index} value={option} className="text-gray-900">{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={formData.type === 'Numeric' ? 'number' : 'text'}
                value={formData.value}
                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.value ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder={formData.type === 'Numeric' ? '1.5' : 'Enter value'}
              />
            )}
            {errors.value && <p className="mt-1 text-sm text-red-600">{errors.value}</p>}
          </div>


          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Create Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditConfigModal({ isOpen, onClose, onSave, config }) {
  const [formData, setFormData] = useState({
    title: '',
    segment: 'All Users',
    keyName: '',
    value: '',
    type: 'Toggle',
    status: 'Active',
    enumOptions: []
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen && config) {
      setFormData({
        title: config.title || '',
        segment: config.segment || 'All Users',
        keyName: config.keyName || '',
        value: config.value || '',
        type: config.type || 'Toggle',
        status: config.status || 'Active',
        enumOptions: config.enumOptions || []
      });
      setErrors({});
    }
  }, [isOpen, config]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.value.trim()) {
      newErrors.value = 'Value is required';
    } else if (formData.type === 'Toggle' && !['true', 'false'].includes(formData.value.toLowerCase())) {
      newErrors.value = 'Toggle value must be true or false';
    } else if (formData.type === 'Numeric' && isNaN(formData.value)) {
      newErrors.value = 'Numeric value must be a number';
    } else if (formData.type === 'Enum' && !formData.enumOptions.includes(formData.value)) {
      newErrors.value = 'Value must be one of the defined enum options';
    }

    // Validate Enum options
    if (formData.type === 'Enum') {
      if (formData.enumOptions.length === 0) {
        newErrors.enumOptions = 'At least one enum option is required';
      } else if (formData.enumOptions.some(opt => !opt.trim())) {
        newErrors.enumOptions = 'All enum options must have values';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(config.configId, formData);
    }
  };

  const handleTypeChange = (type) => {
    setFormData(prev => ({
      ...prev,
      type,
      value: type === 'Toggle' ? 'true' : '',
      enumOptions: type === 'Enum' ? (prev.enumOptions.length > 0 ? prev.enumOptions : ['option1', 'option2']) : []
    }));
  };

  const handleEnumOptionChange = (index, value) => {
    const newOptions = [...formData.enumOptions];
    newOptions[index] = value;
    setFormData(prev => ({ ...prev, enumOptions: newOptions }));
  };

  const addEnumOption = () => {
    setFormData(prev => ({ 
      ...prev, 
      enumOptions: [...prev.enumOptions, ''] 
    }));
  };

  const removeEnumOption = (index) => {
    const newOptions = formData.enumOptions.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, enumOptions: newOptions }));
  };

  if (!isOpen || !config) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Edit Configuration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Config ID</label>
            <input
              type="text"
              value={config.configId}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                errors.title ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Segment</label>
              <select
                value={formData.segment}
                onChange={(e) => setFormData(prev => ({ ...prev, segment: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                {SEGMENTS.map(segment => (
                  <option key={segment} value={segment} className="text-gray-900">{segment}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                {CONFIG_TYPES.map(type => (
                  <option key={type} value={type} className="text-gray-900">{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="Active" className="text-gray-900">Active</option>
                <option value="Inactive" className="text-gray-900">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
            <input
              type="text"
              value={formData.keyName}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          {formData.type === 'Enum' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enum Options <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {formData.enumOptions.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleEnumOptionChange(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder={`Option ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeEnumOption(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEnumOption}
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                >
                  + Add Option
                </button>
              </div>
              {errors.enumOptions && <p className="mt-1 text-sm text-red-600">{errors.enumOptions}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Value <span className="text-red-500">*</span>
            </label>
            {formData.type === 'Toggle' ? (
              <select
                value={formData.value}
                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="true" className="text-gray-900">True</option>
                <option value="false" className="text-gray-900">False</option>
              </select>
            ) : formData.type === 'Enum' ? (
              <select
                value={formData.value}
                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="" className="text-gray-500">Select an option</option>
                {formData.enumOptions.filter(opt => opt.trim()).map((option, index) => (
                  <option key={index} value={option} className="text-gray-900">{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={formData.type === 'Numeric' ? 'number' : 'text'}
                value={formData.value}
                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.value ? 'border-red-300' : 'border-gray-300'
                }`}
              />
            )}
            {errors.value && <p className="mt-1 text-sm text-red-600">{errors.value}</p>}
          </div>


          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ViewConfigModal({ isOpen, onClose, config }) {
  if (!isOpen || !config) return null;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Configuration Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Config ID</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                {config.configId}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium min-w-[70px] justify-center ${
                  config.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {config.status}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              {config.title}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Segment</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium min-w-[90px] justify-center ${
                  config.segment === 'All Users' ? 'bg-blue-100 text-blue-800' :
                  config.segment === 'New Users' ? 'bg-green-100 text-green-800' :
                  config.segment === 'Beta Group' ? 'bg-purple-100 text-purple-800' :
                  config.segment === 'Gold Tier' ? 'bg-yellow-100 text-yellow-800' :
                  config.segment === 'Platinum Tier' ? 'bg-gray-100 text-gray-800' :
                  config.segment === 'Bronze Tier' ? 'bg-orange-100 text-orange-800' :
                  config.segment === 'VIP Users' ? 'bg-pink-100 text-pink-800' :
                  'bg-emerald-100 text-emerald-800'
                }`}>
                  {config.segment}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium min-w-[70px] justify-center ${
                  config.type === 'Toggle' ? 'bg-blue-100 text-blue-800' :
                  config.type === 'Text' ? 'bg-purple-100 text-purple-800' :
                  config.type === 'Numeric' ? 'bg-orange-100 text-orange-800' :
                  config.type === 'Enum' ? 'bg-indigo-100 text-indigo-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {config.type}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                {config.keyName}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                {config.type === 'Toggle' ? (config.value === 'true' ? '✅ True' : '❌ False') : config.value}
              </div>
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                {formatDate(config.createdAt)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Updated</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                {formatDate(config.updatedAt)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteConfigModal({ isOpen, onClose, onConfirm, configId }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center mb-4">
          <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Configuration</h3>
          <p className="text-sm text-gray-500 mb-6">
            Are you sure you want to delete configuration <strong>{configId}</strong>? This action cannot be undone.
          </p>
          <div className="flex space-x-3 justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(configId)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}