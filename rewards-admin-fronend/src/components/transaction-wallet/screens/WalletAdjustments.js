'use client';

import { useState, useEffect } from 'react';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline';

export default function WalletAdjustments({ onSneakPeek }) {
  const [formData, setFormData] = useState({
    userId: '',
    balanceType: '',
    adjustmentType: '',
    amount: '',
    reason: '',
    adminId: 'ADM-43' // Auto-filled from session
  });
  const [loading, setLoading] = useState(false);
  const [recentAdjustments, setRecentAdjustments] = useState([]);
  const [userBalance, setUserBalance] = useState(null);

  // Mock recent adjustments
  useEffect(() => {
    const mockAdjustments = [
      /* EXCLUDED: XP adjustments not allowed per requirements
      {
        id: 'ADJ-001',
        userId: 'USR-202589',
        balanceType: 'XP',
        adjustmentType: 'Add',
        amount: '+500',
        reason: 'Compensation for system error',
        adminId: 'ADM-43',
        timestamp: '12/06/2025 10:30 AM',
        status: 'Completed'
      },
      */
      {
        id: 'ADJ-002',
        userId: 'USR-202590',
        balanceType: 'Coin',
        adjustmentType: 'Subtract',
        amount: '-200',
        reason: 'Incorrect crediting',
        adminId: 'ADM-21',
        timestamp: '11/06/2025 03:15 PM',
        status: 'Completed'
      },
      /* EXCLUDED: XP adjustments not allowed per requirements
      {
        id: 'ADJ-003',
        userId: 'USR-202591',
        balanceType: 'XP',
        adjustmentType: 'Add',
        amount: '+1000',
        reason: 'Loyalty bonus adjustment',
        adminId: 'ADM-43',
        timestamp: '11/06/2025 11:45 AM',
        status: 'Completed'
      }
      */
    ];
    setRecentAdjustments(mockAdjustments);
  }, []);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Mock user balance fetch when userId changes
    if (field === 'userId' && value.trim()) {
      // Simulate API call to get user balance
      setTimeout(() => {
        setUserBalance({
          // xp: 1250, // EXCLUDED: XP balance adjustments not allowed per requirements
          coins: 500,
          tier: 'Gold'
        });
      }, 500);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Enhanced validation as per requirements
    const errors = [];
    
    if (!formData.userId.trim()) {
      errors.push('User ID is required');
    } else if (!/^USR-\d+$/.test(formData.userId)) {
      errors.push('User ID must be in format USR-XXXXXX');
    }
    
    if (!formData.balanceType) {
      errors.push('Balance Type is required');
    }
    
    if (!formData.adjustmentType) {
      errors.push('Adjustment Type is required');
    }
    
    if (!formData.amount) {
      errors.push('Amount is required');
    } else if (isNaN(formData.amount) || parseFloat(formData.amount) <= 0) {
      errors.push('Amount must be a positive number');
    }
    
    if (!formData.reason.trim()) {
      errors.push('Reason is required');
    } else if (formData.reason.trim().length < 10) {
      errors.push('Reason must be at least 10 characters long');
    }
    
    if (errors.length > 0) {
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    setLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Add to recent adjustments
    const newAdjustment = {
      id: `ADJ-${String(recentAdjustments.length + 1).padStart(3, '0')}`,
      ...formData,
      amount: `${formData.adjustmentType === 'Add' ? '+' : '-'}${formData.amount}`,
      timestamp: new Date().toLocaleString(),
      status: 'Completed'
    };
    
    setRecentAdjustments(prev => [newAdjustment, ...prev]);
    
    // Reset form
    setFormData({
      userId: '',
      balanceType: '',
      adjustmentType: '',
      amount: '',
      reason: '',
      adminId: 'ADM-43'
    });
    setUserBalance(null);
    setLoading(false);
    
    alert('Wallet adjustment completed successfully!');
  };


  return (
    <div className="space-y-8">
      {/* Adjustment Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Make Wallet Adjustment</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* User ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User ID *
              </label>
              <input
                type="text"
                value={formData.userId}
                onChange={(e) => handleInputChange('userId', e.target.value)}
                placeholder="Enter User ID (e.g., USR-202589)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            {/* Balance Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Balance Type *
              </label>
              <select
                value={formData.balanceType}
                onChange={(e) => handleInputChange('balanceType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Select Type</option>
                <option value="Coin">Coin</option>
                {/* <option value="XP">XP</option> */} {/* EXCLUDED: XP adjustments not allowed per requirements */}
              </select>
            </div>

            {/* Adjustment Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adjustment Type *
              </label>
              <select
                value={formData.adjustmentType}
                onChange={(e) => handleInputChange('adjustmentType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Add/Subtract</option>
                <option value="Add">Add</option>
                <option value="Subtract">Subtract</option>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount *
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="Enter Amount"
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            {/* Admin ID (Auto-filled) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admin ID
              </label>
              <input
                type="text"
                value={formData.adminId}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
              />
            </div>
          </div>


          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason *
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => handleInputChange('reason', e.target.value)}
              placeholder="Provide justification for adjustment..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-emerald-600 text-white font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing Adjustment...' : 'Approve Adjustment'}
            </button>
          </div>
        </form>
      </div>

      {/* Recent Adjustments */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Adjustments</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Adjustment ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Adjustment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentAdjustments.map((adjustment) => (
                <tr key={adjustment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">{adjustment.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => window.open(`/users/${adjustment.userId}`, '_blank')}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {adjustment.userId}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{adjustment.balanceType}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{adjustment.adjustmentType}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">
                      {adjustment.amount}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{adjustment.reason}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{adjustment.adminId}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-500">{adjustment.timestamp}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}