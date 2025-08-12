/**
 * Onboarding Data Mapping Service
 * Converts frontend onboarding values to backend format
 */

// Map frontend age range values to backend format
const mapAgeRange = (frontendAgeRange) => {
  const ageMapping = {
    'Under 18': 'under_18',
    '18-24': '18_24',
    '25-34': '25_34',
    '35-44': '35_44',
    '45+': '55_plus'
  };
  
  return ageMapping[frontendAgeRange] || frontendAgeRange;
};

// Map frontend gender values to backend format
const mapGender = (frontendGender) => {
  const genderMapping = {
    'Male': 'male',
    'Female': 'female',
    'Other': 'other',
    'Prefer not to say': 'prefer_not_to_say'
  };
  
  return genderMapping[frontendGender] || frontendGender;
};

// Map frontend game preferences to backend format
const mapGamePreferences = (frontendPreferences) => {
  const preferenceMapping = {
    'puzzle_brain': 'puzzle',
    'strategy': 'strategy',
    'arcade': 'arcade',
    'simulation': 'simulation',
    'card_casino': 'casino',
    'sports_racing': 'action',
    'word_trivia': 'trivia',
    'role_playing_adventure': 'simulation'
  };
  
  if (!Array.isArray(frontendPreferences)) {
    return [];
  }
  
  return frontendPreferences.map(pref => preferenceMapping[pref] || pref);
};

// Map frontend game style to backend format
const mapGameStyle = (frontendGameStyle) => {
  const styleMapping = {
    'quick_casual': 'casual',
    'medium_sessions': 'competitive',
    'deeper_strategic': 'educational'
  };
  
  return styleMapping[frontendGameStyle] || frontendGameStyle;
};

// Map frontend game habit to backend format
const mapGameHabit = (frontendGameHabit) => {
  const habitMapping = {
    'evening_reward_gamer': 'evening_reward_gamer',
    'casual_break_gamer': 'casual_break_gamer',
    'night_reward_fail_gamer': 'night_reward_fail_gamer',
    'fun_anytime_gamer': 'fun_anytime_gamer',
    'daily_high_reward_gamer': 'daily_high_reward_gamer'
  };
  
  return habitMapping[frontendGameHabit] || frontendGameHabit;
};

// Map frontend primary goal to backend format
const mapPrimaryGoal = (frontendGoal) => {
  const goalMapping = {
    'save_money': 'save_money',
    'earn_cashback': 'earn_cashback',
    'play_games': 'play_games',
    'learn_finance': 'learn_finance',
    'social_connection': 'social_connection',
    'entertainment': 'entertainment',
    'other': 'other'
  };
  
  return goalMapping[frontendGoal] || frontendGoal;
};

// Main mapping function for onboarding data
const mapOnboardingData = (frontendData) => {
  const mappedData = {};
  
  // Map age range
  if (frontendData.ageRange) {
    mappedData.ageRange = mapAgeRange(frontendData.ageRange);
  }
  
  // Map gender
  if (frontendData.gender) {
    mappedData.gender = mapGender(frontendData.gender);
  }
  
  // Map game preferences
  if (frontendData.gamePreferences) {
    mappedData.gamePreferences = mapGamePreferences(frontendData.gamePreferences);
  }
  
  // Map game style
  if (frontendData.gameStyle) {
    mappedData.gameStyle = mapGameStyle(frontendData.gameStyle);
  }
  
  // Map game habit
  if (frontendData.gameHabit) {
    mappedData.gameHabit = mapGameHabit(frontendData.gameHabit);
  }
  
  // Map primary goal
  if (frontendData.primaryGoal) {
    mappedData.primaryGoal = mapPrimaryGoal(frontendData.primaryGoal);
  }
  
  // Map daily earning goal (no transformation needed)
  if (frontendData.dailyEarningGoal !== undefined) {
    mappedData.dailyEarningGoal = frontendData.dailyEarningGoal;
  }
  
  return mappedData;
};

// Map backend data back to frontend format (for responses)
const mapBackendToFrontend = (backendData) => {
  const frontendData = {};
  
  // Reverse age range mapping
  if (backendData.ageRange) {
    const reverseAgeMapping = {
      'under_18': 'Under 18',
      '18_24': '18-24',
      '25_34': '25-34',
      '35_44': '35-44',
      '45_54': '35-44', // Map to closest frontend value
      '55_plus': '45+'
    };
    frontendData.ageRange = reverseAgeMapping[backendData.ageRange] || backendData.ageRange;
  }
  
  // Reverse gender mapping
  if (backendData.gender) {
    const reverseGenderMapping = {
      'male': 'Male',
      'female': 'Female',
      'other': 'Other',
      'prefer_not_to_say': 'Prefer not to say'
    };
    frontendData.gender = reverseGenderMapping[backendData.gender] || backendData.gender;
  }
  
  // Reverse game preferences mapping
  if (backendData.gamePreferences) {
    const reversePreferenceMapping = {
      'puzzle': 'puzzle_brain',
      'strategy': 'strategy',
      'arcade': 'arcade',
      'simulation': 'simulation',
      'casino': 'card_casino',
      'action': 'sports_racing',
      'trivia': 'word_trivia'
    };
    frontendData.gamePreferences = backendData.gamePreferences.map(pref => 
      reversePreferenceMapping[pref] || pref
    );
  }
  
  // Reverse game style mapping
  if (backendData.gameStyle) {
    const reverseStyleMapping = {
      'casual': 'quick_casual',
      'competitive': 'medium_sessions',
      'educational': 'deeper_strategic'
    };
    frontendData.gameStyle = reverseStyleMapping[backendData.gameStyle] || backendData.gameStyle;
  }
  
  // Reverse game habit mapping (no transformation needed)
  if (backendData.gameHabit) {
    frontendData.gameHabit = backendData.gameHabit;
  }
  
  // Reverse primary goal mapping (no transformation needed)
  if (backendData.primaryGoal) {
    frontendData.primaryGoal = backendData.primaryGoal;
  }
  
  // Daily earning goal (no transformation needed)
  if (backendData.dailyEarningGoal !== undefined) {
    frontendData.dailyEarningGoal = backendData.dailyEarningGoal;
  }
  
  return frontendData;
};

module.exports = {
  mapOnboardingData,
  mapBackendToFrontend,
  mapAgeRange,
  mapGender,
  mapGamePreferences,
  mapGameStyle,
  mapGameHabit,
  mapPrimaryGoal
}; 