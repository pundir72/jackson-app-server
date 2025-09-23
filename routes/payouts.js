const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const TremendousOrder = require('../models/TremendousOrder');
const TremendousCampaign = require('../models/TremendousCampaign');
const TremendousOrganization = require('../models/TremendousOrganization');
const tremendous = require('../utils/tremendous');
const verisoul = require('../utils/verisoul');

// Get available payout methods
router.get('/methods', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('location vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get products and funding sources from Tremendous
    const [productsResult, fundingSourcesResult] = await Promise.all([
      tremendous.getProducts(req.query || {}),
      tremendous.getFundingSources(req.query || {})
    ]);

    // Handle fallback data for 502 errors
    let products = [];
    let fundingSources = [];
    let serviceStatus = 'online';
    let warningMessage = null;

    if (productsResult.success) {
      products = productsResult.data.products;
    } else if (productsResult.fallback) {
      products = productsResult.fallback.products;
      serviceStatus = 'degraded';
      warningMessage = 'Using fallback data - Tremendous service temporarily unavailable';
    } else {
      return res.status(500).json({
        success: false,
        error: productsResult.error || 'Failed to load payout methods'
      });
    }

    if (fundingSourcesResult.success) {
      fundingSources = fundingSourcesResult.data.funding_sources;
    } else if (fundingSourcesResult.fallback) {
      fundingSources = fundingSourcesResult.fallback.funding_sources;
      serviceStatus = 'degraded';
      warningMessage = 'Using fallback data - Tremendous service temporarily unavailable';
    } else {
      return res.status(500).json({
        success: false,
        error: fundingSourcesResult.error || 'Failed to load funding sources'
      });
    }

    const methods = products.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      icon: '🎁',
      isAvailable: true,
      minAmount: product.min_value ? product.min_value.denomination : 5,
      maxAmount: product.max_value ? product.max_value.denomination : 100,
      currency: product.currency_code || 'USD',
      processingTime: '1-24 hours',
      fees: 0,
      category: product.category,
      brand: product.brand
    }));

    const response = {
      success: true,
      data: {
        methods,
        fundingSources,
        userCountry: user.location?.country || 'US',
        message: 'Choose your preferred payout method',
        serviceStatus,
        warning: warningMessage
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting payout methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payout methods'
    });
  }
});

// Create payout request
router.post('/create', protect, async (req, res) => {
  try {
    // Extract all fields from request body (all optional)
    const {
      payment = {},
      external_id,
      campaign_id,
      invoice_id,
      reward = {}
    } = req.body;

    const user = await User.findById(req.user.userId).select('xp vip wallet location profile');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Use external_id from request or default to user ID
    const externalId = external_id || user._id.toString();

    // Extract payment details
    const {
      subtotal,
      total,
      fees,
      funding_source_id,
      refund = {},
      channel
    } = payment;

    // Extract reward details
    const {
      id: rewardId,
      order_id: orderId,
      created_at: createdAt,
      campaign_id: rewardCampaignId,
      products = [],
      value = {},
      recipient = {},
      custom_fields = [],
      delivery = {}
    } = reward;

    // Extract value details
    const {
      denomination,
      currency_code
    } = value;

    // Extract recipient details
    const {
      name: recipientName,
      email: recipientEmail,
      phone: recipientPhone
    } = recipient;

    // Extract delivery details
    const {
      method: deliveryMethod = 'LINK',
      status: deliveryStatus
    } = delivery;

    // Extract refund details
    const {
      total: refundTotal
    } = refund;

    // Validate required fields for Tremendous API
    if (!funding_source_id) {
      return res.status(400).json({
        success: false,
        error: 'payment.funding_source_id is required',
        details: {
          field: 'payment.funding_source_id',
          received: funding_source_id,
          expected: 'A valid Tremendous funding source ID (e.g., "OR7EFVES9AG2")'
        }
      });
    }

    if (!denomination || !currency_code) {
      return res.status(400).json({
        success: false,
        error: 'reward.value.denomination and reward.value.currency_code are required'
      });
    }

    if (!recipientName || !recipientEmail) {
      return res.status(400).json({
        success: false,
        error: 'reward.recipient.name and reward.recipient.email are required'
      });
    }

    if (!products || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'reward.products array is required and cannot be empty'
      });
    }

    // Validate amount
    const minAmount = 1; // $1.00 minimum
    const maxAmount = 10000; // $10,000.00 maximum

    if (denomination < minAmount || denomination > maxAmount) {
      return res.status(400).json({
        success: false,
        error: `Amount must be between $${minAmount} and $${maxAmount}`
      });
    }

    // Check user balance (if using internal wallet)
    const userBalance = user.wallet.balance || 0;
    const requiredCoins = Math.round(denomination * 10); // 10 coins per $1

    if (userBalance < requiredCoins) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance',
        required: requiredCoins,
        current: userBalance
      });
    }

    // Build Tremendous order payload
    const tremendousOrderPayload = {
      external_id: externalId,
      funding_source_id: funding_source_id,
      reward: {
        value: {
          denomination: denomination,
          currency_code: currency_code
        },
        delivery: {
          method: deliveryMethod
        },
        recipient: {
          name: recipientName,
          email: recipientEmail
        },
        products: products
      }
    };

    // Add optional fields if provided
    if (campaign_id) {
      tremendousOrderPayload.campaign_id = campaign_id;
    }

    if (invoice_id) {
      tremendousOrderPayload.invoice_id = invoice_id;
    }

    if (recipientPhone) {
      tremendousOrderPayload.reward.recipient.phone = recipientPhone;
    }

    if (custom_fields && custom_fields.length > 0) {
      tremendousOrderPayload.reward.custom_fields = custom_fields;
    }

    if (deliveryStatus) {
      tremendousOrderPayload.reward.delivery.status = deliveryStatus;
    }

    // Add payment details if provided
    if (subtotal !== undefined || total !== undefined || fees !== undefined || channel) {
      tremendousOrderPayload.payment = {};
      
      if (subtotal !== undefined) tremendousOrderPayload.payment.subtotal = subtotal;
      if (total !== undefined) tremendousOrderPayload.payment.total = total;
      if (fees !== undefined) tremendousOrderPayload.payment.fees = fees;
      if (channel) tremendousOrderPayload.payment.channel = channel;
      
      if (refundTotal !== undefined) {
        tremendousOrderPayload.payment.refund = { total: refundTotal };
      }
    }
    // Create order with Tremendous
    const orderResult = await tremendous.createOrder(tremendousOrderPayload);
    
    if (!orderResult.success) {
      return res.status(400).json({
        success: false,
        error: orderResult.error || 'Failed to create order'
      });
    }

    // Deduct coins from user balance
    user.wallet.balance = userBalance - requiredCoins;
    user.wallet.lastUpdated = new Date();

    // Create Tremendous order record
    const tremendousOrder = new TremendousOrder({
      tremendousOrderId: orderResult.data.order.id,
      externalId: externalId,
      userId: user._id,
      status: orderResult.data.order.status || 'PENDING',
      payment: {
        fundingSourceId: funding_source_id,
        amount: denomination,
        currency: currency_code,
        subtotal: subtotal,
        total: total,
        fees: fees,
        channel: channel,
        refund: refundTotal ? { total: refundTotal } : undefined
      },
      reward: {
        value: {
          denomination: denomination,
          currency_code: currency_code
        },
        delivery: {
          method: deliveryMethod,
          status: deliveryStatus
        },
        recipient: {
          name: recipientName,
          email: recipientEmail,
          phone: recipientPhone
        },
        products: products,
        custom_fields: custom_fields
      },
      tremendousData: orderResult.data,
      metadata: {
        source: 'app',
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        campaignId: campaign_id,
        invoiceId: invoice_id,
        rewardId: rewardId,
        orderId: orderId,
        createdAt: createdAt
      }
    });

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'debit',
      amount: requiredCoins,
      description: `Payout request - $${denomination} ${currency_code}`,
      status: 'pending',
      referenceId: orderResult.data.order.id,
      tremendousOrderId: orderResult.data.order.id,
      paymentProvider: 'tremendous',
      metadata: {
        orderId: orderResult.data.order.id,
        products: products,
        amount: denomination,
        currency: currency_code,
        recipient: {
          name: recipientName,
          email: recipientEmail,
          phone: recipientPhone
        },
        fundingSourceId: funding_source_id,
        campaignId: campaign_id,
        invoiceId: invoice_id,
        customFields: custom_fields
      }
    });

    await Promise.all([
      user.save(),
      tremendousOrder.save(),
      transaction.save()
    ]);

    res.json({
      success: true,
      data: {
        message: 'Payout request created successfully!',
        orderId: orderResult.data.order.id,
        tremendousOrderId: orderResult.data.order.id,
        status: orderResult.data.order.status,
        payment: {
          fundingSourceId: funding_source_id,
          amount: denomination,
          currency: currency_code,
          subtotal: subtotal,
          total: total,
          fees: fees,
          channel: channel,
          refund: refundTotal ? { total: refundTotal } : undefined
        },
        reward: {
          value: {
            denomination: denomination,
            currency_code: currency_code
          },
          delivery: {
            method: deliveryMethod,
            status: deliveryStatus
          },
          recipient: {
            name: recipientName,
            email: recipientEmail,
            phone: recipientPhone
          },
          products: products,
          custom_fields: custom_fields
        },
        newBalance: user.wallet.balance,
        tremendousData: orderResult.data
      }
    });
  } catch (error) {
    console.error('Error creating payout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payout'
    });
  }
});

// Get order status
router.get('/:orderId/status', protect, async (req, res) => {
  try {
    const { orderId } = req.params;
    const user = await User.findById(req.user.userId).select('_id');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get order status from Tremendous
    const statusResult = await tremendous.getOrder(orderId);

    if (!statusResult.success) {
      return res.status(400).json({
        success: false,
        error: statusResult.error || 'Failed to get order status'
      });
    }

    res.json({
      success: true,
      data: statusResult.data
    });
  } catch (error) {
    console.error('Error getting order status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order status'
    });
  }
});

// Get user order history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, ...rest } = req.query;
    const user = await User.findById(req.user.userId).select('_id');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get order history from Tremendous
    const historyResult = await tremendous.getOrders({
      external_id: user._id.toString(),
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      ...rest
    });

    if (!historyResult.success) {
      return res.status(500).json({
        success: false,
        error: historyResult.error || 'Failed to get order history'
      });
    }

    res.json({
      success: true,
      data: historyResult.data
    });
  } catch (error) {
    console.error('Error getting order history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order history'
    });
  }
});

// Approve order
router.post('/:orderId/approve', protect, async (req, res) => {
  try {
    const { orderId } = req.params;
    const user = await User.findById(req.user.userId).select('_id');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Approve order with Tremendous
    const approveResult = await tremendous.approveOrder(orderId);

    if (!approveResult.success) {
      return res.status(400).json({
        success: false,
        error: approveResult.error || 'Failed to approve order'
      });
    }

    // Update transaction status
    await Transaction.findOneAndUpdate(
      { referenceId: orderId, user: user._id },
      { status: 'approved' }
    );

    res.json({
      success: true,
      data: {
        message: 'Order approved successfully',
        orderId: orderId,
        status: 'approved'
      }
    });
  } catch (error) {
    console.error('Error approving order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve order'
    });
  }
});

// Reject order
router.post('/:orderId/reject', protect, async (req, res) => {
  try {
    const { orderId } = req.params;
    const user = await User.findById(req.user.userId).select('_id');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Reject order with Tremendous
    const rejectResult = await tremendous.rejectOrder(orderId);

    if (!rejectResult.success) {
      return res.status(400).json({
        success: false,
        error: rejectResult.error || 'Failed to reject order'
      });
    }

    // Update transaction status
    await Transaction.findOneAndUpdate(
      { referenceId: orderId, user: user._id },
      { status: 'rejected' }
    );

    res.json({
      success: true,
      data: {
        message: 'Order rejected successfully',
        orderId: orderId,
        status: 'rejected'
      }
    });
  } catch (error) {
    console.error('Error rejecting order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject order'
    });
  }
});

// Get all orders (admin)
router.get('/orders', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, external_id } = req.query;
    
    // Get orders from Tremendous
    const ordersResult = await tremendous.getOrders({
      external_id: external_id,
      status: status,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    if (!ordersResult.success) {
      return res.status(500).json({
        success: false,
        error: ordersResult.error || 'Failed to get orders'
      });
    }

    res.json({
      success: true,
      data: ordersResult.data
    });
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orders'
    });
  }
});

// Get all rewards
router.get('/rewards', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, ...rest } = req.query;
    
    const rewardsResult = await tremendous.getRewards(rest);
    
    if (!rewardsResult.success) {
      return res.status(400).json({
        success: false,
        error: rewardsResult.error || 'Failed to get rewards'
      });
    }

    let rewards = rewardsResult.data.rewards || [];
    
    // Filter by status if provided
    if (status) {
      rewards = rewards.filter(reward => reward.status === status);
    }

    // Simple pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedRewards = rewards.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        rewards: paginatedRewards,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: rewards.length,
          totalPages: Math.ceil(rewards.length / limit)
        },
        message: 'Rewards retrieved successfully'
      }
    });
  } catch (error) {
    console.error('Error getting rewards:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get rewards'
    });
  }
});

// Get specific reward by ID
router.get('/rewards/:rewardId', protect, async (req, res) => {
  try {
    const { rewardId } = req.params;
    
    const rewardResult = await tremendous.getReward(rewardId);

    if (!rewardResult.success) {
      return res.status(400).json({
        success: false,
        error: rewardResult.error || 'Failed to get reward'
      });
    }

    res.json({
      success: true,
      data: rewardResult.data
    });
  } catch (error) {
    console.error('Error getting reward:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get reward'
    });
  }
});

// Generate reward link
router.post('/rewards/:rewardId/generate-link', protect, async (req, res) => {
  try {
    const { rewardId } = req.params;
    
    const linkResult = await tremendous.generateRewardLink(rewardId);

    if (!linkResult.success) {
      return res.status(400).json({
        success: false,
        error: linkResult.error || 'Failed to generate reward link'
      });
    }

    res.json({
      success: true,
      data: linkResult.data
    });
  } catch (error) {
    console.error('Error generating reward link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate reward link'
    });
  }
});

// Resend reward
router.post('/rewards/:rewardId/resend', protect, async (req, res) => {
  try {
    const { rewardId } = req.params;
    
    const resendResult = await tremendous.resendReward(rewardId);

    if (!resendResult.success) {
      return res.status(400).json({
        success: false,
        error: resendResult.error || 'Failed to resend reward'
      });
    }

    res.json({
      success: true,
      data: resendResult.data
    });
  } catch (error) {
    console.error('Error resending reward:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend reward'
    });
  }
});

// Cancel reward
router.post('/rewards/:rewardId/cancel', protect, async (req, res) => {
  try {
    const { rewardId } = req.params;
    
    const cancelResult = await tremendous.cancelReward(rewardId);

    if (!cancelResult.success) {
      return res.status(400).json({
        success: false,
        error: cancelResult.error || 'Failed to cancel reward'
      });
    }

    res.json({
      success: true,
      data: cancelResult.data
    });
  } catch (error) {
    console.error('Error canceling reward:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel reward'
    });
  }
});

// Get all campaigns
router.get('/campaigns', protect, async (req, res) => {
  try {
    const campaignsResult = await tremendous.getCampaigns(req.query || {});

    if (!campaignsResult.success) {
      return res.status(500).json({
        success: false,
        error: campaignsResult.error || 'Failed to get campaigns'
      });
    }

    res.json({
      success: true,
      data: campaignsResult.data
    });
  } catch (error) {
    console.error('Error getting campaigns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get campaigns'
    });
  }
});

// Create campaign
router.post('/campaigns', protect, async (req, res) => {
  try {
    const campaignData = req.body;
    
    const campaignResult = await tremendous.createCampaign(campaignData);

    if (!campaignResult.success) {
      return res.status(400).json({
        success: false,
        error: campaignResult.error || 'Failed to create campaign'
      });
    }

    res.json({
      success: true,
      data: campaignResult.data
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create campaign'
    });
  }
});

// Get specific campaign by ID
router.get('/campaigns/:campaignId', protect, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const campaignResult = await tremendous.getCampaign(campaignId);

    if (!campaignResult.success) {
      return res.status(400).json({
        success: false,
        error: campaignResult.error || 'Failed to get campaign'
      });
    }

    res.json({
      success: true,
      data: campaignResult.data
    });
  } catch (error) {
    console.error('Error getting campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get campaign'
    });
  }
});

// Update campaign
router.put('/campaigns/:campaignId', protect, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaignData = req.body;
    
    const campaignResult = await tremendous.updateCampaign(campaignId, campaignData);

    if (!campaignResult.success) {
      return res.status(400).json({
        success: false,
        error: campaignResult.error || 'Failed to update campaign'
      });
    }

    res.json({
      success: true,
      data: campaignResult.data
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update campaign'
    });
  }
});

// Get all funding sources
router.get('/funding-sources', protect, async (req, res) => {
  try {
    const fundingSourcesResult = await tremendous.getFundingSources(req.query || {});
    
    if (!fundingSourcesResult.success) {
      return res.status(400).json({
        success: false,
        error: fundingSourcesResult.error || 'Failed to get funding sources'
      });
    }

    const fundingSources = fundingSourcesResult.data.funding_sources || fundingSourcesResult.fallback?.funding_sources || [];

    res.json({
      success: true,
      data: {
        funding_sources: fundingSources,
        total: fundingSources.length,
        message: 'Funding sources retrieved successfully'
      }
    });
  } catch (error) {
    console.error('Error getting funding sources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get funding sources'
    });
  }
});

// Get specific funding source by ID
router.get('/funding-sources/:fundingSourceId', protect, async (req, res) => {
  try {
    const { fundingSourceId } = req.params;
    
    const fundingResult = await tremendous.getFundingSource(fundingSourceId);

    if (!fundingResult.success) {
      return res.status(400).json({
        success: false,
        error: fundingResult.error || 'Failed to get funding source'
      });
    }

    res.json({
      success: true,
      data: fundingResult.data
    });
  } catch (error) {
    console.error('Error getting funding source:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get funding source'
    });
  }
});

// Get all invoices
router.get('/invoices', protect, async (req, res) => {
  try {
    const { offset = 0, limit = 10, ...rest } = req.query;
    
    const invoicesResult = await tremendous.getInvoices({
      offset: parseInt(offset),
      limit: parseInt(limit),
      ...rest
    });

    if (!invoicesResult.success) {
      return res.status(500).json({
        success: false,
        error: invoicesResult.error || 'Failed to get invoices'
      });
    }

    res.json({
      success: true,
      data: invoicesResult.data
    });
  } catch (error) {
    console.error('Error getting invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invoices'
    });
  }
});

// Create invoice
router.post('/invoices', protect, async (req, res) => {
  try {
    const invoiceData = req.body;
    
    const invoiceResult = await tremendous.createInvoice(invoiceData);

    if (!invoiceResult.success) {
      return res.status(400).json({
        success: false,
        error: invoiceResult.error || 'Failed to create invoice'
      });
    }

    res.json({
      success: true,
      data: invoiceResult.data
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice'
    });
  }
});

// Get specific invoice by ID
router.get('/invoices/:invoiceId', protect, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const invoiceResult = await tremendous.getInvoice(invoiceId);

    if (!invoiceResult.success) {
      return res.status(400).json({
        success: false,
        error: invoiceResult.error || 'Failed to get invoice'
      });
    }

    res.json({
      success: true,
      data: invoiceResult.data
    });
  } catch (error) {
    console.error('Error getting invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invoice'
    });
  }
});

// Delete invoice
router.delete('/invoices/:invoiceId', protect, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const deleteResult = await tremendous.deleteInvoice(invoiceId);

    if (!deleteResult.success) {
      return res.status(400).json({
        success: false,
        error: deleteResult.error || 'Failed to delete invoice'
      });
    }

    res.json({
      success: true,
      data: deleteResult.data
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete invoice'
    });
  }
});

// Get invoice PDF
router.get('/invoices/:invoiceId/pdf', protect, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const pdfResult = await tremendous.getInvoicePDF(invoiceId);

    if (!pdfResult.success) {
      return res.status(400).json({
        success: false,
        error: pdfResult.error || 'Failed to get invoice PDF'
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.pdf"`);
    res.send(pdfResult.data);
  } catch (error) {
    console.error('Error getting invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invoice PDF'
    });
  }
});

// Get invoice CSV
router.get('/invoices/:invoiceId/csv', protect, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const csvResult = await tremendous.getInvoiceCSV(invoiceId);

    if (!csvResult.success) {
      return res.status(400).json({
        success: false,
        error: csvResult.error || 'Failed to get invoice CSV'
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.csv"`);
    res.send(csvResult.data);
  } catch (error) {
    console.error('Error getting invoice CSV:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invoice CSV'
    });
  }
});

// Get balance transactions
router.get('/balance-transactions', protect, async (req, res) => {
  try {
    const balanceResult = await tremendous.getBalanceTransactions(req.query || {});

    if (!balanceResult.success) {
      return res.status(500).json({
        success: false,
        error: balanceResult.error || 'Failed to get balance transactions'
      });
    }

    res.json({
      success: true,
      data: balanceResult.data
    });
  } catch (error) {
    console.error('Error getting balance transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get balance transactions'
    });
  }
});

// Get all organizations
router.get('/organizations', protect, async (req, res) => {
  try {
    const organizationsResult = await tremendous.getOrganizations();

    if (!organizationsResult.success) {
      return res.status(500).json({
        success: false,
        error: organizationsResult.error || 'Failed to get organizations'
      });
    }

    res.json({
      success: true,
      data: organizationsResult.data
    });
  } catch (error) {
    console.error('Error getting organizations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get organizations'
    });
  }
});

// Create organization
router.post('/organizations', protect, async (req, res) => {
  try {
    const organizationData = req.body;
    
    const organizationResult = await tremendous.createOrganization(organizationData);

    if (!organizationResult.success) {
      return res.status(400).json({
        success: false,
        error: organizationResult.error || 'Failed to create organization'
      });
    }

    res.json({
      success: true,
      data: organizationResult.data
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create organization'
    });
  }
});

// Get specific organization by ID
router.get('/organizations/:organizationId', protect, async (req, res) => {
  try {
    const { organizationId } = req.params;
    
    const organizationResult = await tremendous.getOrganization(organizationId);

    if (!organizationResult.success) {
      return res.status(400).json({
        success: false,
        error: organizationResult.error || 'Failed to get organization'
      });
    }

    res.json({
      success: true,
      data: organizationResult.data
    });
  } catch (error) {
    console.error('Error getting organization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get organization'
    });
  }
});

// Create organization API key
router.post('/organizations/create-api-key', protect, async (req, res) => {
  try {
    const apiKeyResult = await tremendous.createOrganizationAPIKey();

    if (!apiKeyResult.success) {
      return res.status(400).json({
        success: false,
        error: apiKeyResult.error || 'Failed to create organization API key'
      });
    }

    res.json({
      success: true,
      data: apiKeyResult.data
    });
  } catch (error) {
    console.error('Error creating organization API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create organization API key'
    });
  }
});

// Tremendous webhook callback
router.post('/webhook/tremendous', async (req, res) => {
  try {
    const { order_id, status, event_type } = req.body;
    
    console.log('Tremendous webhook received:', { order_id, status, event_type });

    // Update Tremendous order status
    const tremendousOrder = await TremendousOrder.findByTremendousOrderId(order_id);
    if (tremendousOrder) {
      await tremendousOrder.updateStatus(status, {
        webhookEvent: event_type,
        webhookReceivedAt: new Date()
      });
    }

    // Update transaction status based on webhook
    const transaction = await Transaction.findOne({ tremendousOrderId: order_id });
    if (transaction) {
      let newStatus = 'pending';
      
      switch (status) {
        case 'APPROVED':
          newStatus = 'approved';
          break;
        case 'REJECTED':
          newStatus = 'rejected';
          break;
        case 'SENT':
          newStatus = 'sent';
          break;
        case 'DELIVERED':
          newStatus = 'delivered';
          break;
        case 'CLAIMED':
          newStatus = 'claimed';
          break;
        case 'EXPIRED':
          newStatus = 'expired';
          break;
        default:
          newStatus = status.toLowerCase();
      }
      
      transaction.status = newStatus;
      await transaction.save();
    }

    res.json({
      success: true,
      data: {
        message: 'Webhook processed successfully',
        order_id: order_id,
        status: status
      }
    });
  } catch (error) {
    console.error('Error processing Tremendous webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});


module.exports = router;

