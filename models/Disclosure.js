const mongoose = require('mongoose');

const disclosureSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['installed_apps', 'location', 'overlay', 'notifications']
  },
  version: {
    type: String,
    required: true,
    default: '1.0'
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Disclosure', disclosureSchema);
