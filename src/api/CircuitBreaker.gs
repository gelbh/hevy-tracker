/**
 * Manages circuit breaker state to prevent cascading failures.
 * Uses weighted failure counting to distinguish between temporary and persistent errors.
 * @class CircuitBreaker
 */
class CircuitBreaker {
  constructor(config) {
    this.failures = 0; // Weighted failure count (can be fractional)
    this.lastFailureTime = null;
    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failureThreshold = config.CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    this.resetTimeout = config.CIRCUIT_BREAKER_RESET_TIMEOUT_MS;
    this.statusCode = config.CIRCUIT_BREAKER_STATUS_CODE;
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
      const waitTime = Math.ceil(
        (this.resetTimeout - (now - this.lastFailureTime)) / 1000
      );
      throw new ApiError(
        `Too many API failures. Circuit breaker is open to prevent cascading failures. Please wait ${waitTime} seconds before retrying.`,
        this.statusCode,
        null,
        {
          endpoint,
          circuitBreakerState: this.state,
          lastFailureTime: this.lastFailureTime,
          isCircuitBreakerError: true,
          waitTimeSeconds: waitTime,
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
   * Gets failure weight based on error type
   * Temporary server errors count as 0.5, persistent errors count as 1.0
   * @param {Error} error - The error that occurred
   * @returns {number} Failure weight (0.5 or 1.0)
   * @private
   */
  _getFailureWeight(error) {
    // Don't count circuit breaker's own errors
    if (error?.context?.isCircuitBreakerError === true) {
      return 0;
    }

    // Temporary server errors (likely to resolve on their own) count as half
    const temporaryErrorCodes = [
      HTTP_STATUS.TOO_MANY_REQUESTS, // 429 - Rate limit, will reset
      HTTP_STATUS.SERVICE_UNAVAILABLE, // 503 - Temporary server overload
      HTTP_STATUS.BAD_GATEWAY, // 502 - Temporary gateway issue
      HTTP_STATUS.GATEWAY_TIMEOUT, // 504 - Temporary timeout
    ];

    if (
      error instanceof ApiError &&
      temporaryErrorCodes.includes(error.statusCode)
    ) {
      return 0.5;
    }

    // Persistent errors (client errors, auth failures, etc.) count as full failures
    return 1.0;
  }

  /**
   * Records a failed request and updates circuit breaker state
   * Uses weighted failure counting to distinguish between temporary and persistent errors
   * @param {Error} error - The error that occurred
   */
  recordFailure(error) {
    const weight = this._getFailureWeight(error);
    this.failures += weight;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      console.warn(
        `Circuit breaker opened after ${this.failures.toFixed(1)} weighted failures (threshold: ${this.failureThreshold}). Will retry after ${this.resetTimeout}ms.`
      );
    }
  }
}
