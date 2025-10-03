'use client';

import { useState, useEffect } from 'react';
import FilterDropdown from '@/components/ui/FilterDropdown';
import Pagination from '@/components/ui/Pagination';
import { CheckIcon, DocumentArrowDownIcon, XMarkIcon, ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { getDateRangeFilter } from '@/utils/dateFilters';

export default function TransactionLog({ onSneakPeek }) {
  const [filters, setFilters] = useState({
    dateRange: '',
    type: '',
    status: '',
    approval: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [transactions, setTransactions] = useState([]);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [approvalAction, setApprovalAction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mock data
  useEffect(() => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
    
    const formatDate = (date) => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const mockTransactions = [
      {
        id: '#ID09012',
        userId: 'USR-202589',
        type: 'Reward',
        amount: '20$',
        createdOn: formatDate(today),
        approvedOn: formatDate(today),
        status: 'Completed',
        approval: 'Yes'
      },
      {
        id: '#ID09013',
        userId: 'USR-202590',
        type: 'XP',
        amount: '150 XP',
        createdOn: formatDate(yesterday),
        approvedOn: formatDate(yesterday),
        status: 'Pending',
        approval: 'No'
      },
      {
        id: '#ID09014',
        userId: 'USR-202591',
        type: 'Redemption',
        amount: '500$',
        createdOn: formatDate(twoDaysAgo),
        approvedOn: '-',
        status: 'Failed',
        approval: 'No'
      },
      {
        id: '#ID09015',
        userId: 'USR-202592',
        type: 'Spin',
        amount: '10$',
        createdOn: formatDate(fiveDaysAgo),
        approvedOn: formatDate(fiveDaysAgo),
        status: 'Completed',
        approval: 'Yes'
      }
    ];
    setTransactions(mockTransactions);
  }, []);

  const handleFilterChange = (filterId, value) => {
    setFilters(prev => ({ ...prev, [filterId]: value }));
    setCurrentPage(1);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({
      dateRange: '',
      type: '',
      status: '',
      approval: ''
    });
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleExport = () => {
    // Export functionality
    const csvContent = [
      ['Transaction ID', 'User ID', 'Type', 'Amount', 'Created On', 'Approved On', 'Status', 'Approval'],
      ...filteredTransactions.map(t => [
        t.id, t.userId, t.type, t.amount, t.createdOn, t.approvedOn, t.status, t.approval
      ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transactions.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleApprovalClick = (transaction, action) => {
    setSelectedTransaction(transaction);
    setApprovalAction(action);
    setShowApprovalModal(true);
  };

  const confirmApproval = () => {
    if (!selectedTransaction) return;
    
    setIsLoading(true);
    
    // Simulate processing delay
    setTimeout(() => {
      // Update local state
      setTransactions(prev => prev.map(t => 
        t.id === selectedTransaction.id 
          ? { 
              ...t, 
              approval: approvalAction === 'approve' ? 'Yes' : 'No',
              approvedOn: approvalAction === 'approve' ? new Date().toLocaleDateString('en-GB') : '-',
              status: approvalAction === 'approve' ? 'Completed' : 'Failed'
            }
          : t
      ));
      
      // Show success feedback
      alert(`Transaction ${approvalAction === 'approve' ? 'approved' : 'rejected'} successfully!`);
      
      setIsLoading(false);
      setShowApprovalModal(false);
      setSelectedTransaction(null);
      setApprovalAction('');
    }, 1000);
  };

  const cancelApproval = () => {
    setShowApprovalModal(false);
    setSelectedTransaction(null);
    setApprovalAction('');
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    
    // Simulate refresh delay
    setTimeout(() => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const formatDate = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      };

      // Reset to mock data (simulate fresh data from server)
      const mockTransactions = [
        {
          id: '#ID09012',
          userId: 'USR-202589',
          type: 'Reward',
          amount: '20$',
          createdOn: formatDate(today),
          approvedOn: formatDate(today),
          status: 'Completed',
          approval: 'Yes'
        },
        {
          id: '#ID09013',
          userId: 'USR-202590',
          type: 'XP',
          amount: '150 XP',
          createdOn: formatDate(yesterday),
          approvedOn: formatDate(yesterday),
          status: 'Pending',
          approval: 'No'
        },
        {
          id: '#ID09014',
          userId: 'USR-202591',
          type: 'Redemption',
          amount: '500$',
          createdOn: formatDate(twoDaysAgo),
          approvedOn: '-',
          status: 'Failed',
          approval: 'No'
        },
        {
          id: '#ID09015',
          userId: 'USR-202592',
          type: 'Spin',
          amount: '10$',
          createdOn: formatDate(fiveDaysAgo),
          approvedOn: formatDate(fiveDaysAgo),
          status: 'Completed',
          approval: 'Yes'
        },
        {
          id: '#ID09016',
          userId: 'USR-202593',
          type: 'XP',
          amount: '75 XP',
          createdOn: formatDate(sevenDaysAgo),
          approvedOn: '-',
          status: 'Pending',
          approval: 'No'
        }
      ];
      
      setTransactions(mockTransactions);
      setCurrentPage(1);
      setIsRefreshing(false);
    }, 1500);
  };

  const getStatusBadge = (status) => {
    const styles = {
      'Completed': 'bg-green-100 text-green-800',
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Failed': 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-full min-w-[80px] ${styles[status]}`}>
        {status}
      </span>
    );
  };


  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = !searchTerm || 
      transaction.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.userId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = !filters.type || transaction.type === filters.type;
    const matchesStatus = !filters.status || transaction.status === filters.status;
    const matchesApproval = !filters.approval || transaction.approval === filters.approval;
    const matchesDateRange = getDateRangeFilter(filters.dateRange, 'createdOn')(transaction);
    
    return matchesSearch && matchesType && matchesStatus && matchesApproval && matchesDateRange;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <FilterDropdown
            filterId="dateRange"
            label="Date Range"
            options={['Last 7 days', 'Last 30 days', 'Last 3 months']}
            value={filters.dateRange}
            onChange={handleFilterChange}
          />
          <FilterDropdown
            filterId="type"
            label="Type"
            options={['XP', 'Reward', 'Redemption', 'Spin']}
            value={filters.type}
            onChange={handleFilterChange}
          />
          <FilterDropdown
            filterId="status"
            label="Status"
            options={['Completed', 'Pending', 'Failed']}
            value={filters.status}
            onChange={handleFilterChange}
          />
          <FilterDropdown
            filterId="approval"
            label="Approval"
            options={['Yes', 'No']}
            value={filters.approval}
            onChange={handleFilterChange}
          />
          
          {/* Clear Filters Button */}
          {(filters.dateRange || filters.type || filters.status || filters.approval || searchTerm) && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              title="Clear all filters"
            >
              <XMarkIcon className="w-4 h-4" />
              Clear Filters
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Transaction ID or User ID..."
              value={searchTerm}
              onChange={handleSearch}
              className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh transaction list"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created On
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Approved On
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Approval
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => window.open(`/transactions/${encodeURIComponent(transaction.id)}`, '_blank')}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {transaction.id}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => window.open(`/users/${transaction.userId}`, '_blank')}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {transaction.userId}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{transaction.type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">{transaction.amount}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-900">{transaction.createdOn}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-900">{transaction.approvedOn}</span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(transaction.status)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {transaction.approval === 'Yes' ? (
                        <div className="flex items-center">
                          <CheckIcon className="w-5 h-5 text-green-500" />
                          <span className="ml-2 text-sm text-gray-600">Approved</span>
                        </div>
                      ) : transaction.status === 'Pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprovalClick(transaction, 'approve')}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 hover:bg-green-200 text-green-600 hover:text-green-700 transition-colors"
                            title="Approve transaction"
                          >
                            <CheckIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApprovalClick(transaction, 'reject')}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-colors"
                            title="Reject transaction"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <XMarkIcon className="w-5 h-5 text-red-500" />
                          <span className="ml-2 text-sm text-gray-600">Rejected</span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredTransactions.length}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} transactions
      </div>

      {/* Approval Confirmation Modal */}
      {showApprovalModal && selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Confirm {approvalAction === 'approve' ? 'Approval' : 'Rejection'}
              </h3>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Transaction ID:</span>
                  <span className="text-sm font-medium">{selectedTransaction.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">User ID:</span>
                  <span className="text-sm font-medium">{selectedTransaction.userId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Type:</span>
                  <span className="text-sm font-medium">{selectedTransaction.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Amount:</span>
                  <span className="text-sm font-medium">{selectedTransaction.amount}</span>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to {approvalAction === 'approve' ? 'approve' : 'reject'} this transaction? 
                This action will update the transaction status and log the admin action.
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelApproval}
                  disabled={isLoading}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmApproval}
                  disabled={isLoading}
                  className={`px-4 py-2 rounded-md text-white disabled:opacity-50 ${
                    approvalAction === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processing...
                    </div>
                  ) : (
                    `${approvalAction === 'approve' ? 'Approve' : 'Reject'} Transaction`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}