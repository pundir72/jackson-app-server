'use client';

import React, { useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, EyeSlashIcon, ArrowLeftIcon, LinkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import EditProgressionRuleModal from './modals/EditProgressionRuleModal';
import ConfirmationModal from './modals/ConfirmationModal';

const mockProgressionRules = [
  {
    id: 'PROG001',
    name: 'Survey to Download Flow',
    description: 'Unlock download tasks after completing 2 surveys',
    unlockCondition: 'Complete 2 surveys in sequence',
    dependencies: [
      { fromTask: 'Complete Survey A', toTask: 'Download App X' },
      { fromTask: 'Complete Survey B', toTask: 'Download App Y' }
    ],
    lockType: 'Sequential',
    minimumEventToUnlock: '2 Survey Completions in 24 hours',
    eventThreshold: {
      type: 'Survey Completions',
      count: 2,
      timeWindow: '24 hours'
    },
    rewardTriggerRule: 'Complete download within 10 minutes',
    rewardTrigger: {
      condition: 'Complete download within 10 minutes',
      reward: '250 Coins + 500 XP'
    },
    enabled: true,
    override: false,
    overrideByGameId: null,
    gameId: 'GAME001',
    gameName: 'Survey Master Pro',
    affectedUsers: 8500,
    completionRate: '68.2%',
    avgUnlockTime: '45 minutes',
    lastModified: '2024-03-15',
    createdBy: '2024-03-10 14:30:00'
  },
  {
    id: 'PROG002',
    name: 'Trial Signup Progression',
    description: 'Sequential unlock: Social Follow → Trial Signup → Premium Upgrade',
    unlockCondition: 'Follow 3 social accounts then signup for trial',
    dependencies: [
      { fromTask: 'Follow Social Media', toTask: 'Sign up for Trial' },
      { fromTask: 'Sign up for Trial', toTask: 'Upgrade to Premium' }
    ],
    lockType: 'Timed',
    minimumEventToUnlock: '3 Social Follows in 12 hours',
    eventThreshold: {
      type: 'Social Follows',
      count: 3,
      timeWindow: '12 hours'
    },
    rewardTriggerRule: 'Complete full sequence within 3 days',
    rewardTrigger: {
      condition: 'Complete full sequence within 3 days',
      reward: '1000 Coins + 2x XP Boost'
    },
    enabled: true,
    override: false,
    overrideByGameId: null,
    gameId: 'GAME003',
    gameName: 'Premium Trial Signup',
    affectedUsers: 3200,
    completionRate: '34.5%',
    avgUnlockTime: '2.5 hours',
    lastModified: '2024-03-12',
    createdBy: '2024-03-08 09:15:00'
  },
  {
    id: 'PROG003',
    name: 'Install and Engage Chain',
    description: 'Manual unlock sequence for high-value app installs',
    unlockCondition: 'Manual admin approval required',
    dependencies: [
      { fromTask: 'Download Gaming App', toTask: 'Play for 30 minutes' },
      { fromTask: 'Play for 30 minutes', toTask: 'Make In-App Purchase' }
    ],
    lockType: 'Manual',
    minimumEventToUnlock: '1 App Install in 1 hour',
    eventThreshold: {
      type: 'App Installs',
      count: 1,
      timeWindow: '1 hour'
    },
    rewardTriggerRule: 'Admin approval + Purchase completion',
    rewardTrigger: {
      condition: 'Admin approval + Purchase completion',
      reward: '500 Coins per milestone'
    },
    enabled: false,
    override: true,
    overrideByGameId: 'GAME002',
    gameId: 'GAME002',
    gameName: 'Download & Play Challenge',
    affectedUsers: 0,
    completionRate: '0%',
    avgUnlockTime: 'Manual',
    lastModified: '2024-03-08',
    createdBy: '2024-03-05 16:45:00'
  },
  {
    id: 'PROG004',
    name: 'Social Engagement Ladder',
    description: 'Progressive social media engagement tasks',
    unlockCondition: 'Complete social interactions in sequence',
    dependencies: [
      { fromTask: 'Follow 1 Account', toTask: 'Follow 5 Accounts' },
      { fromTask: 'Follow 5 Accounts', toTask: 'Share Content' },
      { fromTask: 'Share Content', toTask: 'Invite Friends' }
    ],
    lockType: 'Sequential',
    minimumEventToUnlock: '5 Social Interactions in 6 hours',
    eventThreshold: {
      type: 'Social Interactions',
      count: 5,
      timeWindow: '6 hours'
    },
    rewardTriggerRule: 'Each milestone unlocks next + bonus',
    rewardTrigger: {
      condition: 'Each milestone unlocks next + bonus',
      reward: '100 Coins per unlock + 50 XP'
    },
    enabled: true,
    override: false,
    overrideByGameId: null,
    gameId: 'GAME004',
    gameName: 'Social Media Follow',
    affectedUsers: 12750,
    completionRate: '76.8%',
    avgUnlockTime: '3.2 hours',
    lastModified: '2024-03-14',
    createdBy: '2024-03-12 11:20:00'
  }
];

const lockTypes = ['Sequential', 'Timed', 'Manual'];
const eventTypes = ['Survey Completions', 'App Installs', 'Social Interactions', 'Purchase Events', 'Time Spent'];

export default function TaskProgressionRulesModule() {
  const [rules, setRules] = useState(mockProgressionRules);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('all');
  const [filterLockType, setFilterLockType] = useState('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);

  // Filter rules
  const filteredRules = rules.filter(rule => {
    const matchesSearch =
      rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.gameName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesEnabled = filterEnabled === 'all' ||
      (filterEnabled === 'enabled' && rule.enabled) ||
      (filterEnabled === 'disabled' && !rule.enabled);

    const matchesLockType = filterLockType === 'all' || rule.lockType === filterLockType;

    return matchesSearch && matchesEnabled && matchesLockType;
  });

  const handleToggleRule = (ruleId) => {
    setRules(prev => prev.map(rule =>
      rule.id === ruleId ? { ...rule, override: !rule.override } : rule
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
      // Edit existing rule
      setRules(prev => prev.map(rule =>
        rule.id === selectedRule.id ? ruleData : rule
      ));
    } else {
      // Add new rule
      setRules(prev => [...prev, ruleData]);
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

  const getLockTypeBadge = (lockType) => {
    const lockTypeColors = {
      'Sequential': 'bg-blue-100 text-blue-800',
      'Timed': 'bg-orange-100 text-orange-800',
      'Manual': 'bg-purple-100 text-purple-800'
    };

    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${lockTypeColors[lockType]}`}>
        {lockType}
      </span>
    );
  };

  const renderDependencyChain = (dependencies) => {
    return (
      <div className="space-y-2">
        {dependencies.map((dep, index) => (
          <div key={index} className="flex items-center space-x-2 text-xs">
            <span className="bg-gray-100 px-2 py-1 rounded text-gray-700 max-w-[120px] truncate">
              {dep.fromTask}
            </span>
            <LinkIcon className="h-3 w-3 text-gray-400" />
            <span className="bg-green-100 px-2 py-1 rounded text-green-700 max-w-[120px] truncate">
              {dep.toTask}
            </span>
          </div>
        ))}
      </div>
    );
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
                  Task Progression Rules
                </h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Allows admin to control how in-game tasks are locked, unlocked, and how rewards are released based on completion dependencies or event thresholds
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleCreateRule}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Progression Rule
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
                  placeholder="Search rules by name, description, or game..."
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
                value={filterEnabled}
                onChange={(e) => setFilterEnabled(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Status</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>

              <select
                value={filterLockType}
                onChange={(e) => setFilterLockType(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Lock Types</option>
                {lockTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
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
                  Task ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unlock Condition
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lock Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Minimum Event to Unlock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reward Trigger Rule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Override
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Override by Game ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || filterEnabled !== 'all' || filterLockType !== 'all'
                      ? 'No progression rules match your current filters.'
                      : 'No progression rules configured yet. Add your first rule to get started.'}
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => (
                  <React.Fragment key={rule.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{rule.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs">{rule.unlockCondition}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getLockTypeBadge(rule.lockType)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{rule.minimumEventToUnlock}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs">{rule.rewardTriggerRule}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center justify-center min-w-[50px] px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            rule.override ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {rule.override ? 'Yes' : 'No'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{rule.overrideByGameId || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{rule.createdBy}</div>
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

                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Progression Rule Modal */}
      <EditProgressionRuleModal
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
        title="Delete Progression Rule"
        message={`Are you sure you want to delete the rule "${selectedRule?.name}"? This action cannot be undone.`}
        confirmText="Delete Rule"
        type="warning"
      />
    </div>
  );
}