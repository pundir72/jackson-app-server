'use client';

import { useState } from 'react';
import { ArrowLeftIcon, ClockIcon, GiftIcon, UserGroupIcon, PlayIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

const initialWelcomeBonusSettings = {
  unlockWindow: { value: 24, unit: 'hours' },
  completionDeadline: { value: 7, unit: 'days' },
  overrideByGameId: false,
  selectedGames: [],
  overrideByXP: false,
  xpThreshold: 200,
  enableRule: true
};

const initialGameplaySettings = {
  firstTimeGameLimit: 2,
  repeatUserGameLimit: 5,
  downloadTimerLimit: { value: 24, unit: 'hours' },
  minimumTaskTime: 5,
  maximumTaskTime: 60,
  taskUnlockRule: ['Sequential', 'Time-based'],
  minimumEventThreshold: 3,
  enableDynamicTaskFlow: true
};

const timeUnits = ['minutes', 'hours', 'days'];
const unlockRuleOptions = [
  'Sequential',
  'Time-based',
  'Performance-based',
  'Event-triggered',
  'Manual approval',
  'Tier-restricted'
];

const availableGames = [
  { id: 'lords-mobile', name: 'Lords Mobile' },
  { id: 'coin-tycoon', name: 'Coin Tycoon' },
  { id: 'puzzle-quest', name: 'Puzzle Quest' },
  { id: 'battle-arena', name: 'Battle Arena' }
];

export default function WelcomeBonusTimerRules() {
  const [activeTab, setActiveTab] = useState('welcome-bonus');
  const [welcomeBonusSettings, setWelcomeBonusSettings] = useState(initialWelcomeBonusSettings);
  const [gameplaySettings, setGameplaySettings] = useState(initialGameplaySettings);
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState('2024-03-15T10:30:00Z');

  const handleWelcomeBonusChange = (key, value) => {
    setWelcomeBonusSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setIsModified(true);
  };

  const handleGameplayChange = (key, value) => {
    setGameplaySettings(prev => ({
      ...prev,
      [key]: value
    }));
    setIsModified(true);
  };

  const handleWelcomeBonusTimerChange = (field, value) => {
    setWelcomeBonusSettings(prev => ({
      ...prev,
      unlockWindow: {
        ...prev.unlockWindow,
        [field]: value
      }
    }));
    setIsModified(true);
  };

  const handleCompletionDeadlineChange = (field, value) => {
    setWelcomeBonusSettings(prev => ({
      ...prev,
      completionDeadline: {
        ...prev.completionDeadline,
        [field]: value
      }
    }));
    setIsModified(true);
  };

  const handleGameplayTimerChange = (field, value) => {
    setGameplaySettings(prev => ({
      ...prev,
      downloadTimerLimit: {
        ...prev.downloadTimerLimit,
        [field]: value
      }
    }));
    setIsModified(true);
  };

  const handleUnlockRuleToggle = (rule) => {
    setGameplaySettings(prev => {
      const currentRules = prev.taskUnlockRule;
      const updatedRules = currentRules.includes(rule)
        ? currentRules.filter(r => r !== rule)
        : [...currentRules, rule];

      return {
        ...prev,
        taskUnlockRule: updatedRules
      };
    });
    setIsModified(true);
  };

  const handleGameSelection = (gameId) => {
    setWelcomeBonusSettings(prev => {
      const currentGames = prev.selectedGames;
      const updatedGames = currentGames.includes(gameId)
        ? currentGames.filter(id => id !== gameId)
        : [...currentGames, gameId];

      return {
        ...prev,
        selectedGames: updatedGames
      };
    });
    setIsModified(true);
  };

  const validateWelcomeBonusSettings = () => {
    const unlockInHours = welcomeBonusSettings.unlockWindow.unit === 'hours'
      ? welcomeBonusSettings.unlockWindow.value
      : welcomeBonusSettings.unlockWindow.value * 24;

    const deadlineInHours = welcomeBonusSettings.completionDeadline.unit === 'hours'
      ? welcomeBonusSettings.completionDeadline.value
      : welcomeBonusSettings.completionDeadline.value * 24;

    return deadlineInHours >= unlockInHours;
  };

  const handleSaveSettings = async () => {
    if (!validateWelcomeBonusSettings()) {
      alert('Completion deadline must be greater than or equal to unlock window');
      return;
    }

    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSaving(false);
    setIsModified(false);
    setLastSaved(new Date().toISOString());
  };

  const handleResetSettings = () => {
    if (confirm('Are you sure you want to reset all settings to default values?')) {
      setWelcomeBonusSettings(initialWelcomeBonusSettings);
      setGameplaySettings(initialGameplaySettings);
      setIsModified(true);
    }
  };

  const formatLastSaved = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const tabs = [
    {
      id: 'welcome-bonus',
      name: 'Welcome Bonus Config',
      icon: GiftIcon,
      description: 'Configure welcome bonus timer and completion rules'
    },
    {
      id: 'gameplay-logic',
      name: 'Gameplay Logic Settings',
      icon: Cog6ToothIcon,
      description: 'Global game visibility and progression settings'
    }
  ];

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
                  Welcome Bonus Timer Rules
                </h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Configure welcome bonus timing and global gameplay logic settings
              </p>
              {lastSaved && (
                <p className="mt-1 text-xs text-gray-500">
                  Last saved: {formatLastSaved(lastSaved)}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleResetSettings}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Reset to Default
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={!isModified || isSaving}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                  !isModified || isSaving
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'welcome-bonus' && (
            <div className="space-y-8">
              {/* Welcome Bonus Config Section */}
              <div>
                <div className="flex items-center mb-6">
                  <GiftIcon className="h-5 w-5 text-indigo-600 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">Welcome Bonus Configuration</h3>
                </div>

                {/* Enable Rule Toggle */}
                <div className="mb-6">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Enable Welcome Bonus Timer Rules</h4>
                      <p className="text-sm text-gray-500">
                        Activate timer-based welcome bonus unlock and completion logic
                      </p>
                    </div>
                    <button
                      onClick={() => handleWelcomeBonusChange('enableRule', !welcomeBonusSettings.enableRule)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        welcomeBonusSettings.enableRule ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          welcomeBonusSettings.enableRule ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Timing Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Welcome Bonus Unlock Window
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        min="1"
                        value={welcomeBonusSettings.unlockWindow.value}
                        onChange={(e) => handleWelcomeBonusTimerChange('value', parseInt(e.target.value) || 1)}
                        className="flex-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        disabled={!welcomeBonusSettings.enableRule}
                      />
                      <select
                        value={welcomeBonusSettings.unlockWindow.unit}
                        onChange={(e) => handleWelcomeBonusTimerChange('unit', e.target.value)}
                        className="border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        disabled={!welcomeBonusSettings.enableRule}
                      >
                        {timeUnits.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Time window after first game download for bonus to appear
                    </p>
                  </div>

                  {/* PHASE 2: Completion Deadline temporarily hidden */}
                  {/* <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bonus Completion Deadline
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        min="1"
                        value={welcomeBonusSettings.completionDeadline.value}
                        onChange={(e) => handleCompletionDeadlineChange('value', parseInt(e.target.value) || 1)}
                        className="flex-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        disabled={!welcomeBonusSettings.enableRule}
                      />
                      <select
                        value={welcomeBonusSettings.completionDeadline.unit}
                        onChange={(e) => handleCompletionDeadlineChange('unit', e.target.value)}
                        className="border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        disabled={!welcomeBonusSettings.enableRule}
                      >
                        {timeUnits.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Maximum time allowed to complete bonus tasks after unlock
                    </p>
                  </div> */}
                </div>

                {/* PHASE 2: Override Settings temporarily hidden */}
                {/* <div className="space-y-6">
                  <h4 className="text-sm font-medium text-gray-900">Override Settings</h4>

                  <div>
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="override-game"
                        checked={welcomeBonusSettings.overrideByGameId}
                        onChange={(e) => handleWelcomeBonusChange('overrideByGameId', e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        disabled={!welcomeBonusSettings.enableRule}
                      />
                      <label htmlFor="override-game" className="ml-2 text-sm font-medium text-gray-700">
                        Override by Game ID
                      </label>
                    </div>
                    {welcomeBonusSettings.overrideByGameId && welcomeBonusSettings.enableRule && (
                      <div className="ml-6">
                        <label className="block text-sm text-gray-600 mb-2">Select Games for Override:</label>
                        <div className="grid grid-cols-2 gap-2">
                          {availableGames.map(game => (
                            <label key={game.id} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={welcomeBonusSettings.selectedGames.includes(game.id)}
                                onChange={() => handleGameSelection(game.id)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">{game.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="override-xp"
                        checked={welcomeBonusSettings.overrideByXP}
                        onChange={(e) => handleWelcomeBonusChange('overrideByXP', e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        disabled={!welcomeBonusSettings.enableRule}
                      />
                      <label htmlFor="override-xp" className="ml-2 text-sm font-medium text-gray-700">
                        Override by XP Threshold
                      </label>
                    </div>
                    {welcomeBonusSettings.overrideByXP && welcomeBonusSettings.enableRule && (
                      <div className="ml-6">
                        <label className="block text-sm text-gray-600 mb-2">XP Threshold:</label>
                        <div className="relative max-w-xs">
                          <input
                            type="number"
                            min="0"
                            value={welcomeBonusSettings.xpThreshold}
                            onChange={(e) => handleWelcomeBonusChange('xpThreshold', parseInt(e.target.value) || 0)}
                            className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-12"
                          />
                          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">XP</span>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Apply custom timing for users above this XP level
                        </p>
                      </div>
                    )}
                  </div>
                </div> */}

                {/* Validation Rules Display */}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Validation Rules</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Completion deadline must be greater than or equal to unlock window</li>
                    <li>• Unlock window minimum: 1 hour, maximum: 168 hours (7 days)</li>
                    <li>• Completion deadline minimum: 1 hour, maximum: 720 hours (30 days)</li>
                    <li>• XP threshold must be a positive number</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gameplay-logic' && (
            <div className="space-y-8">
              {/* Game Visibility Settings */}
              <div>
                <div className="flex items-center mb-4">
                  <UserGroupIcon className="h-5 w-5 text-indigo-600 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">Game Visibility Settings</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First-Time Game Limit
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={gameplaySettings.firstTimeGameLimit}
                        onChange={(e) => handleGameplayChange('firstTimeGameLimit', parseInt(e.target.value) || 0)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-16"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 sm:text-sm">games</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Maximum games shown to new users on first app open
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Repeat-User Game Limit
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={gameplaySettings.repeatUserGameLimit}
                        onChange={(e) => handleGameplayChange('repeatUserGameLimit', parseInt(e.target.value) || 0)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-16"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 sm:text-sm">games</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Maximum games shown to returning users
                    </p>
                  </div>
                </div>
              </div>

              {/* Timing Settings */}
              <div>
                <div className="flex items-center mb-4">
                  <ClockIcon className="h-5 w-5 text-indigo-600 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">Timing Settings</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Download Timer Limit
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        min="1"
                        value={gameplaySettings.downloadTimerLimit.value}
                        onChange={(e) => handleGameplayTimerChange('value', parseInt(e.target.value) || 1)}
                        className="flex-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                      <select
                        value={gameplaySettings.downloadTimerLimit.unit}
                        onChange={(e) => handleGameplayTimerChange('unit', e.target.value)}
                        className="border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        {timeUnits.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Maximum time allowed for download completion
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Task Time
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={gameplaySettings.minimumTaskTime}
                        onChange={(e) => handleGameplayChange('minimumTaskTime', parseInt(e.target.value) || 1)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-16"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 sm:text-sm">mins</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Minimum time required to complete a task
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Maximum Task Time
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="10"
                        max="180"
                        value={gameplaySettings.maximumTaskTime}
                        onChange={(e) => handleGameplayChange('maximumTaskTime', parseInt(e.target.value) || 10)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-16"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 sm:text-sm">mins</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Maximum time allowed to complete a task
                    </p>
                  </div>
                </div>
              </div>

              {/* Task Logic Settings */}
              <div>
                <div className="flex items-center mb-4">
                  <Cog6ToothIcon className="h-5 w-5 text-indigo-600 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">Task Logic Settings</h3>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Task Unlock Rules (Multi-select)
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {unlockRuleOptions.map(rule => (
                        <label key={rule} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={gameplaySettings.taskUnlockRule.includes(rule)}
                            onChange={() => handleUnlockRuleToggle(rule)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{rule}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Select the unlock mechanisms available for task progression
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Event Threshold
                    </label>
                    <div className="relative max-w-xs">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={gameplaySettings.minimumEventThreshold}
                        onChange={(e) => handleGameplayChange('minimumEventThreshold', parseInt(e.target.value) || 1)}
                        className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm pr-20"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 sm:text-sm">events</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Minimum number of events required to trigger unlock
                    </p>
                  </div>
                </div>
              </div>

              {/* Flow Control */}
              <div>
                <div className="flex items-center mb-4">
                  <PlayIcon className="h-5 w-5 text-indigo-600 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">Flow Control</h3>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Enable Dynamic Task Flow</h4>
                    <p className="text-sm text-gray-500">
                      Allow tasks to be dynamically unlocked based on user behavior and conditions
                    </p>
                  </div>
                  <button
                    onClick={() => handleGameplayChange('enableDynamicTaskFlow', !gameplaySettings.enableDynamicTaskFlow)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      gameplaySettings.enableDynamicTaskFlow ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        gameplaySettings.enableDynamicTaskFlow ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Settings Summary */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Current Configuration Summary</h4>

          {activeTab === 'welcome-bonus' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Rule Status:</span>
                <span className={`ml-2 font-medium ${welcomeBonusSettings.enableRule ? 'text-green-600' : 'text-red-600'}`}>
                  {welcomeBonusSettings.enableRule ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Unlock Window:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {welcomeBonusSettings.unlockWindow.value} {welcomeBonusSettings.unlockWindow.unit}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Completion Deadline:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {welcomeBonusSettings.completionDeadline.value} {welcomeBonusSettings.completionDeadline.unit}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Overrides:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {[
                    welcomeBonusSettings.overrideByGameId && 'Game ID',
                    welcomeBonusSettings.overrideByXP && 'XP Tier'
                  ].filter(Boolean).join(', ') || 'None'}
                </span>
              </div>
            </div>
          )}

          {activeTab === 'gameplay-logic' && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-2">
                <div>
                  <span className="text-gray-600">New Users:</span>
                  <span className="ml-2 font-medium text-gray-900">{gameplaySettings.firstTimeGameLimit} games max</span>
                </div>
                <div>
                  <span className="text-gray-600">Returning Users:</span>
                  <span className="ml-2 font-medium text-gray-900">{gameplaySettings.repeatUserGameLimit} games max</span>
                </div>
                <div>
                  <span className="text-gray-600">Download Limit:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {gameplaySettings.downloadTimerLimit.value} {gameplaySettings.downloadTimerLimit.unit}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Task Duration:</span>
                  <span className="ml-2 font-medium text-gray-900">
                    {gameplaySettings.minimumTaskTime}-{gameplaySettings.maximumTaskTime} mins
                  </span>
                </div>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">Unlock Rules:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {gameplaySettings.taskUnlockRule.join(', ')} ({gameplaySettings.taskUnlockRule.length} active)
                </span>
              </div>
              <div className="mt-2 text-sm">
                <span className="text-gray-600">Dynamic Flow:</span>
                <span className={`ml-2 font-medium ${gameplaySettings.enableDynamicTaskFlow ? 'text-green-600' : 'text-red-600'}`}>
                  {gameplaySettings.enableDynamicTaskFlow ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Unsaved Changes Banner */}
        {isModified && (
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-amber-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-amber-800">You have unsaved changes</span>
              </div>
              <button
                onClick={handleSaveSettings}
                className="text-sm text-amber-800 hover:text-amber-900 font-medium underline"
              >
                Save Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}