'use client';

export default function OfferPreviewModal({ isOpen, onClose, offer }) {
  if (!isOpen || !offer) return null;

  const getProgressPercentage = () => {
    // Simulate progress for demo
    return Math.floor(Math.random() * 100);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Mobile Preview</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mobile Frame */}
        <div className="p-4">
          <div className="bg-gray-900 rounded-3xl p-2 shadow-2xl">
            {/* Mobile Screen */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ aspectRatio: '9/19.5' }}>
              {/* Status Bar */}
              <div className="bg-gray-100 px-4 py-2 flex justify-between items-center text-xs">
                <span className="font-medium">9:41</span>
                <div className="flex items-center space-x-1">
                  <div className="w-4 h-2 bg-green-500 rounded-sm"></div>
                  <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                  <div className="w-4 h-2 border border-gray-400 rounded-sm"></div>
                </div>
              </div>

              {/* App Header */}
              <div className="bg-emerald-500 text-white p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                  <div>
                    <h1 className="font-semibold">Surveys</h1>
                    <p className="text-xs text-emerald-100">Earn coins by sharing your opinions</p>
                  </div>
                </div>
              </div>

              {/* Survey Card */}
              <div className="p-4">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Survey Header */}
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 text-sm">{offer.title}</h3>
                        <p className="text-xs text-gray-600 mt-1">{offer.description}</p>
                      </div>
                      <div className="ml-3 text-right">
                        <div className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full text-xs font-medium">
                          +{offer.coinReward} coins
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Survey Details */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Estimated time:</span>
                      <span className="font-medium text-gray-900">{offer.estimatedTime}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Difficulty:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        offer.difficulty === 'Easy' ? 'bg-green-100 text-green-800' :
                        offer.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {offer.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Category:</span>
                      <span className="font-medium text-gray-900">{offer.category}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Powered by:</span>
                      <span className="font-medium text-blue-600">{offer.sdkSource}</span>
                    </div>

                    {/* Progress Bar (if started) */}
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                        <span>Progress</span>
                        <span>{getProgressPercentage()}% complete</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" 
                          style={{ width: `${getProgressPercentage()}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="p-4 bg-gray-50">
                    <button className="w-full bg-emerald-500 text-white py-3 px-4 rounded-lg font-medium text-sm hover:bg-emerald-600 transition-colors">
                      {getProgressPercentage() > 0 ? 'Continue Survey' : 'Start Survey'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sample Questions Preview */}
              <div className="px-4 pb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h4 className="font-medium text-blue-900 text-xs mb-2">Sample Questions</h4>
                  <div className="space-y-2">
                    {offer.category === 'Finance' && (
                      <>
                        <p className="text-xs text-blue-800">• What is your primary investment goal?</p>
                        <p className="text-xs text-blue-800">• How familiar are you with cryptocurrency?</p>
                      </>
                    )}
                    {offer.category === 'Consumer' && (
                      <>
                        <p className="text-xs text-blue-800">• How often do you shop online?</p>
                        <p className="text-xs text-blue-800">• What factors influence your purchase decisions?</p>
                      </>
                    )}
                    {offer.category === 'Health' && (
                      <>
                        <p className="text-xs text-blue-800">• How would you rate your overall health?</p>
                        <p className="text-xs text-blue-800">• What wellness activities do you practice?</p>
                      </>
                    )}
                    {offer.category === 'Technology' && (
                      <>
                        <p className="text-xs text-blue-800">• Which apps do you use most frequently?</p>
                        <p className="text-xs text-blue-800">• How important is data privacy to you?</p>
                      </>
                    )}
                    {offer.category === 'Travel' && (
                      <>
                        <p className="text-xs text-blue-800">• What type of vacations do you prefer?</p>
                        <p className="text-xs text-blue-800">• How do you typically book your travel?</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Navigation */}
              <div className="bg-white border-t border-gray-200 p-2">
                <div className="flex justify-around">
                  <div className="flex flex-col items-center py-2">
                    <div className="w-6 h-6 bg-emerald-500 rounded-full"></div>
                    <span className="text-xs text-emerald-600 mt-1">Surveys</span>
                  </div>
                  <div className="flex flex-col items-center py-2">
                    <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                    <span className="text-xs text-gray-500 mt-1">Tasks</span>
                  </div>
                  <div className="flex flex-col items-center py-2">
                    <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                    <span className="text-xs text-gray-500 mt-1">Rewards</span>
                  </div>
                  <div className="flex flex-col items-center py-2">
                    <div className="w-6 h-6 bg-gray-300 rounded-full"></div>
                    <span className="text-xs text-gray-500 mt-1">Profile</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="text-xs text-gray-600 mb-3">
            This preview shows how the survey will appear to users on mobile devices. 
            The actual survey content is provided by {offer.sdkSource}.
          </div>
          <button
            onClick={onClose}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg font-medium text-sm hover:bg-gray-700"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}