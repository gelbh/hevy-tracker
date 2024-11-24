/**
 * Secure configuration management
 */
class Config {
  static _AUTHORIZED_API_KEY = null;

  static initialize() {
    if (!this._AUTHORIZED_API_KEY) {
      this._AUTHORIZED_API_KEY = "";
    }
  }

  static isAuthorized() {
    return this._AUTHORIZED_API_KEY !== "" && this._AUTHORIZED_API_KEY !== null;
  }
}

// Initialize on load
Config.initialize();
