// Example test file for Hevy Tracker
// This demonstrates how to test Google Apps Script code with mocks

describe('Example Test Suite', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  test('should pass basic assertion', () => {
    expect(true).toBe(true);
  });

  test('should mock Logger.log', () => {
    Logger.log('Test message');
    expect(Logger.log).toHaveBeenCalledWith('Test message');
  });

  test('should mock PropertiesService', () => {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('testKey', 'testValue');
    
    expect(props.getProperty('testKey')).toBe('testValue');
  });

  test('should mock UrlFetchApp', () => {
    const response = UrlFetchApp.fetch('https://api.example.com');
    expect(UrlFetchApp.fetch).toHaveBeenCalledWith('https://api.example.com');
  });
});

describe('Utility Functions', () => {
  test('should format data correctly', () => {
    // Example of testing a utility function
    const formatDate = (date) => {
      return date.toISOString().split('T')[0];
    };

    const testDate = new Date('2024-01-15');
    expect(formatDate(testDate)).toBe('2024-01-15');
  });

  test('should validate input', () => {
    // Example of testing validation logic
    const isValidApiKey = (key) => {
      return typeof key === 'string' && key.length > 0;
    };

    expect(isValidApiKey('valid-key')).toBe(true);
    expect(isValidApiKey('')).toBe(false);
    expect(isValidApiKey(null)).toBe(false);
  });
});
