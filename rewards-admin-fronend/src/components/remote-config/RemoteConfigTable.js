'use client';

import { useState } from 'react';
import Pagination from '../ui/Pagination';

export default function RemoteConfigTable({ 
  configs, 
  loading,
  onEdit,
  onView,
  onDelete,
  onToggleStatus
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const itemsPerPage = 10;
  
  // Sorting logic
  const sortedConfigs = [...configs].sort((a, b) => {
    if (!sortField) return 0;
    
    let aValue = a[sortField];
    let bValue = b[sortField];
    
    // Handle date sorting
    if (sortField === 'updatedAt') {
      aValue = new Date(aValue);
      bValue = new Date(bValue);
    }
    
    // Handle string sorting
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

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        Loading configurations...
      </div>
    );
  }

  return (
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
                  Title
                  {getSortIcon('title')}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button 
                  onClick={() => handleSort('configId')}
                  className="flex items-center hover:text-gray-700"
                >
                  Config ID
                  {getSortIcon('configId')}
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
                  onClick={() => handleSort('keyName')}
                  className="flex items-center hover:text-gray-700"
                >
                  Key Name
                  {getSortIcon('keyName')}
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button 
                  onClick={() => handleSort('type')}
                  className="flex items-center hover:text-gray-700"
                >
                  Type
                  {getSortIcon('type')}
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
            {currentConfigs.map((config) => (
              <tr key={config.configId} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{config.title}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500 font-mono">{config.configId}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={getSegmentBadge(config.segment)}>
                    {config.segment}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 font-mono">{config.keyName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {config.type === 'Toggle' ? (config.value === 'true' ? '✅ True' : '❌ False') : 
                     config.type === 'Enum' ? `📋 ${config.value}` : config.value}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={getTypeBadge(config.type)}>
                    {config.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => onToggleStatus(config.configId, config.status)}
                    className={getStatusBadge(config.status)}
                  >
                    {config.status}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(config.updatedAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    onClick={() => onView(config)}
                    className="text-gray-400 hover:text-gray-600"
                    title="View"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onEdit(config)}
                    className="text-emerald-600 hover:text-emerald-900"
                    title="Edit"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(config.configId)}
                    className="text-red-600 hover:text-red-900"
                    title="Delete"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
          <h3 className="mt-4 text-lg font-medium text-gray-900">No configurations found</h3>
          <p className="mt-2 text-gray-500">Get started by creating a new remote configuration.</p>
        </div>
      )}
    </div>
  );
}