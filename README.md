# Hevy Tracker

A Google Sheets Add-on for importing and analyzing workout data from Hevy App.

## Features

- Import workout data from Hevy API
- Track exercises and routines
- Analyze workout progress
- Manage routine folders
- Log weight measurements

## Setup

### Prerequisites

- Node.js and npm installed
- Google account with access to Google Apps Script
- Hevy account with API access

### Installation

1. Install clasp globally:
```bash
npm install -g @google/clasp
```

2. Clone the repository:
```bash
git clone https://github.com/yourusername/hevy-tracker.git
cd hevy-tracker
```

3. Login to Google:
```bash
clasp login
```

4. Push to your Apps Script project:
```bash
clasp push
```

### Configuration

1. Get your Hevy API key from [Hevy Developer Settings](https://hevy.com/settings?developer)
2. Set up the API key in the add-on settings
3. Start importing your workout data

## Development

### Project Structure

```
src/
├── api/
│   └── ApiClient.js       # API client implementation
├── sheets/
│   ├── SheetManager.js    # Sheet management
│   ├── Exercises.js       # Exercise tracking
│   ├── Routines.js       # Routine management
│   ├── RoutineFolders.js # Folder organization
│   └── Workouts.js       # Workout tracking
├── ui/
│   ├── Menu.js           # Menu interface
│   └── dialogs/          # HTML dialogs
├── utils/
│   ├── ErrorHandler.js   # Error management
│   ├── Logger.js         # Logging utility
│   └── Utils.js          # Common utilities
└── Constants.js          # Global constants

```

### Commands

- `clasp push`: Push changes to Apps Script
- `clasp pull`: Pull changes from Apps Script
- `clasp status`: Check file sync status
- `clasp open`: Open script in Apps Script editor
- `clasp version`: Create a new version
- `clasp deploy`: Deploy a version

### Development Workflow

1. Make changes to local files
2. Test changes locally when possible
3. Push changes to Apps Script: `clasp push`
4. Test in the Google Sheets environment
5. Commit and push to GitHub
6. Create new version when ready: `clasp version 'Version description'`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

[MIT License](LICENSE)

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/yourusername/hevy-tracker/issues).