# Onboarding API Documentation

## Base URL
```
http://localhost:3000/api/v1/onboarding
```

## Authentication
All onboarding endpoints require authentication. Include the Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Complete Onboarding Step
**POST** `/step-complete`

Complete a specific onboarding step and save associated data.

**Request Body:**
```json
{
  "step": "age_selection",
  "data": {
    "ageRange": "25_34"
  }
}
```

**Valid Steps:**
- `welcome` - Welcome screen
- `age_selection` - Age range selection
- `gender_selection` - Gender selection
- `primary_goal` - Primary goal selection
- `improvement_areas` - Improvement areas selection
- `daily_earning_goal` - Daily earning goal setting
- `game_preferences` - Game preferences selection
- `game_style` - Game style preference
- `player_type` - Player type selection
- `location_permission` - Location permission
- `face_id_setup` - Face ID setup
- `disclosure_accepted` - Disclosure acceptance

**Response:**
```json
{
  "success": true,
  "message": "Step completed successfully",
  "data": {
    "step": "age_selection",
    "nextStep": "gender_selection",
    "progress": {
      "progress": 8,
      "completedSteps": 1,
      "totalSteps": 12,
      "currentStep": "age_selection",
      "isCompleted": false
    },
    "isCompleted": false
  },
  "statusCode": 200
}
```

### 2. Get Onboarding Progress
**GET** `/progress`

Get the current onboarding progress and saved preferences.

**Response:**
```json
{
  "success": true,
  "message": "Onboarding progress retrieved successfully",
  "data": {
    "progress": {
      "progress": 25,
      "completedSteps": 3,
      "totalSteps": 12,
      "currentStep": "game_preferences",
      "isCompleted": false
    },
    "preferences": {
      "ageRange": "25-34",
      "gender": "Male",
      "gamePreferences": ["puzzle_brain", "strategy"],
      "gameStyle": "quick_casual",
      "gameHabit": "evening_reward_gamer"
    }
  },
  "statusCode": 200
}
```

### 3. Save All Onboarding Preferences
**POST** `/save-preferences`

Save all collected onboarding preferences and mark onboarding as complete.

**Request Body:**
```json
{
  "ageRange": "25_34",
  "gender": "male",
  "gamePreferences": ["puzzle", "strategy"],
  "gameStyle": "casual",
  "gameHabit": "evening_reward_gamer",
  "primaryGoal": "earn_cashback",
  "dailyEarningGoal": 50
}
```

**Response:**
```json
{
  "success": true,
  "message": "Onboarding preferences saved successfully",
  "data": {
    "preferences": {
      "ageRange": "25-34",
      "gender": "Male",
      "gamePreferences": ["puzzle_brain", "strategy"],
      "gameStyle": "quick_casual",
      "gameHabit": "evening_reward_gamer",
      "primaryGoal": "earn_cashback",
      "dailyEarningGoal": 50
    },
    "isCompleted": true
  },
  "statusCode": 200
}
```

### 4. Resume Onboarding
**GET** `/resume`

Resume onboarding from where the user left off.

**Response:**
```json
{
  "success": true,
  "message": "Onboarding resumed successfully",
  "data": {
    "currentStep": "game_preferences",
    "nextStep": "game_style",
    "progress": {
      "progress": 25,
      "completedSteps": 3,
      "totalSteps": 12,
      "currentStep": "game_preferences",
      "isCompleted": false
    },
    "isCompleted": false,
    "preferences": {
      "ageRange": "25-34",
      "gender": "Male"
    }
  },
  "statusCode": 200
}
```

## Data Mapping

The API automatically maps frontend values to backend format:

### Age Range Mapping
- Frontend: `"Under 18"` → Backend: `"under_18"`
- Frontend: `"18-24"` → Backend: `"18_24"`
- Frontend: `"25-34"` → Backend: `"25_34"`
- Frontend: `"35-44"` → Backend: `"35_44"`
- Frontend: `"45+"` → Backend: `"55_plus"`

### Game Preferences Mapping
- Frontend: `"puzzle_brain"` → Backend: `"puzzle"`
- Frontend: `"strategy"` → Backend: `"strategy"`
- Frontend: `"arcade"` → Backend: `"arcade"`
- Frontend: `"simulation"` → Backend: `"simulation"`
- Frontend: `"card_casino"` → Backend: `"casino"`
- Frontend: `"sports_racing"` → Backend: `"action"`
- Frontend: `"word_trivia"` → Backend: `"trivia"`
- Frontend: `"role_playing_adventure"` → Backend: `"simulation"`

### Game Style Mapping
- Frontend: `"quick_casual"` → Backend: `"casual"`
- Frontend: `"medium_sessions"` → Backend: `"competitive"`
- Frontend: `"deeper_strategic"` → Backend: `"educational"`

### Game Habit Mapping
- Frontend: `"evening_reward_gamer"` → Backend: `"evening_reward_gamer"`
- Frontend: `"casual_break_gamer"` → Backend: `"casual_break_gamer"`
- Frontend: `"night_reward_fail_gamer"` → Backend: `"night_reward_fail_gamer"`
- Frontend: `"fun_anytime_gamer"` → Backend: `"fun_anytime_gamer"`
- Frontend: `"daily_high_reward_gamer"` → Backend: `"daily_high_reward_gamer"`

## Error Responses

### Invalid Step
```json
{
  "success": false,
  "message": "Invalid onboarding step",
  "statusCode": 400
}
```

### Validation Error
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "ageRange",
      "message": "Invalid age range",
      "value": "invalid_age"
    }
  ],
  "statusCode": 400
}
```

## Frontend Integration Example

```javascript
// Complete age selection step
const completeAgeStep = async (ageRange) => {
  try {
    const response = await fetch('/api/v1/onboarding/step-complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        step: 'age_selection',
        data: { ageRange }
      })
    });
    
    const result = await response.json();
    if (result.success) {
      // Navigate to next step
      router.push('/select-gender');
    }
  } catch (error) {
    console.error('Error completing step:', error);
  }
};

// Get onboarding progress
const getProgress = async () => {
  try {
    const response = await fetch('/api/v1/onboarding/progress', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = await response.json();
    if (result.success) {
      setProgress(result.data.progress);
    }
  } catch (error) {
    console.error('Error getting progress:', error);
  }
};
```

## Testing

Run the onboarding tests:
```bash
npm test -- --testPathPattern=onboarding.test.js
``` 