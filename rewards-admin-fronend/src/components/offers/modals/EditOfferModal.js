'use client';

import { useState, useEffect, useRef } from 'react';
import { XMarkIcon, CloudArrowUpIcon, TrashIcon } from '@heroicons/react/24/outline';

const SDK_OFFERS = [
  'WELCOME_001', 'DAILY_002', 'SURVEY_003', 'APP_DOWNLOAD_004', 'TRIAL_005',
  'SOCIAL_006', 'GAMING_007', 'PREMIUM_008', 'BONUS_009', 'REWARD_010'
];

const REWARD_TYPES = ['Coins', 'XP'];

const AGE_GROUPS = [
  '13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'
];

const GENDERS = ['Male', 'Female', 'Other', 'Any'];

const COUNTRIES = [
  'US', 'CA', 'UK', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE',
  'BR', 'IN', 'JP', 'KR', 'MX', 'AR', 'CL', 'CO', 'PE', 'VE'
];

const CITIES = {
  'US': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'],
  'CA': ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'],
  'UK': ['London', 'Manchester', 'Birmingham', 'Glasgow', 'Liverpool'],
  'AU': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
  // Add more cities as needed
};

const GAME_PREFERENCES = [
  'Puzzle', 'Trivia', 'Casual', 'Strategy', 'Action', 'Adventure', 'Sports', 'Racing'
];

const MARKETING_CHANNELS = [
  'Facebook', 'TikTok', 'Organic', 'Paid', 'Google', 'Instagram', 'Twitter', 'YouTube'
];

const XP_TIERS = ['Junior', 'Mid', 'Senior', 'All'];
const TIERS = ['Bronze', 'Gold', 'Platinum', 'All'];

const CREATIVE_SECTIONS = {
  offerCard: {
    name: 'Offer Card',
    previewLabel: 'Card Layout',
    recommendedSize: '320x180px',
    description: 'Main visual for the offer display'
  }
};

export default function EditOfferModal({ isOpen, onClose, offer, onSave }) {
  const [formData, setFormData] = useState({
    sdkOfferId: '',
    offerName: '',
    rewardType: '',
    rewardValue: '',
    startDate: '',
    endDate: '',
    active: true,
    defaultFallback: false,
    segments: {
      ageGroups: [],
      gender: '',
      country: '',
      city: '',
      gamePreferences: [],
      marketingChannel: '',
      campaignName: ''
    },
    xpTier: '',
    tiers: [],
    creatives: {
      offerCard: []
    }
  });

  const [errors, setErrors] = useState({});
  const [dragStates, setDragStates] = useState({});
  const fileInputRefs = useRef({});

  useEffect(() => {
    if (offer) {
      // Edit mode - populate with existing offer data
      setFormData({
        sdkOfferId: offer.sdkOffer || '',
        offerName: offer.offerName || '',
        rewardType: offer.rewardType || '',
        rewardValue: offer.rewardValue || '',
        startDate: offer.startDate || '',
        endDate: offer.endDate || '',
        active: offer.status === 'Active',
        defaultFallback: offer.defaultFallback || false,
        segments: {
          ageGroups: offer.segments?.ageGroups || [],
          gender: offer.segments?.gender || '',
          country: offer.segments?.country || '',
          city: offer.segments?.city || '',
          gamePreferences: offer.segments?.gamePreferences || [],
          marketingChannel: offer.marketingChannel || '',
          campaignName: offer.campaign || ''
        },
        xpTier: offer.xpTier || '',
        tiers: offer.tiers || [],
        creatives: offer.creatives || {
          offerCard: []
        }
      });
    } else {
      // Reset form for new offer
      setFormData({
        sdkOfferId: '',
        offerName: '',
        rewardType: '',
        rewardValue: '',
        startDate: '',
        endDate: '',
        active: true,
        defaultFallback: false,
        segments: {
          ageGroups: [],
          gender: '',
          country: '',
          city: '',
          gamePreferences: [],
          marketingChannel: '',
          campaignName: ''
        },
        xpTier: '',
        tiers: [],
        creatives: {
          offerCard: []
        }
      });
    }
    setErrors({});
    setDragStates({});
  }, [offer, isOpen]);

  const handleInputChange = (field, value) => {
    if (field.includes('.')) {
      const [section, subField] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [subField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleMultiSelectChange = (field, value) => {
    if (field === 'tiers') {
      // Handle tiers directly (not nested in segments)
      setFormData(prev => {
        const currentArray = prev.tiers;
        const updatedArray = currentArray.includes(value)
          ? currentArray.filter(item => item !== value)
          : [...currentArray, value];

        return {
          ...prev,
          tiers: updatedArray
        };
      });

      // Clear tier error when user interacts
      if (errors.tiers) {
        setErrors(prev => ({
          ...prev,
          tiers: ''
        }));
      }
    } else {
      // Handle nested segments fields
      const [section, subField] = field.split('.');
      setFormData(prev => {
        const currentArray = prev[section][subField];
        const updatedArray = currentArray.includes(value)
          ? currentArray.filter(item => item !== value)
          : [...currentArray, value];

        return {
          ...prev,
          [section]: {
            ...prev[section],
            [subField]: updatedArray
          }
        };
      });
    }
  };

  const handleCountryChange = (country) => {
    handleInputChange('segments.country', country);
    // Reset city when country changes
    handleInputChange('segments.city', '');
  };

  const validateForm = () => {
    const newErrors = {};

    // Required fields
    if (!formData.sdkOfferId) {
      newErrors.sdkOfferId = 'SDK Offer is required';
    }
    if (!formData.offerName.trim()) {
      newErrors.offerName = 'Offer name is required';
    } else if (formData.offerName.length > 100) {
      newErrors.offerName = 'Offer name must be 100 characters or less';
    }
    if (!formData.rewardType) {
      newErrors.rewardType = 'Reward type is required';
    }
    if (!formData.rewardValue || formData.rewardValue < 1) {
      newErrors.rewardValue = 'Reward value must be at least 1';
    }
    if (!formData.tiers || formData.tiers.length === 0) {
      newErrors.tiers = 'At least one tier must be selected';
    }

    // Date validation
    if (formData.startDate && formData.endDate) {
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);
      if (endDate <= startDate) {
        newErrors.endDate = 'End date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = (sectionKey, files) => {
    const uploadedFiles = Array.from(files);
    if (uploadedFiles.length === 0) return;

    const validFiles = [];
    const allowedTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp'];

    for (const file of uploadedFiles) {
      // Validate file type
      if (!allowedTypes.includes(file.type)) {
        alert(`${file.name}: Please upload only PNG, JPG, JPEG, or WebP images`);
        continue;
      }

      // Validate file size (2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert(`${file.name}: File size must be less than 2MB`);
        continue;
      }

      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      validFiles.push({
        file: file,
        filename: file.name,
        url: previewUrl,
        previewUrl: previewUrl,
        id: `${file.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });
    }

    if (validFiles.length > 0) {
      setFormData(prev => ({
        ...prev,
        creatives: {
          ...prev.creatives,
          [sectionKey]: [...prev.creatives[sectionKey], ...validFiles]
        }
      }));
    }
  };

  const handleDragOver = (e, sectionKey) => {
    e.preventDefault();
    setDragStates(prev => ({ ...prev, [sectionKey]: true }));
  };

  const handleDragLeave = (e, sectionKey) => {
    e.preventDefault();
    setDragStates(prev => ({ ...prev, [sectionKey]: false }));
  };

  const handleDrop = (e, sectionKey) => {
    e.preventDefault();
    setDragStates(prev => ({ ...prev, [sectionKey]: false }));
    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(sectionKey, files);
  };

  const removeCreative = (sectionKey, creativeId = null) => {
    if (creativeId) {
      // Remove specific creative from array
      const creativeToRemove = formData.creatives[sectionKey].find(c => c.id === creativeId);
      if (creativeToRemove?.previewUrl) {
        URL.revokeObjectURL(creativeToRemove.previewUrl);
      }
      setFormData(prev => ({
        ...prev,
        creatives: {
          ...prev.creatives,
          [sectionKey]: prev.creatives[sectionKey].filter(c => c.id !== creativeId)
        }
      }));
    } else {
      // Remove all creatives (legacy support)
      formData.creatives[sectionKey].forEach(creative => {
        if (creative?.previewUrl) {
          URL.revokeObjectURL(creative.previewUrl);
        }
      });
      setFormData(prev => ({
        ...prev,
        creatives: {
          ...prev.creatives,
          [sectionKey]: []
        }
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // Convert form data to the specified JSON format
      const payload = {
        ...formData,
        id: offer?.id || `${formData.sdkOfferId}_${Date.now()}`,
        status: formData.active ? 'Active' : 'Inactive',
        // Map to existing table structure
        offerName: formData.offerName,
        sdkOffer: formData.sdkOfferId,
        marketingChannel: formData.segments.marketingChannel,
        campaign: formData.segments.campaignName,
        retentionRate: offer?.retentionRate || '0%',
        clickRate: offer?.clickRate || '0%',
        installRate: offer?.installRate || '0%',
        roas: offer?.roas || '0%'
      };

      onSave(payload);
      onClose();
    }
  };

  if (!isOpen) return null;

  const availableCities = formData.segments.country ? CITIES[formData.segments.country] || [] : [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="relative inline-block align-middle bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all max-w-5xl w-full z-50">
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                {offer ? 'Edit Offer' : 'Add New Offer'}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-8 max-h-[80vh] overflow-y-auto">
            {/* SECTION 1: Basic Details */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Basic Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select SDK Offer *
                  </label>
                  <select
                    value={formData.sdkOfferId}
                    onChange={(e) => handleInputChange('sdkOfferId', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.sdkOfferId ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    aria-label="Select SDK Offer"
                  >
                    <option value="">Choose SDK Offer...</option>
                    {SDK_OFFERS.map(sdk => (
                      <option key={sdk} value={sdk}>{sdk}</option>
                    ))}
                  </select>
                  {errors.sdkOfferId && <p className="mt-1 text-xs text-red-600">{errors.sdkOfferId}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Offer Name/Title *
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={formData.offerName}
                    onChange={(e) => handleInputChange('offerName', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.offerName ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    placeholder="Enter offer name"
                    aria-label="Offer Name"
                  />
                  {errors.offerName && <p className="mt-1 text-xs text-red-600">{errors.offerName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reward Type *
                  </label>
                  <select
                    value={formData.rewardType}
                    onChange={(e) => handleInputChange('rewardType', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.rewardType ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    aria-label="Reward Type"
                  >
                    <option value="">Select reward type</option>
                    {REWARD_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {errors.rewardType && <p className="mt-1 text-xs text-red-600">{errors.rewardType}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reward Value *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.rewardValue}
                    onChange={(e) => handleInputChange('rewardValue', parseInt(e.target.value) || '')}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.rewardValue ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    placeholder="Enter reward value"
                    aria-label="Reward Value"
                  />
                  {errors.rewardValue && <p className="mt-1 text-xs text-red-600">{errors.rewardValue}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Start Date"
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
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.endDate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                    }`}
                    aria-label="End Date"
                  />
                  {errors.endDate && <p className="mt-1 text-xs text-red-600">{errors.endDate}</p>}
                </div>

                <div className="flex items-center space-x-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={(e) => handleInputChange('active', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Active/Visible</span>
                  </label>
                </div>

                <div className="flex items-center space-x-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.defaultFallback}
                      onChange={(e) => handleInputChange('defaultFallback', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Default Fallback Offer</span>
                  </label>
                </div>
              </div>
            </div>

            {/* SECTION 2: Targeting & Segmentation */}
            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-medium text-gray-900 mb-4">Targeting & Segmentation</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age Group
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-3">
                    {AGE_GROUPS.map(age => (
                      <label key={age} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.segments.ageGroups.includes(age)}
                          onChange={() => handleMultiSelectChange('segments.ageGroups', age)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">{age}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.segments.gender}
                    onChange={(e) => handleInputChange('segments.gender', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Gender"
                  >
                    <option value="">Select gender...</option>
                    {GENDERS.map(gender => (
                      <option key={gender} value={gender}>{gender}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <select
                    value={formData.segments.country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Country"
                  >
                    <option value="">Select Country...</option>
                    {COUNTRIES.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <select
                    value={formData.segments.city}
                    onChange={(e) => handleInputChange('segments.city', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={!formData.segments.country}
                    aria-label="City"
                  >
                    <option value="">Select City...</option>
                    {availableCities.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Game Preferences
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-3">
                    {GAME_PREFERENCES.map(pref => (
                      <label key={pref} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.segments.gamePreferences.includes(pref)}
                          onChange={() => handleMultiSelectChange('segments.gamePreferences', pref)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">{pref}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Marketing Channel
                  </label>
                  <select
                    value={formData.segments.marketingChannel}
                    onChange={(e) => handleInputChange('segments.marketingChannel', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Marketing Channel"
                  >
                    <option value="">Select Channel...</option>
                    {MARKETING_CHANNELS.map(channel => (
                      <option key={channel} value={channel}>{channel}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Campaign Name
                  </label>
                  <input
                    type="text"
                    value={formData.segments.campaignName}
                    onChange={(e) => handleInputChange('segments.campaignName', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Enter campaign name"
                    aria-label="Campaign Name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    XP Tier
                  </label>
                  <select
                    value={formData.xpTier}
                    onChange={(e) => handleInputChange('xpTier', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="XP Tier"
                  >
                    <option value="">Select XP Tier...</option>
                    {XP_TIERS.map(tier => (
                      <option key={tier} value={tier}>{tier}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tier Access *
                  </label>
                  <div className={`space-y-2 max-h-32 overflow-y-auto border rounded-md p-3 ${
                    errors.tiers ? 'border-red-300' : 'border-gray-200'
                  }`}>
                    {TIERS.map(tier => {
                      const getTierBadgeStyle = (tier) => {
                        switch (tier) {
                          case 'Gold': return 'bg-yellow-100 text-yellow-800';
                          case 'Platinum': return 'bg-purple-100 text-purple-800';
                          case 'Bronze': return 'bg-amber-100 text-amber-800';
                          case 'All': return 'bg-blue-100 text-blue-800';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };

                      const getTierIcon = (tier) => {
                        switch (tier) {
                          case 'Gold': return '🟡';
                          case 'Platinum': return '🟣';
                          case 'Bronze': return '🟤';
                          case 'All': return '🔵';
                          default: return '⚫';
                        }
                      };

                      return (
                        <label key={tier} className="flex items-center justify-between">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.tiers.includes(tier)}
                              onChange={() => handleMultiSelectChange('tiers', tier)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700">{tier}</span>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getTierBadgeStyle(tier)}`}>
                            <span className="mr-1">{getTierIcon(tier)}</span>
                            {tier}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {errors.tiers && <p className="mt-1 text-xs text-red-600">{errors.tiers}</p>}
                  <p className="mt-1 text-xs text-gray-500">Select which user tiers can access this offer</p>
                </div>
              </div>
            </div>

            {/* SECTION 3: Offer Card Creative Management */}
            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-medium text-gray-900 mb-4">Offer Card Creative Management</h4>
              <div className="space-y-4">
                {Object.entries(CREATIVE_SECTIONS).map(([key, section]) => {
                  const creatives = formData.creatives[key] || [];
                  const isDragging = dragStates[key];

                  return (
                    <div key={key}>
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <h5 className="text-sm font-medium text-gray-800">{section.name}</h5>
                            <p className="text-xs text-gray-500 mt-1">{section.description}</p>
                          </div>
                          <div className="text-right">
                            <div className="inline-block bg-gray-100 rounded-md px-3 py-2 text-xs text-gray-600">
                              {section.previewLabel}
                            </div>
                          </div>
                        </div>

                        {/* Existing Creatives Grid */}
                        {creatives.length > 0 && (
                          <div className="mb-4">
                            <h6 className="text-xs font-medium text-gray-700 mb-2">Uploaded Creatives ({creatives.length})</h6>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {creatives.map((creative) => (
                                <div key={creative.id} className="relative group">
                                  <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                                    <img
                                      src={creative.previewUrl}
                                      alt={creative.filename}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeCreative(key, creative.id)}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove creative"
                                  >
                                    <TrashIcon className="h-3 w-3" />
                                  </button>
                                  <p className="text-xs text-gray-600 mt-1 truncate" title={creative.filename}>
                                    {creative.filename}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Upload Area */}
                        <div
                          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                            isDragging
                              ? 'border-blue-400 bg-blue-50'
                              : 'border-gray-300 hover:border-blue-400'
                          }`}
                          onDragOver={(e) => handleDragOver(e, key)}
                          onDragLeave={(e) => handleDragLeave(e, key)}
                          onDrop={(e) => handleDrop(e, key)}
                          onClick={() => fileInputRefs.current[key]?.click()}
                        >
                          <CloudArrowUpIcon className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-700">Add Creatives</p>
                            <p className="text-xs text-gray-500">Recommended: {section.recommendedSize}</p>
                            <p className="text-xs text-gray-400">Drag & drop multiple files or click to browse</p>
                          </div>
                          <input
                            ref={(el) => fileInputRefs.current[key] = el}
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp"
                            multiple
                            onChange={(e) => handleFileUpload(key, e.target.files)}
                            className="hidden"
                            aria-label={`Upload ${section.name} Creative`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
              >
                {offer ? 'Update Offer' : 'Save Offer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}