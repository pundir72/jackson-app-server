import FilterDropdown from '../ui/FilterDropdown';

export default function UsersHeader({
  filterOptions,
  selectedFilters,
  onFilterChange,
  onExport,
  className = ""
}) {
  return (
    <header className={`flex flex-col lg:flex-row w-full items-start lg:items-end justify-between gap-6 mb-6 ${className}`} role="banner">
      <div className="flex-shrink-0">
        <h1 className="[font-family:'DM_Sans-SemiBold',Helvetica] font-semibold text-[#333333] text-[25.6px] tracking-[0] leading-[normal]">
          Users
        </h1>
        <p className="[font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#666666] text-[14.4px] tracking-[0] leading-[normal] mt-1">
          Track all your users activity
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end" role="toolbar" aria-label="User filters">
        {filterOptions.map((filter) => (
          <FilterDropdown
            key={filter.id}
            filterId={filter.id}
            label={filter.label}
            options={filter.options}
            value={selectedFilters[filter.id]}
            onChange={onFilterChange}
          />
        ))}
        <button
          onClick={onExport}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors h-[42px] whitespace-nowrap"
          title="Export user data"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Export
        </button>
      </div>
    </header>
  );
}