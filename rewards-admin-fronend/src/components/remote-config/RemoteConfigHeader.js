'use client';

import { useEffect, useCallback } from 'react';
import { useSearch } from '../../contexts/SearchContext';
import { SEGMENTS } from '../../data/remoteConfig';

export default function RemoteConfigHeader({ 
  totalConfigs, 
  activeConfigs, 
  onCreateNew,
  filters,
  onFiltersChange,
  activeTab
}) {
  const { searchTerm, registerSearchHandler } = useSearch();

  const handleSearchChange = useCallback((query) => {
    onFiltersChange(prev => ({ ...prev, searchTerm: query }));
  }, [onFiltersChange]);

  useEffect(() => {
    registerSearchHandler(handleSearchChange);
  }, [registerSearchHandler, handleSearchChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Remote Config</h1>
          <p className="text-gray-600 mt-1">
            Manage app features, toggles, and personalized configurations
          </p>
        </div>
        {activeTab === 'configs' && (
          <button
            onClick={onCreateNew}
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Config
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Configs</p>
              <p className="text-2xl font-semibold text-gray-900">{totalConfigs}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Configs</p>
              <p className="text-2xl font-semibold text-gray-900">{activeConfigs}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-900">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={filters.type || ''}
                onChange={(e) => onFiltersChange({ ...filters, type: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="" className="text-gray-900">All Types</option>
                <option value="Toggle" className="text-gray-900">Toggle</option>
                <option value="Text" className="text-gray-900">Text</option>
                <option value="Numeric" className="text-gray-900">Numeric</option>
                <option value="Enum" className="text-gray-900">Enum</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status || ''}
                onChange={(e) => onFiltersChange({ ...filters, status: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="" className="text-gray-900">All Status</option>
                <option value="Active" className="text-gray-900">Active</option>
                <option value="Inactive" className="text-gray-900">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Segment</label>
              <select
                value={filters.segment || ''}
                onChange={(e) => onFiltersChange({ ...filters, segment: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="" className="text-gray-900">All Segments</option>
                {SEGMENTS.map(segment => (
                  <option key={segment} value={segment} className="text-gray-900">{segment}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
              <select
                value={filters.dateRange || ''}
                onChange={(e) => onFiltersChange({ ...filters, dateRange: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="" className="text-gray-900">All Time</option>
                <option value="Last 7 days" className="text-gray-900">Last 7 days</option>
                <option value="Last 30 days" className="text-gray-900">Last 30 days</option>
                <option value="Last 3 months" className="text-gray-900">Last 3 months</option>
              </select>
            </div>
        </div>
      </div>
    </div>
  );
}