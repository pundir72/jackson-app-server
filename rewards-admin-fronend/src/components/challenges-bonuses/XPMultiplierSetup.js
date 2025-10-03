'use client';

import React, { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function XPMultiplierSetup({
  multipliers = [],
  onAddMultiplier,
  onUpdateMultiplier,
  onDeleteMultiplier,
  onToggleActive,
  loading = false
}) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    streakLength: '',
    multiplier: '',
    vipBonusApplied: true,
    active: true,
    notes: ''
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [errors, setErrors] = useState({});

  // Reset form
  const resetForm = () => {
    setFormData({
      streakLength: '',
      multiplier: '',
      vipBonusApplied: true,
      active: true,
      notes: ''
    });
    setErrors({});
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.streakLength || formData.streakLength < 1) {
      newErrors.streakLength = 'Streak length must be at least 1 day';
    }

    if (!formData.multiplier || formData.multiplier < 1) {
      newErrors.multiplier = 'Multiplier must be at least 1.0x';
    }

    // Check for duplicate streak lengths (excluding currently editing item)
    const existingStreak = multipliers.find(m => 
      m.streakLength === parseInt(formData.streakLength) && 
      m.id !== editingId
    );
    if (existingStreak) {
      newErrors.streakLength = 'A multiplier for this streak length already exists';
    }


    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const multiplierData = {
      streakLength: parseInt(formData.streakLength),
      multiplier: parseFloat(formData.multiplier),
      vipBonusApplied: formData.vipBonusApplied,
      active: formData.active,
      notes: formData.notes
    };

    try {
      if (editingId) {
        await onUpdateMultiplier(editingId, multiplierData);
        setEditingId(null);
      } else {
        await onAddMultiplier(multiplierData);
        setShowAddForm(false);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving multiplier:', error);
    }
  };

  const handleEdit = (multiplier) => {
    setFormData({
      streakLength: multiplier.streakLength.toString(),
      multiplier: multiplier.multiplier.toString(),
      vipBonusApplied: multiplier.vipBonusApplied,
      active: multiplier.active,
      notes: multiplier.notes || ''
    });
    setEditingId(multiplier.id);
    setErrors({});
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    resetForm();
  };

  const handleToggleActive = async (id, currentActive) => {
    try {
      await onToggleActive(id, !currentActive);
    } catch (error) {
      console.error('Error toggling multiplier status:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this multiplier? This action cannot be undone.')) {
      try {
        await onDeleteMultiplier(id);
      } catch (error) {
        console.error('Error deleting multiplier:', error);
      }
    }
  };

  const formatMultiplier = (value) => {
    return `${value}x`;
  };

  const sortedMultipliers = [...multipliers].sort((a, b) => a.streakLength - b.streakLength);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">XP Multiplier Setup</h2>
              <p className="mt-1 text-sm text-gray-600">
                Configure XP multipliers based on daily streak achievements
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              disabled={showAddForm || editingId}
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Multiplier
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-200">
            <div className="space-y-4">
              <h3 className="text-md font-medium text-blue-900">Add New XP Multiplier</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Streak Length (Days) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.streakLength}
                    onChange={(e) => setFormData({...formData, streakLength: e.target.value})}
                    className={`w-full px-3 py-2 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.streakLength ? 'border-red-300' : 'border-gray-300'}`}
                    placeholder="Enter days"
                  />
                  {errors.streakLength && (
                    <p className="mt-1 text-sm text-red-600">{errors.streakLength}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    XP Multiplier *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={formData.multiplier}
                      onChange={(e) => setFormData({...formData, multiplier: e.target.value})}
                      className={`w-full px-3 py-2 pr-8 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.multiplier ? 'border-red-300' : 'border-gray-300'}`}
                      placeholder="1.5"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 text-sm">x</span>
                    </div>
                  </div>
                  {errors.multiplier && (
                    <p className="mt-1 text-sm text-red-600">{errors.multiplier}</p>
                  )}
                </div>

                <div className="flex flex-col">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Settings</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.vipBonusApplied}
                        onChange={(e) => setFormData({...formData, vipBonusApplied: e.target.checked})}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">VIP Bonus Applied</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.active}
                        onChange={(e) => setFormData({...formData, active: e.target.checked})}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">Active</span>
                    </label>
                  </div>
                </div>
              </div>


              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Optional notes about this multiplier logic..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
                >
                  <CheckIcon className="h-4 w-4 mr-2" />
                  Save Multiplier
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

        {/* Multipliers Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Streak Length
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  XP Multiplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  VIP Bonus
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedMultipliers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No XP multipliers configured yet. Add your first multiplier to get started.
                  </td>
                </tr>
              ) : (
                sortedMultipliers.map((multiplier) => (
                  <tr key={multiplier.id} className="hover:bg-gray-50">
                    {editingId === multiplier.id ? (
                      // Edit Row
                      <>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            min="1"
                            value={formData.streakLength}
                            onChange={(e) => setFormData({...formData, streakLength: e.target.value})}
                            className={`w-20 px-2 py-1 border rounded text-sm ${errors.streakLength ? 'border-red-300' : 'border-gray-300'}`}
                          />
                          <span className="ml-1 text-sm text-gray-600">days</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              step="0.1"
                              value={formData.multiplier}
                              onChange={(e) => setFormData({...formData, multiplier: e.target.value})}
                              className={`w-20 px-2 py-1 pr-6 border rounded text-sm ${errors.multiplier ? 'border-red-300' : 'border-gray-300'}`}
                            />
                            <span className="absolute right-1 top-1 text-sm text-gray-600">x</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={formData.vipBonusApplied}
                            onChange={(e) => setFormData({...formData, vipBonusApplied: e.target.checked})}
                            className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={formData.active}
                            onChange={(e) => setFormData({...formData, active: e.target.checked})}
                            className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            rows={1}
                            className="w-32 px-2 py-1 border border-gray-300 rounded text-xs resize-none"
                            placeholder="Notes..."
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
                          <span 
                            className="font-medium cursor-help" 
                            title={`Minimum consecutive daily login streak required`}
                          >
                            {multiplier.streakLength}
                          </span>
                          <span className="ml-1 text-gray-600">days</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span 
                            className="font-medium text-emerald-600 cursor-help" 
                            title={`Users with a ${multiplier.streakLength}-day streak will earn ${multiplier.multiplier}x XP${multiplier.vipBonusApplied ? ' (includes VIP bonus)' : ''}`}
                          >
                            {formatMultiplier(multiplier.multiplier)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center min-w-[60px] px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            multiplier.vipBonusApplied
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {multiplier.vipBonusApplied ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleActive(multiplier.id, multiplier.active)}
                            className={`inline-flex items-center justify-center min-w-[80px] px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              multiplier.active
                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                : 'bg-red-100 text-red-800 hover:bg-red-200'
                            }`}
                          >
                            {multiplier.active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {multiplier.notes ? (
                            <div className="max-w-xs truncate" title={multiplier.notes}>
                              {multiplier.notes}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEdit(multiplier)}
                              className="text-emerald-600 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-50"
                              title="Edit multiplier"
                              disabled={editingId || showAddForm}
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(multiplier.id)}
                              className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                              title="Delete multiplier"
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
        {sortedMultipliers.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Total: {sortedMultipliers.length} multipliers | Active: {sortedMultipliers.filter(m => m.active).length}
              </span>
              <span className="text-xs">
                Multipliers are applied based on consecutive daily login streaks
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}