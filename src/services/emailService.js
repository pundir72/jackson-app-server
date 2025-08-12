const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport ({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Email templates
const emailTemplates = {
  emailVerification: (data) => ({
    subject: `Verify Your Email - ${data.appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to ${data.appName}!</h2>
        <p>Hi ${data.name},</p>
        <p>Thank you for registering with ${data.appName}. To complete your registration, please verify your email address.</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
          <h3 style="color: #007bff; font-size: 24px; margin: 0;">${data.otp}</h3>
          <p style="margin: 10px 0 0 0; color: #666;">Your verification code</p>
        </div>
        <p>This code will expire in 5 minutes.</p>
        <p>If you didn't create an account, please ignore this email.</p>
        <p>Best regards,<br>The ${data.appName} Team</p>
      </div>
    `,
  }),

  passwordReset: (data) => ({
    subject: `Reset Your Password - ${data.appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hi ${data.name},</p>
        <p>We received a request to reset your password for your ${data.appName} account.</p>
        <p>Click the link below to reset your password:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL}/reset-password?token=${data.resetToken}" 
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
            Reset Password
          </a>
        </div>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email.</p>
        <p>Best regards,<br>The ${data.appName} Team</p>
      </div>
    `,
  }),

  welcomeEmail: (data) => ({
    subject: `Welcome to ${data.appName}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to ${data.appName}!</h2>
        <p>Hi ${data.name},</p>
        <p>Welcome to ${data.appName}! We're excited to have you on board.</p>
        <p>Here's what you can do with ${data.appName}:</p>
        <ul>
          <li>Earn cashback on your purchases</li>
          <li>Play games and win rewards</li>
          <li>Complete daily challenges</li>
          <li>Track your spending and savings</li>
          <li>Get financial tips and advice</li>
        </ul>
        <p>Start earning rewards today!</p>
        <p>Best regards,<br>The ${data.appName} Team</p>
      </div>
    `,
  }),

  challengeCompleted: (data) => ({
    subject: `Challenge Completed! - ${data.appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Congratulations! 🎉</h2>
        <p>Hi ${data.name},</p>
        <p>You've successfully completed the challenge: <strong>${data.challengeTitle}</strong></p>
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0;">
          <h3 style="color: #28a745; margin: 0;">Rewards Earned:</h3>
          <p style="margin: 10px 0;">💰 ${data.points} Points</p>
          <p style="margin: 10px 0;">💵 $${data.cashback} Cashback</p>
        </div>
        <p>Keep up the great work and earn more rewards!</p>
        <p>Best regards,<br>The ${data.appName} Team</p>
      </div>
    `,
  }),

  vipUpgrade: (data) => ({
    subject: `Welcome to VIP! - ${data.appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🎉 Welcome to VIP!</h2>
        <p>Hi ${data.name},</p>
        <p>Congratulations on upgrading to VIP membership!</p>
        <p>As a VIP member, you now have access to:</p>
        <ul>
          <li>Exclusive challenges and rewards</li>
          <li>Higher cashback rates</li>
          <li>Priority customer support</li>
          <li>Early access to new features</li>
          <li>Special VIP-only games</li>
        </ul>
        <p>Your VIP membership is active until: <strong>${data.expiryDate}</strong></p>
        <p>Enjoy your VIP benefits!</p>
        <p>Best regards,<br>The ${data.appName} Team</p>
      </div>
    `,
  }),

  receiptScanned: (data) => ({
    subject: `Receipt Scanned - ${data.appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Receipt Processed</h2>
        <p>Hi ${data.name},</p>
        <p>Your receipt has been successfully scanned and processed.</p>
        <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0;">
          <h3 style="color: #007bff; margin: 0;">Receipt Details:</h3>
          <p style="margin: 10px 0;"><strong>Store:</strong> ${data.storeName}</p>
          <p style="margin: 10px 0;"><strong>Amount:</strong> $${data.amount}</p>
          <p style="margin: 10px 0;"><strong>Cashback Earned:</strong> $${data.cashback}</p>
          <p style="margin: 10px 0;"><strong>Points Earned:</strong> ${data.points}</p>
        </div>
        <p>Your rewards have been added to your account!</p>
        <p>Best regards,<br>The ${data.appName} Team</p>
      </div>
    `,
  }),
};

// Send email
const sendEmail = async ({ to, subject, html, template, data }) => {
  try {
    const transporter = createTransporter();

    let emailContent;
    if (template && emailTemplates[template]) {
      const templateData = emailTemplates[template](data);
      emailContent = {
        from: `"${process.env.EMAIL_FROM_NAME || 'Jackson App'}" <${process.env.EMAIL_USER}>`,
        to,
        subject: templateData.subject,
        html: templateData.html,
      };
    } else {
      emailContent = {
        from: `"${process.env.EMAIL_FROM_NAME || 'Jackson App'}" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
      };
    }

    const info = await transporter.sendMail(emailContent);
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Email sending error:', error);
    throw error;
  }
};

// Send bulk email
const sendBulkEmail = async (emails) => {
  try {
    const transporter = createTransporter();
    const results = [];

    for (const email of emails) {
      try {
        const info = await transporter.sendMail(email);
        results.push({ success: true, to: email.to, messageId: info.messageId });
      } catch (error) {
        results.push({ success: false, to: email.to, error: error.message });
      }
    }

    logger.info(`Bulk email sent: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  } catch (error) {
    logger.error('Bulk email sending error:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendBulkEmail,
  emailTemplates,
}; 