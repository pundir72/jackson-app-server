'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, PhotoIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function AddEditRewardModal({
  isOpen,
  onClose,
  onSave,
  reward = null,
  rewardTypes = [],
  tierOptions = [],
  existingRewards = []
}) {
  const isEdit = !!reward;
  
  const [formData, setFormData] = useState({
    label: '',
    type: 'Coins',
    amount: '',
    probability: '',
    tierVisibility: ['All Tiers'],
    icon: null,
    iconUrl: '',
    active: true
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [iconPreview, setIconPreview] = useState('');

  useEffect(() => {
    if (reward) {
      setFormData({
        label: reward.label || '',
        type: reward.type || 'Coins',
        amount: reward.amount || '',
        probability: reward.probability || '',
        tierVisibility: reward.tierVisibility || ['All Tiers'],
        icon: null,
        iconUrl: reward.icon || '',
        active: reward.active !== undefined ? reward.active : true
      });
      setIconPreview(reward.icon || '');
    } else {
      setFormData({
        label: '',
        type: 'Coins',
        amount: '',
        probability: '',
        tierVisibility: ['All Tiers'],
        icon: null,
        iconUrl: '',
        active: true
      });
      setIconPreview('');
    }
    setErrors({});
  }, [reward, isOpen]);

  // Calculate remaining probability
  const remainingProbability = useMemo(() => {
    const usedProbability = existingRewards
      .filter(r => r.active && (!isEdit || r.id !== reward?.id))
      .reduce((sum, r) => sum + (r.probability || 0), 0);
    return 100 - usedProbability;
  }, [existingRewards, isEdit, reward?.id]);

  const validateForm = () => {
    const newErrors = {};

    // Label validation
    if (!formData.label.trim()) {
      newErrors.label = 'Reward label is required';
    } else if (formData.label.length > 100) {
      newErrors.label = 'Reward label must be 100 characters or less';
    } else if (!/^[a-zA-Z0-9\s]+$/.test(formData.label)) {
      newErrors.label = 'Reward label must contain only alphanumeric characters and spaces';
    }

    // Check for duplicate labels
    const duplicateLabel = existingRewards.find(r => 
      r.label.toLowerCase() === formData.label.toLowerCase() && 
      (!isEdit || r.id !== reward?.id)
    );
    if (duplicateLabel) {
      newErrors.label = 'A reward with this label already exists';
    }

    // Amount validation
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    } else if (formData.amount > 1000000) {
      newErrors.amount = 'Amount must be 1,000,000 or less';
    }

    // Probability validation
    if (!formData.probability || formData.probability <= 0) {
      newErrors.probability = 'Probability must be greater than 0';
    } else if (formData.probability > 100) {
      newErrors.probability = 'Probability cannot exceed 100%';
    } else if (formData.probability > remainingProbability && formData.active) {
      newErrors.probability = `Probability cannot exceed ${remainingProbability}% (remaining available)`;
    }

    // Tier visibility validation
    if (!formData.tierVisibility.length) {
      newErrors.tierVisibility = 'At least one tier must be selected';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTierChange = (tier, checked) => {
    setFormData(prev => {
      let newTiers = [...prev.tierVisibility];
      
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
      
      return { ...prev, tierVisibility: newTiers };
    });
  };

  const handleIconUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type - only allow specific formats
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        setErrors(prev => ({ ...prev, icon: 'Please select a valid image file (.png, .jpg, .svg only)' }));
        return;
      }


      const reader = new FileReader();
      reader.onload = (e) => {
        setIconPreview(e.target.result);
        setFormData(prev => ({
          ...prev,
          icon: file,
          iconUrl: e.target.result
        }));
        setErrors(prev => ({ ...prev, icon: undefined }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...formData,
        amount: parseFloat(formData.amount),
        probability: parseFloat(formData.probability)
      });
    } catch (error) {
      console.error('Error saving reward:', error);
      setErrors({ submit: 'Failed to save reward. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {isEdit ? 'Edit Reward' : 'Add New Reward'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reward Label *
              </label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => handleInputChange('label', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.label ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="200 Coins"
                maxLength={100}
              />
              {errors.label && (
                <p className="mt-1 text-sm text-red-600">{errors.label}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reward Type *
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleInputChange('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
              >
                {rewardTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount *
              </label>
              <input
                type="number"
                min="1"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.amount ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="200"
              />
              {errors.amount && (
                <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Probability (%) *
              </label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={formData.probability}
                onChange={(e) => handleInputChange('probability', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.probability ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="20"
              />
              {errors.probability && (
                <p className="mt-1 text-sm text-red-600">{errors.probability}</p>
              )}
            </div>
          </div>

          {/* Tier Visibility */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tier Visibility *
            </label>
            <p className="text-xs text-gray-500 mb-3">Select one or more tiers that can see this reward</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {tierOptions.map((tier) => (
                <label key={tier} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.tierVisibility.includes(tier)}
                    onChange={(e) => handleTierChange(tier, e.target.checked)}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{tier}</span>
                </label>
              ))}
            </div>
            {errors.tierVisibility && (
              <p className="mt-1 text-sm text-red-600">{errors.tierVisibility}</p>
            )}
          </div>

          {/* Icon Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Reward Icon (Optional)
            </label>
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                {iconPreview ? (
                  <img
                    src={iconPreview}
                    alt="Icon preview"
                    className="h-16 w-16 object-cover rounded-lg border border-gray-300"
                  />
                ) : (
                  <div className="h-16 w-16 border-2 border-gray-300 border-dashed rounded-lg flex items-center justify-center">
                    <PhotoIcon className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleIconUpload}
                  className="hidden"
                  id="icon-upload"
                />
                <label
                  htmlFor="icon-upload"
                  className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                >
                  <PhotoIcon className="h-4 w-4 mr-2" />
                  {iconPreview ? 'Change Icon' : 'Upload Icon'}
                </label>
                <p className="mt-1 text-xs text-gray-500">
                  PNG, JPG, SVG
                </p>
                {errors.icon && (
                  <p className="mt-1 text-sm text-red-600">{errors.icon}</p>
                )}
              </div>
            </div>
          </div>

          {/* Active Status */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => handleInputChange('active', e.target.checked)}
                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Active</span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Inactive rewards won&apos;t be available for spinning but will retain historical data
            </p>
          </div>

          {/* Validation Summary */}
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
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || Object.keys(errors).length > 0}
              className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {isEdit ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                isEdit ? 'Update Reward' : 'Add Reward'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}