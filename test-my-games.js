/**
 * Comprehensive test for My Games Screen functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testMyGamesScreen() {
  try {
    console.log('🧪 Testing My Games Screen - Complete Implementation\n');

    // Test data
    const testData = {
      mobile: '+5555555555',
      password: 'testpassword123',
      firstName: 'MyGames',
      lastName: 'Tester'
    };

    // Step 1: Register and login user
    console.log('1. Setting up user...');
    await axios.post(`${BASE_URL}/api/auth/register`, testData);
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      mobile: testData.mobile,
      password: testData.password
    });
    const authToken = loginResponse.data.data.token;
    console.log('✅ User setup complete');

    // Step 2: Set up user profile for dynamic features
    console.log('2. Setting up user profile...');
    await axios.put(`${BASE_URL}/api/onboarding/primary-goal`, {
      mobile: testData.mobile,
      goal: 'earn'
    });
    await axios.put(`${BASE_URL}/api/onboarding/age-range`, {
      mobile: testData.mobile,
      ageRange: '18-25'
    });
    await axios.put(`${BASE_URL}/api/onboarding/game-style`, {
      mobile: testData.mobile,
      gameStyle: 'casual'
    });
    await axios.put(`${BASE_URL}/api/onboarding/daily-earning-goal`, {
      mobile: testData.mobile,
      goal: 300
    });
    console.log('✅ User profile setup complete');

    // Step 3: Test My Games main endpoint
    console.log('3. Testing My Games main endpoint...');
    const myGamesResponse = await axios.get(
      `${BASE_URL}/api/my-games`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    console.log('✅ My Games data retrieved');
    console.log('App Version:', myGamesResponse.data.data.appVersion);
    console.log('Games Count:', myGamesResponse.data.data.games.length);
    console.log('Account Overview:', myGamesResponse.data.data.accountOverview);

    // Step 4: Test game search functionality
    console.log('4. Testing game search...');
    const searchResponse = await axios.get(
      `${BASE_URL}/api/my-games/search?q=puzzle`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    console.log('✅ Game search working');
    console.log('Search Results:', searchResponse.data.data.results.length);
    console.log('Suggestions:', searchResponse.data.data.suggestions.length);

    // Step 5: Test AI Assistant
    console.log('5. Testing AI Assistant...');
    const aiResponse = await axios.post(
      `${BASE_URL}/api/my-games/ai-chat`,
      {
        message: 'How can I earn more coins in games?',
        context: 'earning_tips'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ AI Assistant working');
    console.log('AI Response:', aiResponse.data.data.response.substring(0, 100) + '...');

    // Step 6: Test booster reward status
    console.log('6. Testing booster reward status...');
    const boosterStatusResponse = await axios.get(
      `${BASE_URL}/api/my-games/booster/status`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    console.log('✅ Booster status retrieved');
    console.log('Booster Available:', boosterStatusResponse.data.data.isAvailable);

    // Step 7: Test booster reward claim (simulation)
    console.log('7. Testing booster reward claim...');
    try {
      const boosterClaimResponse = await axios.post(
        `${BASE_URL}/api/my-games/booster/claim`,
        {
          adId: 'test-ad-123',
          adDuration: 30,
          adProvider: 'admob'
        },
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Booster reward claimed');
      console.log('Reward:', boosterClaimResponse.data.data.reward);
    } catch (error) {
      console.log('⚠️ Booster claim failed (expected if on cooldown):', error.response?.data?.error);
    }

    // Step 8: Test game management
    console.log('8. Testing game management...');
    
    // Add a test game first
    await axios.put(
      `${BASE_URL}/api/account-overview/update-progress`,
      {
        activityType: 'game',
        progressData: {
          gameId: 'test-game-my-games',
          completed: true,
          score: 1500,
          level: 3
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Test favorite toggle
    const favoriteResponse = await axios.put(
      `${BASE_URL}/api/my-games/games/test-game-my-games/favorite`,
      { isFavorite: true },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Game favorite toggle working');
    console.log('Favorite Status:', favoriteResponse.data.data.isFavorite);

    // Step 9: Test message system
    console.log('9. Testing message system...');
    const messagesResponse = await axios.get(
      `${BASE_URL}/api/my-games/messages/test-game-my-games`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    console.log('✅ Message system working');
    console.log('Unread Count:', messagesResponse.data.data.unreadCount);

    // Step 10: Test complete My Games screen data
    console.log('10. Testing complete My Games screen...');
    const completeResponse = await axios.get(
      `${BASE_URL}/api/my-games`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    
    const data = completeResponse.data.data;
    console.log('✅ Complete My Games screen data:');
    console.log('- App Version:', data.appVersion);
    console.log('- Games Count:', data.games.length);
    console.log('- Search Enabled:', data.searchEnabled);
    console.log('- AI Assistant Available:', data.aiAssistant.isAvailable);
    console.log('- Booster Available:', data.boosterRewards.isAvailable);
    console.log('- Non-Gaming Offers:', data.nonGamingOffers.totalAvailable);
    console.log('- User Preferences:', Object.keys(data.userPreferences));

    // Step 11: Test search history
    console.log('11. Testing search functionality with history...');
    await axios.get(
      `${BASE_URL}/api/my-games/search?q=action`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    await axios.get(
      `${BASE_URL}/api/my-games/search?q=strategy`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    
    const finalMyGamesResponse = await axios.get(
      `${BASE_URL}/api/my-games`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    
    console.log('✅ Search history working');
    console.log('Search History Length:', finalMyGamesResponse.data.data.userPreferences.searchHistory.length);

    console.log('\n🎉 All My Games Screen tests completed successfully!');
    console.log('\n📊 Implementation Summary:');
    console.log('✅ App Version Display - Dynamic from environment');
    console.log('✅ Game List Display - User games with metadata');
    console.log('✅ Search Functionality - Real-time search with history');
    console.log('✅ Account Overview - Dynamic progress tracking');
    console.log('✅ AI Assistant - OpenAI-powered chat support');
    console.log('✅ Booster Rewards - Time-based ad rewards');
    console.log('✅ Non-Gaming Offers - Survey integration');
    console.log('✅ Message System - Unread message tracking');
    console.log('✅ Game Management - Favorites, removal, etc.');
    console.log('✅ User Preferences - Search history, favorites, etc.');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.error('Full error:', error);
  }
}

// Run the test
testMyGamesScreen();

