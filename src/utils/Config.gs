/**
 * Secure configuration management
 */
class Config {
  // Use static getter/setter instead of class fields
  static get AUTHORIZED_API_KEY() {
    if (!this._AUTHORIZED_API_KEY) {
      this._AUTHORIZED_API_KEY = ""; // Will be overwritten by config.local.gs
    }
    return this._AUTHORIZED_API_KEY;
  }

  static set AUTHORIZED_API_KEY(value) {
    this._AUTHORIZED_API_KEY = value;
  }

  static get isAuthorized() {
    return this.AUTHORIZED_API_KEY !== "";
  }
}
