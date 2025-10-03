'use client';

import React, { useState, useEffect } from 'react';
import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function SpinSettingsConfiguration({ settings = {}, onUpdateSettings, loading }) {
  const [formData, setFormData] = useState({
    spinMode: 'free',
    cooldownPeriod: 6, // in hours
    maxSpinsPerDay: 3,
    eligibleTiers: ['All Tiers'],
    startDate: '',
    endDate: '',
    ...settings
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setFormData(prev => ({ ...prev, ...settings }));
  }, [settings]);

  useEffect(() => {
    const isChanged = JSON.stringify(formData) !== JSON.stringify({ ...formData, ...settings });
    setHasChanges(isChanged);
  }, [formData, settings]);

  const tierOptions = [
    'All Tiers',
    'Bronze',
    'Gold',
    'Platinum'
  ];


  const validateForm = () => {
    const newErrors = {};

    if (formData.cooldownPeriod < 1 || formData.cooldownPeriod > 24) {
      newErrors.cooldownPeriod = 'Cooldown period must be between 1-24 hours';
    }

    if (formData.maxSpinsPerDay && (formData.maxSpinsPerDay < 1 || formData.maxSpinsPerDay > 50)) {
      newErrors.maxSpinsPerDay = 'Max spins per day must be between 1-50';
    }

    if (formData.startDate && formData.endDate && new Date(formData.startDate) >= new Date(formData.endDate)) {
      newErrors.dateRange = 'Start date must be before end date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setSaveSuccess(false);
  };

  const handleTierChange = (tier, checked) => {
    setFormData(prev => {
      let newTiers = [...prev.eligibleTiers];
      
      if (tier === 'All Tiers') {
        newTiers = checked ? ['All Tiers'] : [];
      } else {
        if (checked) {
          newTiers = newTiers.filter(t => t !== 'All Tiers');
          newTiers.push(tier);
        } else {
          newTiers = newTiers.filter(t => t !== tier);
        }
        
        if (newTiers.length === 0) {
          newTiers = ['All Tiers'];
        }
      }
      
      return { ...prev, eligibleTiers: newTiers };
    });
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await onUpdateSettings(formData);
      setSaveSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFormData({
      spinMode: 'free',
      cooldownPeriod: 6, // in hours
      maxSpinsPerDay: 3,
      eligibleTiers: ['All Tiers'],
      startDate: '',
      endDate: '',
      ...settings
    });
    setHasChanges(false);
    setErrors({});
    setSaveSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* Spin Settings Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Spin Settings Configuration</h2>
              <p className="mt-1 text-sm text-gray-600">
                Configure spin modes, cooldowns, eligibility, and advanced settings
              </p>
            </div>
            {saveSuccess && (
              <div className="flex items-center text-emerald-600">
                <CheckIcon className="h-5 w-5 mr-2" />
                <span className="text-sm font-medium">Settings saved successfully</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Basic Spin Settings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Spin Mode */}
            <div className="space-y-4">
              <h3 className="text-base font-medium text-gray-900">Spin Mode</h3>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="spinMode"
                    value="free"
                    checked={formData.spinMode === 'free'}
                    onChange={(e) => handleInputChange('spinMode', e.target.value)}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700">Free Spin</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="spinMode"
                    value="ad-based"
                    checked={formData.spinMode === 'ad-based'}
                    onChange={(e) => handleInputChange('spinMode', e.target.value)}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700">Ad-Based Spin</span>
                </label>
              </div>
            </div>

            {/* Cooldown & Frequency */}
            <div className="space-y-4">
              <h3 className="text-base font-medium text-gray-900">Frequency Controls</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cooldown Period (hours) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={formData.cooldownPeriod}
                    onChange={(e) => handleInputChange('cooldownPeriod', parseInt(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${
                      errors.cooldownPeriod ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="6"
                  />
                  {errors.cooldownPeriod && (
                    <p className="mt-1 text-sm text-red-600">{errors.cooldownPeriod}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Spins Per Day
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formData.maxSpinsPerDay}
                    onChange={(e) => handleInputChange('maxSpinsPerDay', parseInt(e.target.value))}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${
                      errors.maxSpinsPerDay ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="3"
                  />
                  {errors.maxSpinsPerDay && (
                    <p className="mt-1 text-sm text-red-600">{errors.maxSpinsPerDay}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Eligibility Settings */}
          <div>
            <h3 className="text-base font-medium text-gray-900 mb-1">Eligible XP Tiers</h3>
            <p className="text-xs text-gray-500 mb-4">Select one or more tiers that can access the spin wheel</p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {tierOptions.map((tier) => (
                <label key={tier} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.eligibleTiers.includes(tier)}
                    onChange={(e) => handleTierChange(tier, e.target.checked)}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{tier}</span>
                </label>
              ))}
            </div>
          </div>


          {/* Date Range Settings */}
          <div>
            <h3 className="text-base font-medium text-gray-900 mb-4">Campaign Duration (Optional)</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="datetime-local"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="datetime-local"
                  value={formData.endDate}
                  onChange={(e) => handleInputChange('endDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
            {errors.dateRange && (
              <p className="mt-2 text-sm text-red-600">{errors.dateRange}</p>
            )}
          </div>


          {/* Validation Messages */}
          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mt-0.5" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Please fix the following errors:</h3>
                  <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                    {Object.values(errors).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              onClick={handleReset}
              disabled={!hasChanges || saving}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset Changes
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving || Object.keys(errors).length > 0}
              className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}