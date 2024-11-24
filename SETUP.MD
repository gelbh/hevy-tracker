# Setup Guide

## Configuration

1. Copy the configuration template:

```bash
cp src/config.template.js src/config.local.js
```

2. Edit `src/config.local.js` and fill in your API keys and other sensitive values:

```javascript
const LOCAL_CONFIG = {
  AUTHORIZED_API_KEY: "your-api-key-here",
};
```

3. Run the setup script to configure the Apps Script project:

```bash
npm run setup
```

## Security Notes

- Never commit `config.local.js` to version control
- The `setup.js` script safely transfers sensitive values to Apps Script's Properties Service
- API keys and other sensitive values are stored securely in Apps Script's Properties Service
- Local development uses `config.local.js` which is git-ignored
