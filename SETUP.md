# Setup Guide

Detailed setup instructions for both users and developers of Hevy Tracker.

## For Users

### Getting Started

1. Open the Template

   - Visit the [Hevy Tracker Template](https://docs.google.com/spreadsheets/d/1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk/)
   - You don't need to request access - just create your own copy

2. Create Your Spreadsheet

   - Click Extensions → Hevy Tracker → Create New Spreadsheet From Template
   - Click Create Spreadsheet in the dialog
   - Open your new spreadsheet using the provided link

3. Set Up Your API Key
   - Go to [Hevy Developer Settings](https://hevy.com/settings?developer)
   - Copy your API key
   - In your spreadsheet, click Extensions → Hevy Tracker → Set Hevy API Key
   - Paste your API key and click Save
   - Initial data import will begin automatically

### Understanding the Sheets

1. Workouts

   - Records all your workout sessions
   - Includes exercises, sets, weights, reps
   - Automatically updates with new workouts

2. Exercises

   - List of all exercises you use
   - Tracks muscle groups and usage count
   - Custom and preset exercises included

3. Routines

   - Your saved workout routines
   - Organized in folders
   - Includes exercise and set details

4. Weight History
   - Track your weight measurements
   - Manual logging or import from other sources

### Common Tasks

1. Importing Data

   - Click Extensions → Hevy Tracker → Import Data
   - Choose what to import or select "Import All"
   - Wait for the process to complete

2. Logging Weight

   - Click Extensions → Hevy Tracker → Log Weight
   - Enter your weight in kg
   - Click OK to save

3. Managing API Key
   - Click Extensions → Hevy Tracker → Set Hevy API Key
   - Enter new key or click Cancel
   - Key is stored securely

## For Developers

### Setup Development Environment

1. Prerequisites

   - Node.js and npm installed
   - Google account with access to Google Apps Script
   - Git installed

2. Install Clasp

   ```bash
   npm install -g @google/clasp
   clasp login
   ```

3. Clone Repository

   ```bash
   git clone https://github.com/gelbh/hevy-tracker.git
   cd hevy-tracker
   ```

4. Configuration

   ```bash
   # Create local config
   cp src/utils/config.template.gs src/utils/config.local.gs

   # Edit config.local.gs with your values
   code src/utils/config.local.gs
   ```

### Development Workflow

1. Making Changes

   - Edit files in `src/` directory
   - Use VS Code with JavaScript language features
   - Test changes locally when possible

2. Testing

   ```bash
   # Push changes to Apps Script
   npm run push

   # Open script editor
   npm run open

   # Check status
   npm run status
   ```

3. Committing Changes

   ```bash
   git add .
   git commit -m "type: description"
   git push
   ```

4. Deployment

   ```bash
   # Create new version
   npm run version "Version description"

   # Deploy
   npm run deploy
   ```

### Important Notes

1. API Keys

   - Never commit API keys to git
   - Use `config.local.gs` for sensitive data
   - Test with your own Hevy API key

2. File Structure

   - Keep `src/` directory organized
   - Update both code and documentation
   - Follow Google Apps Script conventions

3. Error Handling

   - Use provided error handling utilities
   - Log errors appropriately
   - Provide user feedback

4. Testing
   - Test all changes in Apps Script environment
   - Verify imports work correctly
   - Check error scenarios

### Troubleshooting

1. Clasp Issues

   - Verify `.claspignore` configuration
   - Check file permissions
   - Ensure proper login state

2. API Errors

   - Verify API key is valid
   - Check rate limits
   - Review error logs

3. Deployment Problems
   - Clear browser cache
   - Check version numbers
   - Verify OAuth scopes

## Support

If you need help:

1. Check documentation
2. Review [GitHub Issues](https://github.com/gelbh/hevy-tracker/issues)
3. Ask in the community
4. Open a new issue

Remember to always include:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Error messages if any
