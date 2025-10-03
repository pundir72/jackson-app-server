'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import KPICards from './KPICards';
import FilterControls from './FilterControls';
import RetentionTrendGraph from './RetentionTrendGraph';
import TopPlayedGameSnapshot from './TopPlayedGameSnapshot';
import RevenueVsRewardTable from './RevenueVsRewardTable';
import AttributionPerformanceTable from './AttributionPerformanceTable';

const Dashboard = () => {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    dateRange: 'last30days',
    game: 'all',
    source: 'all',
    ageRange: 'all',
    gender: 'all'
  });
  
  const [dashboardData, setDashboardData] = useState({
    kpis: {
      totalUsers: 45789,
      activeUsersToday: 3247,
      totalRewardsIssued: 2456789,
      totalRedemptions: 1234567,
      avgXPPerUser: 847
    },
    retentionData: [],
    topGame: {
      name: 'Match 3 Daily',
      banner: 'https://c.animaapp.com/7TgsSdEJ/img/image-16@2x.png',
      avgXP: 315,
      rewardConversion: 68,
      demographics: {
        age: [
          { name: '13-17', value: 8, color: '#ff6b6b' },
          { name: '18-24', value: 22, color: '#4ecdc4' },
          { name: '25-34', value: 35, color: '#45b7d1' },
          { name: '35-44', value: 25, color: '#f9ca24' },
          { name: '45+', value: 10, color: '#6c5ce7' }
        ],
        gender: [
          { name: 'Female', value: 58, color: '#ff6b9d' },
          { name: 'Male', value: 24, color: '#4ecdc4' },
          { name: 'Other', value: 18, color: '#a0a0a0' }
        ],
        region: [
          { name: 'North America', value: 40, color: '#3742fa' },
          { name: 'Europe', value: 25, color: '#2ed573' },
          { name: 'Asia', value: 20, color: '#ffa502' },
          { name: 'Other', value: 15, color: '#6c5ce7' }
        ],
        tier: [
          { name: 'Gold', value: 25, color: '#ffd700' },
          { name: 'Platinum', value: 35, color: '#c0c0c0' },
          { name: 'Bronze', value: 40, color: '#cd7f32' }
        ]
      }
    },
    revenueData: [],
    attributionData: [],
    loading: false
  });

  const handleFilterChange = (filterKey, value) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
  };

  // EXCLUDED: Near-real-time auto-refresh functionality not supported per requirements
  // Simulate data loading based on filters
  // useEffect(() => {
  //   setDashboardData(prev => ({ ...prev, loading: true }));
  //
  //   // Simulate API call delay
  //   setTimeout(() => {
  //     setDashboardData(prev => ({
  //       ...prev,
  //       loading: false,
  //       // Data would be filtered based on current filters
  //     }));
  //   }, 500);
  // }, [filters]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Hello, {user?.firstName || 'Admin'}! 👋
        </h1>
        <p className="text-gray-600 mt-1">
          Welcome to your admin dashboard - here&apos;s what&apos;s happening today
        </p>
      </div>

      {/* Filter Controls */}
      <FilterControls 
        filters={filters} 
        onFilterChange={handleFilterChange} 
      />

      {/* KPI Cards */}
      <KPICards 
        data={dashboardData.kpis} 
        loading={dashboardData.loading} 
      />

      {/* Retention Trend Graph Section */}
      <div className="mb-6">
        <RetentionTrendGraph 
          data={dashboardData.retentionData}
          filters={filters}
          loading={dashboardData.loading}
        />
      </div>

      {/* Top Played Game Section */}
      <div className="mb-6">
        <TopPlayedGameSnapshot 
          data={dashboardData.topGame}
          loading={dashboardData.loading}
        />
      </div>

      {/* Tables Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue vs Reward Cost Table */}
        <RevenueVsRewardTable 
          data={dashboardData.revenueData}
          loading={dashboardData.loading}
        />
        
        {/* Attribution Performance Table */}
        <AttributionPerformanceTable 
          data={dashboardData.attributionData}
          loading={dashboardData.loading}
        />
      </div>
    </div>
  );
};

export default Dashboard;