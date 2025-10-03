'use client';

import { useState, useCallback } from 'react';
import { challengesBonusesAPI } from '../data/challengesBonuses';

export function useChallengesBonuses() {
  const [challenges, setChallenges] = useState([]);
  const [multipliers, setMultipliers] = useState([]);
  const [bonusDays, setBonusDays] = useState([]);
  const [pauseRules, setPauseRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Refresh all data
  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [challengesData, multipliersData, bonusDaysData, pauseRulesData] = await Promise.all([
        challengesBonusesAPI.getChallenges(),
        challengesBonusesAPI.getMultipliers(),
        challengesBonusesAPI.getBonusDays(),
        challengesBonusesAPI.getPauseRules()
      ]);

      setChallenges(challengesData);
      setMultipliers(multipliersData);
      setBonusDays(bonusDaysData);
      setPauseRules(pauseRulesData);
    } catch (err) {
      setError('Failed to load data. Please try again.');
      console.error('Error refreshing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Challenge operations
  const addChallenge = useCallback(async (challengeData) => {
    setLoading(true);
    setError(null);
    
    try {
      const newChallenge = await challengesBonusesAPI.createChallenge(challengeData);
      setChallenges(prev => [...prev, newChallenge]);
      return newChallenge;
    } catch (err) {
      setError('Failed to create challenge. Please try again.');
      console.error('Error creating challenge:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateChallenge = useCallback(async (id, challengeData) => {
    setLoading(true);
    setError(null);
    
    try {
      const updatedChallenge = await challengesBonusesAPI.updateChallenge(id, challengeData);
      setChallenges(prev => 
        prev.map(challenge => 
          challenge.id === id ? updatedChallenge : challenge
        )
      );
      return updatedChallenge;
    } catch (err) {
      setError('Failed to update challenge. Please try again.');
      console.error('Error updating challenge:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteChallenge = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    
    try {
      await challengesBonusesAPI.deleteChallenge(id);
      setChallenges(prev => prev.filter(challenge => challenge.id !== id));
    } catch (err) {
      setError('Failed to delete challenge. Please try again.');
      console.error('Error deleting challenge:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleChallengeVisibility = useCallback(async (id, visibility) => {
    setLoading(true);
    setError(null);
    
    try {
      const updatedChallenge = await challengesBonusesAPI.toggleChallengeVisibility(id, visibility);
      setChallenges(prev => 
        prev.map(challenge => 
          challenge.id === id ? updatedChallenge : challenge
        )
      );
      return updatedChallenge;
    } catch (err) {
      setError('Failed to update challenge visibility. Please try again.');
      console.error('Error toggling challenge visibility:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Multiplier operations
  const addMultiplier = useCallback(async (multiplierData) => {
    setLoading(true);
    setError(null);
    
    try {
      const newMultiplier = await challengesBonusesAPI.createMultiplier(multiplierData);
      setMultipliers(prev => [...prev, newMultiplier]);
      return newMultiplier;
    } catch (err) {
      setError('Failed to create multiplier. Please try again.');
      console.error('Error creating multiplier:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateMultiplier = useCallback(async (id, multiplierData) => {
    setLoading(true);
    setError(null);
    
    try {
      const updatedMultiplier = await challengesBonusesAPI.updateMultiplier(id, multiplierData);
      setMultipliers(prev => 
        prev.map(multiplier => 
          multiplier.id === id ? updatedMultiplier : multiplier
        )
      );
      return updatedMultiplier;
    } catch (err) {
      setError('Failed to update multiplier. Please try again.');
      console.error('Error updating multiplier:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteMultiplier = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    
    try {
      await challengesBonusesAPI.deleteMultiplier(id);
      setMultipliers(prev => prev.filter(multiplier => multiplier.id !== id));
    } catch (err) {
      setError('Failed to delete multiplier. Please try again.');
      console.error('Error deleting multiplier:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleMultiplierActive = useCallback(async (id, active) => {
    setLoading(true);
    setError(null);
    
    try {
      const updatedMultiplier = await challengesBonusesAPI.updateMultiplier(id, { active });
      setMultipliers(prev => 
        prev.map(multiplier => 
          multiplier.id === id ? updatedMultiplier : multiplier
        )
      );
      return updatedMultiplier;
    } catch (err) {
      setError('Failed to update multiplier status. Please try again.');
      console.error('Error toggling multiplier active status:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Bonus day operations
  const addBonusDay = useCallback(async (bonusDayData) => {
    setLoading(true);
    setError(null);

    try {
      const newBonusDay = await challengesBonusesAPI.createBonusDay(bonusDayData);
      setBonusDays(prev => [...prev, newBonusDay]);
      return newBonusDay;
    } catch (err) {
      setError('Failed to create bonus day. Please try again.');
      console.error('Error creating bonus day:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateBonusDay = useCallback(async (id, bonusDayData) => {
    setLoading(true);
    setError(null);

    try {
      const updatedBonusDay = await challengesBonusesAPI.updateBonusDay(id, bonusDayData);
      setBonusDays(prev =>
        prev.map(bonusDay =>
          bonusDay.id === id ? updatedBonusDay : bonusDay
        )
      );
      return updatedBonusDay;
    } catch (err) {
      setError('Failed to update bonus day. Please try again.');
      console.error('Error updating bonus day:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBonusDay = useCallback(async (id) => {
    setLoading(true);
    setError(null);

    try {
      await challengesBonusesAPI.deleteBonusDay(id);
      setBonusDays(prev => prev.filter(bonusDay => bonusDay.id !== id));
    } catch (err) {
      setError('Failed to delete bonus day. Please try again.');
      console.error('Error deleting bonus day:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Pause rule operations
  const addPauseRule = useCallback(async (pauseRuleData) => {
    setLoading(true);
    setError(null);

    try {
      const newPauseRule = await challengesBonusesAPI.createPauseRule(pauseRuleData);
      setPauseRules(prev => [...prev, newPauseRule]);
      return newPauseRule;
    } catch (err) {
      setError('Failed to create pause rule. Please try again.');
      console.error('Error creating pause rule:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePauseRule = useCallback(async (id, pauseRuleData) => {
    setLoading(true);
    setError(null);

    try {
      const updatedPauseRule = await challengesBonusesAPI.updatePauseRule(id, pauseRuleData);
      setPauseRules(prev =>
        prev.map(pauseRule =>
          pauseRule.id === id ? updatedPauseRule : pauseRule
        )
      );
      return updatedPauseRule;
    } catch (err) {
      setError('Failed to update pause rule. Please try again.');
      console.error('Error updating pause rule:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deletePauseRule = useCallback(async (id) => {
    setLoading(true);
    setError(null);

    try {
      await challengesBonusesAPI.deletePauseRule(id);
      setPauseRules(prev => prev.filter(pauseRule => pauseRule.id !== id));
    } catch (err) {
      setError('Failed to delete pause rule. Please try again.');
      console.error('Error deleting pause rule:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    // State
    challenges,
    multipliers,
    bonusDays,
    pauseRules,
    loading,
    error,

    // Actions
    refreshData,

    // Challenge operations
    addChallenge,
    updateChallenge,
    deleteChallenge,
    toggleChallengeVisibility,

    // Multiplier operations
    addMultiplier,
    updateMultiplier,
    deleteMultiplier,
    toggleMultiplierActive,

    // Bonus day operations
    addBonusDay,
    updateBonusDay,
    deleteBonusDay,

    // Pause rule operations
    addPauseRule,
    updatePauseRule,
    deletePauseRule
  };
}