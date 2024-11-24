/**
 * Secure configuration management
 */
class Config {
  static initialize() {
    if (typeof this._AUTHORIZED_API_KEY === "undefined") {
      this._AUTHORIZED_API_KEY = "";
    }
  }

  static isAuthorized() {
    return this._AUTHORIZED_API_KEY !== "" && this._AUTHORIZED_API_KEY !== null;
  }
}

// Add static property to class after definition
Config._AUTHORIZED_API_KEY = "";

// Initialize on load
Config.initialize();
