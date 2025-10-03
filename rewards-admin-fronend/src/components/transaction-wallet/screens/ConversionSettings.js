'use client';

import { useState, useEffect } from 'react';
import { CogIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function ConversionSettings() {
  const [conversionRules, setConversionRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  // Mock data from Rewards Config Module
  useEffect(() => {
    const mockConversionRules = [
      {
        id: 'CONV-001',
        xpTier: 'Bronze',
        conversionRule: '200 XP = ₹1',
        method: 'Paytm',
        ruleSource: 'Rewards Config Module'
      },
      {
        id: 'CONV-002',
        xpTier: 'Platinum',
        conversionRule: '150 XP = ₹1',
        method: 'UPI + Paytm',
        ruleSource: 'Rewards Config Module'
      },
      {
        id: 'CONV-003',
        xpTier: 'Gold',
        conversionRule: '100 XP = ₹1',
        method: 'UPI + Paytm + Gift Card',
        ruleSource: 'Rewards Config Module'
      },
      {
        id: 'CONV-004',
        xpTier: 'Platinum',
        conversionRule: '75 XP = ₹1',
        method: 'UPI + Paytm + Gift Card + Bank Transfer',
        ruleSource: 'Rewards Config Module'
      },
      {
        id: 'CONV-005',
        xpTier: 'VIP',
        conversionRule: '50 XP = ₹1',
        method: 'All Methods + Priority Processing',
        ruleSource: 'Rewards Config Module'
      }
    ];
    
    setConversionRules(mockConversionRules);
    setLastUpdated('12/06/2025 10:30 AM');
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    // Simulate API call to Rewards Config Module
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLastUpdated(new Date().toLocaleString());
    setLoading(false);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">XP Conversion Rules</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configuration sourced from Rewards Config Module
          </p>
        </div>
        
        {/* <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            Last updated: {lastUpdated}
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Syncing...' : 'Sync with Config'}
          </button>
        </div> */}
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  XP Tier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conversion Rule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rule Source
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {conversionRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">{rule.xpTier}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-emerald-600">
                      {rule.conversionRule}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">{rule.method}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <CogIcon className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">{rule.ruleSource}</span>
                    </div>
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