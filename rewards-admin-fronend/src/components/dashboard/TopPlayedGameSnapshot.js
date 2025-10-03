'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const TopPlayedGameSnapshot = ({ data, loading }) => {
  // Data Integration Points (as per requirements):
  // - Game DB: Game name, banner image
  // EXCLUDED: Real-time XP Engine service linkage not supported per requirements
  // - XP Engine integration disabled per requirements
  // - Reward DB: Reward conversion percentage
  // - User DB: Demographics (age, gender, region segmentation)
  // - Analytics DB: User behavior and tier distribution
  
  const gameData = data || {
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
        { name: 'Platinum', value: 35, color: '#e5e5e5' },
        { name: 'Bronze', value: 40, color: '#cd7f32' }
      ]
    }
  };

  const statsData = [
    {
      value: gameData.avgXP,
      label: "Avg. XP",
      color: "#00a389",
    },
    {
      value: `${gameData.rewardConversion}%`,
      label: "Reward\nConversion",
      color: "#00a389",
    },
  ];

  const DonutChart = ({ data, title }) => {
    const RADIAN = Math.PI / 180;
    
    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
      const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
      const x = cx + radius * Math.cos(-midAngle * RADIAN);
      const y = cy + radius * Math.sin(-midAngle * RADIAN);

      return percent > 0.08 ? (
        <text 
          x={x} 
          y={y} 
          fill="white" 
          textAnchor="middle" 
          dominantBaseline="central"
          fontSize={9}
          fontWeight="bold"
        >
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      ) : null;
    };

    return (
      <div className="bg-[#02020280] rounded-[8px] p-4 shadow-[0px_0px_4px_#00000040] backdrop-blur-sm">
        <h3 className="text-center font-semibold text-white text-sm mb-3">{title}</h3>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={50}
                innerRadius={25}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [`${value}%`, 'Percentage']}
                labelStyle={{ color: '#374151' }}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {data.map((item, index) => (
            <div key={index} className="flex items-center text-xs">
              <div 
                className="w-2 h-2 rounded-full mr-1"
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="text-white truncate max-w-16">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="relative w-full h-[299px] rounded-[10px] overflow-hidden bg-gradient-to-br from-purple-600 to-indigo-800 animate-pulse">
        <div className="absolute w-full h-full bg-gray-200/20"></div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full min-h-[400px] rounded-[10px] overflow-hidden p-8"
      style={{
        background: 'radial-gradient(50% 50% at 50% 50%, rgba(88,48,173,1) 0%, rgba(42,34,102,1) 100%)'
      }}
    >
      <h1 className="text-2xl font-semibold text-white mb-8">Top Played Game</h1>

      {/* Game Banner & Title + Metrics Section */}
      <div className="flex items-start gap-8 mb-8">
        {/* Game Icon & Title */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-[140px] h-[140px] bg-white rounded-[12px] overflow-hidden border-[3px] border-solid border-[#d3f8d2] shadow-lg">
            <img
              className="w-full h-full object-cover"
              alt={gameData.name}
              src={gameData.banner}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = `<div class="w-full h-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-bold text-2xl">${gameData.name.charAt(0)}</div>`;
              }}
            />
          </div>
          <h2 className="font-bold text-[#fff2ab] text-2xl text-center leading-tight">
            {gameData.name}
          </h2>
        </div>

        {/* Key Metrics Cards */}
        <div className="flex gap-6 flex-1">
          <div className="bg-[#02020280] rounded-[8px] p-6 shadow-[0px_0px_4px_#00000040] flex-1 backdrop-blur-sm">
            <div className="text-center">
              <div className="text-5xl font-bold text-[#00a389] mb-2">
                {gameData.avgXP.toLocaleString()}
              </div>
              <div className="text-white font-medium text-sm">
                Avg. XP
              </div>
            </div>
          </div>
          
          <div className="bg-[#02020280] rounded-[8px] p-6 shadow-[0px_0px_4px_#00000040] flex-1 backdrop-blur-sm">
            <div className="text-center">
              <div className="text-5xl font-bold text-[#00a389] mb-2">
                {gameData.rewardConversion}%
              </div>
              <div className="text-white font-medium text-sm whitespace-pre-line">
                Reward{'\n'}Conversion
              </div>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        {/* <div className="flex gap-4">
          <button className="inline-flex h-[30px] items-center gap-1.5 px-3 py-1.5 bg-[#fff2ab33] rounded-[20px] border border-solid border-[#ffde5b]">
            <span className="font-semibold text-[#fff2ab] text-sm">
              Age &amp; Gender
            </span>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
            </svg>
          </button>

          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f1f1f133] rounded-[20px]">
            <span className="font-medium text-white text-sm">
              Region &amp; Tier
            </span>
          </button>
        </div> */}
      </div>

      {/* Donut Charts for Demographics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <DonutChart 
          data={gameData.demographics.age}
          title="Age"
        />
        
        <DonutChart 
          data={gameData.demographics.gender}
          title="Gender"
        />
        
        <DonutChart 
          data={gameData.demographics.region}
          title="Region"
        />
        
        <DonutChart 
          data={gameData.demographics.tier}
          title="Tier"
        />
      </div>
    </div>
  );
};

export default TopPlayedGameSnapshot;