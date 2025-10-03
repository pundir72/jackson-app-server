'use client';

import React, { useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon, CalendarIcon } from '@heroicons/react/24/outline';

export default function BonusDayConfiguration({
  bonusDays = [],
  onAddBonusDay,
  onUpdateBonusDay,
  onDeleteBonusDay,
  loading = false
}) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    bonusDay: '',
    rewardType: 'Coins',
    rewardValue: '',
    alternateReward: '',
    resetRule: true
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [errors, setErrors] = useState({});

  const rewardTypes = ['Coins', 'Giftcard', 'XP'];

  const resetForm = () => {
    setFormData({
      bonusDay: '',
      rewardType: 'Coins',
      rewardValue: '',
      alternateReward: '',
      resetRule: true
    });
    setErrors({});
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.bonusDay || formData.bonusDay < 1) {
      newErrors.bonusDay = 'Bonus day must be at least 1';
    }

    if (!formData.rewardValue || formData.rewardValue < 1) {
      newErrors.rewardValue = 'Reward value must be at least 1';
    }

    // Alternate reward validation hidden
    // if (formData.alternateReward && (isNaN(formData.alternateReward) || formData.alternateReward < 0)) {
    //   newErrors.alternateReward = 'Alternate reward must be a valid number >= 0';
    // }

    // Check for duplicate bonus days (excluding currently editing item)
    const existingBonus = bonusDays.find(b =>
      b.bonusDay === parseInt(formData.bonusDay) &&
      b.id !== editingId
    );
    if (existingBonus) {
      newErrors.bonusDay = 'A bonus day for this day already exists';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const bonusDayData = {
      bonusDay: parseInt(formData.bonusDay),
      rewardType: formData.rewardType,
      rewardValue: parseInt(formData.rewardValue),
      alternateReward: formData.alternateReward ? parseInt(formData.alternateReward) : null,
      resetRule: formData.resetRule
    };

    try {
      if (editingId) {
        await onUpdateBonusDay(editingId, bonusDayData);
        setEditingId(null);
      } else {
        await onAddBonusDay(bonusDayData);
        setShowAddForm(false);
      }
      resetForm();
    } catch (error) {
      console.error('Error saving bonus day:', error);
    }
  };

  const handleEdit = (bonusDay) => {
    setFormData({
      bonusDay: bonusDay.bonusDay.toString(),
      rewardType: bonusDay.rewardType,
      rewardValue: bonusDay.rewardValue.toString(),
      alternateReward: bonusDay.alternateReward ? bonusDay.alternateReward.toString() : '',
      resetRule: bonusDay.resetRule
    });
    setEditingId(bonusDay.id);
    setErrors({});
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAddForm(false);
    resetForm();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this bonus day? This action cannot be undone.')) {
      try {
        await onDeleteBonusDay(id);
      } catch (error) {
        console.error('Error deleting bonus day:', error);
      }
    }
  };

  const getRewardIcon = (rewardType) => {
    switch (rewardType) {
      case 'Coins':
        return '🪙';
      case 'Giftcard':
        return '🎁';
      case 'XP':
        return '⭐';
      default:
        return '💎';
    }
  };

  const sortedBonusDays = [...bonusDays].sort((a, b) => a.bonusDay - b.bonusDay);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Bonus Day Configuration</h2>
              <p className="mt-1 text-sm text-gray-600">
                Configure bonus rewards for milestone days (e.g., Day 7, Day 30) to boost user retention
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              disabled={showAddForm || editingId}
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Bonus Day
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-200">
            <div className="space-y-4">
              <h3 className="text-md font-medium text-blue-900">Add New Bonus Day</h3>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bonus Day *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      value={formData.bonusDay}
                      onChange={(e) => setFormData({...formData, bonusDay: e.target.value})}
                      className={`w-full px-3 py-2 pl-10 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.bonusDay ? 'border-red-300' : 'border-gray-300'}`}
                      placeholder="7"
                    />
                    <CalendarIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                  {errors.bonusDay && (
                    <p className="mt-1 text-sm text-red-600">{errors.bonusDay}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reward Type *
                  </label>
                  <select
                    value={formData.rewardType}
                    onChange={(e) => setFormData({...formData, rewardType: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {rewardTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reward Value *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      value={formData.rewardValue}
                      onChange={(e) => setFormData({...formData, rewardValue: e.target.value})}
                      className={`w-full px-3 py-2 pr-12 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.rewardValue ? 'border-red-300' : 'border-gray-300'}`}
                      placeholder="100"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-gray-500">
                      {formData.rewardType.toLowerCase()}
                    </span>
                  </div>
                  {errors.rewardValue && (
                    <p className="mt-1 text-sm text-red-600">{errors.rewardValue}</p>
                  )}
                </div>

                {/* Alternate Reward field hidden */}
                {/* <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alternate Reward
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={formData.alternateReward}
                      onChange={(e) => setFormData({...formData, alternateReward: e.target.value})}
                      className={`w-full px-3 py-2 pr-12 border rounded-md focus:ring-emerald-500 focus:border-emerald-500 ${errors.alternateReward ? 'border-red-300' : 'border-gray-300'}`}
                      placeholder="Enter Value"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-gray-500">
                      {formData.rewardType.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Optional — backup reward if primary missed</p>
                  {errors.alternateReward && (
                    <p className="mt-1 text-sm text-red-600">{errors.alternateReward}</p>
                  )}
                </div> */}

                <div className="flex flex-col justify-end">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.resetRule}
                      onChange={(e) => setFormData({...formData, resetRule: e.target.checked})}
                      className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Reset streak on miss</span>
                  </label>
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
                  Save Bonus Day
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

        {/* Bonus Days Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bonus Day
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reward Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reward Value
                </th>
                {/* Alternate Reward column hidden */}
                {/* <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Alternate Reward
                </th> */}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reset Rule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedBonusDays.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    No bonus days configured yet. Add your first bonus day to get started.
                  </td>
                </tr>
              ) : (
                sortedBonusDays.map((bonusDay) => (
                  <tr key={bonusDay.id} className="hover:bg-gray-50">
                    {editingId === bonusDay.id ? (
                      // Edit Row
                      <>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              value={formData.bonusDay}
                              onChange={(e) => setFormData({...formData, bonusDay: e.target.value})}
                              className={`w-20 px-2 py-1 pl-8 border rounded text-sm ${errors.bonusDay ? 'border-red-300' : 'border-gray-300'}`}
                            />
                            <CalendarIcon className="h-4 w-4 text-gray-400 absolute left-2 top-1.5" />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={formData.rewardType}
                            onChange={(e) => setFormData({...formData, rewardType: e.target.value})}
                            className="w-28 px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            {rewardTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            min="1"
                            value={formData.rewardValue}
                            onChange={(e) => setFormData({...formData, rewardValue: e.target.value})}
                            className={`w-20 px-2 py-1 border rounded text-sm ${errors.rewardValue ? 'border-red-300' : 'border-gray-300'}`}
                          />
                        </td>
                        {/* Alternate Reward input hidden */}
                        {/* <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            min="0"
                            value={formData.alternateReward}
                            onChange={(e) => setFormData({...formData, alternateReward: e.target.value})}
                            className={`w-20 px-2 py-1 border rounded text-sm ${errors.alternateReward ? 'border-red-300' : 'border-gray-300'}`}
                            placeholder="Alt"
                          />
                        </td> */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={formData.resetRule}
                            onChange={(e) => setFormData({...formData, resetRule: e.target.checked})}
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
                            <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                            <span
                              className="font-medium cursor-help"
                              title={`Bonus reward given on day ${bonusDay.bonusDay}`}
                            >
                              Day {bonusDay.bonusDay}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center">
                            <span className="mr-2">{getRewardIcon(bonusDay.rewardType)}</span>
                            <span className="font-medium">{bonusDay.rewardType}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span
                            className="font-medium text-emerald-600"
                            title={`${bonusDay.rewardValue} ${bonusDay.rewardType.toLowerCase()}`}
                          >
                            {bonusDay.rewardValue.toLocaleString()}
                          </span>
                        </td>
                        {/* Alternate Reward data column hidden */}
                        {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {bonusDay.alternateReward ? (
                            <span
                              className="font-medium text-orange-600"
                              title={`${bonusDay.alternateReward} ${bonusDay.rewardType.toLowerCase()} (fallback)`}
                            >
                              {bonusDay.alternateReward.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">None</span>
                          )}
                        </td> */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center min-w-[60px] px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            bonusDay.resetRule
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {bonusDay.resetRule ? 'Reset' : 'Continue'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEdit(bonusDay)}
                              className="text-emerald-600 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-50"
                              title="Edit bonus day"
                              disabled={editingId || showAddForm}
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(bonusDay.id)}
                              className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                              title="Delete bonus day"
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
        {sortedBonusDays.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Total: {sortedBonusDays.length} bonus days | Reset on miss: {sortedBonusDays.filter(b => b.resetRule).length}
              </span>
              <span className="text-xs">
                Bonus days help boost user retention and engagement
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}