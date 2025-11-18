# Grokipedia MCP Compatibility Issue

## Problem

Grokipedia MCP server is returning 404 errors when accessed through the mcp-proxy function.

## Root Cause Analysis

The `grokipedia-mcp` server uses the MCP (Model Context Protocol) which has specific transport requirements:

1. **SSE Transport**: Uses Server-Sent Events (SSE) - not compatible with simple HTTP POST
2. **Streamable-HTTP Transport**: Uses HTTP but with MCP protocol-specific endpoints
3. **Our mcp-proxy**: Expects simple HTTP POST to `/invoke` endpoint

## The Issue

Our `mcp-proxy` function is designed for simple HTTP gateways, but `grokipedia-mcp` implements the full MCP protocol which requires:
- Proper MCP protocol message format (JSON-RPC 2.0)
- Specific endpoint handling
- Protocol-aware request/response handling

## Possible Solutions

### Option 1: Create MCP Protocol Gateway (Recommended)

Create a proper MCP gateway function that understands the MCP protocol:

```typescript
// supabase/functions/mcp-gateway/index.ts
// This would handle MCP protocol properly
```

### Option 2: Use Built-in Implementation

Instead of proxying to grokipedia-mcp, implement grokipedia functionality directly in the `mcp` function (like we do for alphavantage-mcp, polymarket-mcp).

### Option 3: Check if grokipedia-mcp has HTTP API

Some MCP servers expose both MCP protocol AND simple HTTP API. Check if grokipedia-mcp has this.

### Option 4: Use Different MCP Server

Look for a grokipedia API wrapper that provides simple HTTP endpoints instead of full MCP protocol.

## Current Status

- ❌ SSE transport: Not compatible with HTTP proxy
- ❌ Streamable-HTTP transport: Still uses MCP protocol, not simple HTTP
- ⏳ Need: Either MCP protocol gateway OR direct implementation

## Next Steps

1. **Check grokipedia API**: See if Grokipedia has a direct HTTP API we can use
2. **Implement MCP Gateway**: Create proper MCP protocol handler
3. **Direct Implementation**: Add grokipedia functionality to built-in `mcp` function

## Recommendation

For now, **Option 2** (direct implementation) would be fastest. We can add grokipedia search functionality directly to the `mcp` function, similar to how we handle alphavantage and polymarket.

