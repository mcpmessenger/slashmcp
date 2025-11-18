# Grokipedia MCP Research & Setup Guide

## What is Grokipedia?

**Grokipedia** is an AI-generated online encyclopedia developed by **xAI**, launched on October 27, 2025. It uses the Grok large language model to create and edit articles, many of which are derived from Wikipedia.

## What is grokipedia-mcp?

**grokipedia-mcp** is a Model Context Protocol (MCP) server that provides access to the Grokipedia knowledge base. It's developed by **Sky Moore** and available on PyPI.

### Features

The server provides several tools:
- **`search`** - Search Grokipedia for articles matching a query (with filters)
- **`get_page`** - Get page overview
- **`get_page_content`** - Retrieve full page content
- **`get_page_citations`** - Access citations for articles
- **`get_related_pages`** - Explore related pages

### Prompts Available

- **`research_topic`** - Facilitate research workflows
- **`find_sources`** - Locate citations

## Current Status in SlashMCP

✅ **In Registry**: `grokipedia-mcp` is listed in the static `MCP_SERVER_REGISTRY`  
❌ **Not Implemented**: Not supported in the built-in `mcp` function (only `alphavantage-mcp`, `polymarket-mcp`, `gemini-mcp` are supported)  
❌ **Not Registered**: User hasn't registered it as a custom server yet

## The Error You're Seeing

```
Unsupported MCP server: grokipedia-mcp
```

This happens because:
1. The command `/grokipedia-mcp search...` is recognized by the parser
2. It routes to the static `mcp` function (since it's not registered as a custom server)
3. The `mcp` function only supports 3 hardcoded servers
4. It returns "Unsupported MCP server" error

## Solution: Register grokipedia-mcp as a Custom Server

Since `grokipedia-mcp` is a Python package that needs to run as an MCP server, you have two options:

### Option 1: Register as Custom Server (Recommended)

You need to:
1. **Install and run grokipedia-mcp** somewhere (local machine, server, or cloud function)
2. **Get its gateway URL** (the MCP server endpoint)
3. **Register it** in SlashMCP using:

```
/slashmcp add grokipedia-mcp <gateway-url>
```

**Installation** (from PyPI):
```bash
pip install grokipedia-mcp
```

**Running the server** (you'll need to set this up):
```bash
grokipedia-mcp
# This will start an MCP server on a specific port/URL
```

**Note**: The exact command and gateway URL depend on how you deploy it. You may need to:
- Run it locally and expose it via ngrok/tunneling
- Deploy it to a cloud service (AWS Lambda, Railway, Render, etc.)
- Set it up as a Supabase Edge Function (if possible)

### Option 2: Add Built-in Support

We could add `grokipedia-mcp` as a built-in server in the `mcp` function, but this would require:
1. Understanding the Grokipedia API endpoints
2. Implementing the search, get_page, etc. functions
3. Handling authentication if needed

## Finding More Information

### PyPI Package
- **Package**: `grokipedia-mcp`
- **Author**: Sky Moore
- **PyPI URL**: https://pypi.org/project/grokipedia-mcp/

### Related Resources
- **Grokipedia Website**: https://grokipedia.com (if available)
- **xAI Grok**: https://x.ai
- **MCP Documentation**: https://modelcontextprotocol.io

### GitHub Search Results

Unfortunately, I couldn't find a specific GitHub repository for `grokipedia-mcp`. The package appears to be:
- Available on PyPI
- Developed by Sky Moore
- Not open-sourced on GitHub (or under a different name)

**Alternative Grok MCP Servers Found**:
- `Grok-MCP` by merterbak: https://github.com/merterbak/Grok-MCP (for Grok API, not Grokipedia)
- `grok-mcp` by Bob-lance: https://github.com/Bob-lance/grok-mcp (for Grok AI API)

## Next Steps

1. **Try installing the package**:
   ```bash
   pip install grokipedia-mcp
   ```

2. **Check the package documentation**:
   ```bash
   pip show grokipedia-mcp
   ```

3. **Look for CLI commands**:
   ```bash
   grokipedia-mcp --help
   ```

4. **Check if it has MCP server mode**:
   - Most MCP packages can run as servers
   - Look for commands like `grokipedia-mcp serve` or similar

5. **Once you have the server running**, register it:
   ```
   /slashmcp add grokipedia-mcp https://your-server-url.com
   ```

## Current Registry Entry

The registry already has this entry (from `src/lib/mcp/registry.ts`):

```typescript
{
  id: "grokipedia-mcp",
  label: "Grokipedia",
  description: "Community-maintained knowledge base with structured articles and citations.",
  category: "knowledge",
  install: "manus-mcp-cli install grokipedia-mcp",
  commands: [
    {
      name: "search",
      title: "Search Knowledge Base",
      description: "Search Grokipedia for articles matching a query.",
      parameters: [
        {
          name: "query",
          description: "Search phrase or keywords.",
          required: true,
          example: "\"Model Context Protocol history\"",
        },
        {
          name: "limit",
          description: "Maximum number of results.",
          required: false,
          example: "5",
        },
      ],
      example: "/grokipedia-mcp search query=\"Model Context Protocol history\" limit=3",
    },
  ],
}
```

So the command format is correct - you just need to register the server first!

