/**
 * Secure configuration management
 */
class Config {
  static get AUTHORIZED_API_KEY() {
    // This value will be set by GitHub Actions during deployment
    if (!this._AUTHORIZED_API_KEY) {
      this._AUTHORIZED_API_KEY = "";
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
