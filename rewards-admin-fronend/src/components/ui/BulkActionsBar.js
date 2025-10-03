// EXCLUDED: Bulk actions not supported per requirements - actions can only be taken on single users
export default function BulkActionsBar({
  selectedCount,
  onBulkAction,
  onClearSelection,
  className = ""
}) {
  // Component disabled - bulk actions not allowed
  return null;

  /*
  // ORIGINAL CODE - COMMENTED OUT
  if (selectedCount === 0) return null;

  return (
    <div className={`mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between ${className}`}>
      <div className="text-sm text-blue-800">
        <span className="font-medium">{selectedCount}</span> user{selectedCount > 1 ? 's' : ''} selected
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onBulkAction('suspend')}
          className="px-3 py-1.5 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700 transition-colors"
        >
          Bulk Suspend
        </button>
        <button
          onClick={() => onBulkAction('ban')}
          className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
        >
          Bulk Ban
        </button>
        <button
          onClick={() => onBulkAction('restore')}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
        >
          Bulk Restore
        </button>
        <button
          onClick={onClearSelection}
          className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
  */
}