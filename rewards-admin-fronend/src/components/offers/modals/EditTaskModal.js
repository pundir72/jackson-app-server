'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const REWARD_TYPES = ['XP', 'Coins', 'XP + Coins', 'XP Boost', 'Coins + XP Boost'];
const REPEAT_FREQ = ['Once', 'Daily', 'Weekly', 'Monthly'];
const TIER_RESTRICTIONS = ['Bronze', 'Gold', 'Platinum', 'All Tiers'];
const XP_TIER_RESTRICTIONS = ['Junior', 'Mid', 'Senior', 'All'];

export default function EditTaskModal({ isOpen, onClose, task, onSave }) {
  const [formData, setFormData] = useState({
    taskName: '',
    milestoneLogic: '',
    rewardType: 'XP',
    rewardValue: 0,
    tierRestriction: 'All Tiers',
    xpTierRestriction: 'All',
    startDate: '',
    endDate: '',
    repeatFrequency: 'Once',
    activeVisible: true
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (task) {
      setFormData({
        taskName: task.taskName || '',
        milestoneLogic: task.milestoneLogic || '',
        rewardType: task.rewardType || 'XP',
        // if older tasks had separate xp/coins keep numeric fallback
        rewardValue: task.rewardValue ?? (task.rewardXP ?? 0) ?? 0,
        tierRestriction: task.tierRestriction || 'All Tiers',
        xpTierRestriction: task.xpTierRestriction || 'All',
        startDate: task.startDate ? toDatetimeLocal(task.startDate) : '',
        endDate: task.endDate ? toDatetimeLocal(task.endDate) : '',
        repeatFrequency: task.repeatFrequency || 'Once',
        activeVisible: typeof task.activeVisible === 'boolean' ? task.activeVisible : true
      });
    } else {
      // new task defaults
      setFormData({
        taskName: '',
        milestoneLogic: '',
        rewardType: 'XP',
        rewardValue: 0,
        tierRestriction: 'All Tiers',
        xpTierRestriction: 'All',
        startDate: '',
        endDate: '',
        repeatFrequency: 'Once',
        activeVisible: true
      });
    }
    setErrors({});
  }, [task, isOpen]);

  // helper: convert ISO or Date to input[type="datetime-local"] value
  function toDatetimeLocal(value) {
    if (!value) return '';
    const d = new Date(value);
    // get timezone offset so value is local
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISO = new Date(d - tzOffset).toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
    return localISO;
  }

  // convert back from datetime-local string to ISO when saving
  function fromDatetimeLocal(value) {
    if (!value) return null;
    // `value` format: YYYY-MM-DDTHH:mm
    const dt = new Date(value);
    return dt.toISOString();
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.taskName.trim()) newErrors.taskName = 'Task name is required';
    if (!formData.milestoneLogic.trim()) newErrors.milestoneLogic = 'Milestone logic is required';
    if (formData.rewardValue === '' || Number(formData.rewardValue) < 0) newErrors.rewardValue = 'Enter a valid reward value';
    if (formData.startDate && formData.endDate && new Date(formData.endDate) < new Date(formData.startDate)) newErrors.endDate = 'End date must be after start date';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const prepared = {
      id: task?.id || `TASK${Date.now()}`,
      taskName: formData.taskName.trim(),
      milestoneLogic: formData.milestoneLogic.trim(),
      rewardType: formData.rewardType,
      rewardValue: Number(formData.rewardValue),
      tierRestriction: formData.tierRestriction,
      xpTierRestriction: formData.xpTierRestriction,
      startDate: fromDatetimeLocal(formData.startDate),
      endDate: fromDatetimeLocal(formData.endDate),
      repeatFrequency: formData.repeatFrequency,
      activeVisible: formData.activeVisible
    };

    onSave(prepared);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* backdrop */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        {/* Centering helper */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full z-50">
          {/* header */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                {task ? 'Edit Task' : 'Add New Task'}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 gap-4">
              {/* Task Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
                <input
                  type="text"
                  value={formData.taskName}
                  onChange={(e) => handleInputChange('taskName', e.target.value)}
                  placeholder="Enter task name"
                  className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${errors.taskName ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'}`}
                />
                {errors.taskName && <p className="mt-1 text-xs text-red-600">{errors.taskName}</p>}
              </div>

              {/* Milestone Logic */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Milestone Logic</label>
                <input
                  type="text"
                  value={formData.milestoneLogic}
                  onChange={(e) => handleInputChange('milestoneLogic', e.target.value)}
                  placeholder="e.g., Play 10 mins, Win 1 match"
                  className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${errors.milestoneLogic ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'}`}
                />
                {errors.milestoneLogic && <p className="mt-1 text-xs text-red-600">{errors.milestoneLogic}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Reward Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reward Type</label>
                  <select
                    value={formData.rewardType}
                    onChange={(e) => handleInputChange('rewardType', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    {REWARD_TYPES.map(rt => <option key={rt} value={rt}>{rt}</option>)}
                  </select>
                </div>

                {/* Reward Value */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reward Value</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.rewardValue}
                    onChange={(e) => handleInputChange('rewardValue', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Enter reward value"
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${errors.rewardValue ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'}`}
                  />
                  {errors.rewardValue && <p className="mt-1 text-xs text-red-600">{errors.rewardValue}</p>}
                </div>

                {/* Tier Restriction */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tier Restriction</label>
                  <select
                    value={formData.tierRestriction}
                    onChange={(e) => handleInputChange('tierRestriction', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    {TIER_RESTRICTIONS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
                  </select>
                </div>

                {/* XP Tier Restriction */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">XP Tier Restriction</label>
                  <select
                    value={formData.xpTierRestriction}
                    onChange={(e) => handleInputChange('xpTierRestriction', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    {XP_TIER_RESTRICTIONS.map(xpTier => <option key={xpTier} value={xpTier}>{xpTier}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="datetime-local"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${errors.startDate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'}`}
                    placeholder="Start date"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="datetime-local"
                    value={formData.endDate}
                    onChange={(e) => handleInputChange('endDate', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${errors.endDate ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-green-500'}`}
                    placeholder="End date"
                  />
                  {errors.endDate && <p className="mt-1 text-xs text-red-600">{errors.endDate}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                {/* Repeat Frequency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repeat Frequency</label>
                  <select
                    value={formData.repeatFrequency}
                    onChange={(e) => handleInputChange('repeatFrequency', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    {REPEAT_FREQ.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                {/* Active/Visible */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.activeVisible}
                    onChange={(e) => handleInputChange('activeVisible', e.target.checked)}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                    id="activeVisible"
                  />
                  <label htmlFor="activeVisible" className="text-sm text-gray-700">Active/Visible</label>
                </div>
              </div>
            </div>

            {/* footer actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
              >
                Save Task
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
