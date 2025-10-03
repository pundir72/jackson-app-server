'use client';

import { useState } from 'react';
import Pagination from '../ui/Pagination';
import { SEGMENTS } from '../../data/remoteConfig';

export default function PidRewardModifiers({ 
  pidRewards, 
  loading,
  onEdit,
  onDelete,
  filters,
  onFiltersChange
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [editingPid, setEditingPid] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  
  const itemsPerPage = 10;
  
  // Sorting logic
  const sortedPids = [...pidRewards].sort((a, b) => {
    if (!sortField) return 0;
    
    let aValue = a[sortField];
    let bValue = b[sortField];
    
    if (sortField === 'updatedAt') {
      aValue = new Date(aValue);
      bValue = new Date(bValue);
    }
    
    if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedPids.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPids = sortedPids.slice(startIndex, endIndex);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      );
    }
    
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 ml-1 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 ml-1 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status, isClickable = false) => {
    const baseClasses = "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium min-w-[70px] justify-center";
    const interactiveClasses = isClickable ? "cursor-pointer hover:shadow-sm transition-all duration-200" : "";
    if (status === 'Active') {
      return `${baseClasses} ${interactiveClasses} bg-green-100 text-green-800 ${isClickable ? 'hover:bg-green-200' : ''}`;
    }
    return `${baseClasses} ${interactiveClasses} bg-gray-100 text-gray-800 ${isClickable ? 'hover:bg-gray-200' : ''}`;
  };

  const getSegmentBadge = (segment, context = 'display') => {
    const baseClasses = "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium min-w-[90px] justify-center";
    const segmentColors = {
      'All Users': 'bg-blue-100 text-blue-800',
      'New Users': 'bg-green-100 text-green-800', 
      'Beta Group': 'bg-purple-100 text-purple-800',
      'Gold Tier': 'bg-yellow-100 text-yellow-800',
      'Platinum Tier': 'bg-gray-100 text-gray-800',
      'Bronze Tier': 'bg-orange-100 text-orange-800',
      'VIP Users': 'bg-pink-100 text-pink-800'
    };
    const colorClass = segmentColors[segment] || 'bg-emerald-100 text-emerald-800';
    const interactiveClass = context === 'clickable' ? 'cursor-pointer hover:shadow-sm transition-all duration-200' : '';
    
    return `${baseClasses} ${colorClass} ${interactiveClass}`;
  };

  const handleEdit = (pid) => {
    setEditingPid(pid.pidCampaignId);
    setEditForm({
      rewardMultiplier: pid.rewardMultiplier,
      status: pid.status
    });
  };

  const handleSaveEdit = (pidId) => {
    onEdit(pidId, editForm);
    setEditingPid(null);
    setEditForm({});
  };

  const handleCancelEdit = () => {
    setEditingPid(null);
    setEditForm({});
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        Loading PID rewards...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">PID Reward Modifiers</h2>
          <p className="text-gray-600 mt-1">
            Manage campaign-specific reward multipliers by user segment
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Filters</h3>
          <p className="text-xs text-gray-500 mt-1">Filter PID reward modifiers by campaign, segment, and status</p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <svg className="w-4 h-4 inline-block mr-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Campaign ID
              </label>
              <input
                type="text"
                value={filters.searchTerm || ''}
                onChange={(e) => onFiltersChange({ ...filters, searchTerm: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors duration-200"
                placeholder="Search by PID Campaign ID..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <svg className="w-4 h-4 inline-block mr-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                User Segment
              </label>
              <select
                value={filters.segment || ''}
                onChange={(e) => onFiltersChange({ ...filters, segment: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white transition-colors duration-200"
              >
                <option value="" className="text-gray-900">All Segments</option>
                {SEGMENTS.map(segment => (
                  <option key={segment} value={segment} className="text-gray-900">{segment}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <svg className="w-4 h-4 inline-block mr-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Status
              </label>
              <select
                value={filters.status || ''}
                onChange={(e) => onFiltersChange({ ...filters, status: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white transition-colors duration-200"
              >
                <option value="" className="text-gray-900">All Status</option>
                <option value="Active" className="text-gray-900">Active</option>
                <option value="Inactive" className="text-gray-900">Inactive</option>
              </select>
            </div>
          </div>
          
          {/* Filter Summary */}
          {(filters.searchTerm || filters.segment || filters.status) && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-500">Active filters:</span>
                  {filters.searchTerm && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                      Campaign: {filters.searchTerm}
                    </span>
                  )}
                  {filters.segment && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Segment: {filters.segment}
                    </span>
                  )}
                  {filters.status && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Status: {filters.status}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onFiltersChange({})}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('pidCampaignId')}
                    className="flex items-center hover:text-gray-700"
                  >
                    PID Campaign
                    {getSortIcon('pidCampaignId')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('segment')}
                    className="flex items-center hover:text-gray-700"
                  >
                    Segment
                    {getSortIcon('segment')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('rewardMultiplier')}
                    className="flex items-center hover:text-gray-700"
                  >
                    Multiplier
                    {getSortIcon('rewardMultiplier')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('userCount')}
                    className="flex items-center hover:text-gray-700"
                  >
                    User Count
                    {getSortIcon('userCount')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('status')}
                    className="flex items-center hover:text-gray-700"
                  >
                    Status
                    {getSortIcon('status')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('updatedAt')}
                    className="flex items-center hover:text-gray-700"
                  >
                    Last Updated
                    {getSortIcon('updatedAt')}
                  </button>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentPids.map((pid) => (
                <tr key={pid.pidCampaignId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{pid.pidCampaignId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getSegmentBadge(pid.segment)}>
                      {pid.segment}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingPid === pid.pidCampaignId ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.rewardMultiplier}
                        onChange={(e) => setEditForm(prev => ({ ...prev, rewardMultiplier: parseFloat(e.target.value) }))}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    ) : (
                      <div className="text-sm font-medium text-gray-900">
                        {pid.rewardMultiplier}x
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {pid.userCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingPid === pid.pidCampaignId ? (
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                        className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    ) : (
                      <span className={getStatusBadge(pid.status)}>
                        {pid.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(pid.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {editingPid === pid.pidCampaignId ? (
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleSaveEdit(pid.pidCampaignId)}
                          className="text-green-600 hover:text-green-900"
                          title="Save"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-gray-600 hover:text-gray-900"
                          title="Cancel"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(pid)}
                          className="text-emerald-600 hover:text-emerald-900"
                          title="Edit"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {onDelete && (
                          <button
                            onClick={() => onDelete(pid.pidCampaignId)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}

        {pidRewards.length === 0 && (
          <div className="p-12 text-center">
            <div className="mx-auto h-24 w-24 text-gray-400">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No PID rewards found</h3>
            <p className="mt-2 text-gray-500">No reward modifiers match your current filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}