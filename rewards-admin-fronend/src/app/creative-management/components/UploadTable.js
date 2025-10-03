import React from "react";
import Pagination from "../../../components/ui/Pagination";

const UploadTable = ({ data, onEdit, onDelete, onToggle, onPreview, currentPage, totalPages, totalItems, onPageChange }) => {
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
        <table className="w-full" style={{ minWidth: '1000px' }}>
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
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '150px'}}>
                Segment
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px]" style={{minWidth: '200px'}}>
                Actions
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

                <td className="py-4 px-2">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onPreview(row)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors duration-200"
                      title="Preview"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onEdit(row)}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-md transition-colors duration-200"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(row)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors duration-200"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onToggle(row)}
                      className={`p-2 rounded-md transition-colors duration-200 ${
                        row.status === "Active" 
                          ? "text-orange-600 hover:bg-orange-50" 
                          : "text-green-600 hover:bg-green-50"
                      }`}
                      title={row.status === "Active" ? "Deactivate" : "Activate"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                      </svg>
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

export default UploadTable;