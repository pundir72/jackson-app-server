import React, { useState, useEffect } from "react";
import { placementOptions, segmentOptions, validPIDs } from '../constants';
import { validateTitle, validateFile, validatePID, validateSegment } from '../validation';

const AddEditCreativeModal = ({ isOpen, onClose, creative, onSave, existingCreatives }) => {
  const [formData, setFormData] = useState({
    title: "",
    placement: "",
    // EXCLUDED: campaignPID, segment fields removed per requirements
    // campaignPID: "",
    // segment: [],
    status: "Active",
    file: null
  });
  
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (creative) {
      setFormData({
        title: creative.title,
        placement: creative.placement,
        // EXCLUDED: campaignPID, segment fields removed per requirements
        // campaignPID: creative.campaignPID,
        // segment: creative.segment.split(", "),
        status: creative.status,
        file: null
      });
    } else {
      setFormData({
        title: "",
        placement: "",
        // EXCLUDED: campaignPID, segment fields removed per requirements
        // campaignPID: "",
        // segment: [],
        status: "Active",
        file: null
      });
    }
  }, [creative]);

  const validateForm = () => {
    const newErrors = {};

    const titleError = validateTitle(formData.title, existingCreatives, creative?.id);
    if (titleError) newErrors.title = titleError;

    if (!creative || formData.file) {
      const fileError = validateFile(formData.file);
      if (fileError) newErrors.file = fileError;
    }

    // EXCLUDED: PID, and Segment validation removed per requirements
    // const pidError = validatePID(formData.campaignPID);
    // if (pidError) newErrors.campaignPID = pidError;
    //
    // const segmentError = validateSegment(formData.segment);
    // if (segmentError) newErrors.segment = segmentError;

    if (!formData.placement) newErrors.placement = "Placement is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const auditEntry = {
      action: creative ? 'EDIT' : 'CREATE',
      adminId: 'admin_001',
      timestamp: new Date().toISOString()
    };
    
    onSave({
      ...formData,
      // EXCLUDED: segment field processing removed per requirements
      // segment: formData.segment.join(", "),
      id: creative ? creative.id : `CRE-${Date.now()}`,
      isDeleted: false,
      auditLog: creative ? [...(creative.auditLog || []), auditEntry] : [auditEntry],
      views: creative ? creative.views : 0,
      clicks: creative ? creative.clicks : 0,
      ctr: creative ? creative.ctr : "0%"
    });
    
    onClose();
  };

  const handleSegmentChange = (segment) => {
    setFormData(prev => ({
      ...prev,
      segment: prev.segment.includes(segment) 
        ? prev.segment.filter(s => s !== segment)
        : [...prev.segment, segment]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            {creative ? "Edit Creative" : "Add New Creative"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Creative Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Creative Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, title: e.target.value }));
                if (errors.title) setErrors(prev => ({ ...prev, title: null }));
              }}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a389] focus:border-transparent ${
                errors.title ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Spin Promo Banner"
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Creative *
            </label>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                setFormData(prev => ({ ...prev, file: e.target.files[0] }));
                if (errors.file) setErrors(prev => ({ ...prev, file: null }));
              }}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a389] focus:border-transparent file:mr-4 file:py-1 file:px-2 file:border-0 file:text-sm file:bg-[#00a389] file:text-white hover:file:bg-[#008a73] ${
                errors.file ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            <p className="text-xs text-gray-700 mt-1">Supported formats: PNG, JPG, WEBP (Max: 5MB)</p>
            {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
          </div>

          {/* Assign Placement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign Placement *
            </label>
            <select
              required
              value={formData.placement}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, placement: e.target.value }));
                if (errors.placement) setErrors(prev => ({ ...prev, placement: null }));
              }}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a389] focus:border-transparent ${
                errors.placement ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select Placement</option>
              {placementOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.placement && <p className="text-red-500 text-xs mt-1">{errors.placement}</p>}
          </div>

          {/* EXCLUDED: Campaign PID mapping functionality not supported per requirements
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PID / Campaign ID *
            </label>
            <input
              type="text"
              required
              value={formData.campaignPID}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, campaignPID: e.target.value }));
                if (errors.campaignPID) setErrors(prev => ({ ...prev, campaignPID: null }));
              }}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a389] focus:border-transparent ${
                errors.campaignPID ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="fb_campaign_123"
            />
            <p className="text-xs text-gray-700 mt-1">Must match existing campaign: {validPIDs.join(', ')}</p>
            {errors.campaignPID && <p className="text-red-500 text-xs mt-1">{errors.campaignPID}</p>}
          </div>
          */}

          {/* EXCLUDED: Multi-select Target Segment filter not supported per requirements
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Segment *
            </label>
            <div className={`border rounded-md p-3 max-h-32 overflow-y-auto ${
              errors.segment ? 'border-red-500' : 'border-gray-300'
            }`}>
              {segmentOptions.map(segment => (
                <label key={segment} className="flex items-center mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.segment.includes(segment)}
                    onChange={() => {
                      handleSegmentChange(segment);
                      if (errors.segment) setErrors(prev => ({ ...prev, segment: null }));
                    }}
                    className="mr-2 text-[#00a389] focus:ring-[#00a389]"
                  />
                  <span className="text-sm text-gray-800">{segment}</span>
                </label>
              ))}
            </div>
            {errors.segment && <p className="text-red-500 text-xs mt-1">{errors.segment}</p>}
          </div>
          */}

          {/* Launch Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Launch Status
            </label>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={formData.status === "Active"}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  status: e.target.checked ? "Active" : "Inactive" 
                }))}
                className="mr-2 text-[#00a389] focus:ring-[#00a389]"
              />
              <span className="text-sm text-gray-800">Active (visible in app)</span>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#00a389] text-white rounded-md"
            >
              Save Creative
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEditCreativeModal;