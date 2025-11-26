/**
 * Jest configuration for Hevy Tracker tests
 */
module.exports = {
  // Use Node.js environment for Google Apps Script testing
  testEnvironment: "node",

  // Setup file that mocks Google Apps Script APIs
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],

  // Test file pattern
  testMatch: ["**/tests/**/*.test.js"],

  // Coverage collection settings
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/**/*.test.js",
    "!**/node_modules/**",
  ],

  // Coverage output directory
  coverageDirectory: "coverage",

  // Coverage report formats
  coverageReporters: ["text", "lcov", "html"],

  // Test timeout (10 seconds)
  testTimeout: 10000,
};
