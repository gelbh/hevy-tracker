#!/bin/bash

# Check if gcloud is installed
if ! command -v gcloud &>/dev/null; then
  echo "gcloud could not be found. Please install the Google Cloud SDK first."
  exit 1
fi

# Configuration variables
PROJECT_ID="hevy-tracker"
DEPLOYMENT_NAME="production"
VERSION="1.0.0"

# Clean up function for old deployments
cleanup_old_deployments() {
  echo "Cleaning up old deployments..."
  # Get all deployments except HEAD and latest
  OLD_DEPLOYMENTS=$(clasp deployments | grep -v "@HEAD" | grep -v "$1" | grep -o 'AKfycb[a-zA-Z0-9_-]*')

  if [ -n "$OLD_DEPLOYMENTS" ]; then
    while IFS= read -r deployment; do
      echo "Removing deployment: $deployment"
      clasp undeploy "$deployment"
    done <<<"$OLD_DEPLOYMENTS"
  fi
}

# Check if already authenticated with gcloud
if ! gcloud auth list --filter=status:ACTIVE --format="get(account)" | grep -q "@"; then
  echo "Not authenticated with Google Cloud. Authenticating..."
  gcloud auth login
else
  echo "Already authenticated with Google Cloud."
fi

# Set the project
echo "Setting project..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable script.googleapis.com sheets.googleapis.com drive.googleapis.com classroom.googleapis.com admin.googleapis.com

# Check if authenticated with clasp
if [ ! -f ~/.clasprc.json ]; then
  echo "Not authenticated with clasp. Authenticating..."
  clasp login
else
  echo "Already authenticated with clasp."
fi

# Deploy using clasp
echo "Deploying with clasp..."
clasp push

# Create a new deployment
echo "Creating new deployment..."
DEPLOY_RESULT=$(clasp deploy --description "Production deployment $VERSION")
echo "Deploy result: $DEPLOY_RESULT"

# Get the latest deployment ID
LATEST_DEPLOYMENT=$(clasp deployments | tail -n 1)
DEPLOYMENT_ID=$(echo "$LATEST_DEPLOYMENT" | grep -o 'AKfycb[a-zA-Z0-9_-]*')

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "Failed to get deployment ID. Manual intervention required."
  echo "Please run 'clasp deployments' to verify the deployment status."
  exit 1
fi

echo "Deployment ID: $DEPLOYMENT_ID"

# Clean up old deployments but keep the latest one
cleanup_old_deployments "$DEPLOYMENT_ID"

echo "Deployment complete!"

# Show final status
echo "Running final status check..."
clasp deployments
