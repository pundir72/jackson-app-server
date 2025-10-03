'use client';

import { useState } from 'react';

export default function CreateAbTestModal({ 
  isOpen, 
  onClose, 
  onCreateAbTest, 
  userSegments,
  onCalculateAudienceSize,
  onShowNotification
}) {
  const [formData, setFormData] = useState({
    name: '',
    baseMessage: '',
    variants: {
      A: { title: '', body: '', isAiGenerated: false },
      B: { title: '', body: '', isAiGenerated: false }
    },
    targetSegment: [],
    audienceSplit: 50
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [audienceSize, setAudienceSize] = useState(0);
  const [hasGeneratedVariants, setHasGeneratedVariants] = useState(false);

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

  // Handle variant changes
  const handleVariantChange = (variant, field, value) => {
    setFormData(prev => ({
      ...prev,
      variants: {
        ...prev.variants,
        [variant]: {
          ...prev.variants[variant],
          [field]: value
        }
      }
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate form data
      if (!formData.name.trim()) {
        throw new Error('Test name is required');
      }
      if (!formData.baseMessage.trim()) {
        throw new Error('Base message is required');
      }
      if (!formData.variants.A.title.trim() || !formData.variants.A.body.trim()) {
        throw new Error('Variant A title and body are required');
      }
      if (!formData.variants.B.title.trim() || !formData.variants.B.body.trim()) {
        throw new Error('Variant B title and body are required');
      }
      if (formData.targetSegment.length === 0) {
        throw new Error('At least one target segment is required');
      }

      const result = await onCreateAbTest(formData);
      
      if (result.success) {
        onShowNotification('A/B test created successfully!', 'success');
        handleClose();
      } else {
        onShowNotification(result.error || 'Failed to create A/B test', 'error');
      }
    } catch (error) {
      onShowNotification(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle modal close
  const handleClose = () => {
    setFormData({
      name: '',
      baseMessage: '',
      variants: {
        A: { title: '', body: '' },
        B: { title: '', body: '' }
      },
      targetSegment: [],
      audienceSplit: 50
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Create A/B Test</h3>
              <p className="text-sm text-gray-600 mt-1">
                Create and launch an A/B test to optimize push notification performance
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
                  Test Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g., Login Incentive Test"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Audience Split
                </label>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600">A: {formData.audienceSplit}%</span>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="10"
                    value={formData.audienceSplit}
                    onChange={(e) => handleInputChange('audienceSplit', parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-600">B: {100 - formData.audienceSplit}%</span>
                </div>
              </div>
            </div>

            {/* Base Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Base Message <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.baseMessage}
                onChange={(e) => handleInputChange('baseMessage', e.target.value)}
                placeholder="e.g., Login now to claim your rewards!"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Base message that AI will use to generate variants</p>
            </div>

            {/* Variants */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-gray-900">Test Variants</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Variant A */}
                <div className="space-y-4">
                  <h5 className="text-md font-medium text-gray-800">Variant A</h5>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.variants.A.title}
                      onChange={(e) => handleVariantChange('A', 'title', e.target.value)}
                      placeholder="e.g., Claim Your Daily Reward!"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Body <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={formData.variants.A.body}
                      onChange={(e) => handleVariantChange('A', 'body', e.target.value)}
                      placeholder="e.g., Login now to claim your daily reward."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                {/* Variant B */}
                <div className="space-y-4">
                  <h5 className="text-md font-medium text-gray-800">Variant B</h5>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.variants.B.title}
                      onChange={(e) => handleVariantChange('B', 'title', e.target.value)}
                      placeholder="e.g., Your Reward is Waiting!"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Body <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={formData.variants.B.body}
                      onChange={(e) => handleVariantChange('B', 'body', e.target.value)}
                      placeholder="e.g., Login to claim 2x your daily reward points!"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
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
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || formData.targetSegment.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating...' : 'Launch A/B Test'}
          </button>
        </div>
      </div>
    </div>
  );
}