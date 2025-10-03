'use client';

import React, { useState, useEffect } from 'react';
import { XMarkIcon, CalendarIcon } from '@heroicons/react/24/outline';

const CHALLENGE_TYPES = ['Spin', 'Game', 'Survey', 'Referral', 'Watch Ad', 'SDK Game'];
const CLAIM_TYPES = ['Watch Ad', 'Auto'];

export default function AddEditChallengeModal({
  isOpen,
  onClose,
  onSave,
  challenge = null,
  selectedDate = null,
  existingChallenges = [],
  loading = false
}) {
  const [formData, setFormData] = useState({
    title: '',
    type: 'Spin',
    date: '',
    coinReward: '',
    xpReward: '',
    claimType: 'Watch Ad',
    visibility: true
  });
  const [errors, setErrors] = useState({});

  // Initialize form data
  useEffect(() => {
    if (challenge) {
      setFormData({
        title: challenge.title || '',
        type: challenge.type || 'Spin',
        date: challenge.date || '',
        coinReward: challenge.coinReward?.toString() || '',
        xpReward: challenge.xpReward?.toString() || '',
        claimType: challenge.claimType || 'Watch Ad',
        visibility: challenge.visibility !== false
      });
    } else if (selectedDate) {
      const dateString = selectedDate.toISOString().split('T')[0];
      setFormData(prev => ({
        ...prev,
        date: dateString
      }));
    }
  }, [challenge, selectedDate]);

  const validateForm = () => {
    const newErrors = {};

    // Required fields
    if (!formData.title.trim()) {
      newErrors.title = 'Challenge title is required';
    }

    if (!formData.date) {
      newErrors.date = 'Date is required';
    }

    if (!formData.coinReward || parseInt(formData.coinReward) < 0) {
      newErrors.coinReward = 'Coin reward must be 0 or greater';
    }

    if (!formData.xpReward || parseInt(formData.xpReward) < 0) {
      newErrors.xpReward = 'XP reward must be 0 or greater';
    }


    // Check for duplicate challenges on the same date (excluding current challenge if editing)
    const duplicateChallenge = existingChallenges.find(c => 
      c.date === formData.date && 
      c.type === formData.type &&
      (!challenge || c.id !== challenge.id)
    );

    if (duplicateChallenge) {
      newErrors.date = `A ${formData.type} challenge already exists for this date`;
    }

    // Validate past dates
    const selectedDateObj = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDateObj < today && !challenge) {
      newErrors.date = 'Cannot create challenges for past dates';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    const challengeData = {
      title: formData.title.trim(),
      type: formData.type,
      date: formData.date,
      coinReward: parseInt(formData.coinReward),
      xpReward: parseInt(formData.xpReward),
      claimType: formData.claimType,
      visibility: formData.visibility,
      status: 'Scheduled' // Default status for new challenges
    };

    try {
      await onSave(challengeData);
    } catch (error) {
      console.error('Error saving challenge:', error);
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      type: 'Spin',
      date: '',
      coinReward: '',
      xpReward: '',
      claimType: 'Watch Ad',
      visibility: true
    });
    setErrors({});
    onClose();
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {challenge ? 'Edit Challenge' : 'Add New Challenge'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Challenge Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.title ? 'border-red-300' : 'border-gray-300'}`}
                placeholder="e.g., Play 2 SDK Games"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Challenge Type *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
              >
                {CHALLENGE_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.date ? 'border-red-300' : 'border-gray-300'}`}
                />
                <CalendarIcon className="absolute right-3 top-2.5 h-5 w-5 text-gray-400 pointer-events-none" />
              </div>
              {errors.date && (
                <p className="mt-1 text-sm text-red-600">{errors.date}</p>
              )}
            </div>
          </div>

          {/* Rewards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Coin Reward *
              </label>
              <input
                type="number"
                min="0"
                value={formData.coinReward}
                onChange={(e) => setFormData({...formData, coinReward: e.target.value})}
                className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.coinReward ? 'border-red-300' : 'border-gray-300'}`}
                placeholder="100"
              />
              {errors.coinReward && (
                <p className="mt-1 text-sm text-red-600">{errors.coinReward}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                XP Reward *
              </label>
              <input
                type="number"
                min="0"
                value={formData.xpReward}
                onChange={(e) => setFormData({...formData, xpReward: e.target.value})}
                className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.xpReward ? 'border-red-300' : 'border-gray-300'}`}
                placeholder="50"
              />
              {errors.xpReward && (
                <p className="mt-1 text-sm text-red-600">{errors.xpReward}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Claim Type *
              </label>
              <select
                value={formData.claimType}
                onChange={(e) => setFormData({...formData, claimType: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
              >
                {CLAIM_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>


          {/* Visibility */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="visibility"
              checked={formData.visibility}
              onChange={(e) => setFormData({...formData, visibility: e.target.checked})}
              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
            />
            <label htmlFor="visibility" className="text-sm font-medium text-gray-700">
              Visible to users
            </label>
            <p className="text-xs text-gray-500">
              Uncheck to hide this challenge from users while keeping it in the system
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : (challenge ? 'Update Challenge' : 'Create Challenge')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}