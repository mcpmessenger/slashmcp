# Grokipedia MCP Quick Start

## Current Status
✅ Package installed: `grokipedia-mcp` v0.2.2  
✅ Server running: Port 8889  
⏳ Need: Public URL to register in SlashMCP

## Option 1: Install ngrok (Recommended for Testing)

1. **Download**: https://ngrok.com/download (Windows)
2. **Extract** `ngrok.exe` to a folder (e.g., `C:\tools\ngrok\`)
3. **Run from that folder**:
   ```powershell
   cd C:\tools\ngrok
   .\ngrok.exe http 8889
   ```
4. **Copy the HTTPS URL** (e.g., `https://abc123.ngrok-free.app`)
5. **Register**:
   ```
   /slashmcp add grokipedia-mcp https://abc123.ngrok-free.app
   ```

## Option 2: Deploy to Railway (Best for Production)

See `docs/GROKIPEDIA_DEPLOY_RAILWAY.md` for full instructions.

Quick version:
1. Create a simple Python server
2. Deploy to Railway (free)
3. Get public URL automatically
4. Register in SlashMCP

## Option 3: Use Cloudflare Tunnel

1. **Download**: https://github.com/cloudflare/cloudflared/releases
2. **Run**:
   ```powershell
   cloudflared tunnel --url http://localhost:8889
   ```
3. **Copy the HTTPS URL**
4. **Register** in SlashMCP

## Verify Server is Running

Check if server is listening:
```powershell
netstat -ano | findstr :8889
```

Should show: `TCP    0.0.0.0:8889   LISTENING`

## Test After Registration

Once registered, try:
```
/grokipedia-mcp search query="Model Context Protocol" limit=3
```

## Troubleshooting

**Server not running?**
```powershell
py -m grokipedia_mcp --transport sse --port 8889
```

**Port in use?**
```powershell
# Find what's using the port
netstat -ano | findstr :8889

# Use different port
py -m grokipedia_mcp --transport sse --port 3000
```

**Need to stop server?**
```powershell
# Find process ID
netstat -ano | findstr :8889

# Stop it (replace PID with actual number)
Stop-Process -Id <PID>
```

