/**
 * Manages circuit breaker state to prevent cascading failures.
 * @class CircuitBreaker
 */
class CircuitBreaker {
  constructor(config) {
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failureThreshold = config.CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    this.resetTimeout = config.CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
  }

  /**
   * Checks and updates circuit breaker state before making request
   * @param {string} endpoint - API endpoint for context
   * @throws {ApiError} If circuit breaker is open
   */
  check(endpoint) {
    const now = Date.now();

    // Transition from OPEN to HALF_OPEN if reset timeout has passed
    if (
      this.state === "OPEN" &&
      this.lastFailureTime &&
      now - this.lastFailureTime > this.resetTimeout
    ) {
      this.state = "HALF_OPEN";
      this.failures = 0;
    }

    // Reject immediately if circuit is open
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

  /**
   * Records a successful request for circuit breaker state management
   */
  recordSuccess() {
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.failures = 0;
      this.lastFailureTime = null;
    } else if (this.state === "CLOSED") {
      this.failures = 0;
    }
  }

  /**
   * Records a failed request and updates circuit breaker state
   * @param {Error} error - The error that occurred
   */
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
