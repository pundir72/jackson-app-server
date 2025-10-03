'use client';

const FilterDropdown = ({ label, value, onChange, options, placeholder }) => (
  <div className="flex flex-col">
    <label className="text-sm font-medium text-gray-700 mb-2">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm"
    >
      <option value="all">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const FilterControls = ({ filters, onFilterChange }) => {
  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7days', label: 'Last 7 Days' },
    { value: 'last30days', label: 'Last 30 Days' },
    { value: 'last90days', label: 'Last 90 Days' },
    { value: 'lastYear', label: 'Last Year' },
    { value: 'custom', label: 'Custom Range' }
  ];

  const gameOptions = [
    { value: 'candy_crush', label: 'Candy Crush' },
    { value: 'subway_surfers', label: 'Subway Surfers' },
    { value: 'clash_of_clans', label: 'Clash of Clans' },
    { value: 'pokemon_go', label: 'Pokemon GO' },
    { value: 'fortnite', label: 'Fortnite' },
    { value: 'minecraft', label: 'Minecraft' },
    { value: 'roblox', label: 'Roblox' }
  ];

  const sourceOptions = [
    { value: 'facebook', label: 'Facebook' },
    { value: 'google', label: 'Google' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'snapchat', label: 'Snapchat' },
    { value: 'organic', label: 'Organic' },
    { value: 'referral', label: 'Referral' }
  ];

  const ageRangeOptions = [
    { value: '13-17', label: '13-17 years' },
    { value: '18-24', label: '18-24 years' },
    { value: '25-34', label: '25-34 years' },
    { value: '35-44', label: '35-44 years' },
    { value: '45-54', label: '45-54 years' },
    { value: '55+', label: '55+ years' }
  ];

  const genderOptions = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
    { value: 'not_specified', label: 'Not Specified' }
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Filter Dashboard</h2>
        <button
          onClick={() => {
            Object.keys(filters).forEach(key => {
              onFilterChange(key, 'all');
            });
            onFilterChange('dateRange', 'last30days');
          }}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Clear All Filters
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <FilterDropdown
          label="Date Range"
          value={filters.dateRange}
          onChange={(value) => onFilterChange('dateRange', value)}
          options={dateRangeOptions}
          placeholder="Select Date Range"
        />
        
        <FilterDropdown
          label="Game"
          value={filters.game}
          onChange={(value) => onFilterChange('game', value)}
          options={gameOptions}
          placeholder="All Games"
        />
        
        <FilterDropdown
          label="Source"
          value={filters.source}
          onChange={(value) => onFilterChange('source', value)}
          options={sourceOptions}
          placeholder="All Sources"
        />
        
        <FilterDropdown
          label="Age Range"
          value={filters.ageRange}
          onChange={(value) => onFilterChange('ageRange', value)}
          options={ageRangeOptions}
          placeholder="All Ages"
        />
        
        <FilterDropdown
          label="Gender"
          value={filters.gender}
          onChange={(value) => onFilterChange('gender', value)}
          options={genderOptions}
          placeholder="All Genders"
        />
      </div>
      
      {/* Active Filters Display */}
      <div className="flex flex-wrap gap-2 mt-4">
        {Object.entries(filters).map(([key, value]) => {
          if (value === 'all' || (key === 'dateRange' && value === 'last30days')) return null;
          
          const getLabel = (key, value) => {
            const optionsMap = {
              dateRange: dateRangeOptions,
              game: gameOptions,
              source: sourceOptions,
              ageRange: ageRangeOptions,
              gender: genderOptions
            };
            
            const option = optionsMap[key]?.find(opt => opt.value === value);
            return option ? option.label : value;
          };
          
          return (
            <span
              key={key}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              {getLabel(key, value)}
              <button
                onClick={() => onFilterChange(key, key === 'dateRange' ? 'last30days' : 'all')}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default FilterControls;