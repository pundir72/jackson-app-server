'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRemoteConfig } from '../../hooks/useRemoteConfig';
import RemoteConfigHeader from '../../components/remote-config/RemoteConfigHeader';
import RemoteConfigTable from '../../components/remote-config/RemoteConfigTable';
import PidRewardModifiers from '../../components/remote-config/PidRewardModifiers';
import RemoteConfigRules from '../../components/remote-config/RemoteConfigRules';
import { 
  CreateConfigModal, 
  EditConfigModal, 
  ViewConfigModal, 
  DeleteConfigModal 
} from '../../components/remote-config/RemoteConfigModals';

export default function RemoteConfigPage() {
  const {
    configs,
    pidRewards,
    loading,
    filterConfigs,
    filterPidRewards,
    createConfig,
    updateConfig,
    deleteConfig,
    updatePidReward,
    toggleConfigStatus,
  } = useRemoteConfig();

  const [activeTab, setActiveTab] = useState('configs');
  const [filters, setFilters] = useState({});
  const [pidFilters, setPidFilters] = useState({});
  const [rulesFilters, setRulesFilters] = useState({});

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [configToDelete, setConfigToDelete] = useState(null);

  // Notification state
  const [notification, setNotification] = useState(null);

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  // Filtered data
  const filteredConfigs = useMemo(() => {
    return filterConfigs(filters.searchTerm, filters);
  }, [configs, filters, filterConfigs]);

  const filteredPidRewards = useMemo(() => {
    return filterPidRewards(pidFilters.searchTerm, pidFilters);
  }, [pidRewards, pidFilters, filterPidRewards]);

  const filteredRulesConfigs = useMemo(() => {
    return filterConfigs('', rulesFilters);
  }, [configs, rulesFilters, filterConfigs]);

  // Stats
  const stats = {
    total: configs.length,
    active: configs.filter(c => c.status === 'Active').length
  };

  // Handlers
  const handleCreateConfig = () => {
    setShowCreateModal(true);
  };

  const handleEditConfig = (config) => {
    setSelectedConfig(config);
    setShowEditModal(true);
  };

  const handleViewConfig = (config) => {
    setSelectedConfig(config);
    setShowViewModal(true);
  };

  const handleDeleteConfig = (configId) => {
    setConfigToDelete(configId);
    setShowDeleteModal(true);
  };

  const handleToggleStatus = async (configId, currentStatus) => {
    try {
      await toggleConfigStatus(configId);
      showNotification(`Configuration status changed to ${currentStatus === 'Active' ? 'Inactive' : 'Active'}`);
    } catch (error) {
      showNotification('Failed to update configuration status');
    }
  };

  const handleSaveConfig = async (configData) => {
    try {
      const result = await createConfig(configData);
      if (result.success) {
        showNotification('Configuration created successfully');
        setShowCreateModal(false);
      }
    } catch (error) {
      showNotification('Failed to create configuration');
    }
  };

  const handleUpdateConfig = async (configId, configData) => {
    try {
      const result = await updateConfig(configId, configData);
      if (result.success) {
        showNotification('Configuration updated successfully');
        setShowEditModal(false);
        setSelectedConfig(null);
      }
    } catch (error) {
      showNotification('Failed to update configuration');
    }
  };

  const handleConfirmDelete = async (configId) => {
    try {
      const result = await deleteConfig(configId);
      if (result.success) {
        showNotification('Configuration deleted successfully');
        setShowDeleteModal(false);
        setConfigToDelete(null);
      }
    } catch (error) {
      showNotification('Failed to delete configuration');
    }
  };

  const handlePidRewardUpdate = async (pidId, rewardData) => {
    try {
      const result = await updatePidReward(pidId, rewardData);
      if (result.success) {
        showNotification('PID reward modifier updated successfully');
      }
    } catch (error) {
      showNotification('Failed to update PID reward modifier');
    }
  };

  const handlePidRewardDelete = async (pidId) => {
    try {
      // TODO: Implement deletePidReward in useRemoteConfig hook
      // const result = await deletePidReward(pidId);
      // if (result.success) {
      //   showNotification('PID reward modifier deleted successfully');
      // }
      
      // Placeholder confirmation for now
      const confirmed = window.confirm(`Are you sure you want to delete PID Campaign ${pidId}? This action cannot be undone.`);
      if (confirmed) {
        showNotification(`Delete functionality for PID ${pidId} will be implemented when backend is ready`);
      }
    } catch (error) {
      showNotification('Failed to delete PID reward modifier');
    }
  };

  const handleQuickEdit = async (configId, configData) => {
    try {
      const result = await updateConfig(configId, configData);
      if (result.success) {
        showNotification('Configuration updated successfully');
      }
    } catch (error) {
      showNotification('Failed to update configuration');
    }
  };

  const closeAllModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setShowViewModal(false);
    setShowDeleteModal(false);
    setSelectedConfig(null);
    setConfigToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg bg-green-100 text-green-800">
          {notification}
        </div>
      )}

      {/* Header */}
      <RemoteConfigHeader
        totalConfigs={stats.total}
        activeConfigs={stats.active}
        onCreateNew={handleCreateConfig}
        filters={filters}
        onFiltersChange={useCallback((newFilters) => {
          if (typeof newFilters === 'function') {
            setFilters(newFilters);
          } else {
            setFilters(newFilters);
          }
        }, [])}
        activeTab={activeTab}
      />

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('configs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'configs'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Configuration List
              <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${
                activeTab === 'configs' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-900'
              }`}>
                {stats.total}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'rules'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Config Rules
              <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${
                activeTab === 'rules' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-900'
              }`}>
                {stats.active}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('pid-rewards')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'pid-rewards'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              PID Reward Modifiers
              <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${
                activeTab === 'pid-rewards' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-900'
              }`}>
                {pidRewards.length}
              </span>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'configs' && (
            <RemoteConfigTable
              configs={filteredConfigs}
              loading={loading}
              onEdit={handleEditConfig}
              onView={handleViewConfig}
              onDelete={handleDeleteConfig}
              onToggleStatus={handleToggleStatus}
            />
          )}

          {activeTab === 'rules' && (
            <RemoteConfigRules
              configs={filteredRulesConfigs}
              loading={loading}
              onToggleStatus={handleToggleStatus}
              onQuickEdit={handleQuickEdit}
              onDelete={handleDeleteConfig}
              filters={rulesFilters}
              onFiltersChange={setRulesFilters}
            />
          )}

          {activeTab === 'pid-rewards' && (
            <PidRewardModifiers
              pidRewards={filteredPidRewards}
              loading={loading}
              onEdit={handlePidRewardUpdate}
              onDelete={handlePidRewardDelete}
              filters={pidFilters}
              onFiltersChange={setPidFilters}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateConfigModal
        isOpen={showCreateModal}
        onClose={closeAllModals}
        onSave={handleSaveConfig}
      />

      <EditConfigModal
        isOpen={showEditModal}
        onClose={closeAllModals}
        onSave={handleUpdateConfig}
        config={selectedConfig}
      />

      <ViewConfigModal
        isOpen={showViewModal}
        onClose={closeAllModals}
        config={selectedConfig}
      />

      <DeleteConfigModal
        isOpen={showDeleteModal}
        onClose={closeAllModals}
        onConfirm={handleConfirmDelete}
        configId={configToDelete}
      />
    </div>
  );
}