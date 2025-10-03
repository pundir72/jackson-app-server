'use client';

import { useState } from 'react';
import { 
  MOCK_XP_TIERS, 
  MOCK_XP_DECAY_SETTINGS, 
  MOCK_XP_CONVERSIONS, 
  MOCK_BONUS_LOGIC 
} from '../data/rewards';

export const useRewards = () => {
  const [xpTiers, setXpTiers] = useState(MOCK_XP_TIERS);
  const [xpDecaySettings, setXpDecaySettings] = useState(MOCK_XP_DECAY_SETTINGS);
  const [xpConversions, setXpConversions] = useState(MOCK_XP_CONVERSIONS);
  const [bonusLogic, setBonusLogic] = useState(MOCK_BONUS_LOGIC);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getDataByTab = (activeTab) => {
    switch (activeTab) {
      case "XP Tiers":
        return xpTiers;
      case "XP Decay Settings":
        return xpDecaySettings;
      case "XP Conversion":
        return xpConversions;
      case "Bonus Logic":
        return bonusLogic;
      default:
        return [];
    }
  };

  // EXCLUDED: Copy of Data KPIs file mapping and audit logging not supported per requirements
  const logAction = (action, activeTab, itemData, itemId = null) => {
    // Audit logging and KPI mapping disabled per requirements
    console.log('Audit logging and KPI file mapping disabled per requirements');

    /* ORIGINAL CODE - COMMENTED OUT
    const logEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      action,
      tab: activeTab,
      itemId,
      itemData: { ...itemData },
      admin: 'Admin User', // This would come from auth context in real app
    };
    setAuditLogs(prev => [logEntry, ...prev]);
    */
  };

  const validateBusinessRules = (activeTab, itemData, itemId = null, currentData = null) => {
    const errors = [];

    if (activeTab === 'Bonus Logic') {
      // Check for duplicate active bonus types
      const existingBonuses = currentData || bonusLogic;
      const activeBonusOfSameType = existingBonuses.find(
        bonus => bonus.bonusType === itemData.bonusType && 
                 bonus.active && 
                 bonus.id !== itemId
      );
      
      if (activeBonusOfSameType && itemData.active) {
        errors.push(`Only one active bonus of type "${itemData.bonusType}" is allowed. Please deactivate the existing one first.`);
      }
    }

    if (activeTab === 'XP Tiers') {
      // Check for overlapping XP ranges
      const existingTiers = currentData || xpTiers;
      const overlappingTier = existingTiers.find(
        tier => tier.id !== itemId && 
               ((itemData.xpMin >= tier.xpMin && itemData.xpMin <= tier.xpMax) ||
                (itemData.xpMax >= tier.xpMin && itemData.xpMax <= tier.xpMax) ||
                (itemData.xpMin <= tier.xpMin && itemData.xpMax >= tier.xpMax))
      );
      
      if (overlappingTier) {
        errors.push(`XP range overlaps with existing tier "${overlappingTier.tierName}".`);
      }
    }

    return errors;
  };

  const updateItem = async (activeTab, itemId, itemData) => {
    setLoading(true);
    try {
      console.log(`Updating ${activeTab} item:`, itemId, itemData);
      
      // Validate business rules
      const validationErrors = validateBusinessRules(activeTab, itemData, itemId);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(' '));
      }

      let updatedItem;
      
      switch (activeTab) {
        case "XP Tiers":
          setXpTiers(prev => prev.map(item => {
            if (item.id === itemId) {
              updatedItem = { ...item, ...itemData };
              return updatedItem;
            }
            return item;
          }));
          break;
        case "XP Decay Settings":
          setXpDecaySettings(prev => prev.map(item => {
            if (item.id === itemId) {
              updatedItem = { ...item, ...itemData };
              return updatedItem;
            }
            return item;
          }));
          break;
        case "XP Conversion":
          setXpConversions(prev => prev.map(item => {
            if (item.id === itemId) {
              updatedItem = { ...item, ...itemData };
              return updatedItem;
            }
            return item;
          }));
          break;
        case "Bonus Logic":
          setBonusLogic(prev => prev.map(item => {
            if (item.id === itemId) {
              updatedItem = { ...item, ...itemData };
              return updatedItem;
            }
            return item;
          }));
          break;
      }
      
      // Log the action
      logAction('UPDATE', activeTab, updatedItem, itemId);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const addItem = async (activeTab, itemData) => {
    setLoading(true);
    try {
      console.log(`Adding ${activeTab} item:`, itemData);
      
      // Validate business rules
      const validationErrors = validateBusinessRules(activeTab, itemData);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(' '));
      }
      
      const newItem = {
        id: Date.now(),
        ...itemData,
        // Add auto-generated fields based on tab
        ...(activeTab === 'XP Tiers' && {
          xpRange: `${itemData.xpMin} - ${itemData.xpMax} XP`,
          iconSrc: itemData.badgeFile ? URL.createObjectURL(itemData.badgeFile) : "https://c.animaapp.com/mf180vyvQGfAhJ/img/---icon--star--9@2x.png"
        }),
        ...(activeTab === 'XP Decay Settings' && {
          xpRange: itemData.xpRange || `${itemData.xpMin || 0} - ${itemData.xpMax || 999} XP`
        })
      };

      switch (activeTab) {
        case "XP Tiers":
          setXpTiers(prev => [...prev, newItem]);
          break;
        case "XP Decay Settings":
          setXpDecaySettings(prev => [...prev, newItem]);
          break;
        case "XP Conversion":
          setXpConversions(prev => [...prev, newItem]);
          break;
        case "Bonus Logic":
          setBonusLogic(prev => [...prev, newItem]);
          break;
      }
      
      // Log the action
      logAction('CREATE', activeTab, newItem);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const deleteItem = async (activeTab, itemId) => {
    setLoading(true);
    try {
      console.log(`Deleting ${activeTab} item:`, itemId);
      
      let deletedItem;
      
      switch (activeTab) {
        case "XP Tiers":
          deletedItem = xpTiers.find(item => item.id === itemId);
          setXpTiers(prev => prev.filter(item => item.id !== itemId));
          break;
        case "XP Decay Settings":
          deletedItem = xpDecaySettings.find(item => item.id === itemId);
          setXpDecaySettings(prev => prev.filter(item => item.id !== itemId));
          break;
        case "XP Conversion":
          deletedItem = xpConversions.find(item => item.id === itemId);
          setXpConversions(prev => prev.filter(item => item.id !== itemId));
          break;
        case "Bonus Logic":
          deletedItem = bonusLogic.find(item => item.id === itemId);
          setBonusLogic(prev => prev.filter(item => item.id !== itemId));
          break;
      }
      
      // Log the action
      if (deletedItem) {
        logAction('DELETE', activeTab, deletedItem, itemId);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const toggleItemStatus = async (activeTab, itemId) => {
    const currentData = getDataByTab(activeTab);
    const item = currentData.find(i => i.id === itemId);
    if (item) {
      await updateItem(activeTab, itemId, { status: !item.status });
    }
  };

  const bulkUpdateStatus = async (activeTab, itemIds, status) => {
    setLoading(true);
    try {
      const promises = itemIds.map(id => updateItem(activeTab, id, { status }));
      await Promise.all(promises);
      setLoading(false);
      return { success: true };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  return {
    xpTiers,
    xpDecaySettings,
    xpConversions,
    bonusLogic,
    auditLogs,
    loading,
    error,
    getDataByTab,
    updateItem,
    addItem,
    deleteItem,
    toggleItemStatus,
    bulkUpdateStatus,
    validateBusinessRules,
  };
};