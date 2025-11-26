/**
 * Quota tracking and management utility
 * Tracks usage of Google Apps Script quotas and provides warnings
 * @module QuotaTracker
 */

/**
 * @typedef {Object} QuotaUsage
 * @property {number} urlFetchCount - Number of UrlFetch calls made today
 * @property {number} urlFetchLimit - Daily limit for UrlFetch calls
 * @property {number} executionTimeMs - Total execution time in milliseconds today
 * @property {number} executionTimeLimitMs - Daily limit for execution time
 * @property {Date} lastUpdated - Timestamp of last update
 */

/**
 * Quota limits for Google Apps Script (free accounts)
 * @type {Object<number>}
 * @private
 */
const QUOTA_LIMITS = {
  URL_FETCH_DAILY: 20000, // Daily limit for UrlFetch calls
  EXECUTION_TIME_DAILY_MS: 90 * 60 * 1000, // 90 minutes per day
  EXECUTION_TIME_PER_FUNCTION_MS: 6 * 60 * 1000, // 6 minutes per function
  WARNING_THRESHOLD: 0.8, // Warn when 80% of quota is used
};

/**
 * Property keys for quota tracking
 * @type {Object<string>}
 * @private
 */
const QUOTA_PROPERTY_KEYS = {
  URL_FETCH_COUNT: "QUOTA_URL_FETCH_COUNT",
  URL_FETCH_DATE: "QUOTA_URL_FETCH_DATE",
  EXECUTION_TIME_MS: "QUOTA_EXECUTION_TIME_MS",
  EXECUTION_TIME_DATE: "QUOTA_EXECUTION_TIME_DATE",
};

class QuotaTracker {
  /**
   * Records a UrlFetch call for quota tracking
   * @param {number} [count=1] - Number of calls to record
   */
  static recordUrlFetch(count = 1) {
    try {
      const props = PropertiesService.getDocumentProperties();
      const today = new Date().toDateString();
      const lastDate = props.getProperty(QUOTA_PROPERTY_KEYS.URL_FETCH_DATE);

      let currentCount = 0;
      if (lastDate === today) {
        currentCount = parseInt(
          props.getProperty(QUOTA_PROPERTY_KEYS.URL_FETCH_COUNT) || "0"
        );
      }

      const newCount = currentCount + count;
      props.setProperty(QUOTA_PROPERTY_KEYS.URL_FETCH_COUNT, String(newCount));
      props.setProperty(QUOTA_PROPERTY_KEYS.URL_FETCH_DATE, today);

      // Check if approaching limit
      if (
        newCount / QUOTA_LIMITS.URL_FETCH_DAILY >=
        QUOTA_LIMITS.WARNING_THRESHOLD
      ) {
        this._warnUrlFetchQuota(newCount);
      }
    } catch (error) {
      console.warn("Failed to record UrlFetch quota:", error);
    }
  }

  /**
   * Records execution time for quota tracking
   * @param {number} executionTimeMs - Execution time in milliseconds
   */
  static recordExecutionTime(executionTimeMs) {
    try {
      const props = PropertiesService.getDocumentProperties();
      const today = new Date().toDateString();
      const lastDate = props.getProperty(
        QUOTA_PROPERTY_KEYS.EXECUTION_TIME_DATE
      );

      let currentTime = 0;
      if (lastDate === today) {
        currentTime = parseInt(
          props.getProperty(QUOTA_PROPERTY_KEYS.EXECUTION_TIME_MS) || "0"
        );
      }

      const newTime = currentTime + executionTimeMs;
      props.setProperty(QUOTA_PROPERTY_KEYS.EXECUTION_TIME_MS, String(newTime));
      props.setProperty(QUOTA_PROPERTY_KEYS.EXECUTION_TIME_DATE, today);

      // Check if approaching limit
      if (
        newTime / QUOTA_LIMITS.EXECUTION_TIME_DAILY_MS >=
        QUOTA_LIMITS.WARNING_THRESHOLD
      ) {
        this._warnExecutionTimeQuota(newTime);
      }
    } catch (error) {
      console.warn("Failed to record execution time quota:", error);
    }
  }

  /**
   * Gets current quota usage
   * @returns {QuotaUsage} Current quota usage information
   */
  static getQuotaUsage() {
    const props = PropertiesService.getDocumentProperties();
    const today = new Date().toDateString();

    const urlFetchDate = props.getProperty(QUOTA_PROPERTY_KEYS.URL_FETCH_DATE);
    const urlFetchCount =
      urlFetchDate === today
        ? parseInt(
            props.getProperty(QUOTA_PROPERTY_KEYS.URL_FETCH_COUNT) || "0"
          )
        : 0;

    const executionTimeDate = props.getProperty(
      QUOTA_PROPERTY_KEYS.EXECUTION_TIME_DATE
    );
    const executionTimeMs =
      executionTimeDate === today
        ? parseInt(
            props.getProperty(QUOTA_PROPERTY_KEYS.EXECUTION_TIME_MS) || "0"
          )
        : 0;

    return {
      urlFetchCount: urlFetchCount,
      urlFetchLimit: QUOTA_LIMITS.URL_FETCH_DAILY,
      executionTimeMs: executionTimeMs,
      executionTimeLimitMs: QUOTA_LIMITS.EXECUTION_TIME_DAILY_MS,
      lastUpdated: new Date(),
    };
  }

  /**
   * Checks if quota limits are approaching and returns warning message
   * @returns {string|null} Warning message or null if no warning needed
   */
  static checkQuotaWarnings() {
    const usage = this.getQuotaUsage();
    const warnings = [];

    const urlFetchPercent = usage.urlFetchCount / usage.urlFetchLimit;
    if (urlFetchPercent >= QUOTA_LIMITS.WARNING_THRESHOLD) {
      warnings.push(
        `UrlFetch quota: ${Math.round(urlFetchPercent * 100)}% used (${
          usage.urlFetchCount
        }/${usage.urlFetchLimit})`
      );
    }

    const executionTimePercent =
      usage.executionTimeMs / usage.executionTimeLimitMs;
    if (executionTimePercent >= QUOTA_LIMITS.WARNING_THRESHOLD) {
      const minutesUsed = Math.round(usage.executionTimeMs / 60000);
      const minutesLimit = Math.round(usage.executionTimeLimitMs / 60000);
      warnings.push(
        `Execution time quota: ${Math.round(
          executionTimePercent * 100
        )}% used (${minutesUsed}/${minutesLimit} minutes)`
      );
    }

    return warnings.length > 0 ? warnings.join("\n") : null;
  }

  /**
   * Warns user about approaching UrlFetch quota limit
   * @param {number} currentCount - Current count of UrlFetch calls
   * @private
   */
  static _warnUrlFetchQuota(currentCount) {
    const percent = Math.round(
      (currentCount / QUOTA_LIMITS.URL_FETCH_DAILY) * 100
    );
    const remaining = QUOTA_LIMITS.URL_FETCH_DAILY - currentCount;

    console.warn(
      `UrlFetch quota warning: ${percent}% used (${currentCount}/${QUOTA_LIMITS.URL_FETCH_DAILY}). ${remaining} calls remaining.`
    );

    if (percent >= 90) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Warning: ${percent}% of daily UrlFetch quota used. ${remaining} calls remaining.`,
        "Quota Warning",
        TOAST_DURATION.LONG
      );
    }
  }

  /**
   * Warns user about approaching execution time quota limit
   * @param {number} currentTimeMs - Current execution time in milliseconds
   * @private
   */
  static _warnExecutionTimeQuota(currentTimeMs) {
    const percent = Math.round(
      (currentTimeMs / QUOTA_LIMITS.EXECUTION_TIME_DAILY_MS) * 100
    );
    const remainingMinutes = Math.round(
      (QUOTA_LIMITS.EXECUTION_TIME_DAILY_MS - currentTimeMs) / 60000
    );

    console.warn(
      `Execution time quota warning: ${percent}% used. ${remainingMinutes} minutes remaining.`
    );

    if (percent >= 90) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Warning: ${percent}% of daily execution time quota used. ${remainingMinutes} minutes remaining.`,
        "Quota Warning",
        TOAST_DURATION.LONG
      );
    }
  }

  /**
   * Resets quota tracking (useful for testing or manual reset)
   */
  static resetQuotaTracking() {
    const props = PropertiesService.getDocumentProperties();
    props.deleteProperty(QUOTA_PROPERTY_KEYS.URL_FETCH_COUNT);
    props.deleteProperty(QUOTA_PROPERTY_KEYS.URL_FETCH_DATE);
    props.deleteProperty(QUOTA_PROPERTY_KEYS.EXECUTION_TIME_MS);
    props.deleteProperty(QUOTA_PROPERTY_KEYS.EXECUTION_TIME_DATE);
  }
}
