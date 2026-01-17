const nodemailer = require("nodemailer");
const config = require("../config/config");

const sendEmail = async (to, subject, text, html = null) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: config.EMAIL,
        pass: config.EMAIL_PASSWORD,
      },
    });

    // Send email
    const mailOptions = {
      from: config.EMAIL,
      to,
      subject,
      text,
    };

    // Add HTML if provided
    if (html) {
      mailOptions.html = html;
    }

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

// Password reset email template
const sendPasswordResetEmail = async (to, resetUrl, userName = "User") => {
  const subject = "Password Reset Request - Jackson App";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset - Jackson App</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px;
        }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          padding: 30px; 
          text-align: center; 
          border-radius: 10px 10px 0 0;
        }
        .content { 
          background: #f9f9f9; 
          padding: 30px; 
          border-radius: 0 0 10px 10px;
        }
        .button { 
          display: inline-block; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          padding: 15px 30px; 
          text-decoration: none; 
          border-radius: 25px; 
          margin: 20px 0; 
          font-weight: bold;
        }
        .footer { 
          text-align: center; 
          margin-top: 30px; 
          color: #666; 
          font-size: 14px;
        }
        .warning { 
          background: #fff3cd; 
          border: 1px solid #ffeaa7; 
          padding: 15px; 
          border-radius: 5px; 
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔐 Password Reset</h1>
        <p>Jackson App</p>
      </div>
      
      <div class="content">
        <h2>Hello ${userName}!</h2>
        
        <p>We received a request to reset your password for your Jackson App account. If you didn't make this request, you can safely ignore this email.</p>
        
        <p>To reset your password, click the button below:</p>
        
        <div style="text-align: center;">
          <a href="${resetUrl}" class="button">Reset Password</a>
        </div>
        
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
        
        <div class="warning">
          <strong>⚠️ Security Notice:</strong>
          <ul>
            <li>This link will expire in 1 hour</li>
            <li>Only use this link on devices you trust</li>
            <li>Never share this link with anyone</li>
          </ul>
        </div>
        
        <p>If you have any questions or need assistance, please contact our support team.</p>
        
        <p>Best regards,<br>The Jackson App Team</p>
      </div>
      
      <div class="footer">
        <p>This is an automated message, please do not reply to this email.</p>
        <p>&copy; 2024 Jackson App. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
    Password Reset Request - Jackson App
    
    Hello ${userName}!
    
    We received a request to reset your password for your Jackson App account. If you didn't make this request, you can safely ignore this email.
    
    To reset your password, visit this link:
    ${resetUrl}
    
    Security Notice:
    - This link will expire in 1 hour
    - Only use this link on devices you trust
    - Never share this link with anyone
    
    If you have any questions or need assistance, please contact our support team.
    
    Best regards,
    The Jackson App Team
    
    This is an automated message, please do not reply to this email.
  `;

  return await sendEmail(to, subject, text, html);
};

// Payout request confirmation email
const sendPayoutRequestConfirmationEmail = async (
  to,
  userName = "User",
  amount,
  currency = "USD"
) => {
  const subject = "Payout Request Submitted - Under Review";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payout Request Submitted</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px;
        }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          padding: 30px; 
          text-align: center; 
          border-radius: 10px 10px 0 0;
        }
        .content { 
          background: #f9f9f9; 
          padding: 30px; 
          border-radius: 0 0 10px 10px;
        }
        .info-box { 
          background: #e3f2fd; 
          border-left: 4px solid #2196f3; 
          padding: 15px; 
          margin: 20px 0; 
          border-radius: 5px;
        }
        .footer { 
          text-align: center; 
          margin-top: 30px; 
          color: #666; 
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>💰 Payout Request Submitted</h1>
        <p>Jackson App</p>
      </div>
      
      <div class="content">
        <h2>Hello ${userName}!</h2>
        
        <p>We have received your payout request and it is currently under review.</p>
        
        <div class="info-box">
          <strong>Request Details:</strong><br>
          Amount: ${currency} ${amount.toFixed(2)}<br>
          Status: Under Review
        </div>
        
        <p>Our team will review your request and process it as soon as possible. You will receive an email notification once your payout has been approved and processed.</p>
        
        <p>If you have any questions or need assistance, please contact our support team.</p>
        
        <p>Best regards,<br>The Jackson App Team</p>
      </div>
      
      <div class="footer">
        <p>This is an automated message, please do not reply to this email.</p>
        <p>&copy; 2024 Jackson App. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
    Payout Request Submitted - Under Review
    
    Hello ${userName}!
    
    We have received your payout request and it is currently under review.
    
    Request Details:
    Amount: ${currency} ${amount.toFixed(2)}
    Status: Under Review
    
    Our team will review your request and process it as soon as possible. You will receive an email notification once your payout has been approved and processed.
    
    If you have any questions or need assistance, please contact our support team.
    
    Best regards,
    The Jackson App Team
    
    This is an automated message, please do not reply to this email.
  `;

  return await sendEmail(to, subject, text, html);
};

// Payout approved and processed email
const sendPayoutApprovedEmail = async (
  to,
  userName = "User",
  amount,
  currency = "USD",
  orderId
) => {
  const subject = "Payout Approved - Your Reward is on the Way!";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payout Approved</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px;
        }
        .header { 
          background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); 
          color: white; 
          padding: 30px; 
          text-align: center; 
          border-radius: 10px 10px 0 0;
        }
        .content { 
          background: #f9f9f9; 
          padding: 30px; 
          border-radius: 0 0 10px 10px;
        }
        .success-box { 
          background: #d4edda; 
          border-left: 4px solid #28a745; 
          padding: 15px; 
          margin: 20px 0; 
          border-radius: 5px;
        }
        .footer { 
          text-align: center; 
          margin-top: 30px; 
          color: #666; 
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>✅ Payout Approved!</h1>
        <p>Jackson App</p>
      </div>
      
      <div class="content">
        <h2>Hello ${userName}!</h2>
        
        <p>Great news! Your payout request has been approved and processed successfully.</p>
        
        <div class="success-box">
          <strong>Payout Details:</strong><br>
          Amount: ${currency} ${amount.toFixed(2)}<br>
          Order ID: ${orderId || "N/A"}<br>
          Status: Completed
        </div>
        
        <p>Your reward is being processed and you should receive it shortly. Please check your email for the reward delivery link.</p>
        
        <p>Thank you for using Jackson App!</p>
        
        <p>Best regards,<br>The Jackson App Team</p>
      </div>
      
      <div class="footer">
        <p>This is an automated message, please do not reply to this email.</p>
        <p>&copy; 2024 Jackson App. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
    Payout Approved - Your Reward is on the Way!
    
    Hello ${userName}!
    
    Great news! Your payout request has been approved and processed successfully.
    
    Payout Details:
    Amount: ${currency} ${amount.toFixed(2)}
    Order ID: ${orderId || "N/A"}
    Status: Completed
    
    Your reward is being processed and you should receive it shortly. Please check your email for the reward delivery link.
    
    Thank you for using Jackson App!
    
    Best regards,
    The Jackson App Team
    
    This is an automated message, please do not reply to this email.
  `;

  return await sendEmail(to, subject, text, html);
};

// Payout rejected email
const sendPayoutRejectedEmail = async (
  to,
  userName = "User",
  amount,
  currency = "USD",
  reason
) => {
  const subject = "Payout Request Rejected";

  // Escape HTML to prevent XSS attacks
  const escapeHtml = (text) => {
    if (!text) return "";
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  const safeUserName = escapeHtml(userName);
  const safeReason = escapeHtml(reason || "No reason provided");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payout Request Rejected</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px;
        }
        .header { 
          background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); 
          color: white; 
          padding: 30px; 
          text-align: center; 
          border-radius: 10px 10px 0 0;
        }
        .content { 
          background: #f9f9f9; 
          padding: 30px; 
          border-radius: 0 0 10px 10px;
        }
        .warning-box { 
          background: #ffebee; 
          border-left: 4px solid #f44336; 
          padding: 20px; 
          margin: 20px 0; 
          border-radius: 5px;
        }
        .reason-box {
          background: #fff;
          border: 2px solid #f44336;
          padding: 15px;
          margin: 15px 0;
          border-radius: 5px;
          font-size: 16px;
          line-height: 1.8;
          white-space: pre-wrap;
        }
        .footer { 
          text-align: center; 
          margin-top: 30px; 
          color: #666; 
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>❌ Payout Request Rejected</h1>
        <p>Jackson App</p>
      </div>
      
      <div class="content">
        <h2>Hello ${safeUserName}!</h2>
        
        <p>We regret to inform you that your payout request has been rejected.</p>
        
        <div class="warning-box">
          <strong>Request Details:</strong><br>
          Amount: ${currency} ${amount.toFixed(2)}<br>
          Status: <strong style="color: #f44336;">Rejected</strong>
        </div>
        
        <div class="reason-box">
          <strong style="color: #f44336; font-size: 18px;">Rejection Reason:</strong><br><br>
          ${safeReason}
        </div>
        
        <p><strong>Important:</strong> Your coins (${(amount * 10).toFixed(0)} coins) have been refunded to your account balance.</p>
        
        <p>If you believe this is an error or have any questions, please contact our support team.</p>
        
        <p>Best regards,<br>The Jackson App Team</p>
      </div>
      
      <div class="footer">
        <p>This is an automated message, please do not reply to this email.</p>
        <p>&copy; 2024 Jackson App. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
    Payout Request Rejected
    
    Hello ${userName}!
    
    We regret to inform you that your payout request has been rejected.
    
    Request Details:
    Amount: ${currency} ${amount.toFixed(2)}
    Status: Rejected
    
    ============================================
    REJECTION REASON:
    ============================================
    ${reason || "No reason provided"}
    ============================================
    
    Important: Your coins (${(amount * 10).toFixed(0)} coins) have been refunded to your account balance.
    
    If you believe this is an error or have any questions, please contact our support team.
    
    Best regards,
    The Jackson App Team
    
    This is an automated message, please do not reply to this email.
  `;

  return await sendEmail(to, subject, text, html);
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPayoutRequestConfirmationEmail,
  sendPayoutApprovedEmail,
  sendPayoutRejectedEmail,
};
