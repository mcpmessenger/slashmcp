# Grokipedia MCP Setup Guide

## Installation Complete ✅

The `grokipedia-mcp` package has been successfully installed!

## Running the Server

### Option 1: SSE Transport (Recommended for SlashMCP)

Run the server with SSE transport on port 8888:

```powershell
py -m grokipedia_mcp --transport sse --port 8888
```

Or use a different port:
```powershell
py -m grokipedia_mcp --transport sse --port 3000
```

### Option 2: Streamable HTTP Transport

```powershell
py -m grokipedia_mcp --transport streamable-http --port 8888
```

### Option 3: Stdio (for direct MCP client integration)

```powershell
py -m grokipedia_mcp --transport stdio
```

## Registering in SlashMCP

Once the server is running, register it in SlashMCP:

### If running locally:
1. **Expose it publicly** using a tunneling service:
   - **ngrok**: `ngrok http 8888`
   - **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8888`
   - **LocalTunnel**: `lt --port 8888`

2. **Register in SlashMCP**:
   ```
   /slashmcp add grokipedia-mcp https://your-tunnel-url.ngrok.io
   ```

### If deploying to a cloud service:

1. **Deploy to Railway/Render/Fly.io**:
   - Create a new service
   - Set command: `python -m grokipedia_mcp --transport sse --port $PORT`
   - Get the public URL

2. **Register in SlashMCP**:
   ```
   /slashmcp add grokipedia-mcp https://your-service-url.com
   ```

## Available Commands

Once registered, you can use:

```
/grokipedia-mcp search query="Model Context Protocol" limit=5
/grokipedia-mcp get_page page="Model Context Protocol"
/grokipedia-mcp get_page_content page="Model Context Protocol"
/grokipedia-mcp get_page_citations page="Model Context Protocol"
/grokipedia-mcp get_related_pages page="Model Context Protocol"
```

## Troubleshooting

### Server won't start
- Check if port is already in use: `netstat -ano | findstr :8888`
- Try a different port: `--port 3000`

### Connection refused
- Make sure the server is running
- Check firewall settings
- Verify the URL is correct

### Authentication issues
- Grokipedia MCP doesn't require authentication by default
- If you need API keys, check the Grokipedia API documentation

## Next Steps

1. **Start the server** (choose one of the options above)
2. **Get a public URL** (use ngrok or deploy to cloud)
3. **Register it** in SlashMCP using `/slashmcp add`
4. **Test it** with `/grokipedia-mcp search query="test"`

## Notes

- The server uses Grokipedia's public API (https://grokipedia.com)
- No API key required for basic usage
- Rate limits may apply (check Grokipedia's terms)

