import React from "react";
import Pagination from "../../../components/ui/Pagination";

const TrackerTable = ({ data, onView, currentPage, totalPages, totalItems, onPageChange }) => {
  const getStatusStyles = (status) => {
    switch (status) {
      case "Active":
        return "bg-[#d4f8d3] text-[#076758]";
      case "Inactive":
        return "bg-[#ffebee] text-[#c62828]";
      default:
        return "bg-[#d4f8d3] text-[#076758]";
    }
  };

  return (
    <div className="bg-white rounded-[10px] border border-gray-200 w-full">
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: '1200px' }}>
          <thead>
            <tr className="bg-[#ecf8f1]">
              <th className="text-left py-4 px-3 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '200px'}}>
                Creative Title
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '120px'}}>
                Placement
              </th>
              {/* <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '150px'}}>
                Campaign PID
              </th> */}
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '90px'}}>
                Status
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '120px'}}>
                Segment
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '100px'}}>
                Views
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '100px'}}>
                Clicks
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '80px'}}>
                CTR
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
                className={`border-b border-[#d0d6e7] ${index === data.length - 1 ? "border-b-0" : ""}`}
              >
                <td className="py-4 px-3">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.title}
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.placement}
                  </div>
                </td>

                {/* <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.campaignPID}
                  </div>
                </td> */}

                <td className="py-4 px-2 text-center">
                  <div className={`inline-flex items-center justify-center px-3 py-1.5 rounded-full min-w-[80px] ${getStatusStyles(row.status)}`}>
                    <div className="font-medium text-[14px] tracking-[0.1px] leading-[18px] whitespace-nowrap">
                      {row.status}
                    </div>
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.segment}
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.views.toLocaleString()}
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.clicks.toLocaleString()}
                  </div>
                </td>

                <td className="py-4 px-2 text-center">
                  <div className="font-medium text-[#00a389] text-sm tracking-[0.1px] leading-5">
                    {row.ctr}
                  </div>
                </td>

                <td className="py-4 px-2">
                  <div className="flex items-center justify-center">
                    <button 
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-[#00a389] rounded-full cursor-pointer text-xs"
                      onClick={() => onView(row)}
                    >
                      <div className="font-medium text-white text-xs tracking-[0] leading-4">
                        👁️ View
                      </div>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination 
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={onPageChange}
      />
    </div>
  );
};

export default TrackerTable;