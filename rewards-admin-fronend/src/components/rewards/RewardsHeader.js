import FilterDropdown from '../ui/FilterDropdown';

export default function RewardsHeader({ 
  tabs,
  activeTab,
  onTabChange,
  filterOptions,
  selectedFilters,
  onFilterChange,
  onExport,
  onAdd,
  onShowAuditLogs,
  onShowAdvancedFilter,
  selectedCount = 0,
  hasAdvancedFilters = false,
  className = ""
}) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <header className="flex flex-col lg:flex-row w-full items-start lg:items-end justify-between gap-6">
        <div className="flex-shrink-0">
          <h1 className="[font-family:'DM_Sans-SemiBold',Helvetica] font-semibold text-[#333333] text-[25.6px] tracking-[0] leading-[normal]">
            Rewards Management
          </h1>
          <p className="[font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#666666] text-[14.4px] tracking-[0] leading-[normal] mt-1">
            Manage XP tiers, decay settings, conversions, and bonus logic
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
          {selectedCount > 0 && (
            <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium h-[42px] flex items-center">
              {selectedCount} selected
            </span>
          )}
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
            onClick={onShowAdvancedFilter}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors h-[42px] whitespace-nowrap ${
              hasAdvancedFilters 
                ? 'bg-orange-600 text-white hover:bg-orange-700' 
                : 'bg-gray-600 text-white hover:bg-gray-700'
            }`}
            title="Advanced filters"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z" />
            </svg>
            {hasAdvancedFilters ? 'Filters Applied' : 'Advanced Filter'}
          </button>
          <button
            onClick={onShowAuditLogs}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors h-[42px] whitespace-nowrap"
            title="View audit logs"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Audit Logs
          </button>
          {/* <button
            onClick={onExport}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors h-[42px] whitespace-nowrap"
            title="Export data"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Export
          </button> */}
          <button
            onClick={onAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors h-[42px] whitespace-nowrap"
            title="Add new item"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New
          </button>
        </div>
      </header>

      {/* Tabs Section - Original Design */}
      <div className="w-full">
        <nav className="inline-flex items-start gap-4" role="tablist">
          {tabs.map((tab, index) => (
            <button
              key={index}
              className={`inline-flex items-center justify-center gap-2.5 px-3 py-1 relative flex-[0_0_auto] rounded transition-colors ${
                tab.name === activeTab
                  ? "bg-[#fff2ab]"
                  : "bg-[#ebebeb] hover:bg-[#e0e0e0]"
              }`}
              onClick={() => onTabChange(tab.name)}
              role="tab"
              aria-selected={tab.name === activeTab}
            >
              <div
                className={`w-fit font-semibold tracking-[0] leading-6 whitespace-nowrap [font-family:'DM_Sans',Helvetica] text-sm ${
                  tab.name === activeTab ? "text-[#c88124]" : "text-[#757575]"
                }`}
              >
                {tab.name}
              </div>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}