const { redactUrl } = require('../utils/redactUrl');

describe('redactUrl', () => {
  it('masks the Adjust callback token and keeps the other params', () => {
    expect(
      redactUrl('/api/direct-games/adjust/callback?token=s3cr3t&app_token=abc&label=t1')
    ).toBe('/api/direct-games/adjust/callback?token=[REDACTED]&app_token=abc&label=t1');
  });

  it('masks token and secret wherever they appear in the query', () => {
    expect(redactUrl('/x?a=1&token=s3cr3t')).toBe('/x?a=1&token=[REDACTED]');
    expect(redactUrl('/x?SECRET=s3cr3t#frag')).toBe('/x?SECRET=[REDACTED]#frag');
  });

  it('leaves look-alike params and URLs without secrets untouched', () => {
    expect(redactUrl('/x?app_token=abc&event_token=def')).toBe('/x?app_token=abc&event_token=def');
    expect(redactUrl('/api/game/1/tasks')).toBe('/api/game/1/tasks');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
