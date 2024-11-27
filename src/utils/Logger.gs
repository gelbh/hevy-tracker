/**
 * Logger.gs
 * Centralized logging system for tracking application events and errors
 */

class Logger {
  static get ERROR() {
    return "ERROR";
  }
  static get INFO() {
    return "INFO";
  }
  static get WARNING() {
    return "WARNING";
  }
  static get DEBUG() {
    return "DEBUG";
  }

  /**
   * Log a message with the specified level and context
   */
  static log(level, message, context = {}, error = null) {
    console.log(`[${level}] ${message}`, context, error);
  }

  static error(message, context = {}, error = null) {
    this.log(this.ERROR, message, context, error);
  }

  static warn(message, context = {}) {
    this.log(this.WARNING, message, context);
  }

  static info(message, context = {}) {
    this.log(this.INFO, message, context);
  }

  static debug(message, context = {}) {
    if (DEBUG_MODE) {
      this.log(this.DEBUG, message, context);
    }
  }
}
