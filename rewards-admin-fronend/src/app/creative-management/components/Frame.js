import React, { useState } from "react";
import { placementOptions, segmentOptions, validPIDs } from './constants';

const Frame = ({ activeTab, setActiveTab, filters, onFilterChange, onAddNew }) => {
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pidOpen, setPidOpen] = useState(false);
  const [segmentOpen, setSegmentOpen] = useState(false);

  const placementFilterOptions = ["All Placements", ...placementOptions];
  const statusFilterOptions = ["All Status", "Active", "Inactive"];
  const pidFilterOptions = ["All PIDs", ...validPIDs];
  const segmentFilterOptions = ["All Segments", ...segmentOptions];

  const filterOptions = [
    {
      id: "dateRange",
      label: filters.dateRange || "Date Range",
      isOpen: dateRangeOpen,
      setOpen: setDateRangeOpen,
      options: null,
    },
    // EXCLUDED: Placement, Campaign PID, and Segment filters not supported per requirements
    // {
    //   id: "placement",
    //   label: filters.placement || "Placement",
    //   isOpen: placementOpen,
    //   setOpen: setPlacementOpen,
    //   options: placementFilterOptions,
    // },
    // {
    //   id: "pid",
    //   label: filters.pid || "Campaign PID",
    //   isOpen: pidOpen,
    //   setOpen: setPidOpen,
    //   options: pidFilterOptions,
    // },
    // {
    //   id: "segment",
    //   label: filters.segment || "Segment",
    //   isOpen: segmentOpen,
    //   setOpen: setSegmentOpen,
    //   options: segmentFilterOptions,
    // },
    {
      id: "status",
      label: filters.status || "Status",
      isOpen: statusOpen,
      setOpen: setStatusOpen,
      options: statusFilterOptions,
    },
  ];

  const handleFilterClick = (filterId) => {
    const filter = filterOptions.find((f) => f.id === filterId);
    if (filter) {
      filter.setOpen(!filter.isOpen);
    }
  };

  const handleFilterSelect = (filterId, value) => {
    onFilterChange(filterId, value);
    const filter = filterOptions.find((f) => f.id === filterId);
    if (filter) {
      filter.setOpen(false);
    }
  };

  const handleDateRangeSelect = (range) => {
    onFilterChange("dateRange", range);
    setDateRangeOpen(false);
  };

  return (
    <div>
      <header className="w-full mb-6" role="banner">
        {/* Title Section */}
        <div className="mb-6">
          <h1 className="[font-family:'DM_Sans-SemiBold',Helvetica] font-semibold text-[#333333] text-[25.6px] tracking-[0] leading-[normal]">
            Creative Management
          </h1>
          <p className="[font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#666666] text-[14.4px] tracking-[0] leading-[normal] mt-1">
            Manage and track creative assets and performance
          </p>
        </div>

        {/* Filters and Actions Section */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 flex-1 lg:max-w-4xl order-2 lg:order-1">
            <span className="text-sm font-medium text-[#333333] mr-2 hidden sm:inline">Filters:</span>
              {filterOptions.map((filter) => (
                <div key={filter.id} className="relative min-w-[150px] flex-shrink-0">
                  <div className="relative h-[42px] bg-white rounded-[9.6px] border border-gray-200">
                    <button
                      className="w-full h-full px-4 pr-10 bg-transparent border-none rounded-[9.6px] cursor-pointer font-medium text-[#3e4954] text-[14.4px] text-left"
                      onClick={() => handleFilterClick(filter.id)}
                    >
                      {filter.label}
                    </button>
                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                      <svg className="w-3 h-2 text-[#3e4954]" fill="currentColor" viewBox="0 0 12 7">
                        <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  {/* Dropdown Options */}
                  {filter.isOpen && filter.options && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-[9.6px] shadow-lg border border-gray-200 z-10">
                      {filter.options.map((option, optionIndex) => (
                        <button
                          key={optionIndex}
                          className="w-full px-4 py-3 text-left bg-white font-medium text-[#3e4954] text-[14.4px]"
                          onClick={() => handleFilterSelect(filter.id, option)}
                        >
                          {option}
                        </button>
                      ))}
                      <button
                        className="w-full px-4 py-3 text-left bg-white font-medium text-[#666666] text-[14.4px] border-t border-gray-200"
                        onClick={() => handleFilterSelect(filter.id, null)}
                      >
                        Clear Filter
                      </button>
                    </div>
                  )}

                  {/* Date Range Picker */}
                  {filter.id === "dateRange" && filter.isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-[9.6px] shadow-lg border border-gray-200 z-10 p-4 min-w-[300px]">
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-[#333333] mb-2">Select Date Range</div>
                        <div className="grid grid-cols-1 gap-2">
                          <button
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 rounded-md [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#3e4954] text-[14px]"
                            onClick={() => handleDateRangeSelect("Today")}
                          >
                            Today
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 rounded-md [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#3e4954] text-[14px]"
                            onClick={() => handleDateRangeSelect("Yesterday")}
                          >
                            Yesterday
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 rounded-md [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#3e4954] text-[14px]"
                            onClick={() => handleDateRangeSelect("Last 7 days")}
                          >
                            Last 7 days
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 rounded-md [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#3e4954] text-[14px]"
                            onClick={() => handleDateRangeSelect("Last 30 days")}
                          >
                            Last 30 days
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 rounded-md [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#666666] text-[14px] border-t border-gray-200 mt-2 pt-3"
                            onClick={() => handleDateRangeSelect(null)}
                          >
                            Clear Filter
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
          
          <div className="flex-shrink-0 order-1 lg:order-2">
            <button
              onClick={onAddNew}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#00a389] text-white rounded-[9.6px] font-medium text-[14.4px] whitespace-nowrap hover:bg-[#008a73] transition-colors duration-200 shadow-sm"
            >
              + Add New Creative
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 ${
            activeTab === "upload" 
              ? "border-[#00a389] text-[#00a389]" 
              : "border-transparent text-gray-500"
          }`}
          onClick={() => setActiveTab("upload")}
        >
          Upload & Assign Creatives
        </button>
        {/* EXCLUDED: Campaign Tracker tab with drill-down functionality not supported per requirements
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 ${
            activeTab === "tracker"
              ? "border-[#00a389] text-[#00a389]"
              : "border-transparent text-gray-500"
          }`}
          onClick={() => setActiveTab("tracker")}
        >
          Creative Campaign Tracker
        </button>
        */}
      </div>
    </div>
  );
};

export default Frame;