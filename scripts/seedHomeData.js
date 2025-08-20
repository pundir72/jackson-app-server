const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Deals = require('../models/Deals');
const { Reward, DailyReward } = require('../models/Rewards');
const Transaction = require('../models/Transaction');

// MongoDB connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jackson-app');
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Sample Users Data
const sampleUsers = [
    {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        mobile: '9876543210',
        password: 'password123',
        profile: {
            avatar: 'https://via.placeholder.com/150/4CAF50/FFFFFF?text=JD',
            bio: 'Financial enthusiast and gamer',
            theme: 'dark'
        },
        wallet: {
            balance: 2500,
            currency: 'coins',
            lastUpdated: new Date()
        },
        xp: {
            current: 1850,
            tier: 3,
            streak: 7
        },
        vip: {
            level: 'GOLD',
            expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            benefits: {
                bonusPercentage: 25,
                cashback: 5,
                exclusiveAccess: true,
                prioritySupport: true,
                specialOffers: true
            }
        },
        games: [
            {
                gameId: 'quiz_game_1',
                score: 85,
                completed: true,
                date: new Date()
            },
            {
                gameId: 'puzzle_game_1',
                score: 92,
                completed: true,
                date: new Date()
            }
        ],
        tasks: [
            {
                taskId: 'task_1',
                type: 'daily',
                completed: false,
                xpReward: 100,
                date: new Date()
            },
            {
                taskId: 'task_2',
                type: 'weekly',
                completed: false,
                xpReward: 400,
                date: new Date()
            }
        ],
        surveys: [
            {
                surveyId: 'survey_1',
                completed: false,
                date: new Date()
            }
        ],
        races: [
            {
                raceId: 'race_1',
                position: 3,
                completed: false,
                date: new Date()
            }
        ],
        onboarding: {
            completed: true,
            step: 5,
            primaryGoal: 'earn',
            gender: 'male',
            ageRange: '26-35',
            improvementArea: 'budgeting'
        }
    },
    {
        firstName: 'Sarah',
        lastName: 'Wilson',
        email: 'sarah.wilson@example.com',
        mobile: '9876543211',
        password: 'password123',
        profile: {
            avatar: 'https://via.placeholder.com/150/2196F3/FFFFFF?text=SW',
            bio: 'Saving goals and investment focused',
            theme: 'light'
        },
        wallet: {
            balance: 1800,
            currency: 'coins',
            lastUpdated: new Date()
        },
        xp: {
            current: 1200,
            tier: 2,
            streak: 3
        },
        vip: {
            level: 'BRONZE',
            expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
            benefits: {
                bonusPercentage: 10,
                cashback: 2,
                exclusiveAccess: false,
                prioritySupport: false,
                specialOffers: false
            }
        },
        games: [
            {
                gameId: 'quiz_game_1',
                score: 78,
                completed: true,
                date: new Date()
            }
        ],
        tasks: [
            {
                taskId: 'task_1',
                type: 'daily',
                completed: false,
                xpReward: 100,
                date: new Date()
            }
        ],
        surveys: [
            {
                surveyId: 'survey_1',
                completed: false,
                date: new Date()
            }
        ],
        races: [],
        onboarding: {
            completed: true,
            step: 5,
            primaryGoal: 'save',
            gender: 'female',
            ageRange: '18-25',
            improvementArea: 'saving'
        }
    },
    {
        firstName: 'Mike',
        lastName: 'Johnson',
        email: 'mike.johnson@example.com',
        mobile: '9876543212',
        password: 'password123',
        profile: {
            avatar: 'https://via.placeholder.com/150/FF9800/FFFFFF?text=MJ',
            bio: 'Investment and retirement planning',
            theme: 'dark'
        },
        wallet: {
            balance: 4200,
            currency: 'coins',
            lastUpdated: new Date()
        },
        xp: {
            current: 3200,
            tier: 5,
            streak: 15
        },
        vip: {
            level: 'PLATINUM',
            expires: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
            benefits: {
                bonusPercentage: 50,
                cashback: 10,
                exclusiveAccess: true,
                prioritySupport: true,
                specialOffers: true
            }
        },
        games: [
            {
                gameId: 'quiz_game_1',
                score: 95,
                completed: true,
                date: new Date()
            },
            {
                gameId: 'puzzle_game_1',
                score: 88,
                completed: true,
                date: new Date()
            },
            {
                gameId: 'strategy_game_1',
                score: 91,
                completed: true,
                date: new Date()
            }
        ],
        tasks: [
            {
                taskId: 'task_1',
                type: 'daily',
                completed: false,
                xpReward: 100,
                date: new Date()
            },
            {
                taskId: 'task_2',
                type: 'weekly',
                completed: false,
                xpReward: 400,
                date: new Date()
            },
            {
                taskId: 'task_3',
                type: 'monthly',
                completed: false,
                xpReward: 1000,
                date: new Date()
            }
        ],
        surveys: [
            {
                surveyId: 'survey_1',
                completed: false,
                date: new Date()
            },
            {
                surveyId: 'survey_2',
                completed: false,
                date: new Date()
            }
        ],
        races: [
            {
                raceId: 'race_1',
                position: 1,
                completed: false,
                date: new Date()
            }
        ],
        onboarding: {
            completed: true,
            step: 5,
            primaryGoal: 'invest',
            gender: 'male',
            ageRange: '36-45',
            improvementArea: 'investing'
        }
    }
];

// Sample Deals Data
const sampleDeals = [
    {
        title: 'Weekend Gaming Bonanza',
        description: 'Play games this weekend and earn 2x rewards!',
        type: 'game',
        imageUrl: 'https://via.placeholder.com/300x200/4CAF50/FFFFFF?text=Weekend+Bonus',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reward: {
            coins: 200,
            xp: 400,
            benefits: ['2x Coins', '2x XP', 'Bonus Rewards']
        },
        requirements: ['Play 5 games', 'Complete daily tasks'],
        vipOnly: false,
        active: true
    },
    {
        title: 'VIP Exclusive: Premium Survey',
        description: 'Complete this premium survey for VIP members only',
        type: 'survey',
        imageUrl: 'https://via.placeholder.com/300x200/FF9800/FFFFFF?text=VIP+Survey',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        reward: {
            coins: 500,
            xp: 1000,
            benefits: ['Premium Access', 'Exclusive Rewards']
        },
        requirements: ['VIP Membership', 'Complete profile'],
        vipOnly: true,
        active: true
    },
    {
        title: 'New User Welcome Bonus',
        description: 'Special bonus for new users joining this week',
        type: 'bonus',
        imageUrl: 'https://via.placeholder.com/300x200/2196F3/FFFFFF?text=Welcome+Bonus',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reward: {
            coins: 300,
            xp: 600,
            benefits: ['Welcome Package', 'Free VIP Trial']
        },
        requirements: ['New Registration', 'Complete Onboarding'],
        vipOnly: false,
        active: true
    },
    {
        title: 'Monthly Race Championship',
        description: 'Compete in our monthly championship race',
        type: 'race',
        imageUrl: 'https://via.placeholder.com/300x200/9C27B0/FFFFFF?text=Race+Championship',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        reward: {
            coins: 1000,
            xp: 2000,
            benefits: ['Champion Title', 'Exclusive Badge', 'Bonus Rewards']
        },
        requirements: ['Active Account', 'Minimum Level 2'],
        vipOnly: false,
        active: true
    }
];

// Sample Rewards Data
const sampleRewards = [
    {
        type: 'daily',
        title: 'Daily Login Reward',
        description: 'Claim your daily reward for logging in',
        imageUrl: 'https://via.placeholder.com/200x200/4CAF50/FFFFFF?text=Daily+Reward',
        reward: {
            coins: 50,
            xp: 100,
            benefits: ['Daily Bonus', 'Streak Building']
        },
        requirements: ['Daily Login'],
        vipOnly: false,
        active: true,
        startDate: new Date(new Date().setHours(0, 0, 0, 0)), // Start of current day
        endDate: new Date(new Date().setHours(23, 59, 59, 999)) // End of current day
    },
    {
        type: 'weekly',
        title: 'Weekly Task Completion',
        description: 'Complete all weekly tasks for bonus rewards',
        imageUrl: 'https://via.placeholder.com/200x200/2196F3/FFFFFF?text=Weekly+Reward',
        reward: {
            coins: 200,
            xp: 400,
            benefits: ['Weekly Bonus', 'Task Master Badge']
        },
        requirements: ['Complete 5 Weekly Tasks'],
        vipOnly: false,
        active: true,
        startDate: new Date(new Date().setHours(0, 0, 0, 0)), // Start of current day
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    },
    {
        type: 'monthly',
        title: 'Monthly VIP Bonus',
        description: 'Exclusive monthly bonus for VIP members',
        imageUrl: 'https://via.placeholder.com/200x200/FF9800/FFFFFF?text=VIP+Monthly',
        reward: {
            coins: 1000,
            xp: 2000,
            benefits: ['VIP Exclusive', 'Monthly Bonus', 'Premium Rewards']
        },
        requirements: ['Active VIP Membership'],
        vipOnly: true,
        active: true,
        startDate: new Date(new Date().setHours(0, 0, 0, 0)), // Start of current day
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    {
        type: 'special',
        title: 'Holiday Special Reward',
        description: 'Special holiday season rewards for all users',
        imageUrl: 'https://via.placeholder.com/200x200/F44336/FFFFFF?text=Holiday+Special',
        reward: {
            coins: 300,
            xp: 600,
            benefits: ['Holiday Bonus', 'Limited Time', 'Special Badge']
        },
        requirements: ['Active Account'],
        vipOnly: false,
        active: true,
        startDate: new Date(new Date().setHours(0, 0, 0, 0)), // Start of current day
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    }
];

// Sample Daily Rewards Data
const sampleDailyRewards = [
    {
        userId: null, // Will be set after user creation
        date: new Date(),
        claimed: false,
        reward: {
            coins: 50,
            xp: 100
        }
    }
];

// Seed function
const seedHomeData = async () => {
    try {
        console.log('Starting to seed home page data...');

        // Clear existing data
        console.log('Clearing existing data...');
        await User.deleteMany({});
        await Deals.deleteMany({});
        await Reward.deleteMany({});
        await DailyReward.deleteMany({});
        await Transaction.deleteMany({});

        // Create users
        console.log('Creating sample users...');
        const createdUsers = await User.insertMany(sampleUsers);
        console.log(`Created ${createdUsers.length} users`);

        // Create deals
        console.log('Creating sample deals...');
        const createdDeals = await Deals.insertMany(sampleDeals);
        console.log(`Created ${createdDeals.length} deals`);

        // Create rewards
        console.log('Creating sample rewards...');
        const createdRewards = await Reward.insertMany(sampleRewards);
        console.log(`Created ${createdRewards.length} rewards`);

        // Create daily rewards for each user
        console.log('Creating daily rewards for users...');
        const dailyRewardsToCreate = [];
        createdUsers.forEach(user => {
            dailyRewardsToCreate.push({
                userId: user._id,
                date: new Date(),
                claimed: false,
                reward: {
                    coins: 50,
                    xp: 100
                }
            });
        });
        const createdDailyRewards = await DailyReward.insertMany(dailyRewardsToCreate);
        console.log(`Created ${createdDailyRewards.length} daily rewards`);

        // Create sample transactions for users
        console.log('Creating sample transactions...');
        const transactionsToCreate = [];
        createdUsers.forEach((user, userIndex) => {
            // Add some sample transactions with unique timestamps
            const baseTime = Date.now() + (userIndex * 1000); // Ensure unique timestamps
            transactionsToCreate.push(
                new Transaction({
                    user: user._id,
                    type: 'credit',
                    amount: 100,
                    description: 'Welcome bonus',
                    status: 'completed',
                    referenceId: `TX-${baseTime}-${Math.floor(Math.random() * 100000)}`
                }),
                new Transaction({
                    user: user._id,
                    type: 'credit',
                    amount: 50,
                    description: 'Daily reward',
                    status: 'completed',
                    referenceId: `TX-${baseTime + 100}-${Math.floor(Math.random() * 100000)}`
                })
            );
        });
        const createdTransactions = await Transaction.insertMany(transactionsToCreate);
        console.log(`Created ${createdTransactions.length} transactions`);

        console.log('✅ Home page data seeded successfully!');
        console.log('\n📊 Summary:');
        console.log(`- Users: ${createdUsers.length}`);
        console.log(`- Deals: ${createdDeals.length}`);
        console.log(`- Rewards: ${createdRewards.length}`);
        console.log(`- Daily Rewards: ${createdDailyRewards.length}`);
        console.log(`- Transactions: ${createdTransactions.length}`);

        console.log('\n🔑 Sample User Credentials:');
        createdUsers.forEach((user, index) => {
            console.log(`${index + 1}. ${user.email} / password123`);
        });

    } catch (error) {
        console.error('❌ Error seeding data:', error);
    } finally {
        mongoose.connection.close();
        console.log('Database connection closed');
    }
};

// Run the seed function
if (require.main === module) {
    connectDB().then(() => {
        seedHomeData();
    });
}

module.exports = { seedHomeData, connectDB }; 