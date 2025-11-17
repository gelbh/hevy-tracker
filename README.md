<p align="center">
   <img src="https://gelbhart.dev/assets/hevy-tracker/hevy-tracker-logo.svg" alt="hevy-tracker-logo" width="200" style="max-width: 50%; margin-top: 20px;" />
</p>

# Hevy Tracker

[![CI](https://github.com/gelbh/hevy-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/gelbh/hevy-tracker/actions/workflows/ci.yml)
[![Deploy to Apps Script](https://github.com/gelbh/hevy-tracker/actions/workflows/clasp-push.yml/badge.svg)](https://github.com/gelbh/hevy-tracker/actions/workflows/clasp-push.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Google Sheets Add-on for importing and analyzing workout data from Hevy App. Automatically syncs your workouts, exercises, routines, and weight measurements to a structured spreadsheet for advanced analysis and tracking.

## Features

- 🔄 Automatic Data Syncing

  - Workouts with full exercise details
  - Custom and preset exercises
  - Workout routines and folders

- 📊 Data Organization

  - Exercise categorization by muscle groups
  - Workout history tracking
  - Set-by-set performance data
  - Progress analytics

- ⚡ Performance Optimized

  - Efficient batch processing
  - Rate limiting protection
  - Automatic error recovery
  - Progress indicators

- 🔒 Security

  - Secure API key management
  - Protected user data
  - Access control
  - Data validation

## Installation

### For Users

1. Open the [Hevy Tracker Template](https://docs.google.com/spreadsheets/d/1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk/copy)
2. Click "Make a copy" to create your own version
3. The new spreadsheet will open automatically
4. Install the [Hevy Tracker Add-on](https://workspace.google.com/marketplace/app/hevy_tracker/221696974247)
5. Get your Hevy API key from [Hevy Developer Settings](https://hevy.com/settings?developer)
6. In your spreadsheet, click Extensions → Hevy Tracker → Set Hevy API Key
7. Enter your API key when prompted
8. Initial data import will begin automatically

### For Developers

1. Install Node.js and npm
2. Clone the repository:

   ```bash
   git clone https://github.com/gelbh/hevy-tracker.git
   cd hevy-tracker
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Install clasp globally:

   ```bash
   npm install -g @google/clasp
   ```

5. Login to Google:

   ```bash
   clasp login
   ```

6. Run tests to verify setup:

   ```bash
   npm test
   ```

## Project Structure

```text
src/
├── api/
│   └── ApiClient.gs            # API client implementation
├── sheets/
│   ├── SheetManager.gs         # Sheet management
│   ├── Exercises.gs            # Exercise tracking
│   ├── Routines.gs            # Routine management
│   ├── RoutineFolders.gs      # Folder organization
│   ├── RoutineBuilder.gs      # Routine builder
│   └── Workouts.gs            # Workout tracking
├── ui/
│   ├── Menu.gs                # Menu interface
│   └── dialogs/               # HTML dialogs
├── utils/
│   ├── ErrorHandler.gs        # Error management
│   └── Utils.gs               # Common utilities
└── Constants.gs               # Global constants
```

## Development Workflow

1. Make changes to local files
2. Run tests:

   ```bash
   npm test
   ```

3. Test changes in Apps Script:

   ```bash
   clasp push --watch
   ```

4. Commit and push to GitHub (commit message will be validated):

   ```bash
   git add .
   git commit -m "type(scope): description"
   git push
   ```

5. GitHub Actions will automatically:
   - Run tests and validation
   - Deploy to Apps Script (on main branch)

## Testing

We use Jest for unit testing with mocks for Google Apps Script APIs.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Git Hooks

This project uses Husky for Git hooks:

- **commit-msg**: Validates commit message format
- **pre-push**: Runs tests before allowing push

To bypass hooks (not recommended): `git push --no-verify`

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed testing guidelines.

## Security

- API keys are stored securely in Apps Script's Properties Service
- User data is processed only in the user's spreadsheet
- No external data storage
- All API requests are made using HTTPS
- Authorization is required for sensitive operations

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:

1. [Open an issue](https://github.com/gelbh/hevy-tracker/issues)
2. Contact support at tomer@gelbhart.dev
