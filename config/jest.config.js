/**
 * Jest configuration for Hevy Tracker tests
 * @module JestConfig
 */
const path = require("path");

module.exports = {
  // Use Node.js environment for Google Apps Script testing
  testEnvironment: "node",

  // Root directory is parent of config directory
  rootDir: path.resolve(__dirname, ".."),

  // Setup file that mocks Google Apps Script APIs
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],

  // Test file pattern
  testMatch: ["**/tests/**/*.test.js"],

  // Coverage collection settings
  collectCoverageFrom: [
    "src/**/*.gs",
    "!src/**/*.test.js",
    "!**/node_modules/**",
    "!**/__mocks__/**",
  ],

  // Coverage output directory
  coverageDirectory: "coverage",

  // Coverage report formats
  coverageReporters: ["text", "lcov", "html"],

  // Test timeout (10 seconds)
  testTimeout: 10000,

  // Verbose output for better test reporting
  verbose: true,
};
