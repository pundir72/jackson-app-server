const { generateError } = require('../utils/error');

module.exports = (req, res, next) => {
    const { amount } = req.body;
    
    // Check if amount is provided
    if (!amount) {
        return res.status(400).json({ message: 'Amount is required' });
    }
    
    // Check if amount is a valid number
    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number' });
    }
    
    // Check if amount exceeds maximum limit
    const MAX_TRANSACTION_AMOUNT = 1000000; // 1 million
    if (amount > MAX_TRANSACTION_AMOUNT) {
        return res.status(400).json({
            message: `Amount exceeds maximum limit of ${MAX_TRANSACTION_AMOUNT}`
        });
    }
    
    next();
}
