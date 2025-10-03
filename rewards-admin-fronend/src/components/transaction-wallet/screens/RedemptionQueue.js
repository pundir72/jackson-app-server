'use client';

import { useState, useEffect } from 'react';
import FilterDropdown from '@/components/ui/FilterDropdown';
import Pagination from '@/components/ui/Pagination';
import { CheckIcon, XMarkIcon, EyeIcon } from '@heroicons/react/24/outline';

export default function RedemptionQueue({ onSneakPeek }) {
  const [redemptions, setRedemptions] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    verification: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState({});
  const [showRejectModal, setShowRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Mock data
  useEffect(() => {
    const mockRedemptions = [
      {
        id: 'RED-001',
        userId: 'USR-202589',
        amount: '500$',
        status: 'Pending',
        verification: 'Face Verified',
        offerCompletion: 'Spin Master – 12 min session',
        createdAt: '12/06/2025 10:30 AM',
        userProfile: {
          name: 'John Doe',
          email: 'john@example.com',
          tier: 'Gold',
          totalRedemptions: 5
        }
      },
      {
        id: 'RED-002',
        userId: 'USR-202590',
        amount: '200$',
        status: 'Pending',
        verification: 'Pending Verification',
        offerCompletion: 'Survey Task – 8 min session',
        createdAt: '12/06/2025 11:15 AM',
        userProfile: {
          name: 'Jane Smith',
          email: 'jane@example.com',
          tier: 'Platinum',
          totalRedemptions: 2
        }
      },
      {
        id: 'RED-003',
        userId: 'USR-202591',
        amount: '1000$',
        status: 'Approved',
        verification: 'Face Verified',
        offerCompletion: 'Gaming Challenge – 25 min session',
        createdAt: '11/06/2025 09:45 AM',
        userProfile: {
          name: 'Mike Johnson',
          email: 'mike@example.com',
          tier: 'Platinum',
          totalRedemptions: 12
        }
      },
      {
        id: 'RED-004',
        userId: 'USR-202592',
        amount: '300$',
        status: 'Rejected',
        verification: 'Face Not Verified',
        offerCompletion: 'Quiz Challenge – 5 min session',
        createdAt: '11/06/2025 02:20 PM',
        userProfile: {
          name: 'Sarah Wilson',
          email: 'sarah@example.com',
          tier: 'Bronze',
          totalRedemptions: 1
        }
      }
    ];
    setRedemptions(mockRedemptions);
  }, []);

  const handleFilterChange = (filterId, value) => {
    setFilters(prev => ({ ...prev, [filterId]: value }));
    setCurrentPage(1);
  };

  const handleApprove = async (redemptionId) => {
    setLoading(prev => ({ ...prev, [redemptionId]: true }));
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setRedemptions(prev => 
      prev.map(redemption => 
        redemption.id === redemptionId 
          ? { ...redemption, status: 'Approved' }
          : redemption
      )
    );
    
    setLoading(prev => ({ ...prev, [redemptionId]: false }));
  };

  const handleReject = async (redemptionId) => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setLoading(prev => ({ ...prev, [redemptionId]: true }));
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setRedemptions(prev => 
      prev.map(redemption => 
        redemption.id === redemptionId 
          ? { ...redemption, status: 'Rejected', rejectReason }
          : redemption
      )
    );
    
    setLoading(prev => ({ ...prev, [redemptionId]: false }));
    setShowRejectModal(null);
    setRejectReason('');
  };

  const handleSneakPeek = (redemption) => {
    onSneakPeek({
      userId: redemption.userId,
      profile: redemption.userProfile,
      offerHistory: [redemption.offerCompletion],
      verificationStatus: redemption.verification
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-green-100 text-green-800',
      'Rejected': 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-full min-w-[80px] ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const getVerificationBadge = (verification) => {
    const isVerified = verification.includes('Face Verified');
    const isPending = verification.includes('Pending');
    
    const styles = isVerified 
      ? 'bg-green-100 text-green-800'
      : isPending 
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
    
    return (
      <span className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-full min-w-[120px] ${styles}`}>
        {verification}
      </span>
    );
  };


  const filteredRedemptions = redemptions.filter(redemption => {
    const matchesStatus = !filters.status || redemption.status === filters.status;
    const matchesVerification = !filters.verification || 
      redemption.verification.includes(filters.verification);
    
    return matchesStatus && matchesVerification;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredRedemptions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRedemptions = filteredRedemptions.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <FilterDropdown
          filterId="status"
          label="Status"
          options={['Pending', 'Approved', 'Rejected']}
          value={filters.status}
          onChange={handleFilterChange}
        />
        <FilterDropdown
          filterId="verification"
          label="Verification"
          options={['Face Verified', 'Pending']}
          value={filters.verification}
          onChange={handleFilterChange}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Redemption ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Verification
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Offer Completion
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedRedemptions.map((redemption) => (
                <tr key={redemption.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">{redemption.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => window.open(`/users/${redemption.userId}`, '_blank')}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {redemption.userId}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-emerald-600">{redemption.amount}</span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(redemption.status)}
                  </td>
                  <td className="px-6 py-4">
                    {getVerificationBadge(redemption.verification)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{redemption.offerCompletion}</div>
                    <div className="text-xs text-gray-500">{redemption.createdAt}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {redemption.status === 'Pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(redemption.id)}
                            disabled={loading[redemption.id]}
                            className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px] h-9"
                          >
                            {loading[redemption.id] ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Processing</span>
                              </div>
                            ) : (
                              <>
                                <CheckIcon className="w-4 h-4 mr-1" />
                                Approve
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={() => setShowRejectModal(redemption.id)}
                            className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 min-w-[100px] h-9"
                          >
                            <XMarkIcon className="w-4 h-4 mr-1" />
                            Reject
                          </button>
                        </>
                      )}
                      
                      <button
                        onClick={() => handleSneakPeek(redemption)}
                        className="flex items-center justify-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 min-w-[120px] h-9"
                      >
                        <EyeIcon className="w-4 h-4 mr-1" />
                        Sneak Peek
                      </button>
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
            totalItems={filteredRedemptions.length}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Reject Redemption
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for rejection *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Please provide a detailed reason for rejection..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={loading[showRejectModal]}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {loading[showRejectModal] ? 'Processing...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredRedemptions.length)} of {filteredRedemptions.length} redemption requests
      </div>
    </div>
  );
}