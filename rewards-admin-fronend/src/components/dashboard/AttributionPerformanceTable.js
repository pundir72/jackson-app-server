'use client';

const AttributionPerformanceTable = ({ data, loading }) => {
  // Mock data for demonstration
  const mockData = [
    {
      id: 1,
      source: 'Facebook',
      icon: '📘',
      iconBg: 'bg-blue-100',
      installs: 12500,
      d1Retention: 72.5,
      revenue: 89000,
      rewardCost: 24000,
      marginPercent: 73.0,
      cpi: 2.45,
      ltv: 18.50
    },
    {
      id: 2,
      source: 'Google',
      icon: '🔍',
      iconBg: 'bg-green-100',
      installs: 8900,
      d1Retention: 68.2,
      revenue: 67000,
      rewardCost: 19000,
      marginPercent: 71.6,
      cpi: 3.10,
      ltv: 22.30
    },
    {
      id: 3,
      source: 'TikTok',
      icon: '🎵',
      iconBg: 'bg-pink-100',
      installs: 15200,
      d1Retention: 65.8,
      revenue: 78000,
      rewardCost: 28000,
      marginPercent: 64.1,
      cpi: 1.85,
      ltv: 14.20
    },
    {
      id: 4,
      source: 'Instagram',
      icon: '📷',
      iconBg: 'bg-purple-100',
      installs: 6700,
      d1Retention: 69.4,
      revenue: 45000,
      rewardCost: 14000,
      marginPercent: 68.9,
      cpi: 2.75,
      ltv: 19.80
    },
    {
      id: 5,
      source: 'Snapchat',
      icon: '👻',
      iconBg: 'bg-yellow-100',
      installs: 4200,
      d1Retention: 61.3,
      revenue: 23000,
      rewardCost: 9000,
      marginPercent: 60.9,
      cpi: 3.25,
      ltv: 16.40
    },
    {
      id: 6,
      source: 'Organic',
      icon: '🌱',
      iconBg: 'bg-emerald-100',
      installs: 3800,
      d1Retention: 78.1,
      revenue: 34000,
      rewardCost: 8000,
      marginPercent: 76.5,
      cpi: 0.00,
      ltv: 28.90
    }
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  // EXCLUDED: Red/green visual margin indicators & automatic underperformer flagging not supported per requirements
  // const getRetentionColor = (percent) => {
  //   if (percent >= 70) return 'text-green-600 bg-green-50';
  //   if (percent >= 60) return 'text-yellow-600 bg-yellow-50';
  //   return 'text-red-600 bg-red-50';
  // };
  //
  // const getMarginColor = (percent) => {
  //   if (percent >= 70) return 'text-green-600';
  //   if (percent >= 60) return 'text-yellow-600';
  //   return 'text-red-600';
  // };

  const getRetentionColor = (percent) => {
    return 'text-gray-600 bg-gray-50';
  };

  const getMarginColor = (percent) => {
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <div className="h-4 bg-gray-200 rounded flex-1"></div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalInstalls = mockData.reduce((sum, item) => sum + item.installs, 0);
  const totalRevenue = mockData.reduce((sum, item) => sum + item.revenue, 0);
  const totalRewardCost = mockData.reduce((sum, item) => sum + item.rewardCost, 0);
  const avgRetention = mockData.reduce((sum, item) => sum + item.d1Retention, 0) / mockData.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Attribution Performance</h2>
            <p className="text-sm text-gray-600 mt-1">
              Marketing channel effectiveness and ROI analysis
            </p>
          </div>
        </div>


        {/* Attribution Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Source</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Installs</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">D1 Retention</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Revenue</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Reward Cost</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockData.map((source) => (
                <tr key={source.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-2">
                    <div className="flex items-center">
                      <div className={`p-2 rounded-lg ${source.iconBg} mr-3`}>
                        <span className="text-sm">{source.icon}</span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{source.source}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className="font-semibold text-gray-900 text-sm">
                      {formatNumber(source.installs)}
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRetentionColor(source.d1Retention)}`}>
                      {source.d1Retention.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className="font-semibold text-gray-900 text-sm">
                      {formatCurrency(source.revenue)}
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className="text-gray-700 text-sm">
                      {formatCurrency(source.rewardCost)}
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className={`font-semibold text-sm ${getMarginColor(source.marginPercent)}`}>
                      {source.marginPercent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default AttributionPerformanceTable;