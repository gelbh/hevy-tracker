const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Function to safely evaluate the config file
function loadConfig(configPath) {
  let LOCAL_CONFIG;
  const content = fs.readFileSync(configPath, "utf8");
  // Using Function constructor to create a sandbox for evaluation
  new Function("LOCAL_CONFIG", content)(LOCAL_CONFIG);
  return LOCAL_CONFIG;
}

try {
  // Load local config
  const configPath = path.join(__dirname, "..", "src", "config.local.js");
  if (!fs.existsSync(configPath)) {
    console.error(
      "Error: config.local.js not found. Please create it from config.template.js"
    );
    process.exit(1);
  }

  // Create script to set properties
  const setupScript = `
  function __temp_setup() {
    const scriptProps = PropertiesService.getScriptProperties();
    scriptProps.setProperty('AUTHORIZED_API_KEY', '${
      loadConfig(configPath).AUTHORIZED_API_KEY
    }');
    Logger.log('Properties set successfully');
  }`;

  // Create temporary file
  const tempFile = path.join(__dirname, "temp_setup.js");
  fs.writeFileSync(tempFile, setupScript);

  try {
    // Push the temporary file
    console.log("Pushing setup script...");
    execSync(`clasp push -f ${tempFile}`, { stdio: "inherit" });

    console.log("Running setup function...");
    execSync("clasp run __temp_setup", { stdio: "inherit" });

    console.log("Setup completed successfully!");
  } catch (error) {
    console.error("Setup failed:", error.message);
    process.exit(1);
  } finally {
    // Cleanup
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
} catch (error) {
  console.error("Setup failed:", error.message);
  process.exit(1);
}
