export default function UsersResultsSummary({
  startIndex,
  itemsPerPage,
  filteredCount,
  totalCount,
  searchTerm,
  selectedFilters,
  onItemsPerPageChange,
  onClearFilters,
  className = ""
}) {
  const hasActiveFilters = searchTerm || Object.values(selectedFilters).some(v => v);

  return (
    <div className={`mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sticky top-0 py-2 z-10 border-b border-gray-100 ${className}`}>
      <div className="text-sm text-gray-600">
        <span className="font-medium">Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCount)} of {filteredCount} users</span>
        {filteredCount < totalCount && (
          <span className="ml-2 text-xs text-gray-600">
            (filtered from {totalCount} total)
          </span>
        )}
        {searchTerm && (
          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
            Search: &quot;{searchTerm}&quot;
          </span>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(selectedFilters).map(([key, value]) => value && (
            <span key={key} className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: {value}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="text-sm border border-gray-300 rounded px-2 py-1"
        >
          <option value={10}>10 per page</option>
          <option value={25}>25 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}