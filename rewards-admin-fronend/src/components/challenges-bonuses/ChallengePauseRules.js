'use client';

import React, { useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function ChallengePauseRules({
  pauseRules = [],
  onAddPauseRule,
  onUpdatePauseRule,
  onDeletePauseRule,
  loading = false
}) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    ruleName: '',
    actionOnMiss: 'Pause Streak',
    graceDays: 0,
    impactOnXP: true,
    resetCoins: true
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [errors, setErrors] = useState({});

  const actionOptions = ['Pause Streak', 'Reset Streak', 'Continue Streak'];

  const resetForm = () => {
    setFormData({
      ruleName: '',
      actionOnMiss: 'Pause Streak',
      graceDays: 0,
      impactOnXP: true,
      resetCoins: true
    });
    setErrors({});
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.ruleName || formData.ruleName.trim() === '') {
      newErrors.ruleName = 'Rule name is required';
    }

    if (formData.graceDays < 0) {
      newErrors.graceDays = 'Grace days cannot be negative';
    }

    // Check for duplicate rule names (excluding currently editing item)
    const existingRule = pauseRules.find(r =>
      r.ruleName.toLowerCase() === formData.ruleName.toLowerCase() &&
      r.id !== editingId
    );
    if (existingRule) {
      newErrors.ruleName = 'A rule with this name already exists';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const pauseRuleData = {
      ruleName: formData.ruleName.trim(),
      actionOnMiss: formData.actionOnMiss,
      graceDays: parseInt(formData.graceDays),
      impactOnXP: formData.impactOnXP,
      resetCoins: formData.resetCoins
    };

    try {
      if (editingId) {
        await onUpdatePauseRule(editingId, pauseRuleData);
        setEditingId(null);
      } else {
        await onAddPauseRule(pauseRuleData);
        setShowAddForm(false);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving pause rule:', error);
    }
  };

  const handleEdit = (pauseRule) => {
    setFormData({
      ruleName: pauseRule.ruleName,
      actionOnMiss: pauseRule.actionOnMiss,
      graceDays: pauseRule.graceDays.toString(),
      impactOnXP: pauseRule.impactOnXP,
      resetCoins: pauseRule.resetCoins
    });
    setEditingId(pauseRule.id);
    setErrors({});
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    resetForm();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this pause rule? This action cannot be undone.')) {
      try {
        await onDeletePauseRule(id);
      } catch (error) {
        console.error('Error deleting pause rule:', error);
      }
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'Pause Streak':
        return 'bg-yellow-100 text-yellow-800';
      case 'Reset Streak':
        return 'bg-red-100 text-red-800';
      case 'Continue Streak':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'Pause Streak':
        return '⏸️';
      case 'Reset Streak':
        return '🔄';
      case 'Continue Streak':
        return '▶️';
      default:
        return '⚙️';
    }
  };

  const sortedPauseRules = [...pauseRules].sort((a, b) => a.ruleName.localeCompare(b.ruleName));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Challenge Pause Rules</h2>
              <p className="mt-1 text-sm text-gray-600">
                Define what happens when users miss daily challenges - pause streaks, reset progress, or apply grace periods
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              disabled={showAddForm || editingId}
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Pause Rule
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-200">
            <div className="space-y-4">
              <h3 className="text-md font-medium text-blue-900">Add New Pause Rule</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.ruleName}
                      onChange={(e) => setFormData({...formData, ruleName: e.target.value})}
                      className={`w-full px-3 py-2 pl-10 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.ruleName ? 'border-red-300' : 'border-gray-300'}`}
                      placeholder="Standard Pause Rule"
                    />
                    <ShieldCheckIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                  {errors.ruleName && (
                    <p className="mt-1 text-sm text-red-600">{errors.ruleName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Action on Miss *
                  </label>
                  <select
                    value={formData.actionOnMiss}
                    onChange={(e) => setFormData({...formData, actionOnMiss: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {actionOptions.map(action => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Grace Days
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.graceDays}
                    onChange={(e) => setFormData({...formData, graceDays: e.target.value})}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.graceDays ? 'border-red-300' : 'border-gray-300'}`}
                    placeholder="0"
                  />
                  {errors.graceDays && (
                    <p className="mt-1 text-sm text-red-600">{errors.graceDays}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">Number of missed days allowed before action is applied</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Impact Settings
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.impactOnXP}
                        onChange={(e) => setFormData({...formData, impactOnXP: e.target.checked})}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">XP Reset on Miss</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.resetCoins}
                        onChange={(e) => setFormData({...formData, resetCoins: e.target.checked})}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">Coins Reset on Miss</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
                >
                  <CheckIcon className="h-4 w-4 mr-2" />
                  Save Pause Rule
                </button>
                <button
                  onClick={handleCancel}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                >
                  <XMarkIcon className="h-4 w-4 mr-2" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pause Rules Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rule Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action on Miss
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grace Days
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  XP Reset
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coins Reset
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedPauseRules.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    No pause rules configured yet. Add your first pause rule to get started.
                  </td>
                </tr>
              ) : (
                sortedPauseRules.map((pauseRule) => (
                  <tr key={pauseRule.id} className="hover:bg-gray-50">
                    {editingId === pauseRule.id ? (
                      // Edit Row
                      <>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="relative">
                            <input
                              type="text"
                              value={formData.ruleName}
                              onChange={(e) => setFormData({...formData, ruleName: e.target.value})}
                              className={`w-40 px-2 py-1 pl-8 border rounded text-sm ${errors.ruleName ? 'border-red-300' : 'border-gray-300'}`}
                            />
                            <ShieldCheckIcon className="h-4 w-4 text-gray-400 absolute left-2 top-1.5" />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={formData.actionOnMiss}
                            onChange={(e) => setFormData({...formData, actionOnMiss: e.target.value})}
                            className="w-36 px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            {actionOptions.map(action => (
                              <option key={action} value={action}>{action}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            min="0"
                            value={formData.graceDays}
                            onChange={(e) => setFormData({...formData, graceDays: e.target.value})}
                            className={`w-20 px-2 py-1 border rounded text-sm ${errors.graceDays ? 'border-red-300' : 'border-gray-300'}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={formData.impactOnXP}
                            onChange={(e) => setFormData({...formData, impactOnXP: e.target.checked})}
                            className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={formData.resetCoins}
                            onChange={(e) => setFormData({...formData, resetCoins: e.target.checked})}
                            className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={handleSubmit}
                              className="text-emerald-600 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-50"
                              title="Save changes"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={handleCancel}
                              className="text-gray-600 hover:text-gray-900 p-1 rounded-md hover:bg-gray-50"
                              title="Cancel editing"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      // Display Row
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center">
                            <ShieldCheckIcon className="h-4 w-4 text-gray-400 mr-2" />
                            <span
                              className="font-medium cursor-help"
                              title={`Rule: ${pauseRule.ruleName}`}
                            >
                              {pauseRule.ruleName}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center">
                            <span className="mr-2">{getActionIcon(pauseRule.actionOnMiss)}</span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(pauseRule.actionOnMiss)}`}>
                              {pauseRule.actionOnMiss}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span
                            className="font-medium"
                            title={`${pauseRule.graceDays} days grace period before applying rule`}
                          >
                            {pauseRule.graceDays}
                          </span>
                          <span className="ml-1 text-gray-600">days</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center min-w-[60px] px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            pauseRule.impactOnXP
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {pauseRule.impactOnXP ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center min-w-[60px] px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            pauseRule.resetCoins
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {pauseRule.resetCoins ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEdit(pauseRule)}
                              className="text-emerald-600 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-50"
                              title="Edit pause rule"
                              disabled={editingId || showAddForm}
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(pauseRule.id)}
                              className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                              title="Delete pause rule"
                              disabled={editingId || showAddForm}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        {sortedPauseRules.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Total: {sortedPauseRules.length} pause rules | XP Reset: {sortedPauseRules.filter(r => r.impactOnXP).length} | Coins Reset: {sortedPauseRules.filter(r => r.resetCoins).length}
              </span>
              <span className="text-xs">
                Pause rules determine user experience when daily challenges are missed
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}