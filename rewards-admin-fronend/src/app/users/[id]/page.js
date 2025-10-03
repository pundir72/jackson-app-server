'use client';

import { UserDetailPage } from '../../../components/users/UserDetailPage';
import { useParams, useRouter } from 'next/navigation';

// Mock user data - in a real app, this would come from an API
const mockUsers = {
  'IDO9012': {
    id: 1,
    name: "Neil Jackson",
    userId: "IDO9012",
    tier: "Platinum",
    email: "neil.jackson@gmail.com",
    status: "Active",
    avatar: "https://c.animaapp.com/t66hdvJZ/img/avatar.svg",
    gender: "Male",
    age: "25–34",
    phone: "+33 6 45 32 19 87",
    location: "Lyon, France",
    device: "Android – Samsung Galaxy M13",
    ipAddress: "182.77.56.14 (Lyon, France)",
    appVersion: "1.1.3.7",
    lastActive: "12:08 AM on May 23, 2025",
    faceVerification: "Verified",
    memberSince: "January 12, 2025",
    registrationDate: "January 12, 2025",
    signupCountry: "France",
    country: "France",
    accountStatus: "Active",
    lastLoginIp: "182.77.56.14",
    lastLoginLocation: "Lyon, France",
    // Balance & Tier data
    currentXP: "2,850 XP",
    coinBalance: "15,200 Coins",
    redemptionCount: "3 redemptions (2 PayPal, 1 Gift Card)",
    redemptionPreference: "PayPal",
    mostPlayedGame: "Spin Master",
    lastGamePlayed: "Coin Tycoon – May 27",
    totalGamesDownloaded: "17 games",
    avgSessionDuration: "12 minutes",
    primaryEarningSource: "Surveys (BitLabs)",
    preferredGameCategory: "Puzzle & Trivia",
    onboardingGoal: "Earn Extra Income",
    notificationSettings: "Push Enabled, Email Disabled",
    // Activity Summary data
    lastLogin: "May 28, 2025 – 11:42 AM",
    totalLogins: "58 logins since Mar 2025",
    lastTaskCompleted: "BitLabs Survey #432 – May 27",
    offersRedeemed: "12 offers redeemed",
    lastOfferClaimed: "Lucky Spin – 200 coins – May 26",
    totalCoinsEarned: "47,250 coins earned",
    totalXPEarned: "2,850 XP earned",
    redemptionsMade: "3 redemptions",
    challengeProgress: "Day 6 of 7-Day Login Challenge",
    spinUsage: "8 spins used this month",
  },
  'IDIO8202': {
    id: 2,
    name: "Samuel Joh",
    userId: "IDIO8202",
    tier: "Gold",
    email: "samthegamer@gmail.com",
    status: "Active",
    avatar: "https://c.animaapp.com/t66hdvJZ/img/avatar-1.svg",
    gender: "Male",
    age: "18–24",
    phone: "+1 555 123 4567",
    location: "New York, USA",
    device: "iOS – iPhone 14 Pro",
    ipAddress: "192.168.1.1 (New York, USA)",
    appVersion: "1.1.3.7",
    lastActive: "2:15 PM on May 24, 2025",
    faceVerification: "Verified",
    memberSince: "February 15, 2025",
    registrationDate: "February 15, 2025",
    signupCountry: "United States",
    country: "United States",
    accountStatus: "Active",
    lastLoginIp: "192.168.1.1",
    lastLoginLocation: "New York, USA",
    currentXP: "4,120 XP",
    coinBalance: "23,800 Coins",
    redemptionCount: "5 redemptions (3 PayPal, 2 Gift Card)",
    redemptionPreference: "PayPal",
    mostPlayedGame: "Lucky Slots",
    lastGamePlayed: "Prize Wheel – May 28",
    totalGamesDownloaded: "24 games",
    avgSessionDuration: "18 minutes",
    primaryEarningSource: "Game Offers",
    preferredGameCategory: "Casino & Cards",
    onboardingGoal: "Entertainment & Rewards",
    notificationSettings: "Push Enabled, Email Enabled",
    lastLogin: "May 29, 2025 – 3:22 PM",
    totalLogins: "89 logins since Feb 2025",
    lastTaskCompleted: "AdGate Survey #127 – May 28",
    offersRedeemed: "18 offers redeemed",
    lastOfferClaimed: "Download GameX – 500 coins – May 28",
    totalCoinsEarned: "68,400 coins earned",
    totalXPEarned: "4,120 XP earned",
    redemptionsMade: "5 redemptions",
    challengeProgress: "Day 2 of 30-Day Streak Challenge",
    spinUsage: "15 spins used this month",
  },
  'USR-202589': {
    id: 3,
    name: "Nick Johnson",
    userId: "USR-202589",
    tier: "Gold",
    email: "nickjohson12@gmail.com",
    status: "Active",
    avatar: "https://c.animaapp.com/6mo0E72h/img/avatar.svg",
    gender: "Male",
    age: "25–34",
    phone: "+33 6 45 32 19 87",
    location: "Lyon, France",
    device: "Android – Samsung Galaxy M13",
    ipAddress: "182.77.56.14 (Lyon, France)",
    appVersion: "1.1.3.7",
    lastActive: "12:08 AM on May 23, 2025",
    faceVerification: "Verified",
    memberSince: "January 12, 2025",
    registrationDate: "January 12, 2025",
    signupCountry: "France",
    country: "France",
    accountStatus: "Active",
    lastLoginIp: "182.77.56.14",
    lastLoginLocation: "Lyon, France",
    currentXP: "3,200 XP",
    coinBalance: "18,950 Coins",
    redemptionCount: "4 redemptions (2 PayPal, 2 Gift Card)",
    redemptionPreference: "Gift Card",
    mostPlayedGame: "Word Puzzle Pro",
    lastGamePlayed: "Math Challenge – May 26",
    totalGamesDownloaded: "19 games",
    avgSessionDuration: "15 minutes",
    primaryEarningSource: "Mixed (Games + Surveys)",
    preferredGameCategory: "Educational & Puzzle",
    onboardingGoal: "Learn & Earn",
    notificationSettings: "Push Disabled, Email Enabled",
    lastLogin: "May 27, 2025 – 8:30 AM",
    totalLogins: "72 logins since Jan 2025",
    lastTaskCompleted: "Daily Quiz #89 – May 26",
    offersRedeemed: "14 offers redeemed",
    lastOfferClaimed: "Complete Tutorial – 100 coins – May 25",
    totalCoinsEarned: "52,300 coins earned",
    totalXPEarned: "3,200 XP earned",
    redemptionsMade: "4 redemptions",
    challengeProgress: "Day 12 of 14-Day Quiz Challenge",
    spinUsage: "4 spins used this month",
  }
};

export default function UserDetail() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id;

  // Find user by ID
  const user = mockUsers[userId];

  if (!user) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">User Not Found</h1>
        <p className="text-gray-600 mb-6">The user with ID &quot;{userId}&quot; could not be found.</p>
        <button
          onClick={() => router.push('/users')}
          className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          Back to Users
        </button>
      </div>
    );
  }

  return <UserDetailPage user={user} />;
}