import { useState } from 'react';

export default function AdvancedFilter({ 
  isOpen, 
  onClose, 
  activeTab,
  onApplyFilters,
  currentFilters = {}
}) {
  const [filters, setFilters] = useState({
    dateFrom: currentFilters.dateFrom || '',
    dateTo: currentFilters.dateTo || '',
    xpMin: currentFilters.xpMin || '',
    xpMax: currentFilters.xpMax || '',
    searchText: currentFilters.searchText || '',
    tags: currentFilters.tags || [],
    ...currentFilters
  });

  const handleApply = () => {
    onApplyFilters(filters);
    onClose();
  };

  const handleReset = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      xpMin: '',
      xpMax: '',
      searchText: '',
      tags: []
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-black">
              Advanced Filters - {activeTab}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-800"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Search Text */}
            <div>
              <label className="block text-sm font-medium text-black mb-1">
                Search Text
              </label>
              <input
                type="text"
                value={filters.searchText}
                onChange={(e) => setFilters(prev => ({ ...prev, searchText: e.target.value }))}
                placeholder="Search by name, description, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                />
              </div>
            </div>

            {/* XP Range (for relevant tabs) */}
            {(activeTab === 'XP Tiers' || activeTab === 'XP Decay Settings') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Min XP
                  </label>
                  <input
                    type="number"
                    value={filters.xpMin}
                    onChange={(e) => setFilters(prev => ({ ...prev, xpMin: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Max XP
                  </label>
                  <input
                    type="number"
                    value={filters.xpMax}
                    onChange={(e) => setFilters(prev => ({ ...prev, xpMax: e.target.value }))}
                    placeholder="9999"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                </div>
              </div>
            )}

            {/* Tab-specific filters */}
            {activeTab === 'XP Decay Settings' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Decay Type
                  </label>
                  <select
                    value={filters.decayType || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, decayType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  >
                    <option value="">All Types</option>
                    <option value="Fixed">Fixed</option>
                    <option value="Stepwise">Stepwise</option>
                    <option value="Gradual">Gradual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Min Limit Range
                  </label>
                  <select
                    value={filters.minLimitRange || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, minLimitRange: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  >
                    <option value="">All Limits</option>
                    <option value="0-100">0-100</option>
                    <option value="100-500">100-500</option>
                    <option value="500+">500+</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'Bonus Logic' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Reward Type
                  </label>
                  <select
                    value={filters.rewardType || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, rewardType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  >
                    <option value="">All Rewards</option>
                    <option value="XP">XP Only</option>
                    <option value="Coins">Coins Only</option>
                    <option value="Currency">Currency Only</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Trigger Frequency
                  </label>
                  <select
                    value={filters.triggerFreq || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, triggerFreq: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  >
                    <option value="">Any Frequency</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="OneTime">One Time</option>
                  </select>
                </div>
              </div>
            )}

            {/* Status Toggles */}
            <div>
              <label className="block text-sm font-medium text-black mb-2">
                Filter by Status
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.includeActive !== false}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      includeActive: e.target.checked 
                    }))}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-black">Include Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.includeInactive !== false}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      includeInactive: e.target.checked 
                    }))}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-black">Include Inactive</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-8">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset All
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}