<p align="center">
  <img src="https://github.com/user-attachments/assets/453f832f-77aa-4306-832f-fae72623e741" alt="hevy-tracker-logo" width="200" style="max-width: 50%; margin-top: 20px;" />
</p>

# Hevy Tracker

A Google Sheets Add-on for importing and analyzing workout data from Hevy App. Automatically syncs your workouts, exercises, routines, and weight measurements to a structured spreadsheet for advanced analysis and tracking.

## Features

- 🔄 Automatic data syncing from Hevy
  - Workouts with full exercise details
  - Custom and preset exercises
  - Workout routines and folders
  - Weight measurements
- 📊 Comprehensive data organization
  - Exercise categorization by muscle groups
  - Workout history tracking
  - Set-by-set performance data
  - Progress tracking
- ⚡ Performance optimized
  - Efficient batch processing
  - Rate limiting protection
  - Automatic error recovery
  - Progress indicators
- 🔒 Secure configuration
  - Safe API key management
  - Secure authorization handling
  - Protected user data

## Installation

### For Users

1. Open the [Hevy Tracker Template](https://docs.google.com/spreadsheets/d/1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk/)
2. Click Extensions → Hevy Tracker → Create New Spreadsheet From Template
3. Open your new spreadsheet using the provided link
4. Get your Hevy API key from [Hevy Developer Settings](https://hevy.com/settings?developer)
5. In your spreadsheet, click Extensions → Hevy Tracker → Set Hevy API Key
6. Enter your API key when prompted
7. Initial data import will begin automatically

### For Developers

1. Install Node.js and npm
2. Install clasp globally:

   ```bash
   npm install -g @google/clasp
   ```

3. Clone the repository:

   ```bash
   git clone https://github.com/gelbh/hevy-tracker.git
   cd hevy-tracker
   ```

4. Login to Google:

   ```bash
   clasp login
   ```

## Development

### Project Structure

```text
  src/
  ├── api/
  │   └── ApiClient.gs         # API client implementation
  ├── sheets/
  │   ├── SheetManager.gs      # Sheet management
  │   ├── Exercises.gs         # Exercise tracking
  │   ├── Routines.gs          # Routine management
  │   ├── RoutineFolders.gs    # Folder organization
  │   ├── RoutineBuilder.gs    # Routine builder
  │   └── Workouts.gs          # Workout tracking
  ├── ui/
  │   ├── Menu.gs              # Menu interface
  │   └── dialogs/             # HTML dialogs
  ├── utils/
  │   ├── ErrorHandler.gs      # Error management
  │   └── Utils.gs             # Common utilities
  └── Constants.gs             # Global constants
```

### Commands

- `npm run deployments:list` - List all deployments
- `npm run deployments:clean` - Remove all deployments except HEAD
- `npm run deployments:remove -- <ID>` - Remove a specific deployment

### Development Workflow

1. Make changes to local files
2. Test changes:

   ```bash
   clasp push --watch
   ```

3. Commit and push to GitHub:

   ```bash
   git add .
   git commit -m "type(scope): description"
   git push
   ```

4. GitHub Actions will automatically deploy to Apps Script

### Best Practices

- Follow [Google Apps Script Best Practices](https://developers.google.com/apps-script/practices)
- Use conventional commits format for commit messages
- Test all changes in the Apps Script environment
- Update documentation when adding features

## Security

- API keys are stored securely in Apps Script's Properties Service
- User data is processed only in the user's spreadsheet
- No external data storage
- All API requests are made using HTTPS
- Authorization is required for sensitive operations

## Contributing

1. Fork the repository
2. Create your feature branch:

   ```bash
   git checkout -b feature/AmazingFeature
   ```

3. Commit your changes:

   ```bash
   git commit -m 'feat(feature): Add some AmazingFeature'
   ```

4. Push to the branch:

   ```bash
   git push origin feature/AmazingFeature
   ```

5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## Support

If you encounter any issues or have questions:

1. [Open an issue](https://github.com/gelbh/hevy-tracker/issues)
2. Ask in the [Google Workspace Developer Community](https://developers.google.com/apps-script/community)
