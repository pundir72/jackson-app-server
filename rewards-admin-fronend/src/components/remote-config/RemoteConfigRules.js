'use client';

import { useState } from 'react';
import Pagination from '../ui/Pagination';

export default function RemoteConfigRules({ 
  configs, 
  loading,
  onToggleStatus,
  onQuickEdit,
  onDelete,
  filters,
  onFiltersChange
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [editingRule, setEditingRule] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  
  const itemsPerPage = 15;
  
  // Sorting logic
  const sortedConfigs = [...configs].sort((a, b) => {
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

  const totalPages = Math.ceil(sortedConfigs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentConfigs = sortedConfigs.slice(startIndex, endIndex);

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
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status, isClickable = true) => {
    const baseClasses = "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium min-w-[70px] justify-center";
    const interactiveClasses = isClickable ? "cursor-pointer hover:shadow-sm transition-all duration-200" : "";
    if (status === 'Active') {
      return `${baseClasses} ${interactiveClasses} bg-green-100 text-green-800 ${isClickable ? 'hover:bg-green-200' : ''}`;
    }
    return `${baseClasses} ${interactiveClasses} bg-gray-100 text-gray-800 ${isClickable ? 'hover:bg-gray-200' : ''}`;
  };

  const getTypeBadge = (type) => {
    const baseClasses = "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium min-w-[70px] justify-center";
    const typeColors = {
      'Toggle': 'bg-blue-100 text-blue-800',
      'Text': 'bg-purple-100 text-purple-800',
      'Numeric': 'bg-orange-100 text-orange-800',
      'Enum': 'bg-indigo-100 text-indigo-800'
    };
    return `${baseClasses} ${typeColors[type] || 'bg-gray-100 text-gray-800'}`;
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

  const renderToggleSwitch = (isActive, onChange, disabled = false) => {
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && onChange) {
        onChange();
      }
    };

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`relative inline-flex items-center h-5 rounded-full w-9 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
          disabled 
            ? 'opacity-50 cursor-not-allowed bg-gray-300' 
            : isActive 
              ? 'bg-emerald-600 hover:bg-emerald-700' 
              : 'bg-gray-300 hover:bg-gray-400'
        }`}
        title={disabled ? 'Status change disabled during edit' : `Click to toggle status (currently ${isActive ? 'Active' : 'Inactive'})`}
      >
        <span className="sr-only">Toggle status</span>
        <span
          className={`inline-block w-3 h-3 transform transition-transform bg-white rounded-full shadow-sm ${
            isActive ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    );
  };

  const handleEdit = (config) => {
    setEditingRule(config.configId);
    setEditForm({
      value: config.value,
      status: config.status
    });
  };

  const handleSaveEdit = (configId) => {
    onQuickEdit(configId, editForm);
    setEditingRule(null);
    setEditForm({});
  };

  const handleCancelEdit = () => {
    setEditingRule(null);
    setEditForm({});
  };

  const handleStatusClick = (configId, currentStatus) => {
    if (editingRule !== configId) {
      onToggleStatus(configId, currentStatus);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        Loading rules...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Remote Config Rules</h2>
          <p className="text-gray-600 mt-1">
            Simplified operational view for quick rule monitoring and editing
          </p>
        </div>
      </div>

      {/* Status Filter */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center space-x-4">
          <label className="block text-sm font-medium text-gray-700">Status Filter:</label>
          <select
            value={filters.status || ''}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value || null })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
          >
            <option value="" className="text-gray-900">All Status</option>
            <option value="Active" className="text-gray-900">Active</option>
            <option value="Inactive" className="text-gray-900">Inactive</option>
          </select>
          {filters.status && (
            <span className="text-sm text-gray-500">
              Showing {configs.length} rules with {filters.status.toLowerCase()} status
            </span>
          )}
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('title')}
                    className="flex items-center hover:text-gray-700"
                  >
                    Rule Title
                    {getSortIcon('title')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('value')}
                    className="flex items-center hover:text-gray-700"
                  >
                    Value
                    {getSortIcon('value')}
                  </button>
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button 
                    onClick={() => handleSort('status')}
                    className="flex items-center hover:text-gray-700 mx-auto"
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
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentConfigs.map((config) => (
                <tr key={config.configId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{config.title}</div>
                      <div className="mt-1">
                        <span className={getSegmentBadge(config.segment)}>
                          {config.segment}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingRule === config.configId ? (
                      <div className="flex items-center space-x-2">
                        {config.type === 'Toggle' ? (
                          <select
                            value={editForm.value}
                            onChange={(e) => setEditForm(prev => ({ ...prev, value: e.target.value }))}
                            className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          >
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        ) : (
                          <input
                            type={config.type === 'Numeric' ? 'number' : 'text'}
                            value={editForm.value}
                            onChange={(e) => setEditForm(prev => ({ ...prev, value: e.target.value }))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-900">
                        {config.type === 'Toggle' ? (
                          <span className={`inline-flex items-center ${config.value === 'true' ? 'text-green-700' : 'text-red-700'}`}>
                            {config.value === 'true' ? '✅ True' : '❌ False'}
                          </span>
                        ) : (
                          config.value
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-center">
                      {editingRule === config.configId ? (
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                          className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      ) : (
                        renderToggleSwitch(
                          config.status === 'Active',
                          () => handleStatusClick(config.configId, config.status)
                        )
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(config.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {editingRule === config.configId ? (
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleSaveEdit(config.configId)}
                          className="text-green-600 hover:text-green-900"
                          title="Save changes"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-gray-600 hover:text-gray-900"
                          title="Cancel editing"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(config)}
                          className="text-emerald-600 hover:text-emerald-900"
                          title="Quick edit rule"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {onDelete && (
                          <button
                            onClick={() => onDelete(config.configId)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete rule"
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

        {configs.length === 0 && (
          <div className="p-12 text-center">
            <div className="mx-auto h-24 w-24 text-gray-400">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No rules found</h3>
            <p className="mt-2 text-gray-500">No configuration rules match your current filter.</p>
          </div>
        )}
      </div>

      {/* Usage Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Quick Operations</h3>
            <div className="mt-1 text-sm text-blue-700">
              <ul className="list-disc list-inside space-y-1">
                <li>Use toggle switches to quickly change Active/Inactive status</li>
                <li>Use the edit button for quick value and status changes</li>
                <li>Changes are logged in audit trail automatically</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}