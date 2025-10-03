import { useState } from 'react';

export default function RewardsTable({
  activeTab,
  data,
  onEdit,
  onDelete,
  onToggleStatus,
  selectedItems = [],
  onSelectItem,
  onSelectAll,
  className = ""
}) {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleCellEdit = (itemId, field, currentValue) => {
    setEditingCell(`${itemId}-${field}`);
    setEditValue(currentValue);
  };

  const handleCellSave = (item, field) => {
    if (editValue !== item[field]) {
      onEdit({ ...item, [field]: editValue });
    }
    setEditingCell(null);
    setEditValue('');
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const renderToggle = (value, onChange, size = 'sm') => {
    return (
      <button
        onClick={onChange}
        className={`relative inline-flex items-center h-5 rounded-full w-9 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          value ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span className="sr-only">Toggle</span>
        <span
          className={`inline-block w-3 h-3 transform transition-transform bg-white rounded-full ${
            value ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    );
  };

  const renderEditableCell = (item, field, value, type = 'text') => {
    const isEditing = editingCell === `${item.id}-${field}`;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          {type === 'select' ? (
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="text-sm border rounded px-1 py-0.5 w-20"
              onBlur={() => handleCellSave(item, field)}
              onKeyPress={(e) => e.key === 'Enter' && handleCellSave(item, field)}
              autoFocus
            >
              <option value="Fixed">Fixed</option>
              <option value="Stepwise">Stepwise</option>
              <option value="Gradual">Gradual</option>
            </select>
          ) : (
            <input
              type={type}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="text-sm border rounded px-1 py-0.5 w-16"
              onBlur={() => handleCellSave(item, field)}
              onKeyPress={(e) => e.key === 'Enter' && handleCellSave(item, field)}
              autoFocus
            />
          )}
          <button
            onClick={() => handleCellSave(item, field)}
            className="text-green-600 hover:text-green-800 text-xs"
          >
            ✓
          </button>
          <button
            onClick={handleCellCancel}
            className="text-red-600 hover:text-red-800 text-xs"
          >
            ✕
          </button>
        </div>
      );
    }
    
    return (
      <div 
        className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
        onClick={() => handleCellEdit(item.id, field, value)}
        title="Click to edit"
      >
        <span className="text-sm text-gray-700">{value}</span>
      </div>
    );
  };
  const renderTableHeaders = () => {
    switch (activeTab) {
      case "XP Tiers":
        return (
          <tr className="bg-[#ecf8f1]">
            <th className="text-left py-4 px-3 font-semibold text-[#333333] text-sm">XP Tier</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">XP Range</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Badge</th>
            <th className="text-left py-4 px-2 font-semibold text-[#333333] text-sm">Access Benefits</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Status</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Actions</th>
          </tr>
        );
      case "XP Decay Settings":
        return (
          <tr className="bg-[#ecf8f1]">
            <th className="text-left py-4 px-3 font-semibold text-[#333333] text-sm">XP Tier</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">XP Range</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Decay Rule</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Inactivity Duration</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Min XP Limit</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Notifications</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Status</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Actions</th>
          </tr>
        );
      case "XP Conversion":
        return (
          <tr className="bg-[#ecf8f1]">
            <th className="text-left py-4 px-3 font-semibold text-[#333333] text-sm">XP Tier</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Conversion Ratio</th>
            <th className="text-left py-4 px-2 font-semibold text-[#333333] text-sm">Redemption Channels</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Enabled</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Actions</th>
          </tr>
        );
      case "Bonus Logic":
        return (
          <tr className="bg-[#ecf8f1]">
            <th className="text-left py-4 px-3 font-semibold text-[#333333] text-sm">Bonus Type</th>
            <th className="text-left py-4 px-2 font-semibold text-[#333333] text-sm">Trigger Condition</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Reward Value</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Status</th>
            <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm">Actions</th>
          </tr>
        );
      default:
        return null;
    }
  };

  const renderTableRow = (item, index) => {
    switch (activeTab) {
      case "XP Tiers":
        return (
          <tr key={item.id} className={`border-b border-[#d0d6e7] hover:bg-gray-50 transition-colors ${index === data.length - 1 ? "border-b-0" : ""}`}>
            <td className="py-4 px-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex justify-center gap-1 px-2 py-1.5 rounded-full border border-solid items-center bg-gray-50 border-gray-300 min-w-[100px]">
                  <div className="font-semibold text-sm text-center tracking-[0.10px] leading-4 whitespace-nowrap text-gray-700">
                    {item.tierName}
                  </div>
                </div>
              </div>
            </td>
            <td className="py-4 px-2 text-center">
              <span className="text-sm text-gray-700">{item.xpRange}</span>
            </td>
            <td className="py-4 px-2 text-center">
              <span className="text-2xl">{item.badge}</span>
            </td>
            <td className="py-4 px-2">
              <span className="text-sm text-gray-700">{item.accessBenefits}</span>
            </td>
            <td className="py-4 px-2 text-center">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                item.status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {item.status ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td className="py-4 px-2">
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => onEdit(item)}
                  className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                  title="Edit item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(item)}
                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                  title="Delete item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        );
      
      case "XP Decay Settings":
        return (
          <tr key={item.id} className={`border-b border-[#d0d6e7] hover:bg-gray-50 transition-colors ${index === data.length - 1 ? "border-b-0" : ""}`}>
            <td className="py-4 px-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex justify-center gap-1 px-2 py-1.5 rounded-full border border-solid items-center bg-gray-50 border-gray-300 min-w-[100px]">
                  <div className="font-semibold text-sm text-center tracking-[0.10px] leading-4 whitespace-nowrap text-gray-700">
                    {item.tierName}
                  </div>
                </div>
              </div>
            </td>
            <td className="py-4 px-2 text-center">
              <span className="text-sm text-gray-700">{item.xpRange}</span>
            </td>
            <td className="py-4 px-2 text-center">
              <span className="text-sm text-gray-700">{item.decayRuleType}</span>
            </td>
            <td className="py-4 px-2 text-center">
              <span className="text-sm text-gray-700">{item.inactivityDuration}</span>
            </td>
            <td className="py-4 px-2 text-center">
              <span className="text-sm text-gray-700">{item.minimumXpLimit}</span>
            </td>
            <td className="py-4 px-2 text-center">
              <div className="flex justify-center">
                {renderToggle(
                  item.sendNotification,
                  () => onToggleStatus && onToggleStatus({ ...item, sendNotification: !item.sendNotification })
                )}
              </div>
            </td>
            <td className="py-4 px-2 text-center">
              <div className="flex justify-center">
                {renderToggle(
                  item.status,
                  () => onToggleStatus && onToggleStatus({ ...item, status: !item.status })
                )}
              </div>
            </td>
            <td className="py-4 px-2">
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => onEdit(item)}
                  className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                  title="Edit item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(item)}
                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                  title="Delete item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        );

      case "XP Conversion":
        return (
          <tr key={item.id} className={`border-b border-[#d0d6e7] hover:bg-gray-50 transition-colors ${index === data.length - 1 ? "border-b-0" : ""}`}>
            <td className="py-4 px-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex justify-center gap-1 px-2 py-1.5 rounded-full border border-solid items-center bg-gray-50 border-gray-300">
                  <div className="font-semibold text-sm text-center tracking-[0.10px] leading-4 whitespace-nowrap text-gray-700">
                    {item.tierName}
                  </div>
                </div>
              </div>
            </td>
            <td className="py-4 px-2 text-center">
              <span className="text-sm text-gray-700 font-medium">{item.conversionRatio}</span>
            </td>
            <td className="py-4 px-2">
              <div className="flex flex-wrap gap-1">
                {item.redemptionChannels.map((channel, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    {channel}
                  </span>
                ))}
              </div>
            </td>
            <td className="py-4 px-2 text-center">
              <div className="flex justify-center">
                {renderToggle(
                  item.enabled,
                  () => onToggleStatus && onToggleStatus({ ...item, enabled: !item.enabled })
                )}
              </div>
            </td>
            <td className="py-4 px-2">
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => onEdit(item)}
                  className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                  title="Edit item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(item)}
                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                  title="Delete item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        );

      case "Bonus Logic":
        return (
          <tr key={item.id} className={`border-b border-[#d0d6e7] hover:bg-gray-50 transition-colors ${index === data.length - 1 ? "border-b-0" : ""}`}>
            <td className="py-4 px-3">
              <span className="font-medium text-gray-900">{item.bonusType}</span>
            </td>
            <td className="py-4 px-2">
              <span className="text-sm text-gray-700">{item.triggerCondition}</span>
            </td>
            <td className="py-4 px-2 text-center">
              <span className="text-sm text-gray-700 font-medium">{item.rewardValue}</span>
            </td>
            <td className="py-4 px-2 text-center">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                item.status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {item.status ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td className="py-4 px-2">
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => onEdit(item)}
                  className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                  title="Edit item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(item)}
                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                  title="Delete item"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`bg-white rounded-[10px] border border-gray-200 w-full ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: '800px' }}>
          <thead>
            {renderTableHeaders()}
          </thead>
          <tbody>
            {data.map((item, index) => renderTableRow(item, index))}
          </tbody>
        </table>
      </div>
    </div>
  );
}