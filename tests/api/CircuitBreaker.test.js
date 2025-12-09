/**
 * Tests for CircuitBreaker.gs
 */

// Mock constants
const HTTP_STATUS = {
  SERVICE_UNAVAILABLE: 503,
};

// Mock error class
class ApiError extends Error {
  constructor(message, statusCode, response, context = {}) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.response = response;
    this.context = context;
  }
}

global.ApiError = ApiError;
global.HTTP_STATUS = HTTP_STATUS;

// Mock console
global.console = {
  warn: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
};

// CircuitBreaker class
class CircuitBreaker {
  constructor(config) {
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = "CLOSED";
    this.failureThreshold = config.CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    this.resetTimeout = config.CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
  }

  check(endpoint) {
    const now = Date.now();

    if (
      this.state === "OPEN" &&
      this.lastFailureTime &&
      now - this.lastFailureTime > this.resetTimeout
    ) {
      this.state = "HALF_OPEN";
      this.failures = 0;
    }

    if (this.state === "OPEN") {
      throw new ApiError(
        "Circuit breaker is open. API is temporarily unavailable.",
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        null,
        {
          endpoint,
          circuitBreakerState: this.state,
          lastFailureTime: this.lastFailureTime,
        }
      );
    }
  }

  recordSuccess() {
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.failures = 0;
      this.lastFailureTime = null;
    } else if (this.state === "CLOSED") {
      this.failures = 0;
    }
  }

  recordFailure(error) {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.warn(
        `Circuit breaker opened after ${this.failures} failures. Will retry after ${this.resetTimeout}ms.`
      );
    }
  }
}

describe("CircuitBreaker", () => {
  let circuitBreaker;
  const config = {
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
    CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 60000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(1000000);
    circuitBreaker = new CircuitBreaker(config);
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  describe("constructor", () => {
    test("should initialize with CLOSED state", () => {
      expect(circuitBreaker.state).toBe("CLOSED");
      expect(circuitBreaker.failures).toBe(0);
      expect(circuitBreaker.lastFailureTime).toBeNull();
    });

    test("should set failure threshold from config", () => {
      expect(circuitBreaker.failureThreshold).toBe(5);
    });

    test("should set reset timeout from config", () => {
      expect(circuitBreaker.resetTimeout).toBe(60000);
    });
  });

  describe("check()", () => {
    test("should allow requests when CLOSED", () => {
      expect(() => circuitBreaker.check("/endpoint")).not.toThrow();
    });

    test("should allow requests when HALF_OPEN", () => {
      circuitBreaker.state = "HALF_OPEN";
      expect(() => circuitBreaker.check("/endpoint")).not.toThrow();
    });

    test("should throw ApiError when OPEN", () => {
      circuitBreaker.state = "OPEN";
      circuitBreaker.lastFailureTime = Date.now();

      expect(() => circuitBreaker.check("/endpoint")).toThrow(ApiError);
      expect(() => circuitBreaker.check("/endpoint")).toThrow(
        "Circuit breaker is open. API is temporarily unavailable."
      );
    });

    test("should transition from OPEN to HALF_OPEN after reset timeout", () => {
      circuitBreaker.state = "OPEN";
      circuitBreaker.lastFailureTime = Date.now() - 61000; // 61 seconds ago

      circuitBreaker.check("/endpoint");

      expect(circuitBreaker.state).toBe("HALF_OPEN");
      expect(circuitBreaker.failures).toBe(0);
    });

    test("should not transition if reset timeout has not passed", () => {
      circuitBreaker.state = "OPEN";
      circuitBreaker.lastFailureTime = Date.now() - 30000; // 30 seconds ago

      expect(() => circuitBreaker.check("/endpoint")).toThrow(ApiError);
      expect(circuitBreaker.state).toBe("OPEN");
    });

    test("should include endpoint in error context", () => {
      circuitBreaker.state = "OPEN";
      circuitBreaker.lastFailureTime = Date.now();

      try {
        circuitBreaker.check("/test/endpoint");
      } catch (error) {
        expect(error.context.endpoint).toBe("/test/endpoint");
        expect(error.context.circuitBreakerState).toBe("OPEN");
      }
    });
  });

  describe("recordSuccess()", () => {
    test("should reset failures when CLOSED", () => {
      circuitBreaker.failures = 3;
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.failures).toBe(0);
      expect(circuitBreaker.state).toBe("CLOSED");
    });

    test("should transition from HALF_OPEN to CLOSED", () => {
      circuitBreaker.state = "HALF_OPEN";
      circuitBreaker.failures = 2;
      circuitBreaker.lastFailureTime = Date.now();

      circuitBreaker.recordSuccess();

      expect(circuitBreaker.state).toBe("CLOSED");
      expect(circuitBreaker.failures).toBe(0);
      expect(circuitBreaker.lastFailureTime).toBeNull();
    });

    test("should not change state when already CLOSED", () => {
      circuitBreaker.state = "CLOSED";
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.state).toBe("CLOSED");
    });
  });

  describe("recordFailure()", () => {
    test("should increment failures", () => {
      circuitBreaker.recordFailure(new Error("test"));

      expect(circuitBreaker.failures).toBe(1);
      expect(circuitBreaker.lastFailureTime).toBe(Date.now());
    });

    test("should update lastFailureTime", () => {
      const beforeTime = Date.now();
      circuitBreaker.recordFailure(new Error("test"));
      const afterTime = Date.now();

      expect(circuitBreaker.lastFailureTime).toBeGreaterThanOrEqual(beforeTime);
      expect(circuitBreaker.lastFailureTime).toBeLessThanOrEqual(afterTime);
    });

    test("should open circuit when threshold is reached", () => {
      circuitBreaker.failures = 4; // One below threshold

      circuitBreaker.recordFailure(new Error("test"));

      expect(circuitBreaker.state).toBe("OPEN");
      expect(circuitBreaker.failures).toBe(5);
      expect(console.warn).toHaveBeenCalledWith(
        "Circuit breaker opened after 5 failures. Will retry after 60000ms."
      );
    });

    test("should not open circuit when below threshold", () => {
      circuitBreaker.failures = 3;

      circuitBreaker.recordFailure(new Error("test"));

      expect(circuitBreaker.state).toBe("CLOSED");
      expect(circuitBreaker.failures).toBe(4);
      expect(console.warn).not.toHaveBeenCalled();
    });

    test("should handle multiple failures", () => {
      for (let i = 0; i < 4; i++) {
        circuitBreaker.recordFailure(new Error(`error ${i}`));
      }

      expect(circuitBreaker.failures).toBe(4);
      expect(circuitBreaker.state).toBe("CLOSED");

      circuitBreaker.recordFailure(new Error("final error"));

      expect(circuitBreaker.failures).toBe(5);
      expect(circuitBreaker.state).toBe("OPEN");
    });
  });

  describe("state transitions", () => {
    test("should follow complete state machine flow", () => {
      // Start CLOSED
      expect(circuitBreaker.state).toBe("CLOSED");

      // Record failures until OPEN
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(new Error("error"));
      }
      expect(circuitBreaker.state).toBe("OPEN");

      // Should throw when checking
      expect(() => circuitBreaker.check("/endpoint")).toThrow();

      // Wait for reset timeout
      Date.now.mockReturnValue(Date.now() + 61000);
      circuitBreaker.check("/endpoint"); // Transitions to HALF_OPEN

      expect(circuitBreaker.state).toBe("HALF_OPEN");

      // Success in HALF_OPEN should close circuit
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.state).toBe("CLOSED");
    });
  });
});
