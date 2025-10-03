import React from "react";

const ViewDetailsModal = ({ isOpen, onClose, creative }) => {
  if (!isOpen || !creative) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Campaign Details: {creative.title}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Performance Metrics */}
          <div>
            <h3 className="text-lg font-medium mb-4">Performance Metrics</h3>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{creative.views?.toLocaleString()}</div>
                <div className="text-sm text-blue-600">Total Views</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{creative.clicks?.toLocaleString()}</div>
                <div className="text-sm text-green-600">Total Clicks</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{creative.ctr}</div>
                <div className="text-sm text-purple-600">Click Through Rate</div>
              </div>
            </div>
          </div>

          {/* Campaign Information */}
          <div>
            <h3 className="text-lg font-medium mb-4">Campaign Information</h3>
            <div className="space-y-3">
              <div>
                <span className="font-medium text-gray-800">Creative ID:</span>
                <span className="ml-2 text-gray-900 font-mono">{creative.id}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Title:</span>
                <span className="ml-2 text-gray-900">{creative.title}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Placement:</span>
                <span className="ml-2 text-gray-900">{creative.placement}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Campaign PID:</span>
                <span className="ml-2 text-gray-900 font-mono">{creative.campaignPID}</span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Status:</span>
                <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                  creative.status === "Active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}>
                  {creative.status}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-800">Target Segment:</span>
                <span className="ml-2 text-gray-900">{creative.segment}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewDetailsModal;