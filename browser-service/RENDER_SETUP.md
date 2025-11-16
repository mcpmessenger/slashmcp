# Render Setup Instructions

## Build Command

Update your Render service Build Command to:

```bash
apt-get update && apt-get install -y chromium chromium-sandbox && npm install
```

This will:
1. Update package list
2. Install Chromium and Chromium sandbox
3. Install Node.js dependencies

## Start Command

Keep as: `npm start`

## Environment Variables

No special environment variables needed. The code will automatically find Chromium at `/usr/bin/chromium` or `/usr/bin/chromium-browser`.

## Alternative: Use Channel Option

If Chromium installation fails, the code will fall back to using the `channel: 'chrome'` option, which uses system Chrome if available.

