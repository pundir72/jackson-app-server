'use client';

import { NOTIFICATION_TYPES } from '../../../data/notifications';

export default function NotificationTypeSelector({
  selectedType,
  onTypeChange,
  disabled = false
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Notification Type
      </label>
      
      <div className="grid grid-cols-2 gap-3">
        {NOTIFICATION_TYPES.map((type) => (
          <label
            key={type.value}
            className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
              selectedType === type.value
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-300 bg-white hover:bg-gray-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name="notificationType"
              value={type.value}
              checked={selectedType === type.value}
              onChange={(e) => onTypeChange(e.target.value)}
              disabled={disabled}
              className="sr-only"
            />
            
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center">
                <div className="text-lg mr-3">{type.icon}</div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900">{type.label}</div>
                </div>
              </div>
              
              {selectedType === type.value && (
                <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}