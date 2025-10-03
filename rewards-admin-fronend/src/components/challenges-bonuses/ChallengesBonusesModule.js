'use client';

import React, { useState, useEffect } from 'react';
import { CalendarDaysIcon, ListBulletIcon, ChartBarIcon, GiftIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import DailyChallengeListView from './DailyChallengeListView';
import DailyChallengeCalendarView from './DailyChallengeCalendarView';
import XPMultiplierSetup from './XPMultiplierSetup';
import BonusDayConfiguration from './BonusDayConfiguration';
import ChallengePauseRules from './ChallengePauseRules';
import AddEditChallengeModal from './modals/AddEditChallengeModal';
import DeleteConfirmationModal from './modals/DeleteConfirmationModal';
import { useChallengesBonuses } from '../../hooks/useChallengesBonuses';

const VIEW_MODES = {
  LIST: 'list',
  CALENDAR: 'calendar',
  XP_MULTIPLIER: 'xp-multiplier',
  BONUS_DAY: 'bonus-day',
  PAUSE_RULES: 'pause-rules'
};

export default function ChallengesBonusesModule() {
  const [activeView, setActiveView] = useState(VIEW_MODES.LIST);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState(null);
  const [deletingChallenge, setDeletingChallenge] = useState(null);

  const {
    challenges,
    multipliers,
    bonusDays,
    pauseRules,
    loading,
    error,
    addChallenge,
    updateChallenge,
    deleteChallenge,
    toggleChallengeVisibility,
    addMultiplier,
    updateMultiplier,
    deleteMultiplier,
    toggleMultiplierActive,
    addBonusDay,
    updateBonusDay,
    deleteBonusDay,
    addPauseRule,
    updatePauseRule,
    deletePauseRule,
    refreshData
  } = useChallengesBonuses();

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleAddChallenge = () => {
    setEditingChallenge(null);
    setShowChallengeModal(true);
  };

  const handleEditChallenge = (challenge) => {
    setEditingChallenge(challenge);
    setShowChallengeModal(true);
  };

  const handleDeleteChallenge = (challenge) => {
    setDeletingChallenge(challenge);
    setShowDeleteModal(true);
  };

  const handleSaveChallenge = async (challengeData) => {
    try {
      if (editingChallenge) {
        await updateChallenge(editingChallenge.id, challengeData);
      } else {
        await addChallenge(challengeData);
      }
      setShowChallengeModal(false);
      setEditingChallenge(null);
    } catch (error) {
      console.error('Error saving challenge:', error);
      throw error;
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteChallenge(deletingChallenge.id);
      setShowDeleteModal(false);
      setDeletingChallenge(null);
    } catch (error) {
      console.error('Error deleting challenge:', error);
      throw error;
    }
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
  };

  const getActiveViewComponent = () => {
    switch (activeView) {
      case VIEW_MODES.LIST:
        return (
          <DailyChallengeListView
            challenges={challenges}
            onAddChallenge={handleAddChallenge}
            onUpdateChallenge={handleEditChallenge}
            onDeleteChallenge={handleDeleteChallenge}
            onToggleVisibility={toggleChallengeVisibility}
            loading={loading}
          />
        );
      case VIEW_MODES.CALENDAR:
        return (
          <DailyChallengeCalendarView
            challenges={challenges}
            onAddChallenge={handleAddChallenge}
            onUpdateChallenge={handleEditChallenge}
            onDeleteChallenge={handleDeleteChallenge}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            loading={loading}
          />
        );
      case VIEW_MODES.XP_MULTIPLIER:
        return (
          <XPMultiplierSetup
            multipliers={multipliers}
            onAddMultiplier={addMultiplier}
            onUpdateMultiplier={updateMultiplier}
            onDeleteMultiplier={deleteMultiplier}
            onToggleActive={toggleMultiplierActive}
            loading={loading}
          />
        );
      case VIEW_MODES.BONUS_DAY:
        return (
          <BonusDayConfiguration
            bonusDays={bonusDays}
            onAddBonusDay={addBonusDay}
            onUpdateBonusDay={updateBonusDay}
            onDeleteBonusDay={deleteBonusDay}
            loading={loading}
          />
        );
      case VIEW_MODES.PAUSE_RULES:
        return (
          <ChallengePauseRules
            pauseRules={pauseRules}
            onAddPauseRule={addPauseRule}
            onUpdatePauseRule={updatePauseRule}
            onDeletePauseRule={deletePauseRule}
            loading={loading}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Daily Challenges & Bonuses</h1>
              <p className="mt-2 text-sm text-gray-600">
                Manage daily engagement challenges, XP multipliers, and reward structures for enhanced user retention
              </p>
            </div>
            
            {/* View Toggle */}
            <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveView(VIEW_MODES.LIST)}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  activeView === VIEW_MODES.LIST
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <ListBulletIcon className="h-4 w-4 mr-2" />
                List View
              </button>
              <button
                onClick={() => setActiveView(VIEW_MODES.CALENDAR)}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  activeView === VIEW_MODES.CALENDAR
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <CalendarDaysIcon className="h-4 w-4 mr-2" />
                Calendar View
              </button>
              <button
                onClick={() => setActiveView(VIEW_MODES.XP_MULTIPLIER)}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  activeView === VIEW_MODES.XP_MULTIPLIER
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <ChartBarIcon className="h-4 w-4 mr-2" />
                XP Multipliers
              </button>
              <button
                onClick={() => setActiveView(VIEW_MODES.BONUS_DAY)}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  activeView === VIEW_MODES.BONUS_DAY
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <GiftIcon className="h-4 w-4 mr-2" />
                Bonus Days
              </button>
              {/* <button
                onClick={() => setActiveView(VIEW_MODES.PAUSE_RULES)}
                className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  activeView === VIEW_MODES.PAUSE_RULES
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <ShieldCheckIcon className="h-4 w-4 mr-2" />
                Pause Rules
              </button> */}
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="min-h-[600px]">
        {getActiveViewComponent()}
      </div>

      {/* Modals */}
      <AddEditChallengeModal
        isOpen={showChallengeModal}
        onClose={() => {
          setShowChallengeModal(false);
          setEditingChallenge(null);
        }}
        onSave={handleSaveChallenge}
        challenge={editingChallenge}
        selectedDate={selectedDate}
        existingChallenges={challenges}
        loading={loading}
      />

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletingChallenge(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Challenge"
        message={deletingChallenge ? `Are you sure you want to delete "${deletingChallenge.title}"? This action cannot be undone.` : ''}
        confirmButtonText="Delete Challenge"
        loading={loading}
      />
    </div>
  );
}