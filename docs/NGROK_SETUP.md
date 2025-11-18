# ngrok Setup Instructions

## Your Authtoken
```
35Y9wizeYUSqVBt5FG35gyIGyEg_5nyfpEnipofaKiiriGi5q
```

## Step 1: Download ngrok

1. Go to: https://ngrok.com/download
2. Download the Windows version (ZIP file)
3. Extract `ngrok.exe` to: `C:\Users\senti\tools\` (or any folder you prefer)

## Step 2: Configure Authtoken

Open PowerShell and run:

```powershell
# If you extracted to C:\Users\senti\tools\
C:\Users\senti\tools\ngrok.exe config add-authtoken 35Y9wizeYUSqVBt5FG35gyIGyEg_5nyfpEnipofaKiiriGi5q

# Or if you extracted to a different location, use that path
```

## Step 3: Add to PATH (Optional but Recommended)

```powershell
# Add to PATH for current session
$env:Path += ";C:\Users\senti\tools"

# Or add permanently (requires admin)
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Users\senti\tools", "User")
```

## Step 4: Start Tunnel

Once configured, start the tunnel:

```powershell
ngrok http 8889
```

Or if not in PATH:
```powershell
C:\Users\senti\tools\ngrok.exe http 8889
```

## Step 5: Copy the HTTPS URL

ngrok will display something like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8889
```

Copy the HTTPS URL.

## Step 6: Register in SlashMCP

In your chat interface:
```
/slashmcp add grokipedia-mcp https://abc123.ngrok-free.app
```

## Quick Commands

**Start tunnel:**
```powershell
ngrok http 8889
```

**View tunnel status:**
```powershell
# Open in browser: http://localhost:4040
```

**Stop tunnel:**
Press `Ctrl+C` in the ngrok terminal

## Troubleshooting

**"ngrok not recognized"**
- Make sure you're using the full path: `C:\Users\senti\tools\ngrok.exe`
- Or add the folder to your PATH

**"Authtoken invalid"**
- Double-check the token: `35Y9wizeYUSqVBt5FG35gyIGyEg_5nyfpEnipofaKiiriGi5q`
- Make sure you copied it correctly

**"Port already in use"**
- Check if grokipedia-mcp is running: `netstat -ano | findstr :8889`
- Use a different port if needed

