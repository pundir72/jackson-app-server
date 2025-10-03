'use client';

import React, { useState, useEffect } from 'react';
import PrizePoolConfiguration from './PrizePoolConfiguration';
import SpinSettingsConfiguration from './SpinSettingsConfiguration';
import { useSpinWheel } from '../../hooks/useSpinWheel';

export default function SpinWheelManagerModule() {
  const [activeTab, setActiveTab] = useState('prize-pool');
  const {
    rewards,
    settings,
    loading,
    error,
    fetchRewards,
    fetchSettings,
    addReward,
    updateReward,
    deleteReward,
    updateSettings,
    reorderRewards
  } = useSpinWheel();

  useEffect(() => {
    fetchRewards();
    fetchSettings();
  }, []);

  const tabs = [
    { id: 'prize-pool', label: 'Prize Pool Configuration', icon: '🎁' },
    { id: 'settings', label: 'Spin Settings', icon: '⚙️' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error Loading Spin Wheel Data</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Spin Wheel Manager</h1>
              <p className="mt-1 text-sm text-gray-600">
                Configure and manage spinning wheels, rewards, and settings for the Jackson Rewards App
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                Live
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'prize-pool' && (
          <PrizePoolConfiguration
            rewards={rewards}
            onAddReward={addReward}
            onUpdateReward={updateReward}
            onDeleteReward={deleteReward}
            onReorderRewards={reorderRewards}
            loading={loading}
          />
        )}
        
        {activeTab === 'settings' && (
          <SpinSettingsConfiguration
            settings={settings}
            onUpdateSettings={updateSettings}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}