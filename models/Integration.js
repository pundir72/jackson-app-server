const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
  // Basic Integration Info
  integrationName: {
    type: String,
    required: true,
    trim: true
  },
  
  // Category
  category: {
    type: String,
    required: true,
    trim: true
  },
  
  // API Configuration
  apiKey: {
    type: String,
    required: true,
    trim: true
  },
  
  // Endpoint Configuration
  endpointUrl: {
    type: String,
    required: true,
    trim: true
  },
  
  // Description
  description: {
    type: String,
    trim: true
  },
  
  // Status
  active: {
    type: Boolean,
    default: true
  },
  
  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Instance methods
integrationSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    integrationName: this.integrationName,
    category: this.category,
    apiKey: this.apiKey,
    endpointUrl: this.endpointUrl,
    description: this.description,
    active: this.active,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const Integration = mongoose.model('Integration', integrationSchema);

module.exports = Integration;
