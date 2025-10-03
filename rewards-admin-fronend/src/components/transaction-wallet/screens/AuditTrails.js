'use client';

import { useState, useEffect } from 'react';
import FilterDropdown from '@/components/ui/FilterDropdown';
import Pagination from '@/components/ui/Pagination';
import { MagnifyingGlassIcon, ClockIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function AuditTrails() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [filters, setFilters] = useState({
    admin: '',
    action: '',
    dateRange: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Mock audit trail data
  useEffect(() => {
    // Generate realistic timestamps for testing date filters
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    
    const formatTimestamp = (date) => {
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    };

    const mockAuditLogs = [
      {
        id: 'AUD-20102',
        adminId: 'ADM-21',
        adminName: 'John Admin',
        action: 'Approved Redemption',
        targetUser: 'USR-38281',
        targetUserName: 'Jane Smith',
        details: {
          redemptionId: 'RED-001',
          amount: '500$',
          previousStatus: 'Pending',
          newStatus: 'Approved'
        },
        timestamp: formatTimestamp(oneHourAgo),
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome/91.0'
      },
      {
        id: 'AUD-20103',
        adminId: 'ADM-43',
        adminName: 'Sarah Manager',
        action: 'Wallet Adjustment',
        targetUser: 'USR-202589',
        targetUserName: 'Mike Johnson',
        details: {
          adjustmentType: 'Add XP',
          amount: '+500 XP',
          reason: 'Compensation for system error',
          previousBalance: '1250 XP',
          newBalance: '1750 XP'
        },
        timestamp: formatTimestamp(sixHoursAgo),
        ipAddress: '192.168.1.101',
        userAgent: 'Firefox/89.0'
      },
      {
        id: 'AUD-20104',
        adminId: 'ADM-21',
        adminName: 'John Admin',
        action: 'Rejected Redemption',
        targetUser: 'USR-202592',
        targetUserName: 'Alex Wilson',
        details: {
          redemptionId: 'RED-004',
          amount: '300$',
          reason: 'Face verification failed',
          previousStatus: 'Pending',
          newStatus: 'Rejected'
        },
        timestamp: formatTimestamp(twoDaysAgo),
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome/91.0'
      },
      {
        id: 'AUD-20105',
        adminId: 'ADM-43',
        adminName: 'Sarah Manager',
        action: 'Transaction Approval',
        targetUser: 'USR-202590',
        targetUserName: 'Emily Davis',
        details: {
          transactionId: '#ID09015',
          type: 'Reward',
          amount: '20$',
          previousStatus: 'Pending',
          newStatus: 'Approved'
        },
        timestamp: formatTimestamp(fiveDaysAgo),
        ipAddress: '192.168.1.101',
        userAgent: 'Firefox/89.0'
      },
      // {
      //   id: 'AUD-20106',
      //   adminId: 'ADM-12',
      //   adminName: 'Tom Supervisor',
      //   action: 'Conversion Rate Update',
      //   targetUser: 'SYSTEM',
      //   targetUserName: 'System Configuration',
      //   details: {
      //     tier: 'Gold',
      //     previousRate: '120 XP = ₹1',
      //     newRate: '100 XP = ₹1',
      //     effectiveDate: '2025-06-01'
      //   },
      //   timestamp: formatTimestamp(fifteenDaysAgo),
      //   ipAddress: '192.168.1.102',
      //   userAgent: 'Edge/91.0'
      // }
    ];
    
    setAuditLogs(mockAuditLogs);
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
      admin: '',
      action: '',
      dateRange: ''
    });
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Helper function to map audit trail user IDs to actual user IDs
  const mapUserIdForNavigation = (targetUserId) => {
    // Map USR-XXXXX format to IDOXXXX format for existing user pages
    const userIdMappings = {
      'USR-38281': 'IDO9012',
      'USR-202589': 'IDO9013', 
      'USR-202590': 'IDO9014',
      'USR-202591': 'IDO9015',
      'USR-202592': 'IDO9016'
    };
    
    return userIdMappings[targetUserId] || targetUserId;
  };

  // Handle Entry ID navigation to audit detail
  const handleEntryIdClick = (auditLog) => {
    // For now, show audit details in a simple alert
    // In a real implementation, this would open an audit detail modal or page
    const details = `
Audit Entry: ${auditLog.id}
Admin: ${auditLog.adminName} (${auditLog.adminId})
Action: ${auditLog.action}
Target: ${auditLog.targetUser !== 'SYSTEM' ? auditLog.targetUserName : auditLog.targetUser}
Time: ${auditLog.timestamp}
    `.trim();
    
    alert(`Audit Details:\n\n${details}`);
  };

  // Helper function to parse audit trail timestamp format
  const parseAuditTimestamp = (timestamp) => {
    try {
      // Handle format like "2025-05-28 12:01 PM"
      return new Date(timestamp);
    } catch (error) {
      console.error('Error parsing timestamp:', timestamp);
      return new Date(0); // Return epoch time if parsing fails
    }
  };

  // Helper function to filter by date range
  const matchesDateRange = (log) => {
    if (!filters.dateRange) return true;
    
    const logDate = parseAuditTimestamp(log.timestamp);
    const now = new Date();
    let startDate;
    
    switch (filters.dateRange) {
      case 'Last 24 hours':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'Last 7 days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'Last 30 days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return true;
    }
    
    return logDate >= startDate && logDate <= now;
  };

  const getActionBadge = (action) => {
    const styles = {
      'Approved Redemption': 'bg-green-100 text-green-800',
      'Rejected Redemption': 'bg-red-100 text-red-800',
      'Wallet Adjustment': 'bg-blue-100 text-blue-800',
      'Transaction Approval': 'bg-purple-100 text-purple-800',
      'Conversion Rate Update': 'bg-orange-100 text-orange-800'
    };
    
    return (
      <span className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-full w-[140px] ${styles[action] || 'bg-gray-100 text-gray-800'}`}>
        {action}
      </span>
    );
  };


  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = !searchTerm || 
      log.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.adminName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetUser.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetUserName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAdmin = !filters.admin || log.adminName === filters.admin;
    const matchesAction = !filters.action || log.action === filters.action;
    const matchesDate = matchesDateRange(log);
    
    return matchesSearch && matchesAdmin && matchesAction && matchesDate;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

  // Get unique admin names and actions for filters
  const uniqueAdmins = [...new Set(auditLogs.map(log => log.adminName))];
  const uniqueActions = [...new Set(auditLogs.map(log => log.action))];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <FilterDropdown
            filterId="admin"
            label="Admin"
            options={uniqueAdmins}
            value={filters.admin}
            onChange={handleFilterChange}
          />
          <FilterDropdown
            filterId="action"
            label="Action"
            options={uniqueActions}
            value={filters.action}
            onChange={handleFilterChange}
          />
          <FilterDropdown
            filterId="dateRange"
            label="Date Range"
            options={['Last 24 hours', 'Last 7 days', 'Last 30 days']}
            value={filters.dateRange}
            onChange={handleFilterChange}
          />

          {/* Clear Filters Button */}
          {(filters.admin || filters.action || filters.dateRange || searchTerm) && (
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
        
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={handleSearch}
            className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entry ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Target User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleEntryIdClick(log)}
                      className="font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                      title="View audit details"
                    >
                      {log.id}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">{log.adminId}</span>
                  </td>
                  <td className="px-6 py-4">
                    {getActionBadge(log.action)}
                  </td>
                  <td className="px-6 py-4">
                    {log.targetUser !== 'SYSTEM' ? (
                      <button
                        onClick={() => {
                          const mappedUserId = mapUserIdForNavigation(log.targetUser);
                          window.open(`/users/${mappedUserId}`, '_blank');
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                        title={`View user profile for ${log.targetUser}`}
                      >
                        {log.targetUser}
                      </button>
                    ) : (
                      <span className="font-medium text-gray-900">{log.targetUser}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <ClockIcon className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">{log.timestamp}</span>
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
            totalItems={filteredLogs.length}
            onPageChange={setCurrentPage}
          />
        )}
      </div>


      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredLogs.length)} of {filteredLogs.length} audit entries
      </div>
    </div>
  );
}