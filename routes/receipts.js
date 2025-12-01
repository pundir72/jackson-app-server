const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const User = require('../models/User');
const config = require('../config/config');

// Configure multer for receipt image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/receipts');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

// ============================================================================
// RECEIPT UPLOAD & PROCESSING
// ============================================================================

/**
 * Upload receipt with image
 * POST /api/v1/receipts/upload
 */
router.post('/upload', protect, upload.single('receiptImage'), [
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('storeName').optional().isString().withMessage('Store name must be a string'),
  body('category').optional().isIn(['food', 'shopping', 'gas', 'utilities', 'entertainment', 'other']).withMessage('Invalid category'),
  body('description').optional().isString().withMessage('Description must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { amount, storeName, category, description } = req.body;
    const userId = req.user.userId;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Receipt image is required',
        error: 'No image file provided'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate receipt ID
    const receiptId = Date.now().toString();
    
    // Calculate cash reward (2% of receipt amount, minimum $0.10, maximum $5.00)
    const rewardPercentage = 0.02;
    const calculatedReward = parseFloat(amount) * rewardPercentage;
    const minReward = 0.10;
    const maxReward = 5.00;
    const cashReward = Math.max(minReward, Math.min(maxReward, calculatedReward));
    
    // Calculate XP reward
    const xpReward = Math.floor(parseFloat(amount) * 0.5); // 0.5 XP per dollar
    
    // Debug logging
    console.log(`Receipt processing - Amount: ${amount}, Cash Reward: ${cashReward}, XP Reward: ${xpReward}`);

    // Create receipt object
    const newReceipt = {
      id: receiptId,
      amount: parseFloat(amount),
      storeName: storeName || 'Unknown Store',
      category: category || 'other',
      description: description || '',
      imageUrl: `${config.IMAGE_BASE_URL}/receipts/${req.file.filename}`,
      imagePath: req.file.path,
      status: 'processing', // processing, approved, rejected
      reward: {
        cash: cashReward,
        xp: xpReward
      },
      uploadedAt: new Date(),
      processedAt: null,
      approvedAt: null,
      rejectionReason: null
    };

    // Add to user's receipts
    user.cashCoach.receipts.push(newReceipt);
    
    // Add to earning history (only when approved)
    // Note: We'll add this when the receipt is approved

    await user.save();

    // Simulate receipt processing (in real app, this would be async)
    setTimeout(async () => {
      try {
        const updatedUser = await User.findById(userId);
        if (!updatedUser) {
          console.error(`User ${userId} not found during receipt processing`);
          return;
        }
        
        // Ensure cashCoach object exists
        if (!updatedUser.cashCoach) {
          updatedUser.cashCoach = {
            financialGoals: {},
            monthlySummary: {},
            taskProgress: { steps: [], currentStep: 0, totalSteps: 0, isActive: false },
            linkedAccounts: [],
            receipts: [],
            customGoals: [],
            earningHistory: [],
            settings: {}
          };
        }
        
        // Ensure wallet object exists
        if (!updatedUser.wallet) {
          updatedUser.wallet = { balance: 0 };
        }
        
        // Ensure xp object exists
        if (!updatedUser.xp) {
          updatedUser.xp = { current: 0, level: 1 };
        }
        
        // Ensure receipts array exists
        if (!updatedUser.cashCoach.receipts) {
          updatedUser.cashCoach.receipts = [];
        }
        
        const receipt = updatedUser.cashCoach.receipts.find(r => r.id === receiptId);
        
        if (receipt) {
          // Simulate processing logic (in real app, this would be OCR/AI validation)
          const isValidReceipt = await validateReceipt(req.file.path, amount, storeName);
          
          if (isValidReceipt) {
            // Approve receipt
            receipt.status = 'approved';
            receipt.processedAt = new Date();
            receipt.approvedAt = new Date();
            
            // Add cash reward to wallet (ensure balance is initialized)
            if (!updatedUser.wallet.balance || isNaN(updatedUser.wallet.balance)) {
              updatedUser.wallet.balance = 0;
            }
            updatedUser.wallet.balance += receipt.reward.cash;
            
            // Add XP reward (ensure XP is initialized) - apply tier multiplier
            if (!updatedUser.xp.current || isNaN(updatedUser.xp.current)) {
              updatedUser.xp.current = 0;
            }
            const { finalXP } = await applyTierMultiplierToXP(
              updatedUser,
              receipt.reward.xp || 0
            );
            updatedUser.xp.current += finalXP;
            
            // Add to earning history (ensure earningHistory array exists)
            if (!updatedUser.cashCoach.earningHistory) {
              updatedUser.cashCoach.earningHistory = [];
            }
            
            // Ensure amount is a valid number
            const rewardAmount = parseFloat(receipt.reward.cash);
            if (isNaN(rewardAmount) || rewardAmount <= 0) {
              console.error(`Invalid reward amount: ${receipt.reward.cash}`);
              return;
            }
            
            updatedUser.cashCoach.earningHistory.push({
              date: new Date(),
              source: 'receipt',
              amount: rewardAmount,
              description: `Receipt cashback: ${receipt.storeName}`,
              taskId: receiptId
            });
            
            await updatedUser.save();
            
            console.log(`Receipt ${receiptId} approved. Reward: $${receipt.reward.cash}`);
          } else {
            // Reject receipt
            receipt.status = 'rejected';
            receipt.processedAt = new Date();
            receipt.rejectionReason = 'Receipt validation failed. Please ensure the receipt is clear and contains valid store information.';
            
            await updatedUser.save();
            
            console.log(`Receipt ${receiptId} rejected`);
          }
        }
      } catch (error) {
        console.error('Error processing receipt:', error);
      }
    }, 5000); // Process after 5 seconds

    res.json({
      success: true,
      message: 'Receipt received! You\'ll get your reward shortly.',
      data: {
        receiptId: receiptId,
        status: 'processing',
        estimatedReward: cashReward,
        processingTime: '2-5 minutes'
      }
    });

  } catch (error) {
    console.error('Error uploading receipt:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload receipt',
      error: error.message
    });
  }
});

/**
 * Get receipt history
 * GET /api/v1/receipts/history
 */
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const userId = req.user.userId;

    const user = await User.findById(userId).select('cashCoach.receipts');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let receipts = user.cashCoach.receipts || [];
    
    // Filter by status if provided
    if (status) {
      receipts = receipts.filter(receipt => receipt.status === status);
    }
    
    // Sort by upload date (newest first)
    receipts.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedReceipts = receipts.slice(startIndex, endIndex);
    
    // Format receipts for response
    const formattedReceipts = paginatedReceipts.map(receipt => ({
      id: receipt.id,
      amount: receipt.amount,
      storeName: receipt.storeName,
      category: receipt.category,
      description: receipt.description,
      imageUrl: receipt.imageUrl,
      status: receipt.status,
      reward: receipt.reward,
      uploadedAt: receipt.uploadedAt,
      processedAt: receipt.processedAt,
      approvedAt: receipt.approvedAt,
      rejectionReason: receipt.rejectionReason
    }));

    res.json({
      success: true,
      data: {
        receipts: formattedReceipts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(receipts.length / limit),
          totalItems: receipts.length,
          itemsPerPage: parseInt(limit)
        },
        summary: {
          totalReceipts: receipts.length,
          totalRewards: receipts
            .filter(r => r.status === 'approved')
            .reduce((sum, r) => sum + r.reward.cash, 0),
          pendingReceipts: receipts.filter(r => r.status === 'processing').length,
          approvedReceipts: receipts.filter(r => r.status === 'approved').length,
          rejectedReceipts: receipts.filter(r => r.status === 'rejected').length
        }
      }
    });

  } catch (error) {
    console.error('Error getting receipt history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get receipt history',
      error: error.message
    });
  }
});

/**
 * Get single receipt details
 * GET /api/v1/receipts/:receiptId
 */
router.get('/:receiptId', protect, async (req, res) => {
  try {
    const { receiptId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId).select('cashCoach.receipts');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const receipt = user.cashCoach.receipts.find(r => r.id === receiptId);
    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    res.json({
      success: true,
      data: receipt
    });

  } catch (error) {
    console.error('Error getting receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get receipt',
      error: error.message
    });
  }
});

/**
 * Delete receipt
 * DELETE /api/v1/receipts/:receiptId
 */
router.delete('/:receiptId', protect, async (req, res) => {
  try {
    const { receiptId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const receiptIndex = user.cashCoach.receipts.findIndex(r => r.id === receiptId);
    if (receiptIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    const receipt = user.cashCoach.receipts[receiptIndex];
    
    // Only allow deletion of processing or rejected receipts
    if (receipt.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete approved receipts'
      });
    }

    // Remove receipt from array
    user.cashCoach.receipts.splice(receiptIndex, 1);
    
    // Delete image file if it exists
    if (receipt.imagePath && fs.existsSync(receipt.imagePath)) {
      fs.unlinkSync(receipt.imagePath);
    }

    await user.save();

    res.json({
      success: true,
      message: 'Receipt deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete receipt',
      error: error.message
    });
  }
});

// ============================================================================
// RECEIPT PROCESSING & VALIDATION
// ============================================================================

/**
 * Simulate receipt validation (in real app, this would use OCR/AI)
 * @param {string} imagePath - Path to the receipt image
 * @param {number} amount - Expected amount
 * @param {string} storeName - Expected store name
 * @returns {boolean} - Whether the receipt is valid
 */
async function validateReceipt(imagePath, amount, storeName) {
  try {
    // In a real implementation, this would:
    // 1. Use OCR to extract text from the image
    // 2. Parse the receipt data (store name, amount, date, items)
    // 3. Validate the extracted data against the provided amount/store
    // 4. Check for receipt quality and readability
    // 5. Verify the receipt is from a valid store
    
    // For now, simulate validation with some basic checks
    const simulatedValidation = {
      isValid: true,
      extractedData: {
        storeName: storeName || 'Sample Store',
        amount: amount,
        date: new Date().toISOString(),
        items: ['Item 1', 'Item 2', 'Item 3']
      },
      confidence: 0.85
    };
    
    // Simulate some validation failures
    const randomFailure = Math.random() < 0.1; // 10% failure rate for testing
    
    if (randomFailure) {
      console.log('Receipt validation failed (simulated)');
      return false;
    }
    
    console.log('Receipt validation passed (simulated)');
    return true;
    
  } catch (error) {
    console.error('Error validating receipt:', error);
    return false;
  }
}

/**
 * Get receipt statistics
 * GET /api/v1/receipts/stats
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select('cashCoach.receipts');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const receipts = user.cashCoach.receipts || [];
    
    const stats = {
      totalReceipts: receipts.length,
      totalSpent: receipts.reduce((sum, r) => sum + r.amount, 0),
      totalRewards: receipts
        .filter(r => r.status === 'approved')
        .reduce((sum, r) => sum + r.reward.cash, 0),
      averageReceipt: receipts.length > 0 ? receipts.reduce((sum, r) => sum + r.amount, 0) / receipts.length : 0,
      averageReward: receipts.length > 0 ? receipts
        .filter(r => r.status === 'approved')
        .reduce((sum, r) => sum + r.reward.cash, 0) / receipts.filter(r => r.status === 'approved').length : 0,
      statusBreakdown: {
        processing: receipts.filter(r => r.status === 'processing').length,
        approved: receipts.filter(r => r.status === 'approved').length,
        rejected: receipts.filter(r => r.status === 'rejected').length
      },
      categoryBreakdown: receipts.reduce((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {}),
      monthlyBreakdown: receipts.reduce((acc, r) => {
        const month = new Date(r.uploadedAt).toISOString().substring(0, 7);
        if (!acc[month]) {
          acc[month] = { count: 0, total: 0, rewards: 0 };
        }
        acc[month].count++;
        acc[month].total += r.amount;
        if (r.status === 'approved') {
          acc[month].rewards += r.reward.cash;
        }
        return acc;
      }, {})
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error getting receipt stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get receipt statistics',
      error: error.message
    });
  }
});

module.exports = router;
