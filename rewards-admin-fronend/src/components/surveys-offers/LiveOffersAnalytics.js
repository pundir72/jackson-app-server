'use client';

import { useState, useMemo } from 'react';
import OffersTable from './components/OffersTable';
import OfferPreviewModal from './modals/OfferPreviewModal';
import { LIVE_OFFERS } from '../../data/surveys/surveyData';

export default function LiveOffersAnalytics() {
  const [offers, setOffers] = useState(LIVE_OFFERS);
  const [sdkFilter, setSdkFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);

  // Filtered offers
  const filteredOffers = useMemo(() => {
    return offers.filter(offer => {
      const matchesSDK = sdkFilter === 'all' || offer.sdkSource === sdkFilter;
      const matchesStatus = statusFilter === 'all' || offer.status === statusFilter;
      
      return matchesSDK && matchesStatus;
    });
  }, [offers, sdkFilter, statusFilter]);

  // Analytics calculations
  const analytics = useMemo(() => {
    const filtered = filteredOffers;
    return {
      totalOffers: filtered.length,
      liveOffers: filtered.filter(o => o.status === 'Live').length,
      totalViews: filtered.reduce((sum, o) => sum + o.engagementFunnel.views, 0),
      totalStarts: filtered.reduce((sum, o) => sum + o.engagementFunnel.starts, 0),
      totalCompletions: filtered.reduce((sum, o) => sum + o.engagementFunnel.completions, 0),
      totalCoinsIssued: filtered.reduce((sum, o) => sum + o.coinsIssued, 0),
      avgCompletionRate: filtered.length > 0 
        ? (filtered.reduce((sum, o) => sum + (o.engagementFunnel.completions / o.engagementFunnel.views || 0), 0) / filtered.length * 100).toFixed(1)
        : 0
    };
  }, [filteredOffers]);

  const handleSDKFilter = (value) => {
    setSdkFilter(value);
  };

  const handleStatusFilter = (value) => {
    setStatusFilter(value);
  };

  // Get unique SDK sources for filter dropdown
  const uniqueSDKs = useMemo(() => {
    const sdks = [...new Set(offers.map(offer => offer.sdkSource))];
    return sdks.sort();
  }, [offers]);

  // Available status options
  const statusOptions = ['Live', 'Paused', 'Draft'];

  const handlePreviewOffer = (offer) => {
    setSelectedOffer(offer);
    setShowPreviewModal(true);
  };

  // EXCLUDED: Toggle Live/Paused functionality via API not supported per requirements
  // const handleToggleOfferStatus = async (offerId) => {
  //   setOffers(prevOffers =>
  //     prevOffers.map(offer =>
  //       offer.id === offerId
  //         ? { ...offer, status: offer.status === 'Live' ? 'Paused' : 'Live' }
  //         : offer
  //     )
  //   );
  // };

  const handleExportData = (offersToExport = filteredOffers) => {
    // Create CSV content
    const headers = [
      'Offer ID',
      'Title', 
      'SDK Source',
      'Category',
      'Coin Reward',
      'Status',
      'Avg Completion Time',
      'Coins Issued',
      'Views',
      'Starts',
      'Completions',
      'Completion Rate',
      'Description'
    ];

    const csvContent = [
      headers.join(','),
      ...offersToExport.map(offer => [
        offer.id,
        `"${offer.title}"`,
        offer.sdkSource,
        offer.category,
        offer.coinReward,
        offer.status,
        offer.avgCompletionTime,
        offer.coinsIssued,
        offer.engagementFunnel.views,
        offer.engagementFunnel.starts,
        offer.engagementFunnel.completions,
        `${Math.round((offer.engagementFunnel.completions / offer.engagementFunnel.views) * 100)}%`,
        `"${offer.description}"`
      ].join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `survey-offers-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Live Offers & Analytics</h2>
          <p className="text-gray-600 mt-1">Monitor real-time survey performance and engagement metrics</p>
        </div>
        <button
          onClick={() => handleExportData()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Export Data</span>
        </button>
      </div>



      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex gap-4">
          {/* SDK Filter */}
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-2">Filter by SDK</label>
            <select
              value={sdkFilter}
              onChange={(e) => handleSDKFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            >
              <option value="all">All SDKs</option>
              {uniqueSDKs.map((sdk) => (
                <option key={sdk} value={sdk}>
                  {sdk}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            >
              <option value="all">All Status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Results Summary */}
        <div className="text-sm text-gray-600 lg:ml-auto">
          Showing {filteredOffers.length} of {offers.length} offers
          {(sdkFilter !== 'all' || statusFilter !== 'all') && (
            <span className="ml-2 text-emerald-600">
              (Filtered by {sdkFilter !== 'all' ? sdkFilter : ''}{sdkFilter !== 'all' && statusFilter !== 'all' ? ' + ' : ''}{statusFilter !== 'all' ? statusFilter : ''})
            </span>
          )}
        </div>
      </div>


      {/* Offers Table */}
      {/* EXCLUDED: Toggle Live/Paused functionality via API not supported per requirements */}
      <OffersTable
        offers={filteredOffers}
        onPreview={handlePreviewOffer}
        onExport={handleExportData}
      />

      {/* Offer Preview Modal */}
      <OfferPreviewModal
        isOpen={showPreviewModal}
        onClose={() => {
          setShowPreviewModal(false);
          setSelectedOffer(null);
        }}
        offer={selectedOffer}
      />
    </div>
  );
}