'use client';

import React, { useState, useMemo } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, CalendarIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import FilterDropdown from '../ui/FilterDropdown';
import Pagination from '../ui/Pagination';

const CHALLENGE_TYPES = ['Spin', 'Game', 'Survey', 'Referral', 'Watch Ad', 'SDK Game'];
const CLAIM_TYPES = ['Watch Ad', 'Auto'];
const STATUS_TYPES = ['Scheduled', 'Live', 'Pending', 'Expired'];

export default function DailyChallengeListView({
  challenges = [],
  onAddChallenge,
  onUpdateChallenge,
  onDeleteChallenge,
  onToggleVisibility,
  loading = false
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [editingChallenge, setEditingChallenge] = useState(null);
  const [deletingChallenge, setDeletingChallenge] = useState(null);

  // Filter challenges
  const filteredChallenges = useMemo(() => {
    return challenges.filter(challenge => {
      const matchesSearch = 
        challenge.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        challenge.type.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || challenge.status === statusFilter;
      const matchesType = typeFilter === 'all' || challenge.type === typeFilter;
      
      return matchesSearch && matchesStatus && matchesType;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [challenges, searchTerm, statusFilter, typeFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredChallenges.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedChallenges = filteredChallenges.slice(startIndex, startIndex + itemsPerPage);

  const getStatusBadge = (status, date) => {
    const today = new Date();
    const challengeDate = new Date(date);
    
    // Auto-update status based on date
    let actualStatus = status;
    if (challengeDate.toDateString() === today.toDateString()) {
      actualStatus = 'Live';
    } else if (challengeDate > today) {
      actualStatus = 'Scheduled';
    } else if (challengeDate < today) {
      actualStatus = 'Expired';
    }

    const statusStyles = {
      'Scheduled': 'bg-blue-100 text-blue-800',
      'Live': 'bg-green-100 text-green-800',
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Expired': 'bg-gray-100 text-gray-800'
    };

    return (
      <span className={`inline-flex items-center justify-center min-w-[80px] px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[actualStatus]}`}>
        {actualStatus}
      </span>
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };



  const handleToggleVisibility = async (id, currentVisibility) => {
    try {
      await onToggleVisibility(id, !currentVisibility);
    } catch (error) {
      console.error('Error toggling visibility:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Daily Challenge Calendar (List View)</h2>
              <p className="mt-1 text-sm text-gray-600">
                Manage daily challenges and engagement tasks
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => onAddChallenge()}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Challenge
              </button>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            {/* Search */}
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search challenges by title or type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center space-x-4">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Status</option>
                {STATUS_TYPES.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Types</option>
                {CHALLENGE_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Challenges Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Challenge
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coins 
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  XP 
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Claim Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Visibility
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedChallenges.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                      ? 'No challenges match your current filters.'
                      : 'No challenges configured yet. Add your first challenge to get started.'}
                  </td>
                </tr>
              ) : (
                paginatedChallenges.map((challenge) => (
                  <tr key={challenge.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                        {formatDate(challenge.date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{challenge.title}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center min-w-[80px] px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {challenge.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <span className="text-yellow-600 mr-1">🪙</span>
                        <span className="font-medium">{challenge.coinReward}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <span className="text-purple-600 mr-1">⭐</span>
                        <span className="font-medium">{challenge.xpReward}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center min-w-[80px] px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {challenge.claimType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(challenge.status, challenge.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleVisibility(challenge.id, challenge.visibility)}
                        className={`p-1 rounded-md ${challenge.visibility ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                        title={challenge.visibility ? 'Visible to users' : 'Hidden from users'}
                      >
                        {challenge.visibility ? (
                          <EyeIcon className="h-4 w-4" />
                        ) : (
                          <EyeSlashIcon className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onUpdateChallenge(challenge)}
                          className="text-emerald-600 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-50"
                          title="Edit challenge"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onDeleteChallenge(challenge)}
                          className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                          title="Delete challenge"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Results Summary & Pagination */}
        {filteredChallenges.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredChallenges.length)} of {filteredChallenges.length} challenges
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        )}
      </div>

      {/* TODO: Add modals for Add/Edit/Delete operations */}
    </div>
  );
}