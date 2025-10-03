'use client';

const KPICard = ({ title, value, icon, loading }) => {
  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-pulse">
        <div className="flex items-center">
          <div className="p-3 rounded-lg bg-gray-200 w-12 h-12"></div>
          <div className="ml-4 flex-1">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  const formatValue = (val, type) => {
    if (type === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(val);
    }
    
    if (type === 'number') {
      return new Intl.NumberFormat('en-US').format(val);
    }
    
    return val;
  };

  return (
    <div className="bg-white p-4 lg:p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-start">
        <div className={`p-2 lg:p-3 rounded-lg ${icon.bgColor} flex-shrink-0`}>
          <span className="text-xl lg:text-2xl">{icon.emoji}</span>
        </div>
        <div className="ml-3 lg:ml-4 min-w-0 flex-1">
          <p className="text-xs lg:text-sm font-medium text-gray-600 leading-tight">{title}</p>
          <p className="text-lg lg:text-2xl font-bold text-gray-900 truncate mt-1">
            {formatValue(value, icon.type)}
          </p>
        </div>
      </div>
    </div>
  );
};

const KPICards = ({ data, loading }) => {
  const kpiConfig = [
    {
      key: 'totalUsers',
      title: 'Total Registered Users',
      icon: { emoji: '👥', bgColor: 'bg-blue-100', type: 'number' }
    },
    {
      key: 'activeUsersToday',
      title: 'Active Users Today',
      icon: { emoji: '🟢', bgColor: 'bg-green-100', type: 'number' }
    },
    {
      key: 'totalRewardsIssued',
      title: 'Total Rewards Issued',
      icon: { emoji: '🪙', bgColor: 'bg-yellow-100', type: 'number' }
    },
    {
      key: 'totalRedemptions',
      title: 'Total Redemptions',
      icon: { emoji: '💰', bgColor: 'bg-emerald-100', type: 'currency' }
    },
    {
      key: 'avgXPPerUser',
      title: 'Avg. XP/User',
      icon: { emoji: '⭐', bgColor: 'bg-purple-100', type: 'number' }
    }
  ];

  return (
    <div className="mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {kpiConfig.map((config) => (
          <KPICard
            key={config.key}
            title={config.title}
            value={data[config.key]}
            icon={config.icon}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
};

export default KPICards;