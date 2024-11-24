// Config management and initialization
class Config {
  static initialize() {
    const scriptProps = PropertiesService.getScriptProperties();
    const requiredProps = ["AUTHORIZED_API_KEY"];

    if (!scriptProps.getProperty("AUTHORIZED_API_KEY")) {
      scriptProps.setProperty("AUTHORIZED_API_KEY", "");
    }
  }

  static get AUTHORIZED_API_KEY() {
    return PropertiesService.getScriptProperties().getProperty(
      "AUTHORIZED_API_KEY"
    );
  }
}
