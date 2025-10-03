'use client';

export default function TestResultsModal({ test, isOpen, onClose }) {
  if (!isOpen || !test) return null;

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate improvement
  const getImprovement = () => {
    if (!test.stats || !test.winner) return null;
    
    const variantA = test.stats.variantA;
    const variantB = test.stats.variantB;
    
    if (test.winner === 'A') {
      return ((variantA.ctr - variantB.ctr) / variantB.ctr * 100).toFixed(1);
    } else {
      return ((variantB.ctr - variantA.ctr) / variantA.ctr * 100).toFixed(1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">A/B Test Results</h3>
              <p className="text-sm text-gray-600 mt-1">
                Detailed performance analysis for {test.name}
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
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">
            {/* Test Overview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-medium text-gray-900 mb-3">Test Overview</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Name</label>
                  <div className="text-sm text-gray-900">{test.name}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    test.status === 'Running' ? 'bg-blue-100 text-blue-800' :
                    test.status === 'Completed' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {test.status}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Launched</label>
                  <div className="text-sm text-gray-900">{formatDate(test.launchedAt)}</div>
                </div>
                {test.completedAt && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Completed</label>
                    <div className="text-sm text-gray-900">{formatDate(test.completedAt)}</div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Segments</label>
                  <div className="text-sm text-gray-900">{test.targetSegment.join(', ')}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Audience Split</label>
                  <div className="text-sm text-gray-900">{test.audienceSplit}% / {100 - test.audienceSplit}%</div>
                </div>
              </div>
            </div>

            {/* Winner Declaration */}
            {test.winner && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="text-2xl">🏆</span>
                  </div>
                  <div className="ml-3">
                    <h4 className="text-lg font-medium text-green-900">
                      Variant {test.winner} Wins!
                    </h4>
                    <p className="text-sm text-green-700">
                      +{getImprovement()}% improvement in click-through rate
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Variant Comparison */}
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-4">Variant Comparison</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Variant A */}
                <div className={`border rounded-lg p-4 ${
                  test.winner === 'A' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-md font-medium text-gray-900">Variant A</h5>
                    {test.winner === 'A' && <span className="text-green-600 text-sm font-medium">Winner</span>}
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Title</div>
                      <div className="text-sm text-gray-900 bg-gray-100 rounded p-2">
                        {test.variants.A.title}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Body</div>
                      <div className="text-sm text-gray-900 bg-gray-100 rounded p-2">
                        {test.variants.A.body}
                      </div>
                    </div>
                  </div>

                  {/* Performance Stats */}
                  {test.stats && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-gray-600">Sent</div>
                          <div className="font-medium text-gray-900">{test.stats.variantA.sent.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Delivered</div>
                          <div className="font-medium text-gray-900">{test.stats.variantA.delivered.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Opened</div>
                          <div className="font-medium text-gray-900">{test.stats.variantA.opened.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Clicked</div>
                          <div className="font-medium text-gray-900">{test.stats.variantA.clicked.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Open Rate</div>
                          <div className="font-medium text-gray-900">{test.stats.variantA.openRate}%</div>
                        </div>
                        <div>
                          <div className="text-gray-600">CTR</div>
                          <div className="font-medium text-gray-900">{test.stats.variantA.ctr}%</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Variant B */}
                <div className={`border rounded-lg p-4 ${
                  test.winner === 'B' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="text-md font-medium text-gray-900">Variant B</h5>
                    {test.winner === 'B' && <span className="text-green-600 text-sm font-medium">Winner</span>}
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Title</div>
                      <div className="text-sm text-gray-900 bg-gray-100 rounded p-2">
                        {test.variants.B.title}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Body</div>
                      <div className="text-sm text-gray-900 bg-gray-100 rounded p-2">
                        {test.variants.B.body}
                      </div>
                    </div>
                  </div>

                  {/* Performance Stats */}
                  {test.stats && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-gray-600">Sent</div>
                          <div className="font-medium text-gray-900">{test.stats.variantB.sent.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Delivered</div>
                          <div className="font-medium text-gray-900">{test.stats.variantB.delivered.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Opened</div>
                          <div className="font-medium text-gray-900">{test.stats.variantB.opened.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Clicked</div>
                          <div className="font-medium text-gray-900">{test.stats.variantB.clicked.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Open Rate</div>
                          <div className="font-medium text-gray-900">{test.stats.variantB.openRate}%</div>
                        </div>
                        <div>
                          <div className="text-gray-600">CTR</div>
                          <div className="font-medium text-gray-900">{test.stats.variantB.ctr}%</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Key Insights */}
            {/* {test.stats && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-lg font-medium text-blue-900 mb-2">Key Insights</h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>• Total messages sent: {(test.stats.variantA.sent + test.stats.variantB.sent).toLocaleString()}</p>
                  <p>• Overall open rate: {((test.stats.variantA.openRate + test.stats.variantB.openRate) / 2).toFixed(1)}%</p>
                  <p>• Overall CTR: {((test.stats.variantA.ctr + test.stats.variantB.ctr) / 2).toFixed(1)}%</p>
                  {test.winner && (
                    <p>• Variant {test.winner} outperformed by {getImprovement()}% in click-through rate</p>
                  )}
                </div>
              </div>
            )} */}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close Results
          </button>
        </div>
      </div>
    </div>
  );
}