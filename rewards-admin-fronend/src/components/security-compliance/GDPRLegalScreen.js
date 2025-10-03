'use client';

import { useState } from 'react';
import { exportToCSV, exportToJSON } from '../../utils/export';
import QuillRichTextEditor from '../ui/QuillRichTextEditor';

const EXPORT_FORMATS = ['JSON', 'CSV'];

export default function GDPRLegalScreen({ onSave, userData = [] }) {
  const [formData, setFormData] = useState({
    enableGDPRConsent: true,
    exportFormat: 'JSON',
    legalVersion: 'v1.0',
    legalDisclosure: ''
  });

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');

  const validateForm = () => {
    const newErrors = {};

    if (!formData.legalVersion.trim()) {
      newErrors.legalVersion = 'Legal version is required';
    }

    // For Markdown editor, we need to check plain text content
    const getPlainTextLength = (markdown) => {
      if (!markdown) return 0;
      // Remove markdown syntax to get approximate text length
      const plainText = markdown.replace(/[#*_`\[\]()]/g, '').replace(/\n/g, ' ').trim();
      return plainText.length;
    };

    const plainTextLength = getPlainTextLength(formData.legalDisclosure);
    
    if (plainTextLength === 0) {
      newErrors.legalDisclosure = 'Legal disclosure text is required';
    } else if (plainTextLength < 50) {
      newErrors.legalDisclosure = 'Legal disclosure must be at least 50 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave?.(formData);
      // Success notification would be handled by parent
    } catch (error) {
      console.error('Failed to save GDPR settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      // Get data based on selected user or all users
      let dataToExport = userData;
      
      if (selectedUser) {
        dataToExport = userData.filter(user => user.userId === selectedUser);
      }

      if (dataToExport.length === 0) {
        alert('No data available for export');
        return;
      }

      // Export based on format
      if (formData.exportFormat === 'CSV') {
        exportToCSV(dataToExport, 'user_data_export');
      } else {
        exportToJSON(dataToExport, 'user_data_export');
      }

      // Log export action for audit trail
      console.log('Data export completed:', {
        format: formData.exportFormat,
        recordCount: dataToExport.length,
        timestamp: new Date().toISOString(),
        selectedUser: selectedUser || 'all_users'
      });

    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">GDPR & Legal Compliance Configuration</h2>
        <p className="text-gray-600 text-sm mt-1">Manage GDPR consent settings, legal disclosures, and data export functionality</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* EXCLUDED: Global GDPR-consent ON/OFF toggle not supported per requirements
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">GDPR Consent Collection</h3>
              <p className="text-sm text-gray-600 mt-1">Enable or disable global GDPR consent collection for all users</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enableGDPRConsent}
                onChange={(e) => handleInputChange('enableGDPRConsent', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>
        */}

        {/* EXCLUDED: Version-tracked legal disclaimer editable by admin not supported per requirements
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Legal Disclosure Configuration</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Legal Version <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.legalVersion}
              onChange={(e) => handleInputChange('legalVersion', e.target.value)}
              className={`w-full max-w-xs px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                errors.legalVersion ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., v2.3"
            />
            {errors.legalVersion && (
              <p className="mt-1 text-sm text-red-600">{errors.legalVersion}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Legal Disclosure <span className="text-red-500">*</span>
            </label>
            <QuillRichTextEditor
              value={formData.legalDisclosure}
              onChange={(value) => handleInputChange('legalDisclosure', value)}
              placeholder="Enter legal disclosure text (minimum 50 characters)..."
              className={errors.legalDisclosure ? 'border-red-300' : ''}
              minLength={50}
            />
            {errors.legalDisclosure && (
              <p className="mt-1 text-sm text-red-600">{errors.legalDisclosure}</p>
            )}
          </div>
        </div>
        */}

        {/* Data Export Section */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Data Export for GDPR Compliance</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Export Format <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.exportFormat}
                onChange={(e) => handleInputChange('exportFormat', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                {EXPORT_FORMATS.map(format => (
                  <option key={format} value={format}>{format}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select User (Optional)
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 bg-white"
              >
                <option value="">All Users</option>
                {userData.map(user => (
                  <option key={user.userId} value={user.userId}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleExportData}
                disabled={isExporting}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
              >
                {isExporting && (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span>{isExporting ? 'Exporting...' : 'Export Now'}</span>
              </button>
            </div>
          </div>

          <div className="bg-blue-100 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-800">
                Data exports are logged for audit compliance. Exported data includes user profiles, activity history, and preferences.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => {
              setFormData({
                enableGDPRConsent: true,
                exportFormat: 'JSON',
                legalVersion: 'v1.0',
                legalDisclosure: ''
              });
              setErrors({});
            }}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Reset
          </button>
          
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isSaving && (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <span>{isSaving ? 'Saving...' : 'Save Legal Config'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}