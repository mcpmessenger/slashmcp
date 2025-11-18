# Cloudflare Tunnel Setup for Grokipedia MCP

## ✅ Installation Complete

Cloudflared has been downloaded to: `C:\Users\senti\tools\cloudflared.exe`

## Starting the Tunnel

The tunnel is starting in the background. It will display a URL like:
```
https://abc123-def456.trycloudflare.com
```

## Register in SlashMCP

Once you see the HTTPS URL, register it:

```
/slashmcp add grokipedia-mcp https://your-url.trycloudflare.com
```

## Manual Start (if needed)

If you need to start it manually:

```powershell
C:\Users\senti\tools\cloudflared.exe tunnel --url http://localhost:8889
```

## Verify Server is Running

Make sure grokipedia-mcp is running on port 8889:

```powershell
netstat -ano | findstr :8889
```

If not running, start it:
```powershell
py -m grokipedia_mcp --transport sse --port 8889
```

## Troubleshooting

**Tunnel not connecting?**
- Make sure grokipedia-mcp server is running first
- Check firewall settings
- Try restarting both services

**Need to stop tunnel?**
- Press `Ctrl+C` in the terminal where it's running
- Or find the process: `Get-Process cloudflared | Stop-Process`

**Different port?**
- If grokipedia-mcp is on a different port, update the tunnel command:
  ```powershell
  C:\Users\senti\tools\cloudflared.exe tunnel --url http://localhost:3000
  ```

## Advantages of Cloudflare Tunnel

- ✅ Free (no account needed for basic use)
- ✅ HTTPS automatically
- ✅ No authtoken required
- ✅ Easy to use

## Next Steps

1. ✅ Cloudflared installed
2. ✅ Tunnel starting
3. ⏳ Copy the HTTPS URL from tunnel output
4. ⏳ Register in SlashMCP: `/slashmcp add grokipedia-mcp <url>`
5. ⏳ Test: `/grokipedia-mcp search query="test"`

