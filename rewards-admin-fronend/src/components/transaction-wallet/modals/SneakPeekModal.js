'use client';

import { XMarkIcon, UserCircleIcon, CurrencyDollarIcon, TrophyIcon, ClockIcon } from '@heroicons/react/24/outline';

export default function SneakPeekModal({ userData, isOpen, onClose }) {
  if (!isOpen || !userData) return null;

  const mockActivityTimeline = [
    {
      id: 1,
      action: 'Completed Offer',
      details: 'Spin Master Gaming Challenge',
      duration: '12 minutes',
      reward: '+50 XP, +25 Coins',
      timestamp: '2 hours ago',
      type: 'offer'
    },
    {
      id: 2,
      action: 'Redemption Request',
      details: '$500 Paytm Transfer',
      status: 'Pending Approval',
      timestamp: '1 hour ago',
      type: 'redemption'
    },
    {
      id: 3,
      action: 'Survey Completed',
      details: 'Product Feedback Survey',
      duration: '8 minutes',
      reward: '+30 XP, +15 Coins',
      timestamp: '3 hours ago',
      type: 'survey'
    },
    {
      id: 4,
      action: 'Face Verification',
      details: 'Biometric verification completed',
      status: 'Verified',
      timestamp: '4 hours ago',
      type: 'verification'
    },
    {
      id: 5,
      action: 'Login',
      details: 'Mobile app login',
      location: 'Mumbai, India',
      timestamp: '5 hours ago',
      type: 'login'
    }
  ];

  const getActivityIcon = (type) => {
    const icons = {
      'offer': <TrophyIcon className="w-4 h-4" />,
      'redemption': <CurrencyDollarIcon className="w-4 h-4" />,
      'survey': <UserCircleIcon className="w-4 h-4" />,
      'verification': <UserCircleIcon className="w-4 h-4" />,
      'login': <UserCircleIcon className="w-4 h-4" />
    };
    return icons[type] || <UserCircleIcon className="w-4 h-4" />;
  };

  const getActivityBadge = (type, status) => {
    const styles = {
      'offer': 'bg-purple-100 text-purple-800',
      'redemption': status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800',
      'survey': 'bg-blue-100 text-blue-800',
      'verification': status === 'Verified' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
      'login': 'bg-gray-100 text-gray-800'
    };
    
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${styles[type]}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">User Activity - Sneak Peek</h2>
            <p className="text-sm text-gray-600 mt-1">
              Real-time activity timeline for {userData.userId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex h-[calc(90vh-88px)]">
          {/* Left Panel - User Summary */}
          <div className="w-1/3 border-r border-gray-200 p-6 bg-gray-50">
            {/* User Profile */}
            <div className="bg-white rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  <UserCircleIcon className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{userData.profile?.name || 'User Profile'}</h3>
                  <p className="text-sm text-gray-600">{userData.userId}</p>
                </div>
              </div>
              
              {userData.profile && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Tier:</span>
                    <span className="text-sm font-medium text-emerald-600">{userData.profile.tier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Redemptions:</span>
                    <span className="text-sm font-medium">{userData.profile.totalRedemptions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Email:</span>
                    <span className="text-sm text-gray-900">{userData.profile.email}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Verification Status */}
            <div className="bg-white rounded-lg p-4 mb-6">
              <h4 className="font-medium text-gray-900 mb-3">Verification Status</h4>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  userData.verificationStatus?.includes('Verified') 
                    ? 'bg-green-400' 
                    : 'bg-orange-400'
                }`}></div>
                <span className="text-sm text-gray-900">
                  {userData.verificationStatus || 'Face Verified'}
                </span>
              </div>
            </div>

            {/* Recent Offers */}
            {userData.offerHistory && (
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Recent Offer Completions</h4>
                <div className="space-y-2">
                  {userData.offerHistory.map((offer, index) => (
                    <div key={index} className="p-2 bg-purple-50 rounded text-sm">
                      {offer}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Activity Timeline */}
          <div className="flex-1 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
              <div className="flex items-center text-sm text-gray-500">
                <ClockIcon className="w-4 h-4 mr-1" />
                Last 24 hours
              </div>
            </div>

            <div className="space-y-4 max-h-[calc(100%-80px)] overflow-y-auto">
              {mockActivityTimeline.map((activity) => (
                <div key={activity.id} className="flex space-x-4 p-4 bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                      {getActivityIcon(activity.type)}
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium text-gray-900">{activity.action}</h4>
                      <div className="flex items-center space-x-2">
                        {getActivityBadge(activity.type, activity.status)}
                        <span className="text-xs text-gray-500">{activity.timestamp}</span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">{activity.details}</p>
                    
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      {activity.duration && (
                        <div className="flex items-center">
                          <ClockIcon className="w-3 h-3 mr-1" />
                          {activity.duration}
                        </div>
                      )}
                      {activity.reward && (
                        <div className="flex items-center">
                          <TrophyIcon className="w-3 h-3 mr-1" />
                          {activity.reward}
                        </div>
                      )}
                      {activity.location && (
                        <div>📍 {activity.location}</div>
                      )}
                      {activity.status && activity.type !== 'verification' && (
                        <div>Status: {activity.status}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* View Full Profile Link */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  window.open(`/users/${userData.userId}`, '_blank');
                  onClose();
                }}
                className="w-full bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                View Full User Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}