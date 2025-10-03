'use client';

import { useState, useEffect } from 'react';

const SuspendUserModal = ({ user, isOpen, onClose, onSuspend }) => {
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
      setIsLoading(false);
    }
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isLoading, onClose]);

  const handleCancel = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const handleSuspend = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for suspension');
      return;
    }

    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters long');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await onSuspend({
        userId: user.userId,
        reason: reason.trim(),
        suspendedBy: 'Admin', // This would come from current admin user context
        suspendedAt: new Date().toISOString()
      });
      
      onClose();
    } catch (err) {
      console.error('Error suspending user:', err);
      setError('Failed to suspend user. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !user) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div className="relative p-8 border w-96 shadow-xl rounded-md bg-white">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-4 mb-4">
          <h3 className="text-xl font-semibold text-gray-800">Suspend User Account</h3>
          <button 
            onClick={handleCancel} 
            disabled={isLoading}
            className="text-gray-500 hover:text-gray-700 text-3xl leading-none disabled:opacity-50"
          >
            &times;
          </button>
        </div>
        
        {/* Warning Icon and Message */}
        <div className="text-center my-4">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.634a1 1 0 011.486 0l5.525 9.074a1 1 0 01-.743 1.583H3.475a1 1 0 01-.743-1.583l5.525-9.074zM10 13a1 1 0 100-2 1 1 0 000 2zm0 2a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <h4 className="text-lg font-bold text-gray-900 mb-2">Suspend User Access</h4>
          <p className="text-sm text-gray-600">
            This will temporarily disable <span className="font-semibold">{user.name}</span>&apos;s account access. 
            They will not be able to log in until reactivated.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* User Information */}
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <div className="flex items-center space-x-3">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={`${user.name} avatar`}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-gray-500 text-lg">👤</span>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
              <p className="text-xs text-gray-500">User ID: {user.userId}</p>
            </div>
          </div>
        </div>

        {/* Reason Input */}
        <div className="mb-6">
          <label htmlFor="suspendReason" className="block text-sm font-medium text-gray-700 mb-2">
            Reason for Suspension <span className="text-red-500">*</span>
          </label>
          <textarea
            id="suspendReason"
            name="suspendReason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(''); // Clear error when user starts typing
            }}
            rows="4"
            placeholder="Please provide a detailed reason for suspending this user account..."
            className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm p-2 border resize-none text-black ${
              error && !reason.trim() ? 'border-red-300' : ''
            }`}
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">Minimum 10 characters required</p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            onClick={handleCancel}
            type="button"
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSuspend}
            type="button"
            disabled={isLoading || !reason.trim()}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 ${
              isLoading || !reason.trim()
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Suspending...
              </div>
            ) : (
              'Suspend Account'
            )}
          </button>
        </div>

        {/* Warning Footer */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            ⚠️ This action will be logged and can be reversed by reactivating the account.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SuspendUserModal;