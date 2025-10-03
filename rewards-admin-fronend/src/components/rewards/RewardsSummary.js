export default function RewardsSummary({ 
  xpTiers, 
  xpDecaySettings, 
  xpConversions, 
  bonusLogic,
  auditLogs 
}) {
  const stats = {
    totalTiers: xpTiers.length,
    activeTiers: xpTiers.filter(tier => tier.status).length,
    totalDecayRules: xpDecaySettings.length,
    activeDecayRules: xpDecaySettings.filter(rule => rule.status).length,
    totalConversions: xpConversions.length,
    enabledConversions: xpConversions.filter(conv => conv.enabled).length,
    totalBonuses: bonusLogic.length,
    activeBonuses: bonusLogic.filter(bonus => bonus.active && bonus.status).length,
    recentActions: auditLogs.slice(0, 5).length
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Rewards System Overview
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-blue-600">{stats.activeTiers}</div>
          <div className="text-sm text-gray-600">Active Tiers</div>
          <div className="text-xs text-gray-500">of {stats.totalTiers} total</div>
        </div>
        
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-orange-600">{stats.activeDecayRules}</div>
          <div className="text-sm text-gray-600">Decay Rules</div>
          <div className="text-xs text-gray-500">of {stats.totalDecayRules} total</div>
        </div>
        
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-green-600">{stats.enabledConversions}</div>
          <div className="text-sm text-gray-600">Conversions</div>
          <div className="text-xs text-gray-500">of {stats.totalConversions} total</div>
        </div>
        
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-2xl font-bold text-purple-600">{stats.activeBonuses}</div>
          <div className="text-sm text-gray-600">Active Bonuses</div>
          <div className="text-xs text-gray-500">of {stats.totalBonuses} total</div>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
          ✅ Badge Upload Support
        </span>
        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">
          ✅ Inline Editing
        </span>
        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
          ✅ Bulk Operations
        </span>
        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
          ✅ Advanced Filtering
        </span>
        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full">
          ✅ Business Logic Validation
        </span>
        <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
          ✅ Audit Logging
        </span>
      </div>
    </div>
  );
}