/**
 * Shared tool definitions for agent orchestration
 */

import type { Tool } from "https://esm.sh/@openai/agents@0.3.2";
import { createMemoryService, type MemoryService } from "../memory.ts";

/**
 * Create memory tools for agent use
 */
export function createMemoryTools(memoryService: ReturnType<typeof createMemoryService>): Tool[] {
  return [
    {
      name: "query_memory",
      description:
        "Query the user's persistent memory to retrieve stored information like passwords, preferences, facts, or conversation summaries. Use this when the user asks about something they've told you before or when you need to recall stored information.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "The memory key to retrieve (e.g., 'password', 'preferences', 'important_facts', or 'conversation_summary_2025-01-19')",
          },
          search: {
            type: "string",
            description: "Optional: Search term to find relevant memories. If provided, will search all memory keys.",
          },
        },
      },
      async run({ key, search }: { key?: string; search?: string }) {
        try {
          if (search) {
            // Search all memories
            const allMemories = await memoryService.getAllMemory();
            const searchLower = search.toLowerCase();
            const matches = allMemories.filter(
              (mem) =>
                mem.key.toLowerCase().includes(searchLower) ||
                JSON.stringify(mem.value).toLowerCase().includes(searchLower),
            );
            if (matches.length === 0) {
              return `No memories found matching "${search}"`;
            }
            return JSON.stringify(matches, null, 2);
          } else if (key) {
            // Get specific memory
            const value = await memoryService.getMemory(key);
            if (value === null) {
              return `No memory found for key "${key}"`;
            }
            return JSON.stringify({ key, value }, null, 2);
          } else {
            // Get all memories
            const allMemories = await memoryService.getAllMemory();
            return JSON.stringify(allMemories, null, 2);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error querying memory: ${message}`;
        }
      },
    },
    {
      name: "store_memory",
      description:
        "Store information in the user's persistent memory. Use this when the user explicitly asks you to remember something, set a password, save a preference, or store an important fact. The key should be descriptive (e.g., 'password', 'secret_code_word', 'favorite_color', 'important_fact').",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "The memory key to store (e.g., 'password', 'secret_code_word', 'preferences', 'important_fact')",
          },
          value: {
            type: "string",
            description: "The value to store. Can be a simple string or JSON string for complex data.",
          },
        },
        required: ["key", "value"],
      },
      async run({ key, value }: { key: string; value: string }) {
        try {
          // Try to parse as JSON, otherwise store as string
          let parsedValue: unknown = value;
          try {
            parsedValue = JSON.parse(value);
          } catch {
            // Not JSON, store as string
            parsedValue = value;
          }
          
          await memoryService.setMemory(key, parsedValue);
          return `Successfully stored memory with key "${key}"`;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error storing memory: ${message}`;
        }
      },
    },
  ];
}

/**
 * Execute MCP command via gateway
 */
export async function executeMcpCommand(
  command: string,
  mcpGatewayUrl: string,
  authHeader?: string | null,
): Promise<string> {
  if (!mcpGatewayUrl) {
    return "MCP gateway URL is not configured on the server.";
  }

  const trimmed = (command ?? "").trim();
  if (!trimmed.startsWith("/")) {
    return 'Invalid MCP command format. Expected something like "/alphavantage-mcp get_quote symbol=NVDA".';
  }

  // Parse command more carefully to handle quoted values with spaces
  // Format: /server-id command param1="value with spaces" param2=simple
  // First, extract server-id and command name (before any quoted params)
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) {
    // No parameters, just server-id
    const serverId = trimmed.slice(1);
    return JSON.stringify({
      serverId,
      command: undefined,
      args: {},
      positionalArgs: [],
    });
  }
  
  const serverId = trimmed.slice(1, firstSpace);
  let remaining = trimmed.slice(firstSpace + 1).trim();
  
  // Find command name (first word before any quoted params)
  const commandMatch = remaining.match(/^(\S+)/);
  if (!commandMatch) {
    return 'Invalid MCP command format. Expected something like "/alphavantage-mcp get_quote symbol=NVDA".';
  }
  
  const mcpCommand = commandMatch[1];
  remaining = remaining.slice(mcpCommand.length).trim();
  
  // Parse parameters, handling quoted values
  const args: Record<string, string> = {};
  
  if (remaining) {
    // Parse key=value pairs, handling quoted values with spaces
    const paramRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let match;
    
    while ((match = paramRegex.exec(remaining)) !== null) {
      const key = match[1];
      // match[2] = double-quoted value, match[3] = single-quoted value, match[4] = unquoted value
      const value = match[2] || match[3] || match[4] || '';
      args[key] = value;
    }
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Add authorization header if provided
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const response = await fetch(mcpGatewayUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        serverId,
        command: mcpCommand,
        args,
        positionalArgs: [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `MCP gateway request failed with status ${response.status}${
          errorText ? `: ${errorText.slice(0, 200)}` : ""
        }`,
      );
    }

    const data = await response.json();
    return JSON.stringify(data, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing MCP command: ${message}`;
  }
}

/**
 * Create MCP proxy tool
 */
export function createMcpProxyTool(mcpGatewayUrl: string, authHeader?: string | null): Tool {
  return {
    name: "mcp_proxy",
    description:
      "Executes a registered MCP command via the slashmcp backend. Input must be a string in the format: /<server-id> <command> [param=value...]",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: 'The full MCP command string, e.g., "/alphavantage-mcp get_stock_chart symbol=NVDA"',
        },
      },
      required: ["command"],
    },
    async run({ command }: { command: string }) {
      return await executeMcpCommand(command, mcpGatewayUrl, authHeader);
    },
  };
}

/**
 * Tool to list available MCP commands
 */
export const listCommandsTool: Tool = {
  name: "list_mcp_commands",
  description: "Lists all available MCP commands and their usage. Use this when users ask 'what commands are available' or 'how do I use MCP commands'.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Optional category filter: financial, prediction, knowledge, design, llm, automation",
      },
    },
    required: [],
  },
  async run({ category }: { category?: string }) {
    const commands = `
AVAILABLE MCP COMMANDS:

1. ALPHAVANTAGE-MCP (Financial Data)
   - get_stock_chart: Get historical stock price data
     Format: /alphavantage-mcp get_stock_chart symbol=SYMBOL [interval=1day|1wk|1mo] [range=1M|3M|6M|1Y]
     Example: /alphavantage-mcp get_stock_chart symbol=TSLA interval=1wk range=3M
   - get_quote: Get latest stock quote and key stats
     Format: /alphavantage-mcp get_quote symbol=SYMBOL
     Example: /alphavantage-mcp get_quote symbol=NVDA

2. POLYMARKET-MCP (Prediction Markets)
   - get_market_price: Get prediction market odds and pricing
     Format: /polymarket-mcp get_market_price market_id=MARKET_SLUG
     Example: /polymarket-mcp get_market_price market_id=us_election_2024

3. GROKIPEDIA-MCP (Knowledge Base)
   - search: Search Grokipedia knowledge base
     Format: /grokipedia-mcp search query="QUERY" [limit=NUMBER]
     Example: /grokipedia-mcp search query="Model Context Protocol" limit=5

4. CANVA-MCP (Design Creation)
   - create_design: Create a Canva design from template
     Format: /canva-mcp create_design [template=TEMPLATE] [text="TEXT"]
     Templates: presentation, doc, whiteboard (default: presentation)
     Example: /canva-mcp create_design template=presentation text="Hello World"

5. GEMINI-MCP (Text Generation)
   - generate_text: Generate text using Gemini
     Format: /gemini-mcp generate_text prompt="PROMPT" [model=MODEL] [temperature=N] [max_output_tokens=N]

6. PLAYWRIGHT-MCP (Browser Automation)
   - navigate_and_scrape: Navigate and extract content
   - screenshot: Capture page screenshot

7. PLAYWRIGHT-WRAPPER (Advanced Browser Automation)
   - browser_navigate: Navigate to URL
   - browser_snapshot: Get page accessibility snapshot
   - browser_click: Click element on page
   - browser_extract_text: Extract all text from page
   - browser_take_screenshot: Capture screenshot

8. SEARCH-MCP (Web Search)
   - web_search: Search the web using DuckDuckGo
     Format: /search-mcp web_search query="QUERY" [max_results=N]
`;
    return commands;
  },
};

