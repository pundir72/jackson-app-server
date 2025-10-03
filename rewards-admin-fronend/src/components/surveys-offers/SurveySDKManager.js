'use client';

import { useState, useMemo } from 'react';
import SDKTable from './components/SDKTable';
import EditSDKModal from './modals/EditSDKModal';
import AddSDKModal from './modals/AddSDKModal';
import AudiencePreviewModal from './modals/AudiencePreviewModal';
import { SURVEY_SDKS } from '../../data/surveys/surveyData';

export default function SurveySDKManager() {
  const [sdks, setSdks] = useState(SURVEY_SDKS);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAudienceModal, setShowAudienceModal] = useState(false);
  const [selectedSDK, setSelectedSDK] = useState(null);

  const handleEditSDK = (sdk) => {
    setSelectedSDK(sdk);
    setShowEditModal(true);
  };

  const handlePreviewAudience = (sdk) => {
    setSelectedSDK(sdk);
    setShowAudienceModal(true);
  };

  // EXCLUDED: Toggle Live/Paused functionality via API not supported per requirements
  // const handleToggleStatus = async (sdkId) => {
  //   setSdks(prevSDKs =>
  //     prevSDKs.map(sdk =>
  //       sdk.id === sdkId
  //         ? { ...sdk, isActive: !sdk.isActive, status: !sdk.isActive ? 'Active' : 'Inactive' }
  //         : sdk
  //     )
  //   );
  // };


  const handleSaveSDK = async (sdkId, updatedData) => {
    setSdks(prevSDKs => 
      prevSDKs.map(sdk => 
        sdk.id === sdkId 
          ? { ...sdk, ...updatedData, lastUpdated: new Date().toISOString() }
          : sdk
      )
    );
  };

  const handleAddSDK = () => {
    setShowAddModal(true);
  };

  const handleAddNewSDK = async (newSDK) => {
    setSdks(prevSDKs => [...prevSDKs, newSDK]);
  };

  const handleUpdateSegmentRule = async (sdkId, newSegmentRules) => {
    setSdks(prevSDKs => 
      prevSDKs.map(sdk => 
        sdk.id === sdkId 
          ? { ...sdk, segmentRules: newSegmentRules, lastUpdated: new Date().toISOString() }
          : sdk
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Survey SDK Manager</h2>
          <p className="text-gray-600 mt-1">Configure and manage third-party survey SDKs</p>
        </div>
        <button
          onClick={handleAddSDK}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add SDK</span>
        </button>
      </div>


      {/* SDK Table */}
      {/* EXCLUDED: Toggle Live/Paused functionality via API not supported per requirements */}
      <SDKTable
        sdks={sdks}
        onEdit={handleEditSDK}
        onPreviewAudience={handlePreviewAudience}
        onUpdateSegmentRule={handleUpdateSegmentRule}
      />

      {/* Modals */}
      <EditSDKModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedSDK(null);
        }}
        onSave={handleSaveSDK}
        sdk={selectedSDK}
      />

      <AddSDKModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddNewSDK}
      />

      <AudiencePreviewModal
        isOpen={showAudienceModal}
        onClose={() => {
          setShowAudienceModal(false);
          setSelectedSDK(null);
        }}
        sdk={selectedSDK}
      />
    </div>
  );
}