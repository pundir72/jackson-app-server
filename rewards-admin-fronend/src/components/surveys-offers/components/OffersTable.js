'use client';

import { useState } from 'react';

export default function OffersTable({ offers, onPreview, onToggleStatus, onExport }) {
  const [loadingStates, setLoadingStates] = useState({});

  // EXCLUDED: Toggle Live/Paused functionality via API not supported per requirements
  // const handleToggleStatus = async (offerId) => {
  //   setLoadingStates(prev => ({ ...prev, [offerId]: true }));
  //   try {
  //     await onToggleStatus(offerId);
  //   } finally {
  //     setLoadingStates(prev => ({ ...prev, [offerId]: false }));
  //   }
  // };

  const getStatusBadge = (status) => {
    const styles = {
      'Live': 'bg-green-100 text-green-800',
      'Paused': 'bg-yellow-100 text-yellow-800',
      'Draft': 'bg-gray-100 text-gray-800'
    };
    
    return (
      <span className={`inline-block min-w-[70px] text-center px-3 py-1.5 rounded-full text-sm font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };


  const calculateCompletionRate = (funnel) => {
    if (!funnel.views) return '0%';
    return `${Math.round((funnel.completions / funnel.views) * 100)}%`;
  };


  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Offer Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SDK Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Coin Reward
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Avg Completion
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Coins Issued
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Engagement Funnel
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {offers.map((offer) => (
              <tr key={offer.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="font-medium text-gray-900">{offer.title}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="text-sm font-medium text-gray-900">{offer.sdkSource}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="text-sm text-gray-900">{offer.category}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="text-sm font-medium text-emerald-600">{offer.coinReward}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(offer.status)}
                    {/* EXCLUDED: Toggle Live/Paused functionality via API not supported per requirements
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={offer.status === 'Live'}
                        onChange={() => handleToggleStatus(offer.id)}
                        disabled={loadingStates[offer.id]}
                        className="sr-only"
                      />
                      <div className={`w-11 h-6 rounded-full shadow-inner transition-colors relative ${
                        offer.status === 'Live' ? 'bg-emerald-500' : 'bg-gray-300'
                      } ${loadingStates[offer.id] ? 'opacity-50' : ''}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-transform duration-200 ease-in-out ${
                          offer.status === 'Live' ? 'translate-x-5 bg-white' : 'translate-x-0.5 bg-white'
                        }`} />
                      </div>
                    </label>
                    */}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="text-sm text-gray-900">{offer.avgCompletionTime}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="text-sm font-medium text-gray-900">{offer.coinsIssued.toLocaleString()}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs text-gray-600">
                    <div>Views: {offer.engagementFunnel.views}</div>
                    <div>Starts: {offer.engagementFunnel.starts}</div>
                    <div>Completions: {offer.engagementFunnel.completions}</div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-start">
                    <button
                      onClick={() => onPreview(offer)}
                      className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors duration-200"
                    >
                      Preview
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}