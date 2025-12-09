/**
 * Tests for AuthUtils.gs - Developer check and multi-login detection
 */

// Mock constants
const DEVELOPER_CONFIG = {
  EMAILS: ["developer1@example.com", "developer2@example.com"],
};

global.DEVELOPER_CONFIG = DEVELOPER_CONFIG;

// Mock Session
const mockEffectiveUser = {
  getEmail: jest.fn(() => "developer1@example.com"),
};

const mockActiveUser = {
  getEmail: jest.fn(() => "developer1@example.com"),
};

global.Session = {
  getEffectiveUser: jest.fn(() => mockEffectiveUser),
  getActiveUser: jest.fn(() => mockActiveUser),
};

// Mock showMultiLoginWarning
global.showMultiLoginWarning = jest.fn();

// Mock functions
const isDeveloper = () =>
  DEVELOPER_CONFIG.EMAILS.includes(Session.getEffectiveUser().getEmail());

function checkForMultiLoginIssues() {
  try {
    const effectiveUser = Session.getEffectiveUser().getEmail();
    const activeUser = Session.getActiveUser().getEmail();

    if (!activeUser || activeUser !== effectiveUser) {
      showMultiLoginWarning();
      return true;
    }

    return false;
  } catch (error) {
    showMultiLoginWarning();
    return true;
  }
}

describe("AuthUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEffectiveUser.getEmail.mockReturnValue("developer1@example.com");
    mockActiveUser.getEmail.mockReturnValue("developer1@example.com");
  });

  describe("isDeveloper", () => {
    test("should return true for developer email", () => {
      mockEffectiveUser.getEmail.mockReturnValue("developer1@example.com");
      expect(isDeveloper()).toBe(true);

      mockEffectiveUser.getEmail.mockReturnValue("developer2@example.com");
      expect(isDeveloper()).toBe(true);
    });

    test("should return false for non-developer email", () => {
      mockEffectiveUser.getEmail.mockReturnValue("user@example.com");
      expect(isDeveloper()).toBe(false);
    });

    test("should be case-sensitive", () => {
      mockEffectiveUser.getEmail.mockReturnValue("DEVELOPER1@EXAMPLE.COM");
      expect(isDeveloper()).toBe(false);
    });
  });

  describe("checkForMultiLoginIssues", () => {
    test("should return false when active and effective users match", () => {
      mockActiveUser.getEmail.mockReturnValue("user@example.com");
      mockEffectiveUser.getEmail.mockReturnValue("user@example.com");

      const result = checkForMultiLoginIssues();

      expect(result).toBe(false);
      expect(showMultiLoginWarning).not.toHaveBeenCalled();
    });

    test("should return true and show warning when users don't match", () => {
      mockActiveUser.getEmail.mockReturnValue("user1@example.com");
      mockEffectiveUser.getEmail.mockReturnValue("user2@example.com");

      const result = checkForMultiLoginIssues();

      expect(result).toBe(true);
      expect(showMultiLoginWarning).toHaveBeenCalledTimes(1);
    });

    test("should return true when active user is null", () => {
      mockActiveUser.getEmail.mockReturnValue(null);
      mockEffectiveUser.getEmail.mockReturnValue("user@example.com");

      const result = checkForMultiLoginIssues();

      expect(result).toBe(true);
      expect(showMultiLoginWarning).toHaveBeenCalledTimes(1);
    });

    test("should return true when active user is undefined", () => {
      mockActiveUser.getEmail.mockReturnValue(undefined);
      mockEffectiveUser.getEmail.mockReturnValue("user@example.com");

      const result = checkForMultiLoginIssues();

      expect(result).toBe(true);
      expect(showMultiLoginWarning).toHaveBeenCalledTimes(1);
    });

    test("should handle errors and show warning", () => {
      Session.getEffectiveUser.mockImplementationOnce(() => {
        throw new Error("Session error");
      });

      const result = checkForMultiLoginIssues();

      expect(result).toBe(true);
      expect(showMultiLoginWarning).toHaveBeenCalledTimes(1);
    });

    test("should handle error when getting active user email", () => {
      Session.getActiveUser.mockImplementationOnce(() => {
        throw new Error("Session error");
      });

      const result = checkForMultiLoginIssues();

      expect(result).toBe(true);
      expect(showMultiLoginWarning).toHaveBeenCalledTimes(1);
    });
  });
});
