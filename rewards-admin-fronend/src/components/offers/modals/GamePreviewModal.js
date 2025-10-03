'use client';

export default function GamePreviewModal({ isOpen, onClose, game }) {
  if (!isOpen || !game) return null;

  const getTierIcon = (tier) => {
    switch (tier) {
      case 'Gold': return '🟡';
      case 'Platinum': return '🟣';
      case 'Bronze': return '🟤';
      case 'All': return '🔵';
      default: return '⚫';
    }
  };

  const getCountryFlag = (countryCode) => {
    const flags = {
      'US': '🇺🇸',
      'CA': '🇨🇦',
      'UK': '🇬🇧',
      'AU': '🇦🇺',
      'DE': '🇩🇪',
      'FR': '🇫🇷',
      'ES': '🇪🇸',
      'IT': '🇮🇹',
      'NL': '🇳🇱',
      'SE': '🇸🇪'
    };
    return flags[countryCode] || '🌍';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Game Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 max-h-[calc(90vh-120px)] overflow-y-auto">
          {/* Game Header */}
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
              {game.title?.charAt(0) || 'G'}
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-gray-900">{game.title}</h3>
              <p className="text-gray-600 mt-1">ID: {game.id}</p>
              <div className="flex items-center mt-2 space-x-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  game.status === 'Active' ? 'bg-green-100 text-green-800' :
                  game.status === 'Testing' ? 'bg-blue-100 text-blue-800' :
                  game.status === 'Paused' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {game.status}
                </span>
                {game.adSupported && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    Ad Supported
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Game Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">SDK & Integration</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-lg font-semibold text-gray-900">{game.sdk}</div>
                  <div className="text-sm text-gray-600">SDK Provider</div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">XPTR Rules</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-900">{game.xptrRules || 'No specific rules defined'}</div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Task Information</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Tasks:</span>
                    <span className="font-semibold text-gray-900">{game.taskCount || 0}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-gray-600">Active Tasks:</span>
                    <span className="font-semibold text-green-600">{game.activeTasks || 0}</span>
                  </div>
                </div>
              </div>

              {game.countries && game.countries.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Target Countries</h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex flex-wrap gap-2">
                      {game.countries.map(country => (
                        <div key={country} className="flex items-center space-x-1 bg-white px-2 py-1 rounded-md">
                          <span>{getCountryFlag(country)}</span>
                          <span className="text-sm font-medium">{country}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Rewards</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {game.rewardXP > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">XP Reward:</span>
                      <span className="font-semibold text-blue-600">{game.rewardXP} XP</span>
                    </div>
                  )}
                  {game.rewardCoins > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Coin Reward:</span>
                      <span className="font-semibold text-yellow-600">{game.rewardCoins} Coins</span>
                    </div>
                  )}
                  {!game.rewardXP && !game.rewardCoins && (
                    <div className="text-sm text-gray-500">No rewards configured</div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Performance Metrics</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {game.engagementTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Avg. Engagement:</span>
                      <span className="font-semibold text-gray-900">{game.engagementTime}</span>
                    </div>
                  )}
                  {game.retentionRate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Retention Rate:</span>
                      <span className="font-semibold text-green-600">{game.retentionRate}%</span>
                    </div>
                  )}
                  {game.clickRate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Click Rate:</span>
                      <span className="font-semibold text-blue-600">{game.clickRate}%</span>
                    </div>
                  )}
                  {game.installRate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Install Rate:</span>
                      <span className="font-semibold text-purple-600">{game.installRate}%</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Marketing</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {game.marketingChannel && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Channel:</span>
                      <span className="font-semibold text-gray-900">{game.marketingChannel}</span>
                    </div>
                  )}
                  {game.campaign && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Campaign:</span>
                      <span className="font-semibold text-gray-900">{game.campaign}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-between">
          <div className="text-sm text-gray-600">
            Game configured for SDK integration and task management
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium text-sm hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}