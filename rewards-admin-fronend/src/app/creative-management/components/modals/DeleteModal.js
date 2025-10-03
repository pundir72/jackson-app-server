import React from "react";

const DeleteModal = ({ isOpen, onClose, creative, onConfirm }) => {
  if (!isOpen || !creative) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Delete Creative</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">×</button>
        </div>
        
        <p className="text-gray-800 mb-6">
          Are you sure you want to delete &quot;<span className="font-semibold">{creative.title}</span>&quot;? This creative will be archived and removed from active display.
        </p>
        
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(creative.id);
              onClose();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-md"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;