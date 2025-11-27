/**
 * Global test setup and Google Apps Script API mocks
 * Provides mocks for all Google Apps Script services used in tests
 */

// Mock SpreadsheetApp
global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(),
  getActive: jest.fn(),
  openById: jest.fn(),
  create: jest.fn(),
};

// Mock UrlFetchApp
global.UrlFetchApp = {
  fetch: jest.fn(),
};

// Mock PropertiesService
const createPropertiesStore = () => {
  const store = {};
  return {
    getProperty: jest.fn((key) => store[key] || null),
    setProperty: jest.fn((key, value) => {
      store[key] = value;
    }),
    deleteProperty: jest.fn((key) => {
      delete store[key];
    }),
    getKeys: jest.fn(() => Object.keys(store)),
    getProperties: jest.fn(() => ({ ...store })),
  };
};

global.PropertiesService = {
  getScriptProperties: jest.fn(() => createPropertiesStore()),
  getUserProperties: jest.fn(() => createPropertiesStore()),
  getDocumentProperties: jest.fn(() => createPropertiesStore()),
};

// Mock Logger
global.Logger = {
  log: jest.fn(),
};

// Mock Utilities
global.Utilities = {
  formatDate: jest.fn(),
  sleep: jest.fn(),
  jsonStringify: jest.fn(JSON.stringify),
  jsonParse: jest.fn(JSON.parse),
  base64Encode: jest.fn(),
  base64Decode: jest.fn(),
  getUuid: jest.fn(
    () => "test-uuid-" + Math.random().toString(36).substr(2, 9)
  ),
};

// Mock Session
global.Session = {
  getActiveUser: jest.fn(() => ({
    getEmail: jest.fn(() => "test@example.com"),
  })),
  getEffectiveUser: jest.fn(() => ({
    getEmail: jest.fn(() => "test@example.com"),
  })),
};

// Mock console (used in ErrorHandler and other places)
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Mock ScriptApp (used for triggers)
global.ScriptApp = {
  newTrigger: jest.fn(() => ({
    forSpreadsheet: jest.fn(() => ({
      onOpen: jest.fn(() => ({
        create: jest.fn(),
      })),
    })),
  })),
  getUserTriggers: jest.fn(() => []),
};

// Mock HtmlService (used for dialogs)
global.HtmlService = {
  createTemplateFromFile: jest.fn(() => ({
    evaluate: jest.fn(() => ({
      setTitle: jest.fn(() => ({
        setWidth: jest.fn(() => ({
          setHeight: jest.fn(() => ({
            setSandboxMode: jest.fn(() => ({})),
          })),
        })),
      })),
    })),
  })),
  createHtmlOutputFromFile: jest.fn(() => ({
    setTitle: jest.fn(() => ({
      setWidth: jest.fn(() => ({
        setHeight: jest.fn(() => ({
          setSandboxMode: jest.fn(() => ({})),
        })),
      })),
    })),
  })),
};

// Mock Ui (used for dialogs and alerts)
const mockButtonSet = {
  OK: "OK",
  YES_NO: "YES_NO",
};

const mockButton = {
  YES: "YES",
  NO: "NO",
  OK: "OK",
};

global.SpreadsheetApp.getUi = jest.fn(() => ({
  showModalDialog: jest.fn(),
  showSidebar: jest.fn(),
  alert: jest.fn(() => mockButton.OK),
  ButtonSet: mockButtonSet,
  Button: mockButton,
  createAddonMenu: jest.fn(() => ({
    addItem: jest.fn(() => ({
      addItem: jest.fn(),
      addSeparator: jest.fn(() => ({
        addSubMenu: jest.fn(() => ({
          addSeparator: jest.fn(() => ({
            addItem: jest.fn(() => ({
              addToUi: jest.fn(),
            })),
          })),
        })),
      })),
      addToUi: jest.fn(),
    })),
    addSeparator: jest.fn(() => ({
      addSubMenu: jest.fn(() => ({
        addSeparator: jest.fn(() => ({
          addItem: jest.fn(() => ({
            addToUi: jest.fn(),
          })),
        })),
      })),
    })),
    addToUi: jest.fn(),
  })),
}));
