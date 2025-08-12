const logger = require('../utils/logger');

// Mock OCR processing (in production, this would use a real OCR service like Google Vision API)
const processReceiptOCR = async (imagePath) => {
  try {
    logger.info(`Processing OCR for image: ${imagePath}`);

    // Simulate OCR processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock OCR results
    const ocrData = {
      storeName: 'Walmart',
      amount: 45.67,
      date: new Date(),
      items: [
        {
          name: 'Milk',
          price: 3.99,
          quantity: 1,
          category: 'groceries',
        },
        {
          name: 'Bread',
          price: 2.49,
          quantity: 1,
          category: 'groceries',
        },
        {
          name: 'Apples',
          price: 5.99,
          quantity: 1,
          category: 'groceries',
        },
        {
          name: 'Chicken Breast',
          price: 12.99,
          quantity: 1,
          category: 'groceries',
        },
        {
          name: 'Rice',
          price: 8.99,
          quantity: 1,
          category: 'groceries',
        },
        {
          name: 'Tomatoes',
          price: 3.99,
          quantity: 1,
          category: 'groceries',
        },
        {
          name: 'Cheese',
          price: 4.99,
          quantity: 1,
          category: 'groceries',
        },
        {
          name: 'Yogurt',
          price: 2.23,
          quantity: 1,
          category: 'groceries',
        },
      ],
      confidence: 0.85,
      text: 'Walmart\n123 Main St\nCity, State 12345\n\nMilk $3.99\nBread $2.49\nApples $5.99\nChicken Breast $12.99\nRice $8.99\nTomatoes $3.99\nCheese $4.99\nYogurt $2.23\n\nSubtotal: $44.66\nTax: $1.01\nTotal: $45.67',
    };

    logger.info(`OCR processing completed for ${imagePath}`);
    return ocrData;
  } catch (error) {
    logger.error('Error processing OCR:', error);
    throw new Error('Failed to process receipt image');
  }
};

// Validate receipt data
const validateReceiptData = (receiptData) => {
  const errors = [];

  if (!receiptData.storeName) {
    errors.push('Store name is required');
  }

  if (!receiptData.amount || receiptData.amount <= 0) {
    errors.push('Valid amount is required');
  }

  if (!receiptData.date) {
    errors.push('Purchase date is required');
  }

  if (!receiptData.items || receiptData.items.length === 0) {
    errors.push('At least one item is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Analyze receipt for fraud detection
const analyzeReceiptForFraud = async (receiptData) => {
  try {
    const fraudIndicators = [];

    // Check for suspicious patterns
    if (receiptData.amount > 1000) {
      fraudIndicators.push('High amount transaction');
    }

    if (receiptData.items.length > 50) {
      fraudIndicators.push('Unusually large number of items');
    }

    // Check for duplicate receipts (same store, same amount, same date)
    // This would require database lookup in production

    // Check for suspicious item patterns
    const suspiciousItems = receiptData.items.filter(item => 
      item.price > 500 || item.quantity > 10
    );

    if (suspiciousItems.length > 0) {
      fraudIndicators.push('Suspicious item patterns detected');
    }

    const riskScore = fraudIndicators.length * 25; // 0-100 scale

    return {
      isSuspicious: riskScore > 50,
      riskScore,
      fraudIndicators,
      recommendation: riskScore > 50 ? 'manual_review' : 'auto_approve',
    };
  } catch (error) {
    logger.error('Error analyzing receipt for fraud:', error);
    throw new Error('Failed to analyze receipt');
  }
};

// Calculate cashback rate based on store and items
const calculateCashbackRate = (storeName, items) => {
  try {
    // Store-specific cashback rates
    const storeRates = {
      'walmart': 0.05, // 5%
      'target': 0.04,  // 4%
      'amazon': 0.03,  // 3%
      'costco': 0.06,  // 6%
      'kroger': 0.04,  // 4%
      'safeway': 0.04, // 4%
      'publix': 0.04,  // 4%
      'whole foods': 0.03, // 3%
      'trader joes': 0.04, // 4%
      'aldi': 0.05,    // 5%
    };

    // Default rate
    let baseRate = 0.03; // 3%

    // Check for store-specific rate
    const storeKey = storeName.toLowerCase();
    if (storeRates[storeKey]) {
      baseRate = storeRates[storeKey];
    }

    // Category-specific bonuses
    const categoryBonuses = {
      'groceries': 0.01,    // +1%
      'electronics': 0.02,  // +2%
      'clothing': 0.01,     // +1%
      'home': 0.01,         // +1%
      'entertainment': 0.02, // +2%
      'food': 0.01,         // +1%
    };

    let categoryBonus = 0;
    items.forEach(item => {
      if (categoryBonuses[item.category]) {
        categoryBonus += categoryBonuses[item.category];
      }
    });

    // Average category bonus
    if (items.length > 0) {
      categoryBonus = categoryBonus / items.length;
    }

    const totalRate = baseRate + categoryBonus;

    return Math.min(totalRate, 0.10); // Cap at 10%
  } catch (error) {
    logger.error('Error calculating cashback rate:', error);
    return 0.03; // Default 3%
  }
};

// Extract receipt metadata
const extractReceiptMetadata = (receiptData) => {
  try {
    const metadata = {
      storeName: receiptData.storeName,
      amount: receiptData.amount,
      date: receiptData.date,
      itemCount: receiptData.items.length,
      categories: [...new Set(receiptData.items.map(item => item.category))],
      averageItemPrice: receiptData.items.reduce((sum, item) => sum + item.price, 0) / receiptData.items.length,
      totalItems: receiptData.items.reduce((sum, item) => sum + item.quantity, 0),
    };

    return metadata;
  } catch (error) {
    logger.error('Error extracting receipt metadata:', error);
    throw new Error('Failed to extract receipt metadata');
  }
};

// Process receipt for rewards
const processReceiptForRewards = async (receiptData, user) => {
  try {
    // Calculate cashback rate
    const cashbackRate = calculateCashbackRate(receiptData.storeName, receiptData.items);

    // Calculate rewards
    const cashbackAmount = receiptData.amount * cashbackRate;
    const pointsEarned = Math.floor(receiptData.amount); // 1 point per dollar

    // Apply VIP multiplier if user is VIP
    let finalCashback = cashbackAmount;
    let finalPoints = pointsEarned;

    if (user.isVipActive()) {
      finalCashback = cashbackAmount * 1.5;
      finalPoints = pointsEarned * 1.5;
    }

    return {
      cashbackAmount: parseFloat(finalCashback.toFixed(2)),
      pointsEarned: Math.floor(finalPoints),
      cashbackRate: cashbackRate,
      vipMultiplier: user.isVipActive() ? 1.5 : 1,
    };
  } catch (error) {
    logger.error('Error processing receipt for rewards:', error);
    throw new Error('Failed to process receipt rewards');
  }
};

// Get receipt statistics
const getReceiptStats = async (userId) => {
  try {
    // This would typically query the database
    // For now, return mock data
    const stats = {
      totalReceipts: 25,
      totalAmount: 1250.50,
      totalCashback: 62.53,
      totalPoints: 1250,
      averageReceiptAmount: 50.02,
      favoriteStore: 'Walmart',
      mostScannedCategory: 'groceries',
      monthlyTrend: [
        { month: 'Jan', receipts: 5, amount: 250.00 },
        { month: 'Feb', receipts: 8, amount: 400.00 },
        { month: 'Mar', receipts: 12, amount: 600.50 },
      ],
    };

    return stats;
  } catch (error) {
    logger.error('Error getting receipt statistics:', error);
    throw new Error('Failed to get receipt statistics');
  }
};

// Get store recommendations
const getStoreRecommendations = async (userId) => {
  try {
    // This would analyze user's receipt history and provide recommendations
    const recommendations = [
      {
        storeName: 'Target',
        reason: 'You shop here frequently and could earn 4% cashback',
        potentialSavings: 15.00,
        distance: '0.5 miles',
      },
      {
        storeName: 'Kroger',
        reason: 'Great for groceries with 4% cashback on food items',
        potentialSavings: 8.50,
        distance: '1.2 miles',
      },
      {
        storeName: 'Costco',
        reason: 'Bulk purchases earn 6% cashback',
        potentialSavings: 25.00,
        distance: '2.1 miles',
      },
    ];

    return recommendations;
  } catch (error) {
    logger.error('Error getting store recommendations:', error);
    throw new Error('Failed to get store recommendations');
  }
};

module.exports = {
  processReceiptOCR,
  validateReceiptData,
  analyzeReceiptForFraud,
  calculateCashbackRate,
  extractReceiptMetadata,
  processReceiptForRewards,
  getReceiptStats,
  getStoreRecommendations,
}; 