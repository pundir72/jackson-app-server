'use client';

import React, { useState, useEffect } from "react";
import { useSearch } from "../../contexts/SearchContext";
import Pagination from "../../components/ui/Pagination";

const Frame = ({ filters, setFilters, onFilterChange }) => {
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const typeOptions = ["PayPal", "Gift Card"];
  const statusOptions = ["Approved", "Pending", "Active"];

  const filterOptions = [
    {
      id: "dateRange",
      label: filters.dateRange || "Date Range",
      isOpen: dateRangeOpen,
      setOpen: setDateRangeOpen,
      options: null,
    },
    {
      id: "type",
      label: filters.type || "Type",
      isOpen: typeOpen,
      setOpen: setTypeOpen,
      options: typeOptions,
    },
    {
      id: "status",
      label: filters.status || "Status",
      isOpen: statusOpen,
      setOpen: setStatusOpen,
      options: statusOptions,
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
    <header
      className="flex flex-col lg:flex-row w-full items-start lg:items-end justify-between gap-6 mb-6"
      role="banner"
    >
      <div className="flex-shrink-0">
        <h1 className="[font-family:'DM_Sans-SemiBold',Helvetica] font-semibold text-[#333333] text-[25.6px] tracking-[0] leading-[normal]">
          Payments
        </h1>
        <p className="[font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#666666] text-[14.4px] tracking-[0] leading-[normal] mt-1">
          Track all payments from users
        </p>
      </div>


      <div className="flex flex-col gap-2 w-full lg:w-auto lg:max-w-4xl" role="toolbar" aria-label="Payment filters">
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {filterOptions.map((filter) => (
            <div key={filter.id} className="relative min-w-[150px] flex-shrink-0">
              <div className="relative h-[42px] bg-white rounded-[9.6px] shadow-[0px_3.2px_3.2px_#0000000a] border border-gray-200">
                <button
                  className="w-full h-full px-4 pr-10 bg-transparent border-none rounded-[9.6px] cursor-pointer [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#3e4954] text-[14.4px] tracking-[0] leading-[normal] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none text-left"
                  onClick={() => handleFilterClick(filter.id)}
                  aria-expanded={filter.isOpen}
                  aria-haspopup="listbox"
                  aria-label={`Filter by ${filter.label}`}
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
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#3e4954] text-[14.4px] tracking-[0] leading-[normal] first:rounded-t-[9.6px] last:rounded-b-[9.6px]"
                      onClick={() => handleFilterSelect(filter.id, option)}
                    >
                      {option}
                    </button>
                  ))}
                  <button
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#666666] text-[14.4px] tracking-[0] leading-[normal] border-t border-gray-200 last:rounded-b-[9.6px]"
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
      </div>
    </header>
  );
};

const tableData = [
  {
    id: "TXN-001234",
    userId: "983475",
    payoutMethod: "PayPal",
    amount: "₹100",
    status: "Approved",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983999",
    payoutMethod: "Gift Card",
    amount: "₹100",
    status: "Pending",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983475",
    payoutMethod: "PayPal",
    amount: "₹100",
    status: "Active",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983475",
    payoutMethod: "PayPal",
    amount: "₹100",
    status: "Active",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983475",
    payoutMethod: "PayPal",
    amount: "₹100",
    status: "Active",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983999",
    payoutMethod: "Gift Card",
    amount: "₹100",
    status: "Pending",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983475",
    payoutMethod: "PayPal",
    amount: "₹100",
    status: "Active",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983475",
    payoutMethod: "PayPal",
    amount: "₹100",
    status: "Active",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983999",
    payoutMethod: "Gift Card",
    amount: "₹100",
    status: "Pending",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983475",
    payoutMethod: "PayPal",
    amount: "₹100",
    status: "Active",
    requestedAt: "12/06/2025 at 21:45",
  },
  {
    id: "TXN-001234",
    userId: "983475",
    payoutMethod: "PayPal",
    amount: "₹100",
    status: "Active",
    requestedAt: "12/06/2025 at 21:45",
  },
];

const getStatusStyles = (status) => {
  switch (status) {
    case "Approved":
    case "Active":
      return "bg-[#d4f8d3] text-[#076758]";
    case "Pending":
      return "bg-[#fff2ab] text-[#6f631b]";
    default:
      return "bg-[#d4f8d3] text-[#076758]";
  }
};


const Table = ({ data, onApprove, currentPage, totalPages, totalItems, onPageChange }) => {
  return (
    <div className="bg-white rounded-[10px] border border-gray-200 w-full">
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: '800px' }}>
          <thead>
            <tr className="bg-[#ecf8f1]">
              <th className="text-left py-4 px-3 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '120px'}}>
                Redemption ID
              </th>
              <th className="text-left py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '100px'}}>
                User ID
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '120px'}}>
                Payout Method
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '100px'}}>
                Amount
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '90px'}}>
                Status
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '150px'}}>
                Requested At
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '100px'}}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={index}
                className={`border-b border-[#d0d6e7] hover:bg-gray-50 transition-colors ${index === data.length - 1 ? "border-b-0" : ""}`}
              >
                <td className="py-4 px-3">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.id}
                  </div>
                </td>

                <td className="py-4 px-2">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.userId}
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.payoutMethod}
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.amount}
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div
                    className={`inline-flex items-center justify-center px-2 py-1.5 rounded-full min-w-0 ${getStatusStyles(row.status)}`}
                  >
                    <div className="font-medium text-sm tracking-[0.1px] leading-4 whitespace-nowrap">
                      {row.status}
                    </div>
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#7f7f7f] text-sm tracking-[0.1px] leading-5">
                    {row.requestedAt}
                  </div>
                </td>

                <td className="py-4 px-2">
                  <div className="flex items-center justify-center">
                    {row.status === "Pending" ? (
                      <button 
                        className="inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-[#00a389] rounded-full hover:bg-[#008a73] transition-colors cursor-pointer text-xs"
                        onClick={() => onApprove(row.id)}
                      >
                        <div className="font-medium text-white text-xs tracking-[0] leading-4">
                          Approve
                        </div>
                      </button>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-200 rounded-full text-xs cursor-not-allowed">
                        <div className="font-medium text-gray-500 text-xs tracking-[0] leading-4">
                          {row.status === "Approved" ? "Approved" : "Active"}
                        </div>
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination 
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={onPageChange}
      />
    </div>
  );
};

export default function PaymentsPage() {
  const { searchTerm, registerSearchHandler } = useSearch();
  const [filters, setFilters] = useState({
    dateRange: null,
    type: null,
    status: null,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [paymentsData, setPaymentsData] = useState(tableData);
  const itemsPerPage = 10;

  useEffect(() => {
    registerSearchHandler((query) => {
      // Search functionality is automatically handled by filteredData
      setCurrentPage(1); // Reset to first page when searching
    });
  }, [registerSearchHandler]);

  const handleFilterChange = (filterId, value) => {
    setFilters(prev => ({
      ...prev,
      [filterId]: value
    }));
    setCurrentPage(1);
  };

  const handleApprove = (redemptionId) => {
    setPaymentsData(prev => 
      prev.map(payment => 
        payment.id === redemptionId 
          ? { ...payment, status: "Approved" }
          : payment
      )
    );
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const filteredData = paymentsData.filter(payment => {
    const matchesSearch = searchTerm === "" || 
      payment.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.userId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = !filters.type || payment.payoutMethod === filters.type;
    const matchesStatus = !filters.status || payment.status === filters.status;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="w-full p-6">
      <Frame 
        filters={filters}
        setFilters={setFilters}
        onFilterChange={handleFilterChange}
      />
      <Table 
        data={paginatedData}
        onApprove={handleApprove}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={handlePageChange}
      />
    </div>
  );
}