'use client';

const RevenueVsRewardTable = ({ data, loading }) => {
  // Mock data for demonstration
  const mockData = [
    {
      id: 1,
      game: 'Candy Crush Saga',
      icon: '🍭',
      revenue: 145000,
      rewardCost: 38000,
      marginDollar: 107000,
      marginPercent: 73.8,
      d7Retention: 35.2
    },
    {
      id: 2,
      game: 'Subway Surfers',
      icon: '🚇',
      revenue: 89000,
      rewardCost: 27000,
      marginDollar: 62000,
      marginPercent: 69.7,
      d7Retention: 42.1
    },
    {
      id: 3,
      game: 'Clash of Clans',
      icon: '⚔️',
      revenue: 198000,
      rewardCost: 45000,
      marginDollar: 153000,
      marginPercent: 77.3,
      d7Retention: 58.3
    },
    {
      id: 4,
      game: 'Pokemon GO',
      icon: '🎮',
      revenue: 156000,
      rewardCost: 52000,
      marginDollar: 104000,
      marginPercent: 66.7,
      d7Retention: 31.8
    },
    {
      id: 5,
      game: 'Fortnite',
      icon: '🔫',
      revenue: 234000,
      rewardCost: 61000,
      marginDollar: 173000,
      marginPercent: 73.9,
      d7Retention: 48.5
    },
    {
      id: 6,
      game: 'Minecraft',
      icon: '🧱',
      revenue: 123000,
      rewardCost: 28000,
      marginDollar: 95000,
      marginPercent: 77.2,
      d7Retention: 67.2
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

  // EXCLUDED: Red/green visual margin indicators & automatic underperformer flagging not supported per requirements
  // const getMarginColor = (percent) => {
  //   if (percent >= 75) return 'text-green-600 bg-green-50';
  //   if (percent >= 60) return 'text-yellow-600 bg-yellow-50';
  //   return 'text-red-600 bg-red-50';
  // };
  //
  // const getRetentionColor = (percent) => {
  //   if (percent >= 50) return 'text-green-600';
  //   if (percent >= 35) return 'text-yellow-600';
  //   return 'text-red-600';
  // };

  const getMarginColor = (percent) => {
    return 'text-gray-600 bg-gray-50';
  };

  const getRetentionColor = (percent) => {
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
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Revenue vs Reward Cost</h2>
            <p className="text-sm text-gray-600 mt-1">
              Profitability analysis by game performance
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Game</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Revenue</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Reward Cost</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Margin $</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Margin %</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">D7 Retention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockData.map((game) => (
                <tr key={game.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-2">
                    <div className="flex items-center">
                      <span className="text-lg mr-3">{game.icon}</span>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{game.game}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className="font-semibold text-gray-900 text-sm">
                      {formatCurrency(game.revenue)}
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className="text-gray-700 text-sm">
                      {formatCurrency(game.rewardCost)}
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className="font-semibold text-gray-600 text-sm">
                      {formatCurrency(game.marginDollar)}
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getMarginColor(game.marginPercent)}`}>
                      {game.marginPercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <span className={`font-semibold text-sm ${getRetentionColor(game.d7Retention)}`}>
                      {game.d7Retention.toFixed(1)}%
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

export default RevenueVsRewardTable;