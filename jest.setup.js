// Global test setup and Google Apps Script API mocks

// Mock SpreadsheetApp
global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(),
  getActive: jest.fn(),
  openById: jest.fn(),
  create: jest.fn()
};

// Mock UrlFetchApp
global.UrlFetchApp = {
  fetch: jest.fn()
};

// Mock PropertiesService
const createPropertiesStore = () => {
  const store = {};
  return {
    getProperty: jest.fn((key) => store[key] || null),
    setProperty: jest.fn((key, value) => { store[key] = value; }),
    deleteProperty: jest.fn((key) => { delete store[key]; }),
    getKeys: jest.fn(() => Object.keys(store)),
    getProperties: jest.fn(() => ({ ...store }))
  };
};

global.PropertiesService = {
  getScriptProperties: jest.fn(() => createPropertiesStore()),
  getUserProperties: jest.fn(() => createPropertiesStore()),
  getDocumentProperties: jest.fn(() => createPropertiesStore())
};

// Mock Logger
global.Logger = {
  log: jest.fn()
};

// Mock Utilities
global.Utilities = {
  formatDate: jest.fn(),
  sleep: jest.fn(),
  jsonStringify: jest.fn(JSON.stringify),
  jsonParse: jest.fn(JSON.parse),
  base64Encode: jest.fn(),
  base64Decode: jest.fn()
};

// Mock Session
global.Session = {
  getActiveUser: jest.fn(() => ({
    getEmail: jest.fn(() => 'test@example.com')
  })),
  getEffectiveUser: jest.fn(() => ({
    getEmail: jest.fn(() => 'test@example.com')
  }))
};
