'use client';

import { useState, useEffect } from 'react';
import { NOTIFICATION_TYPES, EVENT_CATEGORIES } from '../../data/notifications';
import NotificationTypeSelector from './components/NotificationTypeSelector';

export default function NotificationConfigPanel({
  notificationSettings,
  firebaseFeatures,
  triggerEvents,
  notificationRoles,
  loading,
  onUpdateSettings,
  onToggleFirebaseFeature,
  onShowNotification
}) {
  // Form state - simplified to match requirements
  const [formData, setFormData] = useState({
    notificationType: 'email',
    recipientRoles: [],
    triggerEvents: [],
    slackWebhookUrl: ''
  });

  // Initialize form data
  useEffect(() => {
    if (notificationSettings) {
      setFormData({
        notificationType: notificationSettings.email.enabled ? 'email' : 'slack',
        recipientRoles: ['admin'], // Default role
        triggerEvents: notificationSettings.email.events || [],
        slackWebhookUrl: notificationSettings.slack.webhookUrl || ''
      });
    }
  }, [notificationSettings]);

  // Handlers
  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleRoleToggle = (roleValue) => {
    setFormData(prev => ({
      ...prev,
      recipientRoles: prev.recipientRoles.includes(roleValue)
        ? prev.recipientRoles.filter(r => r !== roleValue)
        : [...prev.recipientRoles, roleValue]
    }));
  };

  const handleEventToggle = (eventValue) => {
    setFormData(prev => ({
      ...prev,
      triggerEvents: prev.triggerEvents.includes(eventValue)
        ? prev.triggerEvents.filter(e => e !== eventValue)
        : [...prev.triggerEvents, eventValue]
    }));
  };

  const handleSaveNotificationSettings = async () => {
    try {
      const settings = {
        notificationType: formData.notificationType,
        recipientRoles: formData.recipientRoles,
        triggerEvents: formData.triggerEvents,
        slackWebhookUrl: formData.slackWebhookUrl
      };

      const result = await onUpdateSettings(settings);
      if (result.success) {
        onShowNotification('Notification settings saved successfully!');
      }
    } catch (error) {
      onShowNotification('Failed to save notification settings', 'error');
    }
  };

  const handleToggleFirebase = async (featureKey) => {
    try {
      const result = await onToggleFirebaseFeature(featureKey);
      if (result.success) {
        const feature = firebaseFeatures.find(f => f.key === featureKey);
        const newStatus = feature?.enabled ? 'disabled' : 'enabled';
        onShowNotification(`Firebase ${feature?.label} ${newStatus} successfully!`);
      }
    } catch (error) {
      onShowNotification('Failed to toggle Firebase feature', 'error');
    }
  };


  return (
    <div className="space-y-8">
      {/* EXCLUDED: Notification recipients & Slack webhook alerts configuration not supported per requirements
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="text-xl mr-2">🔔</span>
            Notification Configuration
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Configure how and when administrators receive system notifications
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="notificationType" className="block text-sm font-medium text-gray-700 mb-2">
                Notification Type
              </label>
              <select
                id="notificationType"
                value={formData.notificationType}
                onChange={(e) => handleFormChange('notificationType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="email">Email</option>
                <option value="slack">Slack</option>
              </select>
            </div>

            {formData.notificationType === 'slack' && (
              <div>
                <label htmlFor="slackWebhook" className="block text-sm font-medium text-gray-700 mb-2">
                  Slack Webhook URL
                </label>
                <input
                  type="url"
                  id="slackWebhook"
                  value={formData.slackWebhookUrl}
                  onChange={(e) => handleFormChange('slackWebhookUrl', e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Recipient Group
              </label>
              {formData.recipientRoles.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleFormChange('recipientRoles', [])}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="space-y-2 border border-gray-300 rounded-lg p-3 bg-white">
              {[
                { value: 'admin', label: 'Admin' },
                { value: 'manager', label: 'Manager' },
                { value: 'publisher', label: 'Publisher' },
                { value: 'qa', label: 'QA' }
              ].map(role => (
                <label
                  key={role.value}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                >
                  <input
                    type="checkbox"
                    checked={formData.recipientRoles.includes(role.value)}
                    onChange={() => handleRoleToggle(role.value)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">{role.label}</span>
                </label>
              ))}
              {formData.recipientRoles.length === 0 && (
                <p className="text-xs text-gray-500 italic p-1">No groups selected</p>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Select which user groups should receive notifications
            </p>
          </div>
        </div>
      </div>
      */}

      {/* Trigger Events - Simple Dropdown */}
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="text-xl mr-2">⚡</span>
            Trigger Events
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Select which events should trigger notifications
          </p>
        </div>

        <div>
          <label htmlFor="triggerEvent" className="block text-sm font-medium text-gray-700 mb-2">
            Trigger Event
          </label>
          <select
            id="triggerEvent"
            value={formData.triggerEvents[0] || ''}
            onChange={(e) => handleFormChange('triggerEvents', e.target.value ? [e.target.value] : [])}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="">Select an event</option>
            <option value="cashout_failure">Cashout Failure</option>
            <option value="cashout_completed">Cashout Completed</option>
            <option value="integration_failure">Integration Failure</option>
            <option value="system_error">System Error</option>
            <option value="survey_completed">Survey Completed</option>
            <option value="reward_issued">Reward Issued</option>
          </select>
        </div>
      </div>

      {/* EXCLUDED: Firebase A/B-testing flags toggle not supported per requirements
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="text-xl mr-2">🧪</span>
            Firebase A/B Testing
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Enable or disable Firebase A/B Testing experiments
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">Firebase A/B Enabled</div>
            <div className="text-xs text-gray-500 mt-1">Toggle A/B testing experiments</div>
          </div>
          <button
            onClick={() => handleToggleFirebase('ab_testing_enabled')}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              firebaseFeatures[0]?.enabled ? 'bg-emerald-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                firebaseFeatures[0]?.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
      */}

      {/* Save Button */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={() => {
            // Reset form to initial state
            setFormData({
              notificationType: 'email',
              recipientRoles: [],
              triggerEvents: [],
              slackWebhookUrl: '',
              emailEnabled: true,
              slackEnabled: false
            });
          }}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
        >
          Reset
        </button>
        
        <button
          type="button"
          onClick={handleSaveNotificationSettings}
          disabled={loading}
          className="px-6 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </span>
          ) : (
            'Save Configuration'
          )}
        </button>
      </div>
    </div>
  );
}