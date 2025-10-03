import { useState, useRef } from 'react';

export function AddEditModal({ 
  isOpen, 
  activeTab, 
  editingItem, 
  onClose, 
  onSave 
}) {
  const [formData, setFormData] = useState({
    // XP Tiers
    tierName: editingItem?.tierName || '',
    xpMin: editingItem?.xpMin || '',
    xpMax: editingItem?.xpMax || '',
    badge: editingItem?.badge || '',
    badgeFile: null,
    accessBenefits: editingItem?.accessBenefits || '',
    status: editingItem?.status ?? true,
    // XP Decay Settings
    decayRuleType: editingItem?.decayRuleType || 'Fixed',
    inactivityDuration: editingItem?.inactivityDuration || '',
    minimumXpLimit: editingItem?.minimumXpLimit || '',
    notificationToggle: editingItem?.notificationToggle ?? true,
    xpRange: editingItem?.xpRange || '',
    // XP Conversion
    tier: editingItem?.tierName || '',
    conversionRatio: editingItem?.conversionRatio || '',
    enabled: editingItem?.enabled ?? true,
    redemptionChannels: editingItem?.redemptionChannels || [],
    newChannel: '',
    // Bonus Logic
    bonusType: editingItem?.bonusType || '',
    triggerCondition: editingItem?.triggerCondition || '',
    rewardValue: editingItem?.rewardValue || '',
    active: editingItem?.active ?? true
  });

  const [formErrors, setFormErrors] = useState({});
  const fileInputRef = useRef(null);

  const handleSubmit = () => {
    const errors = {};
    
    // Comprehensive validation with regex patterns
    if (activeTab === 'XP Tiers') {
      if (!formData.tierName) {
        errors.tierName = 'Tier name is required';
      } else if (!/^[a-zA-Z\s]+$/.test(formData.tierName)) {
        errors.tierName = 'Tier name must contain only letters and spaces';
      }
      
      if (!formData.xpMin || formData.xpMin < 0) {
        errors.xpMin = 'Min XP must be a positive number';
      }
      
      if (!formData.xpMax || formData.xpMax <= formData.xpMin) {
        errors.xpMax = 'Max XP must be greater than Min XP';
      }
    }
    
    if (activeTab === 'XP Decay Settings') {
      if (!formData.tierName) errors.tierName = 'Tier name is required';
      if (!formData.inactivityDuration) {
        errors.inactivityDuration = 'Inactivity duration is required';
      } else if (!/^\d+\s+(Days?|Weeks?|Months?)$/i.test(formData.inactivityDuration)) {
        errors.inactivityDuration = 'Format: "7 Days", "2 Weeks", etc.';
      }
      
      if (!formData.minimumXpLimit || formData.minimumXpLimit < 0) {
        errors.minimumXpLimit = 'Min XP limit must be a positive number';
      }
    }
    
    if (activeTab === 'XP Conversion') {
      if (!formData.conversionRatio) {
        errors.conversionRatio = 'Conversion ratio is required';
      } else if (!/^\d+\s+XP\s*=\s*[₹$]?\d+(\.\d{2})?\s*(Points?|₹|\$)?$/i.test(formData.conversionRatio)) {
        errors.conversionRatio = 'Format: "150 XP = ₹1" or "100 XP = 1 Point"';
      }
      
      if (!formData.redemptionChannels.length) {
        errors.redemptionChannels = 'At least one redemption channel is required';
      }
    }
    
    if (activeTab === 'Bonus Logic') {
      if (!formData.bonusType) {
        errors.bonusType = 'Bonus type is required';
      } else if (!/^[a-zA-Z\s]+$/.test(formData.bonusType)) {
        errors.bonusType = 'Bonus type must contain only letters and spaces';
      }
      
      if (!formData.triggerCondition) {
        errors.triggerCondition = 'Trigger condition is required';
      }
      
      if (!formData.rewardValue) {
        errors.rewardValue = 'Reward value is required';
      } else if (!/^\+?\d+\s+(XP|Coins?|Points?|₹|\$)$/i.test(formData.rewardValue)) {
        errors.rewardValue = 'Format: "+500 XP", "1000 Coins", or "₹50"';
      }
    }

    setFormErrors(errors);
    
    if (Object.keys(errors).length === 0) {
      onSave(formData);
    }
  };

  const resetForm = () => {
    setFormData({
      tierName: '', xpMin: '', xpMax: '', badge: '', badgeFile: null, accessBenefits: '', status: true,
      decayRuleType: 'Fixed', inactivityDuration: '', minimumXpLimit: '', notificationToggle: true,
      xpRange: '',
      tier: '', conversionRatio: '', enabled: true, redemptionChannels: [], newChannel: '',
      bonusType: '', triggerCondition: '', rewardValue: '', active: true
    });
    setFormErrors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'image/png' || file.type === 'image/svg+xml')) {
      setFormData(prev => ({ ...prev, badgeFile: file }));
    } else {
      alert('Please upload a PNG or SVG file');
    }
  };

  const addRedemptionChannel = () => {
    if (formData.newChannel && !formData.redemptionChannels.includes(formData.newChannel)) {
      setFormData(prev => ({
        ...prev,
        redemptionChannels: [...prev.redemptionChannels, prev.newChannel],
        newChannel: ''
      }));
    }
  };

  const removeRedemptionChannel = (channel) => {
    setFormData(prev => ({
      ...prev,
      redemptionChannels: prev.redemptionChannels.filter(c => c !== channel)
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-6 text-black">
            {editingItem ? `Edit ${activeTab}` : `Add New ${activeTab}`}
          </h2>

          <div className="space-y-4">
            {/* XP Tiers Fields */}
            {activeTab === 'XP Tiers' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    XP Tier <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.tierName}
                    onChange={(e) => setFormData(prev => ({ ...prev, tierName: e.target.value }))}
                    placeholder="e.g., Junior, Middle Level, Senior"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                  {formErrors.tierName && <p className="text-red-500 text-xs mt-1">{formErrors.tierName}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      Min XP <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.xpMin}
                      onChange={(e) => setFormData(prev => ({ ...prev, xpMin: parseInt(e.target.value) }))}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    />
                    {formErrors.xpMin && <p className="text-red-500 text-xs mt-1">{formErrors.xpMin}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      Max XP <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.xpMax}
                      onChange={(e) => setFormData(prev => ({ ...prev, xpMax: parseInt(e.target.value) }))}
                      placeholder="999"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    />
                    {formErrors.xpMax && <p className="text-red-500 text-xs mt-1">{formErrors.xpMax}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">Badge/Icon</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.svg"
                    onChange={handleFileUpload}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black file:mr-4 file:py-1 file:px-2 file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {formData.badgeFile && (
                    <div className="text-xs text-green-600 mt-1">File selected: {formData.badgeFile.name}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">Access Benefits</label>
                  <textarea
                    value={formData.accessBenefits}
                    onChange={(e) => setFormData(prev => ({ ...prev, accessBenefits: e.target.value }))}
                    placeholder="Describe the benefits for this tier..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="status"
                    checked={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="status" className="text-sm font-medium text-black">Active</label>
                </div>
              </>
            )}

            {/* XP Decay Settings Fields */}
            {activeTab === 'XP Decay Settings' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">XP Tier</label>
                  <input
                    type="text"
                    value={formData.tierName}
                    onChange={(e) => setFormData(prev => ({ ...prev, tierName: e.target.value }))}
                    placeholder="Junior, Middle Level, Senior..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">Decay Rule Type</label>
                  <select
                    value={formData.decayRuleType}
                    onChange={(e) => setFormData(prev => ({ ...prev, decayRuleType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  >
                    <option value="Fixed">Fixed</option>
                    <option value="Stepwise">Stepwise</option>
                    <option value="Gradual">Gradual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">XP Range</label>
                  <input
                    type="text"
                    value={formData.xpRange}
                    onChange={(e) => setFormData(prev => ({ ...prev, xpRange: e.target.value }))}
                    placeholder="0 - 999 XP"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-black mb-1">Inactivity Duration</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.inactivityDuration}
                        onChange={(e) => setFormData(prev => ({ ...prev, inactivityDuration: e.target.value }))}
                        placeholder="7 Days"
                        className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex flex-col">
                        <button
                          type="button"
                          onClick={() => {
                            const match = formData.inactivityDuration.match(/(\d+)\s*(\w+)/);
                            if (match) {
                              const num = parseInt(match[1]) + 1;
                              const unit = match[2];
                              setFormData(prev => ({ ...prev, inactivityDuration: `${num} ${unit}` }));
                            }
                          }}
                          className="text-xs text-gray-500 hover:text-gray-700 leading-none h-3 flex items-center justify-center"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const match = formData.inactivityDuration.match(/(\d+)\s*(\w+)/);
                            if (match && parseInt(match[1]) > 1) {
                              const num = parseInt(match[1]) - 1;
                              const unit = match[2];
                              setFormData(prev => ({ ...prev, inactivityDuration: `${num} ${unit}` }));
                            }
                          }}
                          className="text-xs text-gray-500 hover:text-gray-700 leading-none h-3 flex items-center justify-center"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                    {formErrors.inactivityDuration && <p className="text-red-500 text-xs mt-1">{formErrors.inactivityDuration}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-black mb-1">Min XP Limit</label>
                    <input
                      type="number"
                      value={formData.minimumXpLimit}
                      onChange={(e) => setFormData(prev => ({ ...prev, minimumXpLimit: parseInt(e.target.value) }))}
                      placeholder="100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    />
                    {formErrors.minimumXpLimit && <p className="text-red-500 text-xs mt-1">{formErrors.minimumXpLimit}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="status-decay"
                    checked={formData.status}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="status-decay" className="text-sm font-medium text-black">Active</label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="notifications"
                    checked={formData.notificationToggle}
                    onChange={(e) => setFormData(prev => ({ ...prev, notificationToggle: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="notifications" className="text-sm font-medium text-black">Send Notification</label>
                </div>
              </>
            )}

            {/* XP Conversion Fields */}
            {activeTab === 'XP Conversion' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Tier</label>
                  <select
                    value={formData.tier}
                    onChange={(e) => setFormData(prev => ({ ...prev, tier: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  >
                    <option value="">Select Tier</option>
                    <option value="Junior">Junior</option>
                    <option value="Middle Level">Middle Level</option>
                    <option value="Senior">Senior</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Conversion Ratio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.conversionRatio}
                    onChange={(e) => setFormData(prev => ({ ...prev, conversionRatio: e.target.value }))}
                    placeholder="150 XP = ₹1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                  {formErrors.conversionRatio && <p className="text-red-500 text-xs mt-1">{formErrors.conversionRatio}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Redemption Channels <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.newChannel}
                        onChange={(e) => setFormData(prev => ({ ...prev, newChannel: e.target.value }))}
                        placeholder="Add redemption channel"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                        onKeyPress={(e) => e.key === 'Enter' && addRedemptionChannel()}
                      />
                      <button
                        type="button"
                        onClick={addRedemptionChannel}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.redemptionChannels.map((channel, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          {channel}
                          <button
                            type="button"
                            onClick={() => removeRedemptionChannel(channel)}
                            className="ml-1 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    {formErrors.redemptionChannels && <p className="text-red-500 text-xs mt-1">{formErrors.redemptionChannels}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={formData.enabled}
                    onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="enabled" className="text-sm font-medium text-black">Enabled</label>
                </div>
              </>
            )}

            {/* Bonus Logic Fields */}
            {activeTab === 'Bonus Logic' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Bonus Type <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.bonusType}
                    onChange={(e) => setFormData(prev => ({ ...prev, bonusType: e.target.value }))}
                    placeholder="Login Streak, Referral, Daily Task..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                  {formErrors.bonusType && <p className="text-red-500 text-xs mt-1">{formErrors.bonusType}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Trigger Condition <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.triggerCondition}
                    onChange={(e) => setFormData(prev => ({ ...prev, triggerCondition: e.target.value }))}
                    placeholder="7 consecutive logins, Complete daily objectives..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                  {formErrors.triggerCondition && <p className="text-red-500 text-xs mt-1">{formErrors.triggerCondition}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Reward Value <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.rewardValue}
                    onChange={(e) => setFormData(prev => ({ ...prev, rewardValue: e.target.value }))}
                    placeholder="500 XP, 1000 Coins, ₹50..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  />
                  {formErrors.rewardValue && <p className="text-red-500 text-xs mt-1">{formErrors.rewardValue}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="active"
                    checked={formData.active}
                    onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="active" className="text-sm font-medium text-black">Active</label>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => {
                onClose();
                resetForm();
              }}
              className="px-4 py-2 text-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {editingItem ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeleteConfirmModal({ 
  isOpen, 
  activeTab, 
  deletingItem, 
  onClose, 
  onConfirm 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-semibold mb-4 text-red-600">
          Delete {activeTab.slice(0, -1)}
        </h2>
        <p className="text-black mb-6">
          Are you sure you want to delete <strong>{deletingItem?.tierName || deletingItem?.bonusType || 'this item'}</strong>? 
          This action cannot be undone and may affect users or system functionality.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}