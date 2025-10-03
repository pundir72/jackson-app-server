'use client';

import { useState } from 'react';

export default function CampaignPreviewModal({ campaign, isOpen, onClose }) {

  if (!isOpen || !campaign) return null;

  // Format target segments for display
  const formatSegments = (segments) => {
    if (!segments || segments.length === 0) return 'All Users';
    return segments.join(', ');
  };

  // Get CTA button text
  const getCtaText = (ctaAction) => {
    switch (ctaAction) {
      case 'app_home':
        return 'Open App';
      case 'profile_setup':
        return 'Complete Profile';
      case 'game_launch':
        return 'Play Game';
      case 'offer_detail':
        return 'View Offer';
      case 'survey_start':
        return 'Take Survey';
      case 'bonus_claim':
        return 'Claim Bonus';
      case 'daily_reward':
        return 'Claim Reward';
      case 'cashout_now':
        return 'Cash Out';
      default:
        return 'Open';
    }
  };

  // Mock phone preview component
  const PhonePreview = () => {
    return (
      <div className="relative mx-auto">
        {/* Phone Frame */}
        <div className="relative w-72 h-[600px] bg-gray-900 rounded-[2.5rem] p-2">
          {/* Screen */}
          <div className="w-full h-full bg-gray-100 overflow-hidden rounded-[2rem] p-4">
            {/* Simple Notification Preview */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm font-medium text-gray-900 mb-2">
                {campaign.title}
              </div>
              <div className="text-sm text-gray-600 mb-3">
                {campaign.body}
              </div>
              <button className="w-full bg-blue-500 text-white text-sm py-2 px-4 rounded">
                {getCtaText(campaign.ctaAction)}
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Campaign Preview</h3>
              <p className="text-sm text-gray-600 mt-1">
                Preview how your push notification will appear on user devices
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Campaign Details */}
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-4">Campaign Details</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                    <div className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">
                      {campaign.name}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Push Title</label>
                    <div className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">
                      {campaign.title}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message Body</label>
                    <div className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">
                      {campaign.body}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Segments</label>
                    <div className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">
                      {formatSegments(campaign.targetSegment)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CTA Action</label>
                    <div className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">
                      {campaign.ctaAction} → {getCtaText(campaign.ctaAction)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frequency Rule</label>
                    <div className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">
                      {campaign.frequencyRule}
                    </div>
                  </div>

                  {campaign.scheduleTime && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Time</label>
                      <div className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3">
                        {new Date(campaign.scheduleTime).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Mobile Preview */}
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-4">Mobile Preview</h4>
                
                {/* Phone Preview */}
                <div className="flex justify-center">
                  <PhonePreview />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}