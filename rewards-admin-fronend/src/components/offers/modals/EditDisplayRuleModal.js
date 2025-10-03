'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const milestoneOptions = [
  'First Game',
  'After 1 Game',
  'Bronze Tier',
  'Platinum Tier',
  'Gold Tier',
  'Weekend Special',
  'Custom Milestone'
];

const targetSegmentOptions = [
  'New Users',
  'Engaged Users',
  'Bronze Tier',
  'Platinum Tier',
  'Gold Tier',
  'All Users',
  'Premium Users'
];

export default function EditDisplayRuleModal({ isOpen, onClose, rule, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    milestone: 'First Game',
    description: '',
    maxGames: 2,
    conditions: [''],
    enabled: true,
    priority: 1,
    targetSegment: 'New Users'
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (rule) {
      setFormData({
        name: rule.name || '',
        milestone: rule.milestone || 'First Game',
        description: rule.description || '',
        maxGames: rule.maxGames === 999 ? 999 : (typeof rule.maxGames === 'string' && rule.maxGames.startsWith('+') ? parseInt(rule.maxGames.substring(1)) : rule.maxGames) || 2,
        conditions: rule.conditions || [''],
        enabled: rule.enabled !== undefined ? rule.enabled : true,
        priority: rule.priority || 1,
        targetSegment: rule.targetSegment || 'New Users'
      });
    } else {
      // Reset form for new rule
      setFormData({
        name: '',
        milestone: 'First Game',
        description: '',
        maxGames: 2,
        conditions: [''],
        enabled: true,
        priority: 1,
        targetSegment: 'New Users'
      });
    }
    setErrors({});
  }, [rule, isOpen]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleConditionChange = (index, value) => {
    const newConditions = [...formData.conditions];
    newConditions[index] = value;
    setFormData(prev => ({
      ...prev,
      conditions: newConditions
    }));
  };

  const addCondition = () => {
    setFormData(prev => ({
      ...prev,
      conditions: [...prev.conditions, '']
    }));
  };

  const removeCondition = (index) => {
    if (formData.conditions.length > 1) {
      const newConditions = formData.conditions.filter((_, i) => i !== index);
      setFormData(prev => ({
        ...prev,
        conditions: newConditions
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Rule name is required';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    if (formData.maxGames < 1) {
      newErrors.maxGames = 'Max games must be at least 1';
    }
    if (formData.priority < 1) {
      newErrors.priority = 'Priority must be at least 1';
    }
    if (formData.conditions.some(condition => !condition.trim())) {
      newErrors.conditions = 'All conditions must be filled';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      const processedMaxGames = formData.milestone === 'Gold Tier' && formData.maxGames === 999
        ? 999
        : formData.maxGames;

      onSave({
        id: rule?.id || `RULE${Date.now()}`,
        ...formData,
        maxGames: processedMaxGames,
        appliedCount: rule?.appliedCount || 0,
        conversionRate: rule?.conversionRate || '0%',
        lastModified: new Date().toISOString().split('T')[0]
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full z-50">
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                {rule ? 'Edit Display Rule' : 'Create New Display Rule'}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Information */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Basic Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.name ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
                    }`}
                    placeholder="Enter rule name"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Milestone *
                  </label>
                  <select
                    value={formData.milestone}
                    onChange={(e) => handleInputChange('milestone', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {milestoneOptions.map(milestone => (
                      <option key={milestone} value={milestone}>{milestone}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Segment *
                  </label>
                  <select
                    value={formData.targetSegment}
                    onChange={(e) => handleInputChange('targetSegment', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {targetSegmentOptions.map(segment => (
                      <option key={segment} value={segment}>{segment}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={formData.priority}
                    onChange={(e) => handleInputChange('priority', parseInt(e.target.value) || 1)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.priority ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
                    }`}
                  />
                  {errors.priority && <p className="mt-1 text-xs text-red-600">{errors.priority}</p>}
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                  errors.description ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
                }`}
                placeholder="Describe what this rule does and when it applies"
              />
              {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
            </div>

            {/* Max Games Configuration */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Game Visibility Configuration</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Maximum Games to Display *
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={formData.maxGames}
                      onChange={(e) => handleInputChange('maxGames', parseInt(e.target.value) || 1)}
                      className={`flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                        errors.maxGames ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
                      }`}
                    />
                    {formData.milestone === 'Gold Tier' && (
                      <button
                        type="button"
                        onClick={() => handleInputChange('maxGames', 999)}
                        className="px-3 py-2 bg-yellow-100 text-yellow-800 text-xs rounded-md hover:bg-yellow-200"
                      >
                        Unlimited
                      </button>
                    )}
                  </div>
                  {errors.maxGames && <p className="mt-1 text-xs text-red-600">{errors.maxGames}</p>}
                  <p className="mt-1 text-xs text-gray-500">
                    {formData.maxGames === 999 ? 'Unlimited games for this user segment' : `Show maximum ${formData.maxGames} games`}
                  </p>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={formData.enabled}
                    onChange={(e) => handleInputChange('enabled', e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enabled" className="ml-2 text-sm text-gray-700">
                    Enable this rule immediately
                  </label>
                </div>
              </div>
            </div>

            {/* Conditions */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Rule Conditions</h4>
              <div className="space-y-3">
                {formData.conditions.map((condition, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={condition}
                      onChange={(e) => handleConditionChange(index, e.target.value)}
                      placeholder="Enter condition (e.g., User has opened app for first time)"
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {formData.conditions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCondition(index)}
                        className="px-2 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addCondition}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  + Add Condition
                </button>
                {errors.conditions && <p className="mt-1 text-xs text-red-600">{errors.conditions}</p>}
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Rule Preview</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Rule:</span>
                  <span className="text-gray-900 font-medium">{formData.name || 'Untitled Rule'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Milestone:</span>
                  <span className="text-gray-900">{formData.milestone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Target:</span>
                  <span className="text-gray-900">{formData.targetSegment}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Games:</span>
                  <span className="text-gray-900">
                    {formData.maxGames === 999 ? 'Unlimited' : `${formData.maxGames} games`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-medium ${formData.enabled ? 'text-green-600' : 'text-red-600'}`}>
                    {formData.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
              >
                {rule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}