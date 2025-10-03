import React, { useState, useEffect } from "react";

export const InputModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  title, 
  message, 
  placeholder = "",
  submitText = "Submit", 
  cancelText = "Cancel",
  type = "text", // text, textarea, select
  options = [] // for select type
}) => {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (isOpen) {
      setInputValue("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onSubmit(inputValue.trim());
      onClose();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      handleSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Background overlay */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Center modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        <div className="px-6 py-6">
          <div className="flex items-start">
            <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mr-4">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-black mb-2">
                {title}
              </h3>
              {message && (
                <p className="text-sm text-black mb-4">
                  {message}
                </p>
              )}
              <div className="mb-6">
                {type === 'select' ? (
                  <select
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  >
                    <option value="">Select an option</option>
                    {options.map((option, index) => (
                      <option key={index} value={option.value || option}>
                        {option.label || option}
                      </option>
                    ))}
                  </select>
                ) : type === 'textarea' ? (
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={placeholder}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                    autoFocus
                  />
                ) : (
                  <input
                    type={type}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    onKeyPress={handleKeyPress}
                    autoFocus
                  />
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-black bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  onClick={onClose}
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                  onClick={handleSubmit}
                  disabled={!inputValue.trim()}
                >
                  {submitText}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};