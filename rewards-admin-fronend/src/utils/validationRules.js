// Validation rules as per requirements specification

export const VALIDATION_RULES = {
  // API Key validation - encrypted format expected
  apiKey: {
    required: true,
    pattern: /^[a-zA-Z0-9_-]{16,}$/,
    message: 'API key must be at least 16 characters (alphanumeric, underscore, dash)'
  },
  
  // Endpoint URL validation - URL format required
  endpointUrl: {
    required: true,
    pattern: /^https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/,
    message: 'Please enter a valid HTTPS URL (e.g., https://api.example.com/v1)'
  },
  
  // EXCLUDED: Slack webhook URL validation not supported per requirements
  // slackWebhookUrl: {
  //   required: false, // Only required when Slack is selected
  //   pattern: /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+$/,
  //   message: 'Please enter a valid Slack webhook URL'
  // },
  
  // Integration name validation
  integrationName: {
    required: true,
    pattern: /^[a-zA-Z0-9\s-_]{2,50}$/,
    message: 'Integration name must be 2-50 characters (letters, numbers, spaces, hyphens, underscores)'
  }
};

export const validateField = (fieldName, value, isRequired = false) => {
  const rule = VALIDATION_RULES[fieldName];
  if (!rule) return { isValid: true };

  // Check if required
  if ((rule.required || isRequired) && (!value || value.trim() === '')) {
    return {
      isValid: false,
      message: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`
    };
  }

  // Skip pattern validation if field is empty and not required
  if (!value || value.trim() === '') {
    return { isValid: true };
  }

  // Pattern validation
  if (rule.pattern && !rule.pattern.test(value)) {
    return {
      isValid: false,
      message: rule.message
    };
  }

  return { isValid: true };
};

export const validateIntegrationForm = (formData) => {
  const errors = {};
  
  // Validate integration name
  const nameValidation = validateField('integrationName', formData.name, true);
  if (!nameValidation.isValid) {
    errors.name = nameValidation.message;
  }

  // Validate API key
  const apiKeyValidation = validateField('apiKey', formData.apiKey, true);
  if (!apiKeyValidation.isValid) {
    errors.apiKey = apiKeyValidation.message;
  }

  // Validate endpoint URL
  const urlValidation = validateField('endpointUrl', formData.endpointUrl, true);
  if (!urlValidation.isValid) {
    errors.endpointUrl = urlValidation.message;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// EXCLUDED: Notification form validation not supported per requirements (Slack webhooks & notification recipients excluded)
export const validateNotificationForm = (formData) => {
  // Validation disabled per requirements
  return {
    isValid: true,
    errors: {}
  };

  /* ORIGINAL CODE - COMMENTED OUT
  const errors = {};

  // Validate Slack webhook URL if Slack is selected
  if (formData.notificationType === 'slack') {
    const webhookValidation = validateField('slackWebhookUrl', formData.slackWebhookUrl, true);
    if (!webhookValidation.isValid) {
      errors.slackWebhookUrl = webhookValidation.message;
    }
  }

  // Validate recipient roles selection
  if (!formData.recipientRoles || formData.recipientRoles.length === 0) {
    errors.recipientRoles = 'Please select at least one recipient role';
  }

  // Validate trigger events selection
  if (!formData.triggerEvents || formData.triggerEvents.length === 0) {
    errors.triggerEvents = 'Please select at least one trigger event';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
  */
};