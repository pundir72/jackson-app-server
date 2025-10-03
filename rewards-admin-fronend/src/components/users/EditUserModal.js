'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const EditUserModal = ({ user, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
    country: '',
    userTier: '',
    xp: '',
    coinBalance: '',
    redemptionPreference: '',
    emailNotifications: true,
    smsNotifications: false
  });
  
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const genderOptions = ['Male', 'Female', 'Other'];
  const countryOptions = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France', 'Spain', 'Italy', 'India', 'Japan', 'Other'];
  const tierOptions = ['Bronze', 'Gold', 'Platinum', 'Premium'];
  const redemptionOptions = ['Cash', 'PayPal', 'Gift Card', 'Crypto'];

  // Initialize form data when user prop changes
  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        gender: user.gender || '',
        dateOfBirth: user.dateOfBirth || '',
        country: user.location || user.country || '',
        userTier: user.tier || '',
        xp: user.currentXP?.replace(/[^\d]/g, '') || user.totalXPEarned?.replace(/[^\d]/g, '') || '',
        coinBalance: user.coinBalance?.replace(/[^\d.]/g, '') || '',
        redemptionPreference: user.redemptionPreference || '',
        emailNotifications: true,
        smsNotifications: false
      });
      setErrors({});
      setHasChanges(false);
    }
  }, [user, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    setHasChanges(true);
    
    // Clear field-specific errors
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required';
    }
    
    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    // XP validation
    if (formData.xp && isNaN(formData.xp)) {
      newErrors.xp = 'XP must be a valid number';
    }
    
    // Coin Balance validation
    if (formData.coinBalance && isNaN(formData.coinBalance)) {
      newErrors.coinBalance = 'Coin balance must be a valid number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Prepare data for submission
      const submitData = {
        ...formData,
        name: formData.name.trim(),
        email: formData.email.toLowerCase().trim(),
        phone: formData.phone.trim()
      };
      
      await onSave(submitData);
      onClose();
    } catch (error) {
      console.error('Error saving user profile:', error);
      setErrors({ submit: 'Failed to save changes. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Edit User Profile</h2>
            <p className="text-sm text-gray-600 mt-1">Update user information and preferences</p>
          </div>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>


        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {errors.submit && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Full Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black ${
                  errors.name ? 'border-red-300' : ''
                }`}
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>

            {/* Email Address */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="john.doe@example.com"
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black ${
                  errors.email ? 'border-red-300' : ''
                }`}
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+1 (555) 123-4567"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black"
              />
            </div>

            {/* Gender */}
            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
                Gender
              </label>
              <select
                id="gender"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black bg-white"
              >
                <option value="">Claude content</option>
                {genderOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            {/* Date of Birth */}
            <div>
              <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-2">
                Date of Birth
              </label>
              <input
                type="text"
                id="dateOfBirth"
                name="dateOfBirth"
                value={formData.dateOfBirth}
                onChange={handleChange}
                placeholder="15/05/1990"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black"
              />
            </div>

            {/* Country / Location */}
            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-2">
                Country / Location
              </label>
              <select
                id="country"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black bg-white"
              >
                <option value="">United States</option>
                {countryOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            {/* User Tier */}
            <div>
              <label htmlFor="userTier" className="block text-sm font-medium text-gray-700 mb-2">
                User Tier
              </label>
              <select
                id="userTier"
                name="userTier"
                value={formData.userTier}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black bg-white"
              >
                <option value="">Premium</option>
                {tierOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            {/* XP (Experience Points) */}
            <div>
              <label htmlFor="xp" className="block text-sm font-medium text-gray-700 mb-2">
                XP (Experience Points)
              </label>
              <input
                type="number"
                id="xp"
                name="xp"
                value={formData.xp}
                onChange={handleChange}
                placeholder="2500"
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black ${
                  errors.xp ? 'border-red-300' : ''
                }`}
              />
              {errors.xp && <p className="mt-1 text-sm text-red-600">{errors.xp}</p>}
            </div>

            {/* Coin Balance */}
            <div>
              <label htmlFor="coinBalance" className="block text-sm font-medium text-gray-700 mb-2">
                Coin Balance
              </label>
              <input
                type="number"
                id="coinBalance"
                name="coinBalance"
                value={formData.coinBalance}
                onChange={handleChange}
                placeholder="150.75"
                step="0.01"
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black ${
                  errors.coinBalance ? 'border-red-300' : ''
                }`}
              />
              {errors.coinBalance && <p className="mt-1 text-sm text-red-600">{errors.coinBalance}</p>}
            </div>

            {/* Redemption Preference */}
            <div>
              <label htmlFor="redemptionPreference" className="block text-sm font-medium text-gray-700 mb-2">
                Redemption Preference
              </label>
              <select
                id="redemptionPreference"
                name="redemptionPreference"
                value={formData.redemptionPreference}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-black bg-white"
              >
                <option value="">Cash</option>
                {redemptionOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="mt-8">
            <h3 className="text-base font-medium text-gray-700 mb-4">Notification Preferences</h3>
            <div className="flex items-center gap-8">
              <div className="flex items-center">
                <input
                  id="emailNotifications"
                  name="emailNotifications"
                  type="checkbox"
                  checked={formData.emailNotifications}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="emailNotifications" className="ml-2 text-sm text-gray-700">
                  Email Notifications
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  id="smsNotifications"
                  name="smsNotifications"
                  type="checkbox"
                  checked={formData.smsNotifications}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="smsNotifications" className="ml-2 text-sm text-gray-700">
                  SMS Notifications
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-6 mt-8">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !hasChanges}
              className={`px-6 py-2.5 text-sm font-medium text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                isLoading || !hasChanges
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditUserModal;