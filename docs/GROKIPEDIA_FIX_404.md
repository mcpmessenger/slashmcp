# Fixing 404 Error with Grokipedia MCP

## Problem

Getting `404 Not Found` when trying to use grokipedia-mcp through the mcp-proxy.

## Root Cause

The `mcp-proxy` function tries to POST to `/invoke` endpoint, but grokipedia-mcp with **SSE transport** uses Server-Sent Events protocol, which is incompatible with simple HTTP POST requests.

## Solution: Use streamable-http Transport

Instead of SSE transport, use `streamable-http` which is compatible with HTTP-based proxying.

### Step 1: Restart Server with streamable-http

Stop the current server and restart with:

```powershell
py -m grokipedia_mcp --transport streamable-http --port 8889
```

### Step 2: Update Cloudflare Tunnel

If your tunnel is still running, it should automatically forward to the new server. If not, restart it:

```powershell
C:\Users\senti\tools\cloudflared.exe tunnel --url http://localhost:8889
```

### Step 3: Re-register in SlashMCP

Update the registration (or it should work with the same URL):

```
/slashmcp add grokipedia-mcp https://enzyme-uncertainty-forest-moved.trycloudflare.com
```

Or if you need to remove and re-add:

```
/slashmcp remove grokipedia-mcp
/slashmcp add grokipedia-mcp https://enzyme-uncertainty-forest-moved.trycloudflare.com
```

## Transport Comparison

| Transport | Compatibility | Use Case |
|-----------|--------------|----------|
| `stdio` | Direct MCP clients | Local development, Claude Desktop |
| `sse` | Server-Sent Events | Real-time streaming, but not compatible with HTTP proxy |
| `streamable-http` | ✅ HTTP POST/GET | **Best for SlashMCP proxy** |

## Testing

After switching to streamable-http, test:

```
/grokipedia-mcp search query="Model Context Protocol" limit=3
```

## Current Status

✅ Server restarted with `streamable-http` transport  
✅ Running on port 8889  
✅ Cloudflare tunnel forwarding (if still running)  
⏳ Test the command again

