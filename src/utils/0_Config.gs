/**
 * Secure configuration management
 */
class Config {
  // Will be set by set_config.gs during deployment
  static _AUTHORIZED_API_KEY = "";

  static get isAuthorized() {
    return this._AUTHORIZED_API_KEY !== "";
  }
}
