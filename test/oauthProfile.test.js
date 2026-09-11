const test = require('node:test');
const assert = require('node:assert/strict');
const { getOAuthNames } = require('../utils/oauthProfile');

test('keeps provider first and last names when both are available', () => {
  assert.deepEqual(getOAuthNames({
    displayName: 'Ada Lovelace',
    name: { givenName: 'Ada', familyName: 'Lovelace' }
  }), { firstName: 'Ada', lastName: 'Lovelace' });
});

test('infers a surname from the display name when familyName is omitted', () => {
  assert.deepEqual(getOAuthNames({
    displayName: 'Md Enayetur Rahman',
    name: { givenName: 'Md Enayetur' }
  }), { firstName: 'Md Enayetur', lastName: 'Rahman' });
});

test('supports mononymous OAuth profiles without violating the user schema', () => {
  assert.deepEqual(getOAuthNames({
    displayName: 'Prince',
    name: { givenName: 'Prince' }
  }), { firstName: 'Prince', lastName: 'User' });
});

test('provides safe names when a provider returns no name fields', () => {
  assert.deepEqual(getOAuthNames({}), { firstName: 'User', lastName: 'User' });
});
