/**
 * Secure configuration management
 */
class Config {
  // This will be overwritten by config.local.gs
  static AUTHORIZED_API_KEY = "";

  static get isAuthorized() {
    return Config.AUTHORIZED_API_KEY !== "";
  }
}
