'use client';

import { useState } from 'react';

export default function DeleteCampaignModal({ 
  campaign, 
  isOpen, 
  onClose, 
  onDeleteCampaign,
  onShowNotification
}) {
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen || !campaign) return null;

  // Handle deletion
  const handleDelete = async () => {
    setIsLoading(true);

    try {
      const result = await onDeleteCampaign(campaign.id);
      
      if (result.success) {
        onShowNotification('Campaign deleted successfully', 'success');
        onClose();
      } else {
        onShowNotification(result.error || 'Failed to delete campaign', 'error');
      }
    } catch (error) {
      onShowNotification('Failed to delete campaign', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if campaign can be deleted
  const canDelete = ['Draft', 'Failed'].includes(campaign.status);
  const hasStats = campaign.stats && campaign.stats.sent > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">Delete Campaign</h3>
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
        <div className="px-6 py-4">
          {!canDelete ? (
            // Cannot delete message
            <div>
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">Cannot Delete Campaign</h4>
                <p className="text-sm text-gray-600">
                  This campaign cannot be deleted because it has a status of &quot;{campaign.status}&quot;. 
                  Only campaigns with &quot;Draft&quot; or &quot;Failed&quot; status can be deleted.
                </p>
              </div>

              {/* Campaign Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Campaign:</span>
                    <span className="font-medium text-gray-900">{campaign.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-medium ${
                      campaign.status === 'Sent' ? 'text-green-600' :
                      campaign.status === 'Scheduled' ? 'text-blue-600' :
                      'text-gray-900'
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                  {hasStats && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Messages Sent:</span>
                      <span className="font-medium text-gray-900">
                        {campaign.stats.sent.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start">
                  <svg className="w-4 h-4 text-blue-400 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-xs text-blue-600">
                    <div className="font-medium mb-1">Alternative Actions:</div>
                    <ul className="space-y-1">
                      {campaign.status === 'Scheduled' && (
                        <li>• Edit the campaign to change its schedule or content</li>
                      )}
                      {campaign.status === 'Sent' && (
                        <li>• Create a new campaign based on this one&apos;s content</li>
                      )}
                      <li>• Archive the campaign instead of deleting it</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Can delete - show confirmation
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">Are you absolutely sure?</h4>
                <p className="text-sm text-gray-600">
                  This action cannot be undone. This will permanently delete the campaign and all its configuration.
                </p>
              </div>

              {/* Campaign Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Campaign:</span>
                    <span className="font-medium text-gray-900">{campaign.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Title:</span>
                    <span className="font-medium text-gray-900 truncate ml-2">{campaign.title}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-medium ${
                      campaign.status === 'Draft' ? 'text-gray-600' : 'text-red-600'
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Created:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="text-sm text-red-600">
                  This action cannot be undone. The campaign will be permanently deleted.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isLoading}
          >
            {canDelete ? 'Cancel' : 'Close'}
          </button>
          
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Deleting...' : 'Delete Campaign'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}