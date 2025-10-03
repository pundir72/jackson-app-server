'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const AGE_GROUPS = [
  '13-17',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65+'
];

const GENDERS = ['Male', 'Female', 'Other'];

const COUNTRIES = [
  'US', 'CA', 'UK', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE',
  'BR', 'IN', 'JP', 'KR', 'MX', 'AR', 'CL', 'CO', 'PE', 'VE'
];

const MARKETING_CHANNELS = [
  'Facebook',
  'TikTok',
  'Google',
  'Instagram',
  'Twitter',
  'YouTube',
  'LinkedIn',
  'Snapchat'
];

export default function ManageSegmentsModal({ isOpen, onClose, offer, onSave }) {
  const [formData, setFormData] = useState({
    ageGroups: [],
    gender: '',
    location: '',
    marketingChannel: '',
    action: 'activate'
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData({
        ageGroups: [],
        gender: '',
        location: '',
        marketingChannel: '',
        action: 'activate'
      });
      setErrors({});
    }
  }, [isOpen]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user makes a selection
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleAgeGroupChange = (ageGroup) => {
    setFormData(prev => {
      const currentAgeGroups = prev.ageGroups;
      const updatedAgeGroups = currentAgeGroups.includes(ageGroup)
        ? currentAgeGroups.filter(ag => ag !== ageGroup)
        : [...currentAgeGroups, ageGroup];

      return {
        ...prev,
        ageGroups: updatedAgeGroups
      };
    });

    // Clear age groups error if any selection is made
    if (errors.ageGroups) {
      setErrors(prev => ({
        ...prev,
        ageGroups: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Check if at least one segment is selected
    if (formData.ageGroups.length === 0 && !formData.gender && !formData.location && !formData.marketingChannel) {
      newErrors.segments = 'Please select at least one segment filter';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      const payload = {
        offerId: offer?.id || offer?.sdkOffer,
        segments: {
          ageGroups: formData.ageGroups,
          gender: formData.gender,
          location: formData.location,
          marketingChannel: formData.marketingChannel
        },
        action: formData.action
      };

      onSave(payload);
      onClose();
    }
  };

  const isFormValid = () => {
    return formData.ageGroups.length > 0 || formData.gender || formData.location || formData.marketingChannel;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        {/* Center modal vertically and horizontally */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Manage Segments
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
            {/* Segment Selection */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Select Segments to Activate/Deactivate</h4>

              {/* {offer && (
                <div className="mb-4 p-3 bg-gray-50 rounded-md">
                  <div className="text-sm">
                    <span className="font-medium text-gray-700">Offer:</span>
                    <span className="ml-2 text-gray-900">{offer.offerName}</span>
                    <span className="ml-2 text-gray-600">({offer.sdkOffer})</span>
                  </div>
                </div>
              )} */}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Age Groups */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age Groups
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-3">
                    {AGE_GROUPS.map(ageGroup => (
                      <label key={ageGroup} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.ageGroups.includes(ageGroup)}
                          onChange={() => handleAgeGroupChange(ageGroup)}
                          className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">{ageGroup}</span>
                      </label>
                    ))}
                  </div>
                  {formData.ageGroups.length > 0 && (
                    <div className="mt-1 text-xs text-gray-600">
                      Selected: {formData.ageGroups.join(', ')}
                    </div>
                  )}
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => handleInputChange('gender', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select gender...</option>
                    {GENDERS.map(gender => (
                      <option key={gender} value={gender}>{gender}</option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  <select
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select Country...</option>
                    {COUNTRIES.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>

                {/* Marketing Channel */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Marketing Channel
                  </label>
                  <select
                    value={formData.marketingChannel}
                    onChange={(e) => handleInputChange('marketingChannel', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select Channel...</option>
                    {MARKETING_CHANNELS.map(channel => (
                      <option key={channel} value={channel}>{channel}</option>
                    ))}
                  </select>
                </div>
              </div>

              {errors.segments && (
                <p className="mt-2 text-sm text-red-600">{errors.segments}</p>
              )}
            </div>

            {/* Action Selection */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Action</h4>
              <div className="flex items-center space-x-6">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="action"
                    value="activate"
                    checked={formData.action === 'activate'}
                    onChange={(e) => handleInputChange('action', e.target.value)}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm text-gray-700">Activate for selected segments</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="action"
                    value="deactivate"
                    checked={formData.action === 'deactivate'}
                    onChange={(e) => handleInputChange('action', e.target.value)}
                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                  />
                  <span className="ml-2 text-sm text-gray-700">Deactivate for selected segments</span>
                </label>
              </div>
            </div>

            {/* Preview Section */}
            {isFormValid() && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Preview Changes</h4>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-gray-600">Action:</span>
                    <span className={`ml-2 font-medium ${formData.action === 'activate' ? 'text-green-600' : 'text-red-600'}`}>
                      {formData.action === 'activate' ? 'Activate' : 'Deactivate'} offer
                    </span>
                  </div>
                  {formData.ageGroups.length > 0 && (
                    <div>
                      <span className="text-gray-600">Age Groups:</span>
                      <span className="ml-2 text-gray-900">{formData.ageGroups.join(', ')}</span>
                    </div>
                  )}
                  {formData.gender && (
                    <div>
                      <span className="text-gray-600">Gender:</span>
                      <span className="ml-2 text-gray-900">{formData.gender}</span>
                    </div>
                  )}
                  {formData.location && (
                    <div>
                      <span className="text-gray-600">Location:</span>
                      <span className="ml-2 text-gray-900">{formData.location}</span>
                    </div>
                  )}
                  {formData.marketingChannel && (
                    <div>
                      <span className="text-gray-600">Channel:</span>
                      <span className="ml-2 text-gray-900">{formData.marketingChannel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isFormValid()}
                className={`px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors ${
                  isFormValid()
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                Apply Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}