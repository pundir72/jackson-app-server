const analytics = require('./analytics');

const logOnboardingEvent = async (user, event) => {
  try {
    await analytics.log(event, {
      userId: user._id,
      mobile: user.mobile,
      event
    });
  } catch (error) {
    console.error('Failed to log onboarding event:', error);
  }
};

module.exports = logOnboardingEvent;
