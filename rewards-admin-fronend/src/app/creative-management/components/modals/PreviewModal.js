import React from "react";

const PreviewModal = ({ isOpen, onClose, creative }) => {
  if (!isOpen || !creative) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Preview: {creative.title}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Mobile Preview */}
          <div>
            <h3 className="text-lg font-medium mb-4">Mobile Preview</h3>
            <div className="bg-gray-100 rounded-lg p-4 max-w-sm mx-auto">
              {/* Mock Mobile Layout */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-gray-800 text-white p-2 text-center text-sm">
                  Mobile App - {creative.placement}
                </div>
                <div className="p-4 space-y-3">
                  {/* Navigation Bar */}
                  <div className="flex justify-between items-center bg-gray-100 p-2 rounded">
                    <span className="text-xs text-gray-600">🏠 Home</span>
                    <span className="text-xs text-gray-600">💰 1,250 pts</span>
                  </div>
                  
                  {creative.placement === "Home Top" && (
                    <div className="w-full">
                      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 rounded-lg shadow-md">
                        <div className="font-bold text-sm">{creative.title}</div>
                        <div className="text-xs opacity-90 mt-1">🎯 {creative.segment}</div>
                        <div className="text-xs opacity-75 mt-1">Tap to claim!</div>
                      </div>
                    </div>
                  )}
                  
                  {creative.placement === "Home Middle" && (
                    <>
                      <div className="bg-gray-200 p-3 rounded text-center text-xs">Daily Tasks</div>
                      <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white p-3 rounded-lg shadow-md">
                        <div className="font-semibold text-sm">{creative.title}</div>
                        <div className="text-xs opacity-90">🎁 Special offer for {creative.segment}</div>
                      </div>
                      <div className="bg-gray-200 p-3 rounded text-center text-xs">Recent Activities</div>
                    </>
                  )}
                  
                  {creative.placement === "Home Bottom" && (
                    <>
                      <div className="bg-gray-200 p-2 rounded text-center text-xs">Tasks</div>
                      <div className="bg-gray-200 p-2 rounded text-center text-xs">Games</div>
                      <div className="bg-orange-500 text-white p-3 rounded-lg shadow-md">
                        <div className="font-semibold text-sm">{creative.title}</div>
                        <div className="text-xs opacity-90">🔥 Limited time offer!</div>
                      </div>
                    </>
                  )}

                  {creative.placement === "Spin Wheel" && (
                    <div className="text-center space-y-3">
                      <div className="text-xs text-gray-600">Daily Spin</div>
                      <div className="w-32 h-32 bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-full mx-auto flex items-center justify-center shadow-lg">
                        <span className="text-white font-bold text-lg">SPIN</span>
                      </div>
                      <div className="bg-green-500 text-white p-2 rounded-lg shadow-md">
                        <div className="font-semibold text-sm">{creative.title}</div>
                        <div className="text-xs opacity-90">🎯 For {creative.segment}</div>
                      </div>
                    </div>
                  )}
                  
                  {creative.placement === "Profile Top" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-2 bg-gray-100 rounded">
                        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                          U
                        </div>
                        <div className="text-xs">
                          <div className="font-semibold">User Profile</div>
                          <div className="text-gray-600">Level 5 • {creative.segment}</div>
                        </div>
                      </div>
                      <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-3 rounded-lg shadow-md">
                        <div className="font-semibold text-sm">🌟 {creative.title}</div>
                        <div className="text-xs opacity-90">Exclusive for you!</div>
                      </div>
                    </div>
                  )}
                  
                  {creative.placement.includes("Offers") && (
                    <div className="space-y-2">
                      <div className="text-center text-xs text-gray-600 font-semibold">🎁 Special Offers</div>
                      <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white p-3 rounded-lg shadow-md">
                        <div className="font-bold text-sm">{creative.title}</div>
                        <div className="text-xs opacity-90">💰 Earn more points!</div>
                        <div className="text-xs opacity-75 mt-1">Target: {creative.segment}</div>
                      </div>
                      <div className="bg-gray-200 p-2 rounded text-center text-xs">More offers below...</div>
                    </div>
                  )}
                  
                  {creative.placement.includes("Games") && (
                    <div className="space-y-2">
                      <div className="text-center text-xs text-gray-600 font-semibold">🎮 Featured Games</div>
                      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-3 rounded-lg shadow-md">
                        <div className="font-bold text-sm">🎯 {creative.title}</div>
                        <div className="text-xs opacity-90">Play & Earn Points!</div>
                        <div className="text-xs opacity-75 mt-1">PID: {creative.campaignPID}</div>
                      </div>
                    </div>
                  )}
                  
                  {creative.placement.includes("Rewards") && (
                    <div className="space-y-2">
                      <div className="text-center text-xs text-gray-600 font-semibold">🏆 Rewards Center</div>
                      <div className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white p-3 rounded-lg shadow-md">
                        <div className="font-bold text-sm">⭐ {creative.title}</div>
                        <div className="text-xs opacity-90">Redeem your points!</div>
                        <div className="text-xs opacity-75 mt-1">Available for {creative.segment}</div>
                      </div>
                    </div>
                  )}
                  
                  {/* Bottom Navigation */}
                  <div className="flex justify-around items-center bg-gray-800 text-white p-2 rounded text-xs">
                    <span className="opacity-75">🏠 Home</span>
                    <span className="opacity-75">🎮 Games</span>
                    <span className="opacity-75">🎁 Offers</span>
                    <span className="opacity-75">👤 Profile</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Creative Details */}
          <div>
            <h3 className="text-lg font-medium mb-4">Creative Details</h3>
            <div className="space-y-3">
              <div>
                <span className="font-medium text-gray-800">Title:</span>
                <span className="ml-2 text-gray-900">{creative.title}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Placement:</span>
                <span className="ml-2 text-gray-900">{creative.placement}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Campaign PID:</span>
                <span className="ml-2 text-gray-900">{creative.campaignPID}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Status:</span>
                <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                  creative.status === "Active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}>
                  {creative.status}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Target Segment:</span>
                <span className="ml-2 text-gray-900">{creative.segment}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Views:</span>
                <span className="ml-2 text-gray-900 font-semibold">{creative.views?.toLocaleString() || 0}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Clicks:</span>
                <span className="ml-2 text-gray-900 font-semibold">{creative.clicks?.toLocaleString() || 0}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">CTR:</span>
                <span className="ml-2 text-[#00a389] font-semibold">{creative.ctr || "0%"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;