'use client';

import { useState, useEffect } from 'react';
import { useSearch } from '../../contexts/SearchContext';
import { useUsers } from '../../hooks/useUsers';
import { usePagination } from '../../hooks/usePagination';
import { USER_FILTER_OPTIONS } from '../../data/users';
import { exportToCSV } from '../../utils/export';
import UsersHeader from '../../components/users/UsersHeader';
import UsersResultsSummary from '../../components/users/UsersResultsSummary';
import BulkActionsBar from '../../components/ui/BulkActionsBar';
import UsersTable from '../../components/users/UsersTable';
import Pagination from '../../components/ui/Pagination';
import EditUserModal from '../../components/users/EditUserModal';
import SuspendUserModal from '../../components/users/SuspendUserModal';

export default function UsersPage() {
  const { searchTerm, registerSearchHandler } = useSearch();
  const { users, filterUsers, updateUser, suspendUser, bulkAction } = useUsers();
  
  const [selectedFilters, setSelectedFilters] = useState({
    tierLevel: "",
    location: "",
    memberSince: "",
    status: "",
    gender: "",
    ageRange: "",
  });

  const [editingUser, setEditingUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [suspendingUser, setSuspendingUser] = useState(null);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);

  const filteredUsers = filterUsers(searchTerm, selectedFilters);
  const {
    items: paginatedUsers,
    totalPages,
    currentPage,
    itemsPerPage,
    startIndex,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
    resetPagination
  } = usePagination(filteredUsers);

  useEffect(() => {
    const handleSearchChange = () => {
      resetPagination();
    };
    registerSearchHandler(handleSearchChange);
  }, [registerSearchHandler, resetPagination]);

  const handleFilterChange = (filterId, value) => {
    setSelectedFilters((prev) => ({
      ...prev,
      [filterId]: value,
    }));
    resetPagination();
  };

  const handleExport = () => {
    exportToCSV(filteredUsers, 'users');
  };

  const handleClearFilters = () => {
    setSelectedFilters({
      tierLevel: "",
      location: "",
      memberSince: "",
      status: "",
      gender: "",
      ageRange: "",
    });
    resetPagination();
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  const handleSaveUser = async (updatedUserData) => {
    try {
      await updateUser(editingUser.id, updatedUserData);
      alert('User profile updated successfully!');
      setShowEditModal(false);
      setEditingUser(null);
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  };

  const handleSuspendUser = (user) => {
    setSuspendingUser(user);
    setShowSuspendModal(true);
  };

  const handleConfirmSuspend = async (suspendData) => {
    try {
      await suspendUser(suspendingUser.id, suspendData);
      alert(`User ${suspendingUser.name} has been suspended successfully!`);
      setShowSuspendModal(false);
      setSuspendingUser(null);
    } catch (error) {
      console.error('Error suspending user:', error);
      throw error;
    }
  };

  const handleSelectUser = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === paginatedUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(paginatedUsers.map(user => user.id));
    }
  };

  const handleBulkAction = async (action) => {
    const selectedCount = selectedUsers.length;
    if (selectedCount === 0) {
      alert('Please select at least one user');
      return;
    }
    
    const confirmMessage = `Are you sure you want to ${action} ${selectedCount} selected user(s)?`;
    if (window.confirm(confirmMessage)) {
      try {
        await bulkAction(selectedUsers, action);
        alert(`Bulk ${action} applied to ${selectedCount} user(s)`);
        setSelectedUsers([]);
      } catch (error) {
        alert(`Error applying bulk ${action}: ${error.message}`);
      }
    }
  };

  return (
    <div className="w-full">
      <UsersHeader
        filterOptions={USER_FILTER_OPTIONS}
        selectedFilters={selectedFilters}
        onFilterChange={handleFilterChange}
        onExport={handleExport}
      />

      {/* PHASE 2: Bulk Actions temporarily hidden */}
      {/* <BulkActionsBar
        selectedCount={selectedUsers.length}
        onBulkAction={handleBulkAction}
        onClearSelection={() => setSelectedUsers([])}
      /> */}

      <UsersResultsSummary
        startIndex={startIndex}
        itemsPerPage={itemsPerPage}
        filteredCount={totalItems}
        totalCount={users.length}
        searchTerm={searchTerm}
        selectedFilters={selectedFilters}
        onItemsPerPageChange={handleItemsPerPageChange}
        onClearFilters={handleClearFilters}
      />

      <UsersTable
        users={paginatedUsers}
        selectedUsers={selectedUsers}
        onSelectUser={handleSelectUser}
        onSelectAll={handleSelectAll}
        onEditUser={handleEditUser}
        onSuspendUser={handleSuspendUser}
      />

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={handlePageChange}
      />

      {/* Edit User Modal */}
      <EditUserModal
        user={editingUser}
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingUser(null);
        }}
        onSave={handleSaveUser}
      />

      {/* Suspend User Modal */}
      <SuspendUserModal
        user={suspendingUser}
        isOpen={showSuspendModal}
        onClose={() => {
          setShowSuspendModal(false);
          setSuspendingUser(null);
        }}
        onSuspend={handleConfirmSuspend}
      />
    </div>
  );
}