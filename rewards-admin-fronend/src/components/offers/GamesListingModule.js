'use client';

import { useState, useMemo } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, FunnelIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import Pagination from '../ui/Pagination';
import Link from 'next/link';
import EditGameModal from './modals/EditGameModal';
import ManageSegmentsModal from './modals/ManageSegmentsModal';
import GamePreviewModal from './modals/GamePreviewModal';
import ConfirmationModal from './modals/ConfirmationModal';
import TierBadge from '../ui/TierBadge';
import XPTierBadge from '../ui/XPTierBadge';

const SDK_PROVIDERS = ['BitLabs', 'AdGem', 'OfferToro', 'AdGate', 'RevenueUniverse', 'Pollfish'];
const COUNTRIES = ['US', 'CA', 'UK', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE'];
const STATUS_TYPES = ['Active', 'Inactive', 'Testing', 'Paused'];
const XP_TIERS = ['Junior', 'Mid', 'Senior', 'All'];
const TIERS = ['Bronze', 'Gold', 'Platinum', 'All'];

// mock data (includes fields used in screenshot)
const mockGames = [
  {
    id: 'PUZZLE_001',
    title: 'Puzzle Master',
    sdk: 'PUZZLE_001',
    xptrRules: 'Solve 10 puzzles',
    taskCount: 5,
    activeTasks: 3,
    countries: ['US', 'CA', 'UK'],
    status: 'Active',
    rewardXP: 750,
    rewardCoins: 150,
    adSupported: true,
    engagementTime: '45 min',
    retentionRate: 78,
    clickRate: 15,
    installRate: 9.2,
    marketingChannel: 'TikTok',
    campaign: 'Gaming Promo',
    xpTier: 'Senior',
    tier: 'Gold'
  },
  {
    id: 'GAME002',
    title: 'Survey Master Pro',
    sdk: 'BitLabs',
    xptrRules: 'Complete 3 surveys worth 100+ points each',
    taskCount: 5,
    activeTasks: 3,
    countries: ['US', 'CA', 'UK'],
    status: 'Active',
    engagementTime: '30 min',
    retentionRate: 65,
    clickRate: 10,
    installRate: 6.5,
    marketingChannel: 'Facebook',
    campaign: 'Survey Boost',
    xpTier: 'Mid',
    tier: 'Platinum'
  }
];

export default function GamesListingModule() {
  // single columns set matching combined screenshot
  const columns = [
    { key: 'title', label: 'Game Title' },
    { key: 'sdk', label: 'SDK Game' },
    { key: 'xptrRules', label: 'XPTR Rules' },
    { key: 'defaultTasks', label: 'Default Tasks' },
    { key: 'engagementTime', label: 'Engagement Time' },
    { key: 'retentionRate', label: 'Retention Rate' },
    { key: 'clickRate', label: 'Click Rate' },
    { key: 'installRate', label: 'Install Rate' },
    { key: 'marketingChannel', label: 'Marketing Channel' },
    { key: 'campaign', label: 'Campaign' },
    { key: 'countries', label: 'Countries' },
    { key: 'xpTier', label: 'XP Tier' },
    { key: 'tier', label: 'Tier' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: 'Actions' }
  ];

  const [games, setGames] = useState(mockGames);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    country: 'all',
    sdk: 'all',
    adGame: 'all',
    status: 'all',
    xpTier: 'all',
    tier: 'all'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showSegmentsModal, setShowSegmentsModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const filteredGames = useMemo(() => {
    return games.filter(game => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        game.title.toLowerCase().includes(q) ||
        (game.sdk || '').toLowerCase().includes(q) ||
        (game.id || '').toLowerCase().includes(q) ||
        (game.xptrRules || '').toLowerCase().includes(q);

      const matchesCountry = filters.country === 'all' || (game.countries || []).includes(filters.country);
      const matchesSdk = filters.sdk === 'all' || game.sdk === filters.sdk;
      const matchesStatus = filters.status === 'all' || game.status === filters.status;
      const matchesAdGame = filters.adGame === 'all' ||
        (filters.adGame === 'yes' && game.adSupported) ||
        (filters.adGame === 'no' && !game.adSupported);
      const matchesXpTier = filters.xpTier === 'all' || game.xpTier === filters.xpTier;
      const matchesTier = filters.tier === 'all' || game.tier === filters.tier;

      return matchesSearch && matchesCountry && matchesSdk && matchesStatus && matchesAdGame && matchesXpTier && matchesTier;
    });
  }, [games, searchTerm, filters]);

  const totalPages = Math.ceil(filteredGames.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedGames = filteredGames.slice(startIndex, startIndex + itemsPerPage);

  const getStatusBadge = (status) => {
    const style = {
      Active: 'bg-green-100 text-green-800',
      Inactive: 'bg-gray-100 text-gray-800',
      Testing: 'bg-blue-100 text-blue-800',
      Paused: 'bg-yellow-100 text-yellow-800'
    }[status] || 'bg-gray-100 text-gray-800';

    return (
      <span className={`inline-flex items-center justify-center min-w-[70px] px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
        {status}
      </span>
    );
  };

  const getCountryFlags = (countries) => {
    return (
      <div className="flex flex-wrap gap-1">
        {(countries || []).slice(0, 3).map(c => (
          <span key={c} className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-md" title={c}>{c}</span>
        ))}
        {(countries || []).length > 3 && <span className="text-xs ml-1 text-gray-500">+{countries.length - 3}</span>}
      </div>
    );
  };


  const handleEditGame = (game) => {
    setSelectedGame(game);
    setShowEditModal(true);
  };

  const handleCreateGame = () => {
    setSelectedGame(null);
    setShowEditModal(true);
  };

  const handleSaveGame = (gameData) => {
    if (selectedGame) {
      setGames(prev => prev.map(g => g.id === selectedGame.id ? gameData : g));
    } else {
      setGames(prev => [...prev, gameData]);
    }
    setShowEditModal(false);
    setSelectedGame(null);
  };

  const handleDeleteGame = (game) => {
    setSelectedGame(game);
    setShowDeleteModal(true);
  };

  const confirmDeleteGame = () => {
    if (selectedGame) {
      setGames(prev => prev.filter(g => g.id !== selectedGame.id));
      setShowDeleteModal(false);
      setSelectedGame(null);
    }
  };

  const handleOpenSegments = (game) => {
    setSelectedGame(game);
    setShowSegmentsModal(true);
  };

  const handleViewGame = (game) => {
    setSelectedGame(game);
    setShowPreviewModal(true);
  };

  const handleSegmentSave = (segmentData) => {
    console.log('Segment data saved:', segmentData);
    // Handle segment save logic here
  };

  const renderCell = (key, game) => {
    switch (key) {
      case 'title':
        return (
          <div>
            <div className="text-sm font-medium text-gray-900">{game.title}</div>
            <div className="text-xs text-gray-700">{game.id}</div>
          </div>
        );
      case 'sdk':
        return <div className="text-sm text-gray-900">{game.sdk}</div>;
      case 'xptrRules':
        return <div className="text-sm text-gray-700 max-w-xs truncate" title={game.xptrRules}>{game.xptrRules}</div>;
      case 'countries':
        return getCountryFlags(game.countries);
      case 'defaultTasks':
        return (
          <div>
            <div className="text-sm font-medium text-gray-900">{game.activeTasks}/{game.taskCount}</div>
            <div className="text-xs text-gray-700">Active/Total</div>
          </div>
        );
      case 'engagementTime':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-800 text-sm">{game.engagementTime}</span>;
      case 'retentionRate':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-800 text-sm">{game.retentionRate}%</span>;
      case 'clickRate':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-800 text-sm">{game.clickRate}%</span>;
      case 'installRate':
        // keep one decimal if present like 9.2
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-800 text-sm">{`${game.installRate}%`}</span>;
      case 'marketingChannel':
        return <div className="text-sm text-gray-900">{game.marketingChannel}</div>;
      case 'campaign':
        return <div className="text-sm text-gray-900">{game.campaign}</div>;
      case 'xpTier':
        return <XPTierBadge xpTier={game.xpTier} />;
      case 'tier':
        return <TierBadge tier={game.tier} />;
      case 'status':
        return getStatusBadge(game.status);
      case 'actions':
  return (
    <div className="flex items-center justify-center space-x-2">
      {/* View button */}
      <button
        onClick={() => handleViewGame(game)}
        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        title="View game details"
      >
        <EyeIcon className="h-4 w-4" />
      </button>

      {/* Edit button */}
      <button
        onClick={() => handleEditGame(game)}
        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        title="Edit game"
      >
        <PencilIcon className="h-4 w-4" />
      </button>

      {/* Tasks button (link) */}
      <Link
        href={`/offers/tasks?game=${encodeURIComponent(game.id)}`}
        className="inline-flex items-center px-3 py-1 rounded-md text-sm bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
        title="View Tasks"
      >
        Tasks
      </Link>

      {/* Delete button */}
      <button
        onClick={() => handleDeleteGame(game)}
        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
        title="Delete game"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
      default:
        return <div className="text-sm">{String(game[key] ?? '')}</div>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link href="/offers" className="text-gray-500 hover:text-gray-700 p-1 rounded-md hover:bg-gray-50"><ArrowLeftIcon className="h-5 w-5" /></Link>
                <h2 className="text-lg font-semibold text-gray-900">Games Listing</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">Displays games pushed via SDK with XP rules, country visibility, and task linkage</p>
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={handleCreateGame} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
                <PlusIcon className="h-4 w-4 mr-2" /> Add Game
              </button>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search games by title, SDK, or XPTR rules..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-md placeholder-gray-500 focus:ring-green-500 focus:border-green-500 focus:outline-none"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1"><FunnelIcon className="h-4 w-4 text-gray-500" /><span className="text-sm text-gray-700">Filters:</span></div>

              <select value={filters.country} onChange={(e) => setFilters(prev => ({ ...prev, country: e.target.value }))} className="border border-gray-300 rounded-md px-3 py-1 text-sm">
                <option value="all">All Countries</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <select value={filters.sdk} onChange={(e) => setFilters(prev => ({ ...prev, sdk: e.target.value }))} className="border border-gray-300 rounded-md px-3 py-1 text-sm">
                <option value="all">All SDKs</option>
                {SDK_PROVIDERS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <select value={filters.adGame} onChange={(e) => setFilters(prev => ({ ...prev, adGame: e.target.value }))} className="border border-gray-300 rounded-md px-3 py-1 text-sm">
                <option value="all">Ad Games</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>

              <select value={filters.status} onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))} className="border border-gray-300 rounded-md px-3 py-1 text-sm">
                <option value="all">All Status</option>
                {STATUS_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <select value={filters.xpTier} onChange={(e) => setFilters(prev => ({ ...prev, xpTier: e.target.value }))} className="border border-gray-300 rounded-md px-3 py-1 text-sm">
                <option value="all">All XP Tiers</option>
                {XP_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
              </select>

              <select value={filters.tier} onChange={(e) => setFilters(prev => ({ ...prev, tier: e.target.value }))} className="border border-gray-300 rounded-md px-3 py-1 text-sm">
                <option value="all">All Tiers</option>
                {TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map(col => (
                  <th key={col.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedGames.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || Object.values(filters).some(f => f !== 'all') ? 'No games match your filters.' : 'No games configured yet.'}
                  </td>
                </tr>
              ) : (
                paginatedGames.map(game => (
                  <tr key={game.id} className="hover:bg-gray-50">
                    {columns.map(col => (
                      <td key={col.key} className="px-6 py-4 whitespace-nowrap align-top">
                        {renderCell(col.key, game)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredGames.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex justify-end">
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
            </div>
          </div>
        )}
      </div>

      <EditGameModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedGame(null); }}
        game={selectedGame}
        onSave={handleSaveGame}
      />

      <ManageSegmentsModal
        isOpen={showSegmentsModal}
        onClose={() => { setShowSegmentsModal(false); setSelectedGame(null); }}
        offer={selectedGame}
        onSave={handleSegmentSave}
      />

      <GamePreviewModal
        isOpen={showPreviewModal}
        onClose={() => { setShowPreviewModal(false); setSelectedGame(null); }}
        game={selectedGame}
      />

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedGame(null); }}
        onConfirm={confirmDeleteGame}
        title="Delete Game"
        message={`Are you sure you want to delete the game "${selectedGame?.title}"? This action cannot be undone.`}
        confirmText="Delete Game"
        type="warning"
      />
    </div>
  );
}
