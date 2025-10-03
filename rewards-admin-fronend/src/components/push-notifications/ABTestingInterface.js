'use client';

import { useState, useMemo } from 'react';
import { useSearch } from '../../contexts/SearchContext';
import Pagination from '../ui/Pagination';
import CreateAbTestModal from './modals/CreateAbTestModal';
import TestResultsModal from './modals/TestResultsModal';

export default function ABTestingInterface({
  abTests,
  userSegments,
  campaignStatuses,
  segmentCategories,
  permissions,
  loading,
  filterAbTests,
  onCreateAbTest,
  onCalculateAudienceSize,
  onShowNotification
}) {
  const { searchTerm } = useSearch();
  const [filters, setFilters] = useState({
    status: 'All Statuses'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const itemsPerPage = 8;

  // Filter and paginate A/B tests
  const filteredAbTests = useMemo(() => {
    return filterAbTests(searchTerm, filters);
  }, [filterAbTests, searchTerm, filters]);

  const totalPages = Math.ceil(filteredAbTests.length / itemsPerPage);
  const paginatedAbTests = filteredAbTests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Status badge component for A/B tests
  const TestStatusBadge = ({ status }) => {
    const getStatusStyle = () => {
      switch (status) {
        case 'Running':
          return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'Completed':
          return 'bg-green-50 text-green-700 border-green-200';
        case 'Paused':
          return 'bg-yellow-50 text-yellow-700 border-yellow-200';
        case 'Draft':
          return 'bg-gray-50 text-gray-700 border-gray-200';
        default:
          return 'bg-gray-50 text-gray-700 border-gray-200';
      }
    };

    const getStatusIcon = () => {
      switch (status) {
        case 'Running':
          return '🧪';
        case 'Completed':
          return '✅';
        case 'Paused':
          return '⏸️';
        case 'Draft':
          return '📝';
        default:
          return '📝';
      }
    };

    return (
      <span
        className={`inline-flex items-center justify-center w-20 py-1 rounded-full text-xs font-medium border ${getStatusStyle()}`}
      >
        <span className="mr-1">{getStatusIcon()}</span>
        <span className="truncate">{status}</span>
      </span>
    );
  };



  // Handle create A/B test
  const handleCreateTest = () => {
    if (!permissions.abTest) {
      onShowNotification('You do not have permission to create A/B tests', 'error');
      return;
    }
    setShowCreateModal(true);
  };

  // Handle view results
  const handleViewResults = (test) => {
    setSelectedTest(test);
    setShowResultsModal(true);
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

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">A/B Testing Interface</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredAbTests.length} tests • {filteredAbTests.filter(t => t.status === 'Running').length} running • {filteredAbTests.filter(t => t.status === 'Completed').length} completed
          </p>
        </div>
        
        {permissions.abTest && (
          <button
            onClick={handleCreateTest}
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create A/B Test
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
              <option value="All Statuses">All Statuses</option>
              <option value="Running">Running</option>
              <option value="Completed">Completed</option>
              <option value="Paused">Paused</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* A/B Tests Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {paginatedAbTests.map((test) => (
          <div key={test.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            {/* Test Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-lg font-medium text-gray-900 truncate">
                      {test.name}
                    </h3>
                    <TestStatusBadge status={test.status} />
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {test.baseMessage}
                  </p>
                  <div className="flex items-center text-xs text-gray-500 space-x-4">
                    <span>by {test.createdBy}</span>
                    <span>•</span>
                    <span>{formatDate(test.launchedAt)}</span>
                  </div>
                </div>
              </div>

              {/* Target Segment */}
              <div className="mt-4">
                <div className="flex flex-wrap gap-1">
                  {test.targetSegment.slice(0, 3).map((segment, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {segment}
                    </span>
                  ))}
                  {test.targetSegment.length > 3 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      +{test.targetSegment.length - 3} more
                    </span>
                  )}
                </div>
              </div>

              {/* Winner Announcement */}
              {test.winner && (
                <div className="mt-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Winner: Variant {test.winner}
                  </span>
                </div>
              )}
            </div>

            {/* Variants Preview */}
            <div className="p-6 border-b border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Variant A</div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {test.variants.A.title}
                    </div>
                    <div className="text-xs text-gray-600 line-clamp-2">
                      {test.variants.A.body}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Variant B</div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {test.variants.B.title}
                    </div>
                    <div className="text-xs text-gray-600 line-clamp-2">
                      {test.variants.B.body}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Basic Performance Stats */}
            {test.stats && (test.stats.variantA.sent > 0 || test.stats.variantB.sent > 0) && (
              <div className="p-6 border-b border-gray-200">
                <div className="text-sm font-medium text-gray-700 mb-3">Performance Stats</div>
                <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                  <div>
                    <div className="font-medium">Variant A</div>
                    <div>Sent: {test.stats.variantA.sent}</div>
                    <div>CTR: {test.stats.variantA.ctr}%</div>
                  </div>
                  <div>
                    <div className="font-medium">Variant B</div>
                    <div>Sent: {test.stats.variantB.sent}</div>
                    <div>CTR: {test.stats.variantB.ctr}%</div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-6">
              <div className="flex justify-between items-center">
                <div className="text-xs text-gray-500">
                  {test.status === 'Running' ? (
                    <span>Test in progress...</span>
                  ) : test.status === 'Completed' ? (
                    <span>Completed {formatDate(test.completedAt)}</span>
                  ) : (
                    <span>Split: {test.audienceSplit}% / {100 - test.audienceSplit}%</span>
                  )}
                </div>
                
                <div className="flex space-x-2">
                  {test.stats && (test.stats.variantA.sent > 0 || test.stats.variantB.sent > 0) && (
                    <button
                      onClick={() => handleViewResults(test)}
                      className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      View Results
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredAbTests.length === 0 && (
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No A/B tests found</h3>
          <p className="text-sm text-gray-500 mb-6">
            {searchTerm || filters.status !== 'All Statuses'
              ? 'Try adjusting your filters or search term'
              : 'Create your first A/B test to optimize push notification performance'
            }
          </p>
          {permissions.abTest && (
            <button
              onClick={handleCreateTest}
              className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your First A/B Test
            </button>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredAbTests.length}
          onPageChange={setCurrentPage}
          variant="compact"
        />
      )}

      {/* Modals */}
      <CreateAbTestModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateAbTest={onCreateAbTest}
        userSegments={userSegments}
        onCalculateAudienceSize={onCalculateAudienceSize}
        onShowNotification={onShowNotification}
      />

      <TestResultsModal
        test={selectedTest}
        isOpen={showResultsModal}
        onClose={() => setShowResultsModal(false)}
      />
    </div>
  );
}