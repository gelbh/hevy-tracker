const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

async function listDeployments() {
  try {
    const { stdout } = await execAsync("clasp deployments");
    const deployments = [];

    // Parse deployment information
    // Handle the format: "- AKfycb... @HEAD" or "- AKfycb... @<version>"
    const lines = stdout.split("\n").filter((line) => line.trim());

    // Skip the first line if it contains "Deployments."
    const deploymentLines = lines[0].includes("Deployments.")
      ? lines.slice(1)
      : lines;

    deploymentLines.forEach((line) => {
      // Match the format: "- <deploymentId> @<version>"
      const match = line.match(/- (AKfycb[\w-]+) @(HEAD|\d+)/);
      if (match) {
        deployments.push({
          id: match[1],
          version: match[2],
        });
      }
    });

    console.log("\nFound deployments:");
    deployments.forEach((dep, index) => {
      console.log(`${index + 1}. ID: ${dep.id} (Version: ${dep.version})`);
    });

    return deployments;
  } catch (error) {
    console.error("Failed to list deployments:", error.message);
    return [];
  }
}

async function removeDeployment(deploymentId) {
  try {
    console.log(`Removing deployment: ${deploymentId}`);
    await execAsync(`clasp undeploy ${deploymentId}`);
    console.log(`Successfully removed deployment: ${deploymentId}`);
    return true;
  } catch (error) {
    console.error(
      `Failed to remove deployment ${deploymentId}:`,
      error.message
    );
    return false;
  }
}

async function cleanupTestDeployments() {
  try {
    console.log("Fetching deployments...");
    const deployments = await listDeployments();

    if (deployments.length === 0) {
      console.log("No deployments found.");
      return;
    }

    // Keep HEAD deployment, remove others
    const deploymentsToRemove = deployments.filter(
      (dep) => dep.version !== "HEAD"
    );

    if (deploymentsToRemove.length === 0) {
      console.log("\nNo deployments to remove (keeping HEAD deployment).");
      return;
    }

    console.log("\nRemoving the following deployments:");
    for (const dep of deploymentsToRemove) {
      await removeDeployment(dep.id);
    }

    console.log("\nCleanup complete!");
  } catch (error) {
    console.error("Cleanup failed:", error.message);
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === "--list") {
    listDeployments();
  } else if (args[0] === "--remove" && args[1]) {
    removeDeployment(args[1]);
  } else {
    cleanupTestDeployments();
  }
}

module.exports = {
  listDeployments,
  removeDeployment,
  cleanupTestDeployments,
};
