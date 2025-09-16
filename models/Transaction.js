const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'completed'
    },
    referenceId: {
        type: String,
    },
    
    // Tremendous integration fields
    tremendousOrderId: {
        type: String,
        index: true
    },
    paymentProvider: {
        type: String,
        default: 'internal'
    },
    
    // Additional metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

transactionSchema.pre('save', function(next) {
    if (!this.referenceId) {
        this.referenceId = `TX-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }
    next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;
