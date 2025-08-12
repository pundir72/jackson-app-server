const twilio = require('twilio');
const logger = require('../utils/logger');

// Initialize Twilio client only if credentials are available
let client = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    logger.info('Twilio client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Twilio client:', error);
  }
} else {
  logger.warn('Twilio credentials not found. SMS functionality will be disabled.');
}

// SMS templates
const smsTemplates = {
  phoneVerification: (data) => ({
    body: `Your ${data.appName} verification code is: ${data.otp}. Valid for 5 minutes.`,
  }),

  challengeCompleted: (data) => ({
    body: `🎉 Challenge completed! You earned ${data.points} points and $${data.cashback} cashback. Keep earning with ${data.appName}!`,
  }),

  rewardEarned: (data) => ({
    body: `💰 You earned ${data.points} points and $${data.cashback} cashback! Total balance: $${data.totalCashback}. ${data.appName}`,
  }),

  vipUpgrade: (data) => ({
    body: `🎉 Welcome to VIP! Enjoy exclusive rewards and higher cashback rates. Your VIP membership expires: ${data.expiryDate}. ${data.appName}`,
  }),

  receiptScanned: (data) => ({
    body: `📷 Receipt scanned! Store: ${data.storeName}, Amount: $${data.amount}, Cashback: $${data.cashback}, Points: ${data.points}. ${data.appName}`,
  }),

  dailyReminder: (data) => ({
    body: `Good morning! Don't forget to complete today's challenges and earn rewards. You have ${data.pendingChallenges} challenges waiting. ${data.appName}`,
  }),

  weeklySummary: (data) => ({
    body: `📊 Weekly summary: ${data.points} points earned, $${data.cashback} cashback, ${data.challengesCompleted} challenges completed. Great job! ${data.appName}`,
  }),

  withdrawalRequest: (data) => ({
    body: `💳 Withdrawal request received for $${data.amount}. It will be processed within 3-5 business days. ${data.appName}`,
  }),

  withdrawalCompleted: (data) => ({
    body: `✅ Your withdrawal of $${data.amount} has been processed and sent to your account. ${data.appName}`,
  }),

  securityAlert: (data) => ({
    body: `⚠️ Security alert: New login detected from ${data.location}. If this wasn't you, please contact support immediately. ${data.appName}`,
  }),
};

// Send SMS
const sendSMS = async ({ to, body, template, data }) => {
  try {
    if (!client) {
      logger.warn('SMS sending skipped: Twilio client not initialized');
      return { sid: 'mock_sid', status: 'disabled', message: 'SMS disabled - no Twilio credentials' };
    }

    let messageBody;
    if (template && smsTemplates[template]) {
      const templateData = smsTemplates[template](data);
      messageBody = templateData.body;
    } else {
      messageBody = body;
    }

    const message = await client.messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });

    logger.info(`SMS sent to ${to}: ${message.sid}`);
    return message;
  } catch (error) {
    logger.error('SMS sending error:', error);
    throw error;
  }
};

// Send bulk SMS
const sendBulkSMS = async (messages) => {
  try {
    const results = [];

    for (const message of messages) {
      try {
        const result = await sendSMS(message);
        results.push({ success: true, to: message.to, sid: result.sid });
      } catch (error) {
        results.push({ success: false, to: message.to, error: error.message });
      }
    }

    logger.info(`Bulk SMS sent: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  } catch (error) {
    logger.error('Bulk SMS sending error:', error);
    throw error;
  }
};

// Verify phone number
const verifyPhoneNumber = async (phoneNumber) => {
  try {
    if (!client) {
      logger.warn('Phone verification skipped: Twilio client not initialized');
      return {
        valid: false,
        error: 'Twilio client not available - phone verification disabled',
      };
    }

    const lookup = await client.lookups.v1.phoneNumbers(phoneNumber).fetch({
      type: ['carrier'],
    });

    return {
      valid: true,
      carrier: lookup.carrier?.name || 'Unknown',
      type: lookup.carrier?.type || 'Unknown',
      countryCode: lookup.countryCode,
    };
  } catch (error) {
    logger.error('Phone verification error:', error);
    return {
      valid: false,
      error: error.message,
    };
  }
};

// Send OTP via SMS
const sendOTP = async (phoneNumber, otp, appName = 'Jackson App') => {
  try {
    return await sendSMS({
      to: phoneNumber,
      template: 'phoneVerification',
      data: { otp, appName },
    });
  } catch (error) {
    logger.error('OTP SMS error:', error);
    throw error;
  }
};

// Send challenge completion notification
const sendChallengeNotification = async (phoneNumber, challengeData) => {
  try {
    return await sendSMS({
      to: phoneNumber,
      template: 'challengeCompleted',
      data: challengeData,
    });
  } catch (error) {
    logger.error('Challenge notification SMS error:', error);
    throw error;
  }
};

// Send reward notification
const sendRewardNotification = async (phoneNumber, rewardData) => {
  try {
    return await sendSMS({
      to: phoneNumber,
      template: 'rewardEarned',
      data: rewardData,
    });
  } catch (error) {
    logger.error('Reward notification SMS error:', error);
    throw error;
  }
};

// Send VIP upgrade notification
const sendVIPNotification = async (phoneNumber, vipData) => {
  try {
    return await sendSMS({
      to: phoneNumber,
      template: 'vipUpgrade',
      data: vipData,
    });
  } catch (error) {
    logger.error('VIP notification SMS error:', error);
    throw error;
  }
};

// Send receipt scan notification
const sendReceiptNotification = async (phoneNumber, receiptData) => {
  try {
    return await sendSMS({
      to: phoneNumber,
      template: 'receiptScanned',
      data: receiptData,
    });
  } catch (error) {
    logger.error('Receipt notification SMS error:', error);
    throw error;
  }
};

// Send daily reminder
const sendDailyReminder = async (phoneNumber, reminderData) => {
  try {
    return await sendSMS({
      to: phoneNumber,
      template: 'dailyReminder',
      data: reminderData,
    });
  } catch (error) {
    logger.error('Daily reminder SMS error:', error);
    throw error;
  }
};

// Send weekly summary
const sendWeeklySummary = async (phoneNumber, summaryData) => {
  try {
    return await sendSMS({
      to: phoneNumber,
      template: 'weeklySummary',
      data: summaryData,
    });
  } catch (error) {
    logger.error('Weekly summary SMS error:', error);
    throw error;
  }
};

// Send withdrawal notification
const sendWithdrawalNotification = async (phoneNumber, withdrawalData, type = 'request') => {
  try {
    const template = type === 'completed' ? 'withdrawalCompleted' : 'withdrawalRequest';
    return await sendSMS({
      to: phoneNumber,
      template,
      data: withdrawalData,
    });
  } catch (error) {
    logger.error('Withdrawal notification SMS error:', error);
    throw error;
  }
};

// Send security alert
const sendSecurityAlert = async (phoneNumber, securityData) => {
  try {
    return await sendSMS({
      to: phoneNumber,
      template: 'securityAlert',
      data: securityData,
    });
  } catch (error) {
    logger.error('Security alert SMS error:', error);
    throw error;
  }
};

module.exports = {
  sendSMS,
  sendBulkSMS,
  verifyPhoneNumber,
  sendOTP,
  sendChallengeNotification,
  sendRewardNotification,
  sendVIPNotification,
  sendReceiptNotification,
  sendDailyReminder,
  sendWeeklySummary,
  sendWithdrawalNotification,
  sendSecurityAlert,
  smsTemplates,
}; 