const nodemailer = require('nodemailer');
const { config } = require('../config/config');

const sendEmail = async (to, subject, text) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.emailUser,
        pass: config.emailPassword,
      },
    });

    // Send email
    await transporter.sendMail({
      from: config.emailUser,
      to,
      subject,
      text,
    });

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
};
