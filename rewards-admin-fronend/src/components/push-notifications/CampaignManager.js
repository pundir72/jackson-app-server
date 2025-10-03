'use client';

import { useState, useMemo } from 'react';
import { useSearch } from '../../contexts/SearchContext';
import Pagination from '../ui/Pagination';
import CreateCampaignModal from './modals/CreateCampaignModal';
import DeleteCampaignModal from './modals/DeleteCampaignModal';
import CampaignPreviewModal from './modals/CampaignPreviewModal';

export default function CampaignManager({
  campaigns,
  stats,
  userSegments,
  ctaRouting,
  campaignStatuses,
  campaignTypes,
  frequencyRules,
  ctaActions,
  segmentCategories,
  ctaCategories,
  gameConfigs,
  offerConfigs,
  permissions,
  loading,
  filterCampaigns,
  onCreateCampaign,
  onUpdateCampaign,
  onDeleteCampaign,
  onSendCampaign,
  onCalculateAudienceSize,
  onShowNotification
}) {
  const { searchTerm } = useSearch();
  const [filters, setFilters] = useState({
    status: 'All Statuses'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const itemsPerPage = 10;

  // Filter and paginate campaigns
  const filteredCampaigns = useMemo(() => {
    return filterCampaigns(searchTerm, filters);
  }, [filterCampaigns, searchTerm, filters]);

  const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage);
  const paginatedCampaigns = filteredCampaigns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Status badge component
  const StatusBadge = ({ status, error }) => {
    const getStatusStyle = () => {
      switch (status) {
        case 'Sent':
          return 'bg-green-50 text-green-700 border-green-200';
        case 'Scheduled':
          return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'Draft':
          return 'bg-gray-50 text-gray-700 border-gray-200';
        case 'Failed':
          return 'bg-red-50 text-red-700 border-red-200';
        default:
          return 'bg-gray-50 text-gray-700 border-gray-200';
      }
    };

    const getStatusIcon = () => {
      switch (status) {
        case 'Sent':
          return '✅';
        case 'Scheduled':
          return '🕒';
        case 'Draft':
          return '📝';
        case 'Failed':
          return '❌';
        default:
          return '📝';
      }
    };

    return (
      <span
        className={`inline-flex items-center justify-center w-16 py-1 rounded-full text-xs font-medium border ${getStatusStyle()}`}
        title={error || status}
      >
        <span className="mr-1">{getStatusIcon()}</span>
        <span className="truncate">{status}</span>
      </span>
    );
  };

  // Handle action buttons
  const handleEdit = (campaign) => {
    if (!permissions.edit) {
      onShowNotification('You do not have permission to edit campaigns', 'error');
      return;
    }
    setSelectedCampaign(campaign);
    setShowEditModal(true);
  };

  const handleDelete = (campaign) => {
    if (!permissions.delete) {
      onShowNotification('You do not have permission to delete campaigns', 'error');
      return;
    }
    setSelectedCampaign(campaign);
    setShowDeleteModal(true);
  };

  const handleSend = async (campaign) => {
    if (!permissions.send) {
      onShowNotification('You do not have permission to send campaigns', 'error');
      return;
    }

    if (campaign.status !== 'Draft') {
      onShowNotification('Only draft campaigns can be sent', 'error');
      return;
    }

    const result = await onSendCampaign(campaign.id);
    if (result.success) {
      onShowNotification(result.message, 'success');
    } else {
      onShowNotification(result.error || 'Failed to send campaign', 'error');
    }
  };

  const handlePreview = (campaign) => {
    setSelectedCampaign(campaign);
    setShowPreviewModal(true);
  };

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format stats helper
  const formatStats = (stats) => {
    if (!stats || stats.sent === 0) return 'No data';
    return `${stats.sent.toLocaleString()} sent | ${stats.openRate}% opened | ${stats.ctr}% clicked`;
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Campaign Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredCampaigns.length} campaigns • {stats.sentCampaigns} sent • {stats.scheduledCampaigns} scheduled
          </p>
        </div>
        
        {permissions.create && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Campaign
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters(prev => ({ ...prev, status: e.target.value }));
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              {campaignStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Campaign Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Campaign
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Target Segment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Schedule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performance
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedCampaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <span className="text-emerald-600 text-lg">📢</span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {campaign.name}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                          {campaign.title}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          by {campaign.createdBy}
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {campaign.targetSegment.slice(0, 2).map((segment, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {segment}
                        </span>
                      ))}
                      {campaign.targetSegment.length > 2 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          +{campaign.targetSegment.length - 2} more
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {campaign.frequencyRule}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <StatusBadge status={campaign.status} error={campaign.error} />
                  </td>
                  
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {campaign.scheduleTime ? (
                      <div>
                        <div className="font-medium">Scheduled</div>
                        <div className="text-xs text-gray-500">
                          {formatDate(campaign.scheduleTime)}
                        </div>
                      </div>
                    ) : campaign.sentAt ? (
                      <div>
                        <div className="font-medium">Sent</div>
                        <div className="text-xs text-gray-500">
                          {formatDate(campaign.sentAt)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">Not scheduled</span>
                    )}
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="text-xs text-gray-600">
                      {formatStats(campaign.stats)}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handlePreview(campaign)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Preview"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>

                      {permissions.edit && campaign.status === 'Draft' && (
                        <button
                          onClick={() => handleEdit(campaign)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}

                      {permissions.send && campaign.status === 'Draft' && (
                        <button
                          onClick={() => handleSend(campaign)}
                          className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                          title="Send Now"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        </button>
                      )}

                      {permissions.delete && (
                        <button
                          onClick={() => handleDelete(campaign)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCampaigns.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="text-sm font-medium text-gray-900">No campaigns found</h3>
            <p className="text-sm text-gray-500 mt-1">
              {searchTerm || filters.status !== 'All Statuses'
                ? 'Try adjusting your filters or search term'
                : 'Get started by creating your first push notification campaign'
              }
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredCampaigns.length}
          onPageChange={setCurrentPage}
          variant="compact"
        />
      )}

      {/* Modals */}
      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateCampaign={onCreateCampaign}
        userSegments={userSegments}
        frequencyRules={frequencyRules}
        ctaActions={ctaActions}
        gameConfigs={gameConfigs}
        offerConfigs={offerConfigs}
        onCalculateAudienceSize={onCalculateAudienceSize}
        onShowNotification={onShowNotification}
      />

      <CreateCampaignModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onCreateCampaign={(data) => onUpdateCampaign(selectedCampaign?.id, data)}
        userSegments={userSegments}
        frequencyRules={frequencyRules}
        ctaActions={ctaActions}
        gameConfigs={gameConfigs}
        offerConfigs={offerConfigs}
        onCalculateAudienceSize={onCalculateAudienceSize}
        onShowNotification={onShowNotification}
        initialData={selectedCampaign}
      />

      <CampaignPreviewModal
        campaign={selectedCampaign}
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
      />

      <DeleteCampaignModal
        campaign={selectedCampaign}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleteCampaign={onDeleteCampaign}
        onShowNotification={onShowNotification}
      />
    </div>
  );
}