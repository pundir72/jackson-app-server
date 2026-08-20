const { EventEmitter } = require('events');

jest.mock('https', () => ({ request: jest.fn() }));

process.env.APP_STORE_SHARED_SECRET = 'test-shared-secret';
const https = require('https');
const { verifyAppStoreReceipt } = require('../utils/appStoreVerification');

const mockAppleResponses = (...responses) => {
  const queue = [...responses];
  https.request.mockImplementation((options, callback) => {
    const request = new EventEmitter();
    request.write = jest.fn();
    request.end = jest.fn(() => {
      const response = new EventEmitter();
      callback(response);
      response.emit('data', JSON.stringify(queue.shift()));
      response.emit('end');
    });
    return request;
  });
};

describe('verifyAppStoreReceipt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries TestFlight receipts against the sandbox and reads subscription history', async () => {
    mockAppleResponses(
      { status: 21007 },
      {
        status: 0,
        environment: 'Sandbox',
        receipt: { bundle_id: 'com.jackson.rewards.app', in_app: [] },
        latest_receipt_info: [{
          product_id: 'gold_monthly',
          transaction_id: 'transaction-1',
          original_transaction_id: 'original-1',
          purchase_date_ms: '1700000000000',
          expires_date_ms: '1800000000000'
        }]
      }
    );

    const result = await verifyAppStoreReceipt('receipt', 'gold_monthly');

    expect(result).toMatchObject({
      valid: true,
      transactionId: 'transaction-1',
      productId: 'gold_monthly',
      environment: 'Sandbox'
    });
    expect(https.request.mock.calls[0][0].hostname).toBe('buy.itunes.apple.com');
    expect(https.request.mock.calls[1][0].hostname).toBe('sandbox.itunes.apple.com');
  });

  it('preserves the Apple status code for actionable client diagnostics', async () => {
    mockAppleResponses({ status: 21004 });

    const result = await verifyAppStoreReceipt('receipt', 'gold_monthly');

    expect(result.valid).toBe(false);
    expect(result.status).toBe(21004);
    expect(result.error).toContain('shared secret');
  });

  it('rejects a receipt issued for a different application bundle', async () => {
    mockAppleResponses({
      status: 0,
      environment: 'Production',
      receipt: {
        bundle_id: 'com.someone.else',
        in_app: [{
          product_id: 'gold_monthly',
          transaction_id: 'transaction-2',
          purchase_date_ms: '1700000000000'
        }]
      }
    });

    const result = await verifyAppStoreReceipt('receipt', 'gold_monthly');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('bundle ID');
  });
});
