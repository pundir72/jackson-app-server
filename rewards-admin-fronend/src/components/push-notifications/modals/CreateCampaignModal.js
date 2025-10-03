'use client';

import { useState } from 'react';

export default function CreateCampaignModal({ 
  isOpen, 
  onClose, 
  onCreateCampaign, 
  userSegments,
  frequencyRules,
  ctaActions,
  gameConfigs,
  offerConfigs,
  onCalculateAudienceSize,
  onShowNotification,
  initialData = null
}) {
  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        name: initialData.name || '',
        title: initialData.title || '',
        body: initialData.body || '',
        targetSegment: initialData.targetSegment || [],
        scheduleTime: initialData.scheduleTime || '',
        frequencyRule: initialData.frequencyRule || '1 per user/day',
        ctaAction: initialData.ctaAction || 'app_home',
        trackInFirebase: initialData.trackInFirebase !== undefined ? initialData.trackInFirebase : true
      };
    }
    return {
      name: '',
      title: '',
      body: '',
      targetSegment: [],
      scheduleTime: '',
      frequencyRule: '1 per user/day',
      ctaAction: 'app_home',
      trackInFirebase: true
    };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [audienceSize, setAudienceSize] = useState(0);

  if (!isOpen) return null;

  // Handle form field changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Calculate audience size when segments change
    if (field === 'targetSegment') {
      const size = onCalculateAudienceSize(value);
      setAudienceSize(size);
    }
  };

  // Handle CTA action change
  const handleCtaChange = (ctaAction) => {
    const ctaConfig = ctaActions.find(action => action.value === ctaAction);
    setFormData(prev => ({
      ...prev,
      ctaAction,
      ctaConfig: {
        type: 'app_navigation',
        deepLink: ctaConfig?.deepLink || 'jackson://home',
        fallbackUrl: null
      }
    }));
  };

  // Handle form submission
  const handleSubmit = async (e, saveAsDraft = false) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Basic validation for both draft and full submission
      if (!formData.name.trim()) {
        throw new Error('Campaign name is required');
      }
      
      // Full validation only for non-draft submissions
      if (!saveAsDraft) {
        if (!formData.title.trim()) {
          throw new Error('Push title is required');
        }
        if (!formData.body.trim()) {
          throw new Error('Message body is required');
        }
        if (formData.targetSegment.length === 0) {
          throw new Error('At least one target segment is required');
        }

        // Validate schedule time if provided
        if (formData.scheduleTime) {
          const scheduleDate = new Date(formData.scheduleTime);
          const now = new Date();
          if (scheduleDate <= now) {
            throw new Error('Schedule time must be in the future');
          }
        }
      }

      // Prepare data with draft status
      const campaignData = {
        ...formData,
        status: saveAsDraft ? 'Draft' : (formData.scheduleTime ? 'Scheduled' : 'Draft'),
        isDraft: saveAsDraft
      };

      const result = await onCreateCampaign(campaignData);
      
      if (result.success) {
        const message = saveAsDraft 
          ? 'Campaign saved as draft successfully!' 
          : 'Campaign created successfully!';
        onShowNotification(message, 'success');
        handleClose();
      } else {
        onShowNotification(result.error || 'Failed to save campaign', 'error');
      }
    } catch (error) {
      onShowNotification(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle save as draft
  const handleSaveAsDraft = (e) => {
    handleSubmit(e, true);
  };

  // Handle modal close
  const handleClose = () => {
    setFormData({
      name: '',
      title: '',
      body: '',
      targetSegment: [],
      scheduleTime: '',
      frequencyRule: '1 per user/day',
      ctaAction: 'app_home',
      ctaConfig: {
        type: 'app_navigation',
        deepLink: 'jackson://home',
        fallbackUrl: null
      },
      trackInFirebase: true
    });
    setAudienceSize(0);
    onClose();
  };

  // Handle segment selection
  const handleSegmentToggle = (segmentName) => {
    const newSegments = formData.targetSegment.includes(segmentName)
      ? formData.targetSegment.filter(s => s !== segmentName)
      : [...formData.targetSegment, segmentName];
    
    handleInputChange('targetSegment', newSegments);
  };


  // Format datetime-local input value
  const formatDateTimeLocal = (date) => {
    if (!date) return '';
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {initialData ? 'Edit Campaign' : 'Create New Campaign'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {initialData ? 'Edit your push notification campaign' : 'Create and configure a push notification campaign'}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g., Summer Blast Promo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Internal label for identifying this campaign</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frequency Rule <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.frequencyRule}
                  onChange={(e) => handleInputChange('frequencyRule', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                >
                  {frequencyRules.map(rule => (
                    <option key={rule.value} value={rule.value}>{rule.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {frequencyRules.find(r => r.value === formData.frequencyRule)?.description}
                </p>
              </div>
            </div>

            {/* Push Notification Content */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-gray-900">Push Notification Content</h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Push Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="e.g., Win Big This Summer! 🏖️"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Title displayed in the push notification</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message Body <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.body}
                  onChange={(e) => handleInputChange('body', e.target.value)}
                  placeholder="e.g., Login now to spin the wheel and win amazing prizes! Limited time summer offers await."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Main message body shown in the notification</p>
              </div>
            </div>

            {/* Target Segments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Target Segments <span className="text-red-500">*</span>
              </label>
              <div className="border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {userSegments.map(segment => (
                    <label
                      key={segment.id}
                      className="flex items-center space-x-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={formData.targetSegment.includes(segment.name)}
                        onChange={() => handleSegmentToggle(segment.name)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {segment.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {segment.userCount.toLocaleString()} users
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {audienceSize > 0 && (
                <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-800">
                    <span className="font-medium">Estimated Audience:</span> ~{Math.floor(audienceSize).toLocaleString()} users
                  </div>
                </div>
              )}
              {formData.targetSegment.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Please select at least one target segment</p>
              )}
            </div>

            {/* CTA Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CTA Action <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.ctaAction}
                  onChange={(e) => handleCtaChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                >
                  {ctaActions.map(action => (
                    <option key={action.value} value={action.value}>
                      {action.label} - {action.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Schedule Time (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={formatDateTimeLocal(formData.scheduleTime)}
                  onChange={(e) => handleInputChange('scheduleTime', e.target.value)}
                  min={formatDateTimeLocal(new Date(Date.now() + 5 * 60 * 1000))} // 5 minutes from now
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty to save as draft</p>
              </div>
            </div>

            {/* Analytics Tracking */}
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.trackInFirebase}
                  onChange={(e) => handleInputChange('trackInFirebase', e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-gray-700">Track in Firebase Analytics</span>
              </label>
              <p className="text-xs text-gray-500 ml-6 mt-1">
                Enable performance tracking (opens, clicks, conversions)
              </p>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          
          <div className="flex space-x-3">
            {!initialData && (
              <button
                onClick={handleSaveAsDraft}
                disabled={isLoading || !formData.name.trim()}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Saving...' : 'Save As Draft'}
              </button>
            )}
            
            <button
              onClick={handleSubmit}
              disabled={isLoading || (!initialData && formData.targetSegment.length === 0)}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading 
                ? (initialData ? 'Updating...' : 'Creating...') 
                : (initialData ? 'Update Campaign' : (formData.scheduleTime ? 'Schedule Campaign' : 'Send Now'))
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}