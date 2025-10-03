'use client';

import React, { useState, useMemo } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, Bars3Icon } from '@heroicons/react/24/outline';
import AddEditRewardModal from './modals/AddEditRewardModal';
import DeleteConfirmationModal from './modals/DeleteConfirmationModal';
import TierBadge from '../ui/TierBadge';

export default function PrizePoolConfiguration({ 
  rewards = [], 
  onAddReward, 
  onUpdateReward, 
  onDeleteReward, 
  onReorderRewards,
  loading 
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReward, setEditingReward] = useState(null);
  const [deletingReward, setDeletingReward] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);

  // Calculate total probability
  const totalProbability = useMemo(() => {
    return rewards
      .filter(reward => reward.active)
      .reduce((sum, reward) => sum + (reward.probability || 0), 0);
  }, [rewards]);

  // Filter rewards
  const filteredRewards = useMemo(() => {
    return rewards
      .filter(reward => {
        const matchesSearch = reward.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             reward.type.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || 
                             (statusFilter === 'active' && reward.active) ||
                             (statusFilter === 'inactive' && !reward.active);
        const matchesType = typeFilter === 'all' || reward.type === typeFilter;
        
        return matchesSearch && matchesStatus && matchesType;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0)); // Sort by order
  }, [rewards, searchTerm, statusFilter, typeFilter]);

  const rewardTypes = ['Coins', 'XP', 'Coupons'];
  const tierOptions = ['All Tiers', 'Bronze', 'Gold', 'Platinum'];

  const handleAddReward = async (rewardData) => {
    try {
      await onAddReward(rewardData);
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding reward:', error);
    }
  };

  const handleUpdateReward = async (id, rewardData) => {
    try {
      await onUpdateReward(id, rewardData);
      setEditingReward(null);
    } catch (error) {
      console.error('Error updating reward:', error);
    }
  };

  const handleDeleteReward = async (id) => {
    try {
      await onDeleteReward(id);
      setDeletingReward(null);
    } catch (error) {
      console.error('Error deleting reward:', error);
    }
  };

  const getProbabilityColor = () => {
    if (totalProbability > 100) return 'text-red-600 bg-red-50 border-red-200';
    if (totalProbability === 100) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    return 'text-amber-600 bg-amber-50 border-amber-200';
  };

  // Drag and drop handlers
  const handleDragStart = (e, reward) => {
    setDraggedItem(reward);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e, reward) => {
    e.preventDefault();
    if (draggedItem && draggedItem.id !== reward.id) {
      setDragOverItem(reward);
    }
  };

  const handleDragLeave = (e) => {
    // Only clear dragOver if we're leaving the row entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverItem(null);
    }
  };

  const handleDrop = async (e, targetReward) => {
    e.preventDefault();
    
    if (!draggedItem || !onReorderRewards || draggedItem.id === targetReward.id) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    try {
      // Find indexes in the filtered list
      const draggedIndex = filteredRewards.findIndex(r => r.id === draggedItem.id);
      const targetIndex = filteredRewards.findIndex(r => r.id === targetReward.id);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        await onReorderRewards(draggedIndex, targetIndex);
      }
    } catch (error) {
      console.error('Error reordering rewards:', error);
    } finally {
      setDraggedItem(null);
      setDragOverItem(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  return (
    <div className="space-y-6">
      {/* Prize Pool Header & Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Prize Pool Configuration</h2>
              <p className="mt-1 text-sm text-gray-600">
                Manage rewards, probabilities, and prize pool settings
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {/* Total Probability Indicator */}
              <div className={`px-3 py-2 rounded-lg border text-sm font-medium ${getProbabilityColor()}`}>
                Total Probability: {totalProbability.toFixed(1)}%
                {totalProbability > 100 && (
                  <span className="ml-2 text-xs">(Exceeds 100%)</span>
                )}
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Reward
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
                  placeholder="Search rewards by name or type..."
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
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Types</option>
                {rewardTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Rewards Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reward
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Probability
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tier Visibility
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
              {filteredRewards.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' 
                      ? 'No rewards match your current filters.' 
                      : 'No rewards configured yet. Add your first reward to get started.'}
                  </td>
                </tr>
              ) : (
                filteredRewards.map((reward, index) => (
                  <tr 
                    key={reward.id} 
                    className={`hover:bg-gray-50 transition-colors cursor-move ${
                      dragOverItem?.id === reward.id ? 'bg-blue-50 border-l-4 border-blue-400' : ''
                    } ${draggedItem?.id === reward.id ? 'opacity-50' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, reward)}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, reward)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, reward)}
                    onDragEnd={handleDragEnd}
                  >
                    <td className="px-6
                     py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Bars3Icon className="h-5 w-5 text-gray-400 cursor-move" title="Drag to reorder" />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 mr-3 bg-gray-100 rounded-full flex items-center justify-center">
                          {reward.icon ? (
                            <img className="h-8 w-8 rounded-full" src={reward.icon} alt={reward.label} />
                          ) : (
                            <span className="text-xs font-medium text-gray-600">
                              {reward.type === 'Coins' ? '🪙' : 
                               reward.type === 'XP' ? '⭐' : 
                               reward.type === 'Coupons' ? '🎫' : '🎁'}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{reward.label}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 min-w-[70px]">
                        {reward.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reward.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {reward.probability}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {reward.tierVisibility.map((tier) => (
                          <TierBadge key={tier} tier={tier} />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium min-w-[70px] ${
                        reward.active 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {reward.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setEditingReward(reward)}
                          className="text-emerald-600 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-50"
                          title="Edit reward"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingReward(reward)}
                          className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                          title="Delete reward"
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

        {/* Results Summary */}
        {filteredRewards.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Showing {filteredRewards.length} of {rewards.length} rewards
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddEditRewardModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddReward}
          rewardTypes={rewardTypes}
          tierOptions={tierOptions}
          existingRewards={rewards}
        />
      )}

      {editingReward && (
        <AddEditRewardModal
          isOpen={!!editingReward}
          onClose={() => setEditingReward(null)}
          onSave={(data) => handleUpdateReward(editingReward.id, data)}
          reward={editingReward}
          rewardTypes={rewardTypes}
          tierOptions={tierOptions}
          existingRewards={rewards}
        />
      )}

      {deletingReward && (
        <DeleteConfirmationModal
          isOpen={!!deletingReward}
          onClose={() => setDeletingReward(null)}
          onConfirm={() => handleDeleteReward(deletingReward.id)}
          title="Delete Reward"
          message={`Are you sure you want to delete "${deletingReward.label}"? This action cannot be undone.`}
          confirmButtonText="Delete Reward"
        />
      )}
    </div>
  );
}