const nodemailer = require('nodemailer');
const config  = require('../config/config');

const sendEmail = async (to, subject, text, html = null) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
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
    console.error('Error sending email:', error);
    throw error;
  }
};

// Password reset email template
const sendPasswordResetEmail = async (to, resetUrl, userName = 'User') => {
  const subject = 'Password Reset Request - Jackson App';
  
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

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
};
