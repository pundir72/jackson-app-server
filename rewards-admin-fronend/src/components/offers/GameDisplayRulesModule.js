'use client';

import { useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, EyeSlashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import EditDisplayRuleModal from './modals/EditDisplayRuleModal';
import ConfirmationModal from './modals/ConfirmationModal';
import MilestoneBadge from '../ui/MilestoneBadge';

const mockDisplayRules = [
  {
    id: 'RULE001',
    name: 'First Game Experience',
    milestone: 'First Game',
    description: 'Show maximum 2 games to new users on first app open',
    maxGames: 2,
    conditions: [
      'User has opened app for first time',
      'No previous game interactions'
    ],
    enabled: true,
    priority: 1,
    targetSegment: 'New Users',
    appliedCount: 12450,
    conversionRate: '78.5%',
    lastModified: '2024-03-10',
    createdBy: 'admin@jackson.com',
    createdAt: '2024-03-10T08:30:00Z'
  },
  {
    id: 'RULE002',
    name: 'After First Game Completion',
    milestone: 'After 1 Game',
    description: 'Show 4 games after user completes their first game',
    maxGames: 4,
    conditions: [
      'User has completed at least 1 game',
      'Time since first completion < 24 hours'
    ],
    enabled: true,
    priority: 2,
    targetSegment: 'Engaged Users',
    appliedCount: 8750,
    conversionRate: '65.2%',
    lastModified: '2024-03-12',
    createdBy: 'sam.admin@jackson.com',
    createdAt: '2024-03-12T14:15:00Z'
  },
  {
    id: 'RULE003',
    name: 'Bronze Tier Games',
    milestone: 'Bronze Tier',
    description: 'Limit Bronze tier users to 3 games maximum',
    maxGames: 3,
    conditions: [
      'User tier = Bronze',
      'Active subscription status'
    ],
    enabled: true,
    priority: 3,
    targetSegment: 'Bronze Tier',
    appliedCount: 15200,
    conversionRate: '42.8%',
    lastModified: '2024-03-08',
    createdBy: 'admin@jackson.com',
    createdAt: '2024-03-08T11:45:00Z'
  },
  {
    id: 'RULE004',
    name: 'Platinum Tier Games',
    milestone: 'Platinum Tier',
    description: 'Show up to 6 games for Platinum tier users',
    maxGames: 6,
    conditions: [
      'User tier = Platinum',
      'XP >= 1000 points'
    ],
    enabled: true,
    priority: 4,
    targetSegment: 'Platinum Tier',
    appliedCount: 6800,
    conversionRate: '58.3%',
    lastModified: '2024-03-14',
    createdBy: 'manager@jackson.com',
    createdAt: '2024-03-14T09:20:00Z'
  },
  {
    id: 'RULE005',
    name: 'Gold Tier Premium Access',
    milestone: 'Gold Tier',
    description: 'Unlimited games access for Gold tier users',
    maxGames: 999,
    conditions: [
      'User tier = Gold',
      'Premium subscription active',
      'XP >= 5000 points'
    ],
    enabled: true,
    priority: 5,
    targetSegment: 'Gold Tier',
    appliedCount: 2150,
    conversionRate: '85.7%',
    lastModified: '2024-03-15',
    createdBy: 'sam.admin@jackson.com',
    createdAt: '2024-03-15T16:10:00Z'
  },
  {
    id: 'RULE006',
    name: 'Weekend Boost',
    milestone: 'Weekend Special',
    description: 'Show 2 additional games during weekends',
    maxGames: '+2',
    conditions: [
      'Current day = Saturday OR Sunday',
      'User has logged in within 48 hours'
    ],
    enabled: false,
    priority: 6,
    targetSegment: 'All Users',
    appliedCount: 0,
    conversionRate: '0%',
    lastModified: '2024-03-05',
    createdBy: 'admin@jackson.com',
    createdAt: '2024-03-05T13:25:00Z'
  }
];

const milestoneOptions = [
  'First Game',
  'After 1 Game',
  'Bronze Tier',
  'Platinum Tier',
  'Gold Tier',
  'Weekend Special',
  'Custom Milestone'
];

export default function GameDisplayRulesModule() {
  const [rules, setRules] = useState(mockDisplayRules);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('all');
  const [filterMilestone, setFilterMilestone] = useState('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);

  // Filter rules
  const filteredRules = rules.filter(rule => {
    const matchesSearch =
      rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.targetSegment.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesEnabled = filterEnabled === 'all' ||
      (filterEnabled === 'enabled' && rule.enabled) ||
      (filterEnabled === 'disabled' && !rule.enabled);

    const matchesMilestone = filterMilestone === 'all' || rule.milestone === filterMilestone;

    return matchesSearch && matchesEnabled && matchesMilestone;
  }).sort((a, b) => a.priority - b.priority);

  const handleToggleRule = (ruleId) => {
    setRules(prev => prev.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  const handleEditRule = (rule) => {
    setSelectedRule(rule);
    setShowEditModal(true);
  };

  const handleCreateRule = () => {
    setSelectedRule(null);
    setShowEditModal(true);
  };

  const handleDeleteRule = (rule) => {
    setSelectedRule(rule);
    setShowDeleteModal(true);
  };

  const confirmDeleteRule = () => {
    if (selectedRule) {
      setRules(prev => prev.filter(rule => rule.id !== selectedRule.id));
      setShowDeleteModal(false);
      setSelectedRule(null);
    }
  };

  const handleSaveRule = (ruleData) => {
    if (selectedRule) {
      // Edit existing rule - preserve original created by data, update last modified
      const updatedRule = {
        ...ruleData,
        createdBy: selectedRule.createdBy,
        createdAt: selectedRule.createdAt,
        lastModified: new Date().toISOString().split('T')[0]
      };
      setRules(prev => prev.map(rule =>
        rule.id === selectedRule.id ? updatedRule : rule
      ));
    } else {
      // Add new rule - add created by metadata
      const newRule = {
        ...ruleData,
        createdBy: 'admin@jackson.com', // In real app, this would come from auth context
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString().split('T')[0]
      };
      setRules(prev => [...prev, newRule]);
    }
    setShowEditModal(false);
    setSelectedRule(null);
  };

  const getStatusBadge = (enabled) => {
    return (
      <span className={`inline-flex items-center justify-center min-w-[70px] px-2.5 py-0.5 rounded-full text-xs font-medium ${
        enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
      }`}>
        {enabled ? 'Enabled' : 'Disabled'}
      </span>
    );
  };


  const formatMaxGames = (maxGames) => {
    if (maxGames === 999) return 'Unlimited';
    if (typeof maxGames === 'string' && maxGames.startsWith('+')) return `Base ${maxGames}`;
    return `${maxGames} Games`;
  };

  const formatCreatedBy = (createdBy, createdAt) => {
    const userName = createdBy.split('@')[0].replace('.', ' ').split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    const date = new Date(createdAt);
    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    return { userName, formattedDate, email: createdBy };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link
                  href="/offers"
                  className="text-gray-500 hover:text-gray-700 p-1 rounded-md hover:bg-gray-50"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </Link>
                <h2 className="text-lg font-semibold text-gray-900">
                  Game Display Rules
                </h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Allow admin to dynamically control how many games are shown to a user on the mobile app home screen based on user milestones
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleCreateRule}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Display Rule
              </button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            {/* Search */}
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search rules by name, description, or segment..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
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
                value={filterEnabled}
                onChange={(e) => setFilterEnabled(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>

              <select
                value={filterMilestone}
                onChange={(e) => setFilterMilestone(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Milestones</option>
                {milestoneOptions.map(milestone => (
                  <option key={milestone} value={milestone}>{milestone}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Rules Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rule Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Milestone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Target Segment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Max Games
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || filterEnabled !== 'all' || filterMilestone !== 'all'
                      ? 'No display rules match your current filters.'
                      : 'No display rules configured yet. Add your first rule to get started.'}
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                        {rule.priority}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                        <div className="text-xs text-gray-700">{rule.id}</div>
                        <div className="text-xs text-gray-600 mt-1 max-w-xs">{rule.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <MilestoneBadge milestone={rule.milestone} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs text-gray-600">{rule.targetSegment}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatMaxGames(rule.maxGames)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatCreatedBy(rule.createdBy, rule.createdAt).userName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatCreatedBy(rule.createdBy, rule.createdAt).formattedDate}
                        </div>
                        <div className="text-xs text-gray-400" title={rule.createdBy}>
                          {formatCreatedBy(rule.createdBy, rule.createdAt).email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(rule.enabled)}
                        <button
                          onClick={() => handleToggleRule(rule.id)}
                          className={`p-1 rounded-md ${rule.enabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                          title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                        >
                          {rule.enabled ? (
                            <EyeIcon className="h-4 w-4" />
                          ) : (
                            <EyeSlashIcon className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditRule(rule)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded-md hover:bg-blue-50"
                          title="Edit rule"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule)}
                          className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                          title="Delete rule"
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

      </div>

      {/* Edit Display Rule Modal */}
      <EditDisplayRuleModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedRule(null);
        }}
        rule={selectedRule}
        onSave={handleSaveRule}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedRule(null);
        }}
        onConfirm={confirmDeleteRule}
        title="Delete Display Rule"
        message={`Are you sure you want to delete the rule "${selectedRule?.name}"? This action cannot be undone.`}
        confirmText="Delete Rule"
        type="warning"
      />
    </div>
  );
}