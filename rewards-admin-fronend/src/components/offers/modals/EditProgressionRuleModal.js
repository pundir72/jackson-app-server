'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon, LinkIcon } from '@heroicons/react/24/outline';

const lockTypes = ['Sequential', 'Timed', 'Manual'];
const eventTypes = ['Survey Completions', 'App Installs', 'Social Interactions', 'Purchase Events', 'Time Spent'];
const timeWindows = ['1 hour', '6 hours', '12 hours', '24 hours', '3 days', '7 days', '30 days'];

const mockGames = [
  { id: 'GAME001', name: 'Survey Master Pro' },
  { id: 'GAME002', name: 'Download & Play Challenge' },
  { id: 'GAME003', name: 'Premium Trial Signup' },
  { id: 'GAME004', name: 'Social Media Follow' }
];

const sampleTasks = [
  'Complete Survey A', 'Complete Survey B', 'Download App X', 'Download App Y',
  'Follow Social Media', 'Sign up for Trial', 'Upgrade to Premium', 'Play for 30 minutes',
  'Make In-App Purchase', 'Follow 1 Account', 'Follow 5 Accounts', 'Share Content',
  'Invite Friends', 'Download Gaming App'
];

export default function EditProgressionRuleModal({ isOpen, onClose, rule, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unlockCondition: '',
    dependencies: [{ fromTask: '', toTask: '' }],
    lockType: 'Sequential',
    minimumEventToUnlock: '',
    eventThreshold: {
      type: 'Survey Completions',
      count: 1,
      timeWindow: '24 hours'
    },
    rewardTriggerRule: '',
    rewardTrigger: {
      condition: '',
      reward: ''
    },
    enabled: true,
    override: false,
    overrideByGameId: '',
    gameId: '',
    gameName: ''
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (rule) {
      setFormData({
        name: rule.name || '',
        description: rule.description || '',
        unlockCondition: rule.unlockCondition || '',
        dependencies: rule.dependencies || [{ fromTask: '', toTask: '' }],
        lockType: rule.lockType || 'Sequential',
        minimumEventToUnlock: rule.minimumEventToUnlock || '',
        eventThreshold: rule.eventThreshold || {
          type: 'Survey Completions',
          count: 1,
          timeWindow: '24 hours'
        },
        rewardTriggerRule: rule.rewardTriggerRule || '',
        rewardTrigger: rule.rewardTrigger || {
          condition: '',
          reward: ''
        },
        enabled: rule.enabled !== undefined ? rule.enabled : true,
        override: rule.override !== undefined ? rule.override : false,
        overrideByGameId: rule.overrideByGameId || '',
        gameId: rule.gameId || '',
        gameName: rule.gameName || ''
      });
    } else {
      // Reset form for new rule
      setFormData({
        name: '',
        description: '',
        unlockCondition: '',
        dependencies: [{ fromTask: '', toTask: '' }],
        lockType: 'Sequential',
        minimumEventToUnlock: '',
        eventThreshold: {
          type: 'Survey Completions',
          count: 1,
          timeWindow: '24 hours'
        },
        rewardTriggerRule: '',
        rewardTrigger: {
          condition: '',
          reward: ''
        },
        enabled: true,
        override: false,
        overrideByGameId: '',
        gameId: '',
        gameName: ''
      });
    }
    setErrors({});
  }, [rule, isOpen]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleGameChange = (gameId) => {
    const selectedGame = mockGames.find(g => g.id === gameId);
    setFormData(prev => ({
      ...prev,
      gameId,
      gameName: selectedGame ? selectedGame.name : ''
    }));
  };

  const handleEventThresholdChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      eventThreshold: {
        ...prev.eventThreshold,
        [field]: field === 'count' ? parseInt(value) || 1 : value
      }
    }));
  };

  const handleRewardTriggerChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      rewardTrigger: {
        ...prev.rewardTrigger,
        [field]: value
      }
    }));
  };

  const handleDependencyChange = (index, field, value) => {
    const newDependencies = [...formData.dependencies];
    newDependencies[index][field] = value;
    setFormData(prev => ({
      ...prev,
      dependencies: newDependencies
    }));
  };

  const addDependency = () => {
    setFormData(prev => ({
      ...prev,
      dependencies: [...prev.dependencies, { fromTask: '', toTask: '' }]
    }));
  };

  const removeDependency = (index) => {
    if (formData.dependencies.length > 1) {
      const newDependencies = formData.dependencies.filter((_, i) => i !== index);
      setFormData(prev => ({
        ...prev,
        dependencies: newDependencies
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Rule name is required';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    if (!formData.unlockCondition.trim()) {
      newErrors.unlockCondition = 'Unlock condition is required';
    }
    if (!formData.minimumEventToUnlock.trim()) {
      newErrors.minimumEventToUnlock = 'Minimum event to unlock is required';
    }
    if (!formData.rewardTriggerRule.trim()) {
      newErrors.rewardTriggerRule = 'Reward trigger rule is required';
    }
    if (!formData.gameId) {
      newErrors.gameId = 'Game selection is required';
    }
    if (formData.dependencies.some(dep => !dep.fromTask.trim() || !dep.toTask.trim())) {
      newErrors.dependencies = 'All dependencies must have both from and to tasks';
    }
    if (formData.eventThreshold.count < 1) {
      newErrors.eventThreshold = 'Event count must be at least 1';
    }
    if (!formData.rewardTrigger.condition.trim()) {
      newErrors.rewardCondition = 'Reward trigger condition is required';
    }
    if (!formData.rewardTrigger.reward.trim()) {
      newErrors.rewardValue = 'Reward value is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      onSave({
        id: rule?.id || `PROG${Date.now()}`,
        ...formData,
        affectedUsers: rule?.affectedUsers || 0,
        completionRate: rule?.completionRate || '0%',
        avgUnlockTime: rule?.avgUnlockTime || '0 minutes',
        lastModified: new Date().toISOString().split('T')[0],
        createdBy: rule?.createdBy || new Date().toISOString().replace('T', ' ').substring(0, 19)
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full z-50">
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                {rule ? 'Edit Progression Rule' : 'Create New Progression Rule'}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Basic Information */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Basic Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.name ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                    }`}
                    placeholder="Enter rule name"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Associated Game *
                  </label>
                  <select
                    value={formData.gameId}
                    onChange={(e) => handleGameChange(e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.gameId ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                    }`}
                  >
                    <option value="">Select Game</option>
                    {mockGames.map(game => (
                      <option key={game.id} value={game.id}>{game.name}</option>
                    ))}
                  </select>
                  {errors.gameId && <p className="mt-1 text-xs text-red-600">{errors.gameId}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.description ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                    }`}
                    placeholder="Describe the progression rule and its purpose"
                  />
                  {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unlock Condition *
                  </label>
                  <input
                    type="text"
                    value={formData.unlockCondition}
                    onChange={(e) => handleInputChange('unlockCondition', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.unlockCondition ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                    }`}
                    placeholder="e.g., Complete 2 surveys in sequence"
                  />
                  {errors.unlockCondition && <p className="mt-1 text-xs text-red-600">{errors.unlockCondition}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Event to Unlock *
                  </label>
                  <input
                    type="text"
                    value={formData.minimumEventToUnlock}
                    onChange={(e) => handleInputChange('minimumEventToUnlock', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.minimumEventToUnlock ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                    }`}
                    placeholder="e.g., 2 Survey Completions in 24 hours"
                  />
                  {errors.minimumEventToUnlock && <p className="mt-1 text-xs text-red-600">{errors.minimumEventToUnlock}</p>}
                </div>
              </div>
            </div>

            {/* Task Dependencies */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Task Dependencies</h4>
              <div className="space-y-4">
                {formData.dependencies.map((dependency, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">From Task</label>
                      <select
                        value={dependency.fromTask}
                        onChange={(e) => handleDependencyChange(index, 'fromTask', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Select task</option>
                        {sampleTasks.map(task => (
                          <option key={task} value={task}>{task}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-shrink-0 pt-6">
                      <LinkIcon className="h-5 w-5 text-gray-400" />
                    </div>

                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">To Task</label>
                      <select
                        value={dependency.toTask}
                        onChange={(e) => handleDependencyChange(index, 'toTask', e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Select task</option>
                        {sampleTasks.map(task => (
                          <option key={task} value={task}>{task}</option>
                        ))}
                      </select>
                    </div>

                    {formData.dependencies.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDependency(index)}
                        className="flex-shrink-0 p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md mt-6"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addDependency}
                  className="flex items-center text-sm text-emerald-600 hover:text-emerald-800"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Add Dependency
                </button>
                {errors.dependencies && <p className="mt-1 text-xs text-red-600">{errors.dependencies}</p>}
              </div>
            </div>

            {/* Lock Configuration */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Lock Configuration</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lock Type *
                  </label>
                  <select
                    value={formData.lockType}
                    onChange={(e) => handleInputChange('lockType', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {lockTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {formData.lockType === 'Sequential' && 'Tasks unlock in order after completion'}
                    {formData.lockType === 'Timed' && 'Tasks unlock after a time delay'}
                    {formData.lockType === 'Manual' && 'Tasks require manual admin approval to unlock'}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={formData.enabled}
                      onChange={(e) => handleInputChange('enabled', e.target.checked)}
                      className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                    />
                    <label htmlFor="enabled" className="ml-2 text-sm text-gray-700">
                      Enable this rule immediately
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="override"
                      checked={formData.override}
                      onChange={(e) => handleInputChange('override', e.target.checked)}
                      className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                    />
                    <label htmlFor="override" className="ml-2 text-sm text-gray-700">
                      Override default behavior
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Override Configuration */}
            {formData.override && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-4">Override Configuration</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Override by Game ID
                  </label>
                  <select
                    value={formData.overrideByGameId}
                    onChange={(e) => handleInputChange('overrideByGameId', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select Game to Override</option>
                    {mockGames.map(game => (
                      <option key={game.id} value={game.id}>{game.name} ({game.id})</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select a specific game to override its default progression rules
                  </p>
                </div>
              </div>
            )}

            {/* Event Threshold */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Event Threshold</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Type *
                  </label>
                  <select
                    value={formData.eventThreshold.type}
                    onChange={(e) => handleEventThresholdChange('type', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {eventTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Required Count *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.eventThreshold.count}
                    onChange={(e) => handleEventThresholdChange('count', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.eventThreshold ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                    }`}
                  />
                  {errors.eventThreshold && <p className="mt-1 text-xs text-red-600">{errors.eventThreshold}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time Window *
                  </label>
                  <select
                    value={formData.eventThreshold.timeWindow}
                    onChange={(e) => handleEventThresholdChange('timeWindow', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {timeWindows.map(window => (
                      <option key={window} value={window}>{window}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Reward Trigger */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Reward Trigger</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reward Trigger Rule *
                  </label>
                  <input
                    type="text"
                    value={formData.rewardTriggerRule}
                    onChange={(e) => handleInputChange('rewardTriggerRule', e.target.value)}
                    className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors.rewardTriggerRule ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                    }`}
                    placeholder="e.g., Complete download within 10 minutes"
                  />
                  {errors.rewardTriggerRule && <p className="mt-1 text-xs text-red-600">{errors.rewardTriggerRule}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Trigger Condition *
                    </label>
                    <input
                      type="text"
                      value={formData.rewardTrigger.condition}
                      onChange={(e) => handleRewardTriggerChange('condition', e.target.value)}
                      className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                        errors.rewardCondition ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                      }`}
                      placeholder="e.g., Complete download within 10 minutes"
                    />
                    {errors.rewardCondition && <p className="mt-1 text-xs text-red-600">{errors.rewardCondition}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reward Value *
                    </label>
                    <input
                      type="text"
                      value={formData.rewardTrigger.reward}
                      onChange={(e) => handleRewardTriggerChange('reward', e.target.value)}
                      className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                        errors.rewardValue ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-emerald-500'
                      }`}
                      placeholder="e.g., 250 Coins + 500 XP"
                    />
                    {errors.rewardValue && <p className="mt-1 text-xs text-red-600">{errors.rewardValue}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Rule Preview</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Rule:</span>
                  <span className="text-gray-900 font-medium">{formData.name || 'Untitled Rule'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Game:</span>
                  <span className="text-gray-900">{formData.gameName || 'No game selected'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Unlock Condition:</span>
                  <span className="text-gray-900">{formData.unlockCondition || 'Not specified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Lock Type:</span>
                  <span className="text-gray-900">{formData.lockType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Min Event to Unlock:</span>
                  <span className="text-gray-900">{formData.minimumEventToUnlock || 'Not specified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Reward Trigger Rule:</span>
                  <span className="text-gray-900">{formData.rewardTriggerRule || 'Not specified'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Dependencies:</span>
                  <span className="text-gray-900">{formData.dependencies.length} task chain(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Override:</span>
                  <span className={`font-medium ${formData.override ? 'text-orange-600' : 'text-gray-600'}`}>
                    {formData.override ? 'Yes' : 'No'}
                  </span>
                </div>
                {formData.override && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Override by Game ID:</span>
                    <span className="text-gray-900">{formData.overrideByGameId || 'Not selected'}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-medium ${formData.enabled ? 'text-green-600' : 'text-red-600'}`}>
                    {formData.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
              >
                {rule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}