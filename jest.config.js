module.exports = {
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/.handover/'],
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/__tests__/**/*.test.js',
  ],
};
