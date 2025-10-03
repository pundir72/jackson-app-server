'use client';

import { useState } from 'react';
import { useRewards } from '../../hooks/useRewards';
import { usePagination } from '../../hooks/usePagination';
import { REWARDS_TABS, REWARDS_FILTER_OPTIONS } from '../../data/rewards';
import { exportToCSV } from '../../utils/export';
import RewardsHeader from '../../components/rewards/RewardsHeader';
import RewardsTable from '../../components/rewards/RewardsTable';
import Pagination from '../../components/ui/Pagination';
import { AddEditModal, DeleteConfirmModal } from '../../components/rewards/RewardsModals';
import AdvancedFilter from '../../components/rewards/AdvancedFilter';
import RewardsSummary from '../../components/rewards/RewardsSummary';

export default function RewardsPage() {
  const { 
    getDataByTab, 
    updateItem, 
    addItem, 
    deleteItem, 
    toggleItemStatus,
    bulkUpdateStatus,
    xpTiers,
    xpDecaySettings,
    xpConversions,
    bonusLogic,
    auditLogs,
    loading 
  } = useRewards();
  const [activeTab, setActiveTab] = useState("XP Tiers");
  const [selectedItems, setSelectedItems] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  
  const [selectedFilters, setSelectedFilters] = useState({
    dateRange: "Date Range",
    type: "Type", 
    status: "Status",
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({});

  const currentData = getDataByTab(activeTab);
  
  const hasAdvancedFilters = Object.keys(advancedFilters).some(
    key => advancedFilters[key] && advancedFilters[key] !== ''
  );

  const applyFilters = (data) => {
    if (!hasAdvancedFilters) return data;
    
    return data.filter(item => {
      // Text search
      if (advancedFilters.searchText) {
        const searchLower = advancedFilters.searchText.toLowerCase();
        const matchesText = Object.values(item).some(value => 
          value && value.toString().toLowerCase().includes(searchLower)
        );
        if (!matchesText) return false;
      }
      
      // XP Range filters
      if (advancedFilters.xpMin && item.xpMin < parseInt(advancedFilters.xpMin)) {
        return false;
      }
      if (advancedFilters.xpMax && item.xpMax > parseInt(advancedFilters.xpMax)) {
        return false;
      }
      
      // Status filters
      if (advancedFilters.includeActive === false && item.status === true) {
        return false;
      }
      if (advancedFilters.includeInactive === false && item.status === false) {
        return false;
      }
      
      // Tab-specific filters
      if (activeTab === 'XP Decay Settings') {
        if (advancedFilters.decayType && item.decayRuleType !== advancedFilters.decayType) {
          return false;
        }
      }
      
      if (activeTab === 'Bonus Logic') {
        if (advancedFilters.rewardType) {
          const hasRewardType = item.rewardValue?.toLowerCase().includes(advancedFilters.rewardType.toLowerCase());
          if (!hasRewardType) return false;
        }
      }
      
      return true;
    });
  };

  const filteredData = applyFilters(currentData);

  const {
    items: paginatedData,
    totalPages,
    currentPage,
    totalItems,
    handlePageChange,
    resetPagination
  } = usePagination(filteredData);

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setSelectedItems([]);
    resetPagination();
  };

  const handleSelectItem = (itemId, checked) => {
    if (checked) {
      setSelectedItems(prev => [...prev, itemId]);
    } else {
      setSelectedItems(prev => prev.filter(id => id !== itemId));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedItems(paginatedData.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleBulkStatusUpdate = async (status) => {
    try {
      await bulkUpdateStatus(activeTab, selectedItems, status);
      alert(`${selectedItems.length} items updated successfully!`);
      setSelectedItems([]);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleToggleStatus = async (itemId) => {
    try {
      await toggleItemStatus(activeTab, itemId);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const getFilterOptions = () => {
    const baseFilters = REWARDS_FILTER_OPTIONS.base;
    const tabFilters = REWARDS_FILTER_OPTIONS[activeTab] || [];
    return [...baseFilters, ...tabFilters];
  };

  const handleFilterChange = (filterId, value) => {
    setSelectedFilters(prev => ({
      ...prev,
      [filterId]: value
    }));
    resetPagination();
  };

  const handleAdvancedFilters = (filters) => {
    setAdvancedFilters(filters);
    resetPagination();
  };

  // EXCLUDED: Global export function on XP screens not supported per requirements
  const handleExport = () => {
    console.log('Export functionality disabled per requirements');
    alert('Export functionality is not supported per requirements');
    // exportToCSV(currentData, `${activeTab.toLowerCase().replace(/\s+/g, '-')}-data`);
  };

  const handleAdd = () => {
    setShowAddModal(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setShowEditModal(true);
  };

  const handleDelete = (item) => {
    setDeletingItem(item);
    setShowDeleteConfirm(true);
  };

  const handleSaveItem = async (itemData) => {
    try {
      if (editingItem) {
        await updateItem(activeTab, editingItem.id, itemData);
        alert('Item updated successfully!');
      } else {
        await addItem(activeTab, itemData);
        alert('Item added successfully!');
      }
      setShowAddModal(false);
      setShowEditModal(false);
      setEditingItem(null);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteItem(activeTab, deletingItem.id);
      alert('Item deleted successfully!');
      setShowDeleteConfirm(false);
      setDeletingItem(null);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* <RewardsSummary
        xpTiers={xpTiers}
        xpDecaySettings={xpDecaySettings}
        xpConversions={xpConversions}
        bonusLogic={bonusLogic}
        auditLogs={auditLogs}
      /> */}
      
      <RewardsHeader
        tabs={REWARDS_TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        filterOptions={getFilterOptions()}
        selectedFilters={selectedFilters}
        onFilterChange={handleFilterChange}
        onExport={handleExport}
        onAdd={handleAdd}
        onShowAuditLogs={() => setShowAuditLogs(true)}
        onShowAdvancedFilter={() => setShowAdvancedFilter(true)}
        selectedCount={selectedItems.length}
        hasAdvancedFilters={hasAdvancedFilters}
      />

      {/* Bulk Actions Bar */}
      {selectedItems.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="text-blue-800">
            {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkStatusUpdate(true)}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              Activate Selected
            </button>
            <button
              onClick={() => handleBulkStatusUpdate(false)}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Deactivate Selected
            </button>
            <button
              onClick={() => setSelectedItems([])}
              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      <RewardsTable
        activeTab={activeTab}
        data={paginatedData}
        selectedItems={selectedItems}
        onSelectItem={handleSelectItem}
        onSelectAll={handleSelectAll}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleStatus={handleToggleStatus}
      />

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={handlePageChange}
      />

      {/* Add/Edit Modal */}
      <AddEditModal
        isOpen={showAddModal || showEditModal}
        activeTab={activeTab}
        editingItem={editingItem}
        onClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingItem(null);
        }}
        onSave={handleSaveItem}
      />

      {/* Audit Logs Modal */}
      {showAuditLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-black">Audit Logs</h2>
                <button
                  onClick={() => setShowAuditLogs(false)}
                  className="text-gray-600 hover:text-gray-800"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="text-gray-600">Recent admin actions will appear here when audit logging is integrated with backend.</div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-2">Sample Log Entry:</div>
                  <div className="text-sm">
                    <div><strong>Action:</strong> UPDATE</div>
                    <div><strong>Tab:</strong> XP Tiers</div>
                    <div><strong>Item:</strong> Bronze Tier</div>
                    <div><strong>Admin:</strong> Admin User</div>
                    <div><strong>Timestamp:</strong> {new Date().toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Filter Modal */}
      <AdvancedFilter
        isOpen={showAdvancedFilter}
        onClose={() => setShowAdvancedFilter(false)}
        activeTab={activeTab}
        onApplyFilters={handleAdvancedFilters}
        currentFilters={advancedFilters}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        activeTab={activeTab}
        deletingItem={deletingItem}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeletingItem(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}