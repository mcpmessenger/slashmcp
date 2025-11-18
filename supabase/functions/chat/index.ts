import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  Agent,
  type AgentInputItem,
  type Handoff,
  type Tool,
  Runner,
} from "https://esm.sh/@openai/agents@0.3.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMemoryService } from "../_shared/memory.ts";
import type { Database } from "../_shared/database.types.ts";

type Provider = "openai" | "anthropic" | "gemini";

const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",").map(origin => origin.trim()) ?? ["*"];
const BASE_SYSTEM_PROMPT =
  "You are a helpful AI research assistant speaking aloud through text-to-speech. Respond in natural spoken sentences, avoid stage directions, asterisks, or emojis, and keep punctuation simple so it sounds good when read aloud. Provide clear answers, cite important facts conversationally, and offer actionable insight when useful.";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const encoder = new TextEncoder();

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const MCP_GATEWAY_URL = PROJECT_URL ? `${PROJECT_URL.replace(/\/+$/, "")}/functions/v1/mcp` : "";

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function respondWithStreamedText(text: string, corsHeaders: Record<string, string>) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (text) {
        const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

// Enhanced streaming response that supports both content and MCP events
function createEventStream(corsHeaders: Record<string, string>) {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const sendContent = (content: string) => {
    if (controller) {
      const payload = JSON.stringify({ choices: [{ delta: { content } }] });
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
    }
  };

  const sendEvent = (event: {
    type: string;
    timestamp: number;
    agent?: string;
    tool?: string;
    command?: string;
    result?: unknown;
    error?: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (controller) {
      const payload = JSON.stringify({ mcpEvent: event });
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
    }
  };

  const close = () => {
    if (controller) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  };

  return { stream, sendContent, sendEvent, close };
}

function mapMessagesForAnthropic(messages: Array<{ role: string; content: string }>) {
  return messages.map(message => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: message.content }],
  }));
}

function mapMessagesForGemini(messages: Array<{ role: string; content: string }>) {
  return messages.map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

// --- Multi-agent setup using OpenAI Agents SDK for the OpenAI provider ---

// Memory tools - will be created dynamically when memoryService is available
function createMemoryTools(memoryService: ReturnType<typeof createMemoryService>): Tool[] {
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

// Helper function to execute MCP commands with optional auth header
async function executeMcpCommand(
  command: string,
  authHeader?: string | null,
): Promise<string> {
  if (!MCP_GATEWAY_URL) {
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

    const response = await fetch(MCP_GATEWAY_URL, {
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

const mcpProxyTool: Tool = {
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
    // Note: When used by agents SDK, auth header should be passed via context
    // For now, try without auth (will work for public endpoints)
    return await executeMcpCommand(command);
  },
};

// Command Discovery Agent - knows all available MCP commands and can translate AND execute
function createCommandDiscoveryAgent(mcpToolAgent: Agent): Agent {
  const allCommands = `
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
     Note: Market IDs must be exact slugs. If not found, use browser automation to search.

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
     Example: /gemini-mcp generate_text prompt="Write a product description"

6. PLAYWRIGHT-MCP (Browser Automation)
   - navigate_and_scrape: Navigate and extract content
     Format: /playwright-mcp navigate_and_scrape url=URL selector=SELECTOR
   - screenshot: Capture page screenshot
     Format: /playwright-mcp screenshot url=URL [selector=SELECTOR]

7. PLAYWRIGHT-WRAPPER (Advanced Browser Automation)
   - browser_navigate: Navigate to URL
     Format: /playwright-wrapper browser_navigate url=URL
   - browser_snapshot: Get page accessibility snapshot
     Format: /playwright-wrapper browser_snapshot
   - browser_click: Click element on page
     Format: /playwright-wrapper browser_click element="DESCRIPTION" ref=SELECTOR
   - browser_extract_text: Extract all text from page
     Format: /playwright-wrapper browser_extract_text url=URL
   - browser_take_screenshot: Capture screenshot
     Format: /playwright-wrapper browser_take_screenshot [filename=NAME] [fullPage=true|false]

8. SEARCH-MCP (Web Search)
   - web_search: Search the web using DuckDuckGo
     Format: /search-mcp web_search query="QUERY" [max_results=N]
     Example: /search-mcp web_search query="Model Context Protocol" max_results=5

COMMAND TRANSLATION RULES:
- "Get stock price for AAPL" → /alphavantage-mcp get_quote symbol=AAPL
- "Show me Tesla's chart" → /alphavantage-mcp get_stock_chart symbol=TSLA
- "What are the odds for [event]?" → /polymarket-mcp get_market_price market_id=EVENT_SLUG
- "Search Grokipedia for [topic]" or "Search grokipedia for [topic]" or "Grokipedia [topic]" → /grokipedia-mcp search query="TOPIC"
- "Search for [topic]" → /grokipedia-mcp search query="TOPIC" (prefer Grokipedia) or /search-mcp web_search query="TOPIC"
- "Create a design with [text]" → /canva-mcp create_design text="TEXT"
- "Visit [website]" or "Scrape [website]" → /playwright-wrapper browser_navigate url=URL
- "Take a screenshot of [url]" → /playwright-wrapper browser_take_screenshot url=URL
`;

  const executeCommandHandoff: Handoff = {
    name: "handoff_to_execute_command",
    description: "Use this handoff when the user wants to actually execute an MCP command (not just see instructions).",
    targetAgent: mcpToolAgent,
    inputFilter: (input: AgentInputItem[]) => input,
  };

  return new Agent({
    name: "Command_Discovery_Agent",
    instructions:
      "You are the Command Discovery Agent - the primary interface for helping users interact with MCP (Model Context Protocol) commands. " +
      "You are friendly, helpful, and proactive. You can BOTH explain commands AND execute them.\n\n" +
      "GREETING USERS:\n" +
      "When a user first greets you or asks 'what can you do?', provide a warm, friendly greeting that:\n" +
      "1. Introduces yourself as the Command Discovery Agent\n" +
      "2. Briefly explains that you can help with MCP commands\n" +
      "3. Mentions key capabilities (stock data, design creation, web search, etc.)\n" +
      "4. Offers to help them get started\n" +
      "Example: 'Hello! I'm your Command Discovery Agent. I can help you use MCP commands to get stock prices, create Canva designs, search the web, and much more. Just ask me in plain language what you'd like to do, and I'll handle it for you!'\n\n" +
      allCommands +
      "\n" +
      "WHEN USER ASKS TO EXECUTE A COMMAND:\n" +
      "1. Identify which MCP server and command matches their request\n" +
      "2. Extract the required parameters from their request\n" +
      "3. Use the `handoff_to_execute_command` handoff to execute the command via MCP_Tool_Agent\n" +
      "4. The MCP_Tool_Agent will execute the command and return results\n" +
      "5. Keep your response concise - detailed command info is automatically logged to the MCP Event Log\n\n" +
      "SPECIAL CASES:\n" +
      "- If user says 'Search Grokipedia for X' or 'Grokipedia X' → Execute /grokipedia-mcp search query=\"X\"\n" +
      "- If user says 'Search for X' → Prefer Grokipedia: /grokipedia-mcp search query=\"X\"\n" +
      "- If user mentions 'Brockopedia', 'Broccopedia', or any variation → They mean 'Grokipedia', use /grokipedia-mcp search\n" +
      "- Common misspellings: Brockopedia, Broccopedia, Grokipedia, Grokypedia → All mean Grokipedia\n\n" +
      "LOCATION/BUSINESS QUERIES:\n" +
      "- 'Find [business] in [location]', 'Nearest [business]', 'Where is [business] near [location]' → Execute /google-places-mcp search_places query=\"[business] in [location]\"\n" +
      "- Examples: 'Find Starbucks in Des Moines' → /google-places-mcp search_places query=\"Starbucks in Des Moines\"\n" +
      "- Examples: 'Nearest coffee shop' → /google-places-mcp search_places query=\"coffee shop\"\n" +
      "- Examples: 'Restaurants near me' → /google-places-mcp search_places query=\"restaurants\"\n\n" +
      "WHEN USER ASKS ABOUT COMMANDS (how-to, what's available, etc.):\n" +
      "1. Use the `list_mcp_commands` tool to show available commands\n" +
      "2. Provide a brief, helpful summary in chat\n" +
      "3. Detailed command documentation is automatically available in the MCP Event Log\n" +
      "4. Offer to execute commands if the user wants\n\n" +
      "IMPORTANT: If the user's intent is clearly to PERFORM an action (e.g., 'get stock price', 'create a design', 'search for X'), " +
      "you should hand off to MCP_Tool_Agent to execute it. Only provide instructions if they explicitly ask 'how do I...' or 'what commands...'",
    handoffs: [executeCommandHandoff],
    tools: [listCommandsTool],
  });
}

// MCP Tool Agent will be created dynamically to ensure consistent tool handling
function createMcpToolAgent(tools: Tool[]): Agent {
  // Ensure tools is always an array
  const toolsArray: Tool[] = Array.isArray(tools) ? tools : [];
  
  // Find the MCP proxy tool - it must be available for this agent
  const mcpTool = toolsArray.find(t => t.name === "mcp_proxy");
  if (!mcpTool) {
    console.error("MCP proxy tool not found in tools array - this should not happen");
    // Return agent with empty tools array - this will cause handoffs to fail gracefully
    // CRITICAL: Always return an array, never undefined
    return new Agent({
      name: "MCP_Tool_Agent",
      instructions: "You are an expert in executing Model Context Protocol (MCP) commands, but the MCP proxy tool is not available.",
      tools: [], // Empty tools array (never undefined) - handoff will fail but won't crash
    });
  }
  
  return new Agent({
    name: "MCP_Tool_Agent",
    instructions:
      "You are an expert in executing Model Context Protocol (MCP) commands. Your only tool is the `mcp_proxy`. " +
      "When a user request requires external data or a specific tool, you must formulate the correct MCP command and use the `mcp_proxy` tool.\n\n" +
      "AVAILABLE MCP SERVERS AND COMMANDS:\n" +
      "1. alphavantage-mcp: get_stock_chart (symbol, interval, range), get_quote (symbol)\n" +
      "2. polymarket-mcp: get_market_price (market_id)\n" +
      "3. grokipedia-mcp: search (query, limit) - Search Grokipedia knowledge base\n" +
      "   IMPORTANT: When user says 'Search Grokipedia for X' or 'Grokipedia X' or mentions 'Brockopedia', use: /grokipedia-mcp search query=\"X\"\n" +
      "4. canva-mcp: create_design (template, text)\n" +
      "5. gemini-mcp: generate_text (prompt, model, temperature, max_output_tokens)\n" +
      "6. playwright-mcp: navigate_and_scrape (url, selector), screenshot (url, selector)\n" +
      "7. playwright-wrapper: browser_navigate (url), browser_snapshot, browser_click (element, ref), browser_extract_text (url), browser_take_screenshot (filename, fullPage)\n" +
      "8. search-mcp: web_search (query, max_results)\n" +
      "9. google-earth-engine-mcp: search_datasets (query), get_image (dataset, location, start_date, end_date), analyze_vegetation (location, date)\n" +
      "10. google-places-mcp: get_place_details (place_id, fields), search_places (query, location), autocomplete (input, location)\n" +
      "    IMPORTANT: When google-places-mcp returns results, format them in a friendly, conversational way:\n" +
      "    - Present each location with name, address, phone, rating, hours, and map links\n" +
      "    - Use emojis and clear formatting (📍 for address, 📞 for phone, ⭐ for rating, 🗺️ for maps)\n" +
      "    - Show if places are open now (✅ Open Now / ❌ Closed)\n" +
      "    - Include clickable map links for each location\n" +
      "    - Make it easy to scan and find the best option\n\n" +
      "CRITICAL: Technical messages, system status, and logging information are sent to the MCP Event Log panel (right side), NOT the chat.\n" +
      "The chat is read aloud, so keep chat responses conversational and user-friendly. All technical details go to the MCP Event Log.\n\n" +
      "SEARCH REQUEST PATTERNS:\n" +
      "- 'Search Grokipedia for [topic]' → /grokipedia-mcp search query=\"[topic]\"\n" +
      "- 'Grokipedia [topic]' → /grokipedia-mcp search query=\"[topic]\"\n" +
      "- 'Brockopedia [topic]', 'Broccopedia [topic]', or any similar variation → User means Grokipedia, use /grokipedia-mcp search query=\"[topic]\"\n" +
      "- 'Search for [topic]' → Prefer Grokipedia: /grokipedia-mcp search query=\"[topic]\"\n" +
      "- Common misspellings: Brockopedia, Broccopedia, Grokipedia, Grokypedia → All mean Grokipedia\n\n" +
      "LOCATION/BUSINESS QUERIES (USE GOOGLE PLACES, NOT WEB SEARCH):\n" +
      "- 'Find [business] in [location]', 'Nearest [business] in [location]', 'Where is [business] near [location]' → /google-places-mcp search_places query=\"[business] in [location]\"\n" +
      "- 'Starbucks near [location]', 'Restaurants in [city]', 'Gas stations near me' → /google-places-mcp search_places query=\"[query]\"\n" +
      "- Examples: 'Find Starbucks in Des Moines' → /google-places-mcp search_places query=\"Starbucks in Des Moines\"\n" +
      "- Examples: 'Nearest coffee shop' → /google-places-mcp search_places query=\"coffee shop\"\n" +
      "- Examples: 'Where's the nearest Starbucks in Des Moines?' → /google-places-mcp search_places query=\"Starbucks in Des Moines\"\n" +
      "- CRITICAL: For location/business queries, ALWAYS use Google Places API, NOT web search\n\n" +
      "CRITICAL POLYMARKET WORKFLOW - FOLLOW EXACTLY:\n" +
      "When a user asks about Polymarket markets:\n" +
      "STEP 1: Try the market lookup first: `/polymarket-mcp get_market_price market_id=GUESSED_SLUG`\n" +
      "STEP 2: Check the result - if it contains 'not found', 'was not found', or any error about the market:\n" +
      "   → DO NOT STOP OR RETURN THE ERROR\n" +
      "   → IMMEDIATELY proceed to STEP 3 (browser search)\n" +
      "STEP 3: Extract search terms from user query (convert 'eagles-and-lions-tonight' to 'eagles and lions tonight')\n" +
      "STEP 4: Search Polymarket.com using browser automation:\n" +
      "   a. Call: `/playwright-wrapper browser_navigate url=https://polymarket.com/search?q=EXTRACTED_SEARCH_TERMS`\n" +
      "   b. Call: `/playwright-wrapper browser_wait_for time=3`\n" +
      "   c. Call: `/playwright-wrapper browser_snapshot`\n" +
      "   d. Analyze the snapshot response - look for market links, event URLs, or market cards\n" +
      "   e. Extract market slugs from URLs (format: /event/MARKET-SLUG or similar)\n" +
      "STEP 5: If you found market slugs in the search results:\n" +
      "   → Call: `/polymarket-mcp get_market_price market_id=EXTRACTED_SLUG`\n" +
      "   → Return the market data\n" +
      "STEP 6: If no markets found in search:\n" +
      "   → Inform user: 'No matching markets found on Polymarket.com for [search terms]'\n" +
      "\n" +
      "REMEMBER: When you see 'market not found' in a tool response, you MUST continue to STEP 3-5. Do not stop or return the error.\n" +
      "\n" +
      "For browser automation, web scraping, or research tasks:\n" +
      "- Use `playwright-wrapper` (or `srv_...` ID) with commands like `browser_navigate`, `browser_snapshot`, `browser_extract_text`\n" +
      "- For recursive testing of the app itself, navigate to the app URL, get snapshots, and interact with elements\n" +
      "- For research, extract text content from pages and analyze it\n" +
      "When researching websites or testing apps, use browser automation to:\n" +
      "1. Navigate to the URL with `browser_navigate url=...`\n" +
      "2. Get page structure with `browser_snapshot url=...`\n" +
      "3. Extract text with `browser_extract_text url=...` (if available)\n" +
      "4. Take screenshots with `browser_take_screenshot url=...` if visual analysis is needed\n" +
      "\n" +
      "MANDATORY: If a Polymarket market lookup fails with any 'not found' error, you MUST:\n" +
      "1. Immediately use browser automation (playwright-wrapper) to search Polymarket.com\n" +
      "2. Extract market slugs from the search results\n" +
      "3. Retry the market lookup with the correct slug\n" +
      "4. Do NOT just return the error - always attempt to find the market via browser search first\n" +
      "Do not answer questions directly; instead, call the tool and return its results.",
    tools: [mcpTool], // Set the tool on the agent so it's available during handoffs
  });
}

const finalAnswerAgent = new Agent({
  name: "Final_Answer_Agent",
  instructions:
    "You are the final response generator. Your task is to take the results from the MCP_Tool_Agent and the user's original query, " +
    "and synthesize a concise, helpful, and professional final answer. Do not use any tools.",
});

// Tool to list available MCP commands
const listCommandsTool: Tool = {
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

// Handoffs will be created dynamically with the correct agents
function createHandoffs(mcpToolAgent: Agent, commandDiscoveryAgent: Agent): [Handoff, Handoff, Handoff] {
  const commandDiscoveryHandoff: Handoff = {
    name: "handoff_to_command_discovery",
    description:
      "Use this handoff when the user asks about available commands, wants to know how to use MCP commands, or needs help translating natural language into MCP command format.",
    targetAgent: commandDiscoveryAgent,
    inputFilter: (input: AgentInputItem[]) => input,
  };

  const mcpHandoff: Handoff = {
    name: "handoff_to_mcp_tool",
    description:
      "Use this handoff when the user's request requires external data or tool execution (e.g., stock prices, market odds, document analysis).",
    targetAgent: mcpToolAgent,
    inputFilter: (input: AgentInputItem[]) => input,
  };

  const finalHandoff: Handoff = {
    name: "handoff_to_final_answer",
    description: "Use this handoff after the MCP_Tool_Agent has executed its command and returned a result.",
    targetAgent: finalAnswerAgent,
    inputFilter: (input: AgentInputItem[]) => input,
  };

  return [commandDiscoveryHandoff, mcpHandoff, finalHandoff];
}


serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Create event stream at the very start to ensure we always have one
  const eventStream = createEventStream(corsHeaders);
  
  // Log request start
  console.log("=== Chat Function Request Start ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", Object.fromEntries(req.headers.entries()));
  
  try {
    let requestData;
    try {
      const requestText = await req.text();
      console.log("Request body length:", requestText.length);
      requestData = JSON.parse(requestText);
      console.log("Parsed request data:", JSON.stringify(requestData).slice(0, 500));
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      // If JSON parsing fails, return error stream
      eventStream.sendEvent({
        type: "error",
        timestamp: Date.now(),
        error: "Invalid JSON in request body",
        metadata: { category: "parse_error", error: parseError instanceof Error ? parseError.message : String(parseError) },
      });
      eventStream.sendContent("Invalid request format. Please try again.");
      eventStream.close();
      return new Response(eventStream.stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }
    
    const { messages, provider } = requestData;
    if (!Array.isArray(messages)) {
      // Return stream even for validation errors
      eventStream.sendEvent({
        type: "error",
        timestamp: Date.now(),
        error: "messages must be an array",
        metadata: { category: "validation_error" },
      });
      eventStream.sendContent("Invalid request: messages must be an array.");
      eventStream.close();
      return new Response(eventStream.stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Try to get authenticated user (optional - memory features work only if authenticated)
    let memoryService: ReturnType<typeof createMemoryService> | null = null;
    let userPreferences: Record<string, unknown> = {};
    let systemPrompt = BASE_SYSTEM_PROMPT;
    let relevantMemories: Array<{ key: string; value: unknown }> = [];

    const authHeader = req.headers.get("Authorization");
    if (authHeader && SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!userError && user) {
          try {
            // User is authenticated - create memory service
            memoryService = createMemoryService(supabase, user.id);

            // Load user preferences and recent memories (truly non-blocking)
            // Start loading but don't wait - we'll use what we have when the stream starts
            // Memory tools will still work even if context injection fails
            Promise.all([
              memoryService.getUserPreferences(),
              memoryService.getAllMemory(),
            ])
              .then(([prefs, allMemories]) => {
                userPreferences = prefs;
                relevantMemories = allMemories
                  .filter((mem) => mem.key !== "preferences")
                  .slice(0, 10);
                
                // Note: We can't update systemPrompt here as it's already been used
                // But we log for debugging
                if (Object.keys(prefs).length > 0 || relevantMemories.length > 0) {
                  console.log(`Loaded ${relevantMemories.length} memories and preferences (for future requests)`);
                }
              })
              .catch((prefError) => {
                console.error("Error loading user preferences/memories (background):", prefError);
                // Continue without preferences - don't block the request
              });
          } catch (memError) {
            console.error("Error creating memory service:", memError);
            // Continue without memory features - don't block the request
          }
        }
      } catch (authError) {
        console.error("Error authenticating user (non-blocking):", authError);
        // Continue without memory features - don't block the request
      }
    } else {
      // Log if keys are missing (for debugging) but don't fail
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.log("Memory service disabled: SUPABASE_URL or SUPABASE_ANON_KEY not configured");
      }
    }

    const normalizedProvider = (provider ?? "openai") as string;
    const selectedProvider: Provider =
      normalizedProvider === "anthropic" || normalizedProvider === "gemini" ? normalizedProvider : "openai";

    const conversation = messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: typeof message.content === "string" ? message.content : String(message.content),
    }));

    if (selectedProvider === "openai") {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        eventStream.sendEvent({
          type: "error",
          timestamp: Date.now(),
          error: "OPENAI_API_KEY is not configured",
        });
        eventStream.sendContent("I apologize, but the OpenAI API key is not configured. Please contact support.");
        eventStream.close();
        
        return new Response(eventStream.stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Try using OpenAI Agents SDK first, fall back to direct API if it fails
      let useAgentsSdk = true;
      // Declare these outside the if block so they're accessible in the fallback section
      let finalOutput = "";
      let errorOccurred = false;
      let errorMessage = "";

      // Use the event stream created at the top of the function

      if (useAgentsSdk) {
        try {
          // Create runner with API key for this request
          const runner = new Runner({
            model: "gpt-4o-mini",
            apiKey: apiKey,
          });

          // Build tools array - include memory tools if available
          const tools: Tool[] = [mcpProxyTool];
          if (memoryService) {
            const memoryTools = createMemoryTools(memoryService);
            tools.push(...memoryTools);
            console.log(`Added ${memoryTools.length} memory tools to agent`);
          }

          // Create agents dynamically with tools to avoid SDK serialization issues
          let currentMcpToolAgent: Agent;
          
          try {
            currentMcpToolAgent = createMcpToolAgent(tools);
          } catch (agentError) {
            console.error("Error creating agents:", agentError);
            // If agent creation fails, fall back to direct API
            useAgentsSdk = false;
            errorOccurred = true;
            errorMessage = agentError instanceof Error ? agentError.message : String(agentError);
            
            const isHostedToolError = errorMessage.includes("hosted_tool") || errorMessage.includes("Unsupported tool type");
            
            eventStream.sendEvent({
              type: "error",
              timestamp: Date.now(),
              error: errorMessage,
              metadata: { isHostedToolError },
            });
            
            if (isHostedToolError) {
              // Send technical error to MCP Event Log (system log)
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                error: errorMessage,
                metadata: {
                  category: "sdk_compatibility",
                  sdkVersion: "0.3.2",
                  issue: "hosted_tool_not_supported",
                  action: "fallback_to_direct_api",
                  message: "Agents SDK encountered compatibility issue with tool types. Multi-agent handoffs disabled.",
                },
              });
              // Send status to MCP Event Log (not chat - chat is read aloud)
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: "Switching to direct API mode. Multi-agent features temporarily unavailable." },
              });
            } else {
              // Send technical error to MCP Event Log
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                error: errorMessage,
                metadata: {
                  category: "agent_creation_error",
                  action: "fallback_to_direct_api",
                },
              });
              // User-friendly message in chat
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: "Switching to direct API mode (fallback mode)" },
              });
            }
            
            throw agentError; // Re-throw to be caught by outer catch
          }

          // Create orchestrator agent WITH tools on the agent itself
          // This ensures tools are available during handoffs (the SDK needs tools on agents for handoffs)
          // CRITICAL: Ensure tools is always an array, never undefined
          const orchestratorTools: Tool[] = Array.isArray(tools) ? tools : [];
          // Add command listing tool to orchestrator tools
          const toolsWithCommands = [...orchestratorTools, listCommandsTool];
          
          // Create Command Discovery Agent (needs mcpToolAgent for handoff)
          const commandDiscoveryAgent = createCommandDiscoveryAgent(currentMcpToolAgent);
          
          // Create handoffs including command discovery (returns 3 handoffs)
          const [commandDiscoveryHandoff, mcpHandoff, finalHandoff] = createHandoffs(currentMcpToolAgent, commandDiscoveryAgent);
          
          const currentOrchestratorAgent = new Agent({
            name: "Orchestrator_Agent",
            instructions:
              "Your primary goal is to route requests to the appropriate specialized agent. " +
              "\n" +
              "DEFAULT BEHAVIOR - Route to Command Discovery Agent:\n" +
              "- For greetings, initial questions, or general 'what can you do?' queries, use `handoff_to_command_discovery` so the Command_Discovery_Agent can greet and help the user.\n" +
              "- The Command_Discovery_Agent is the default agent and should handle most user interactions.\n" +
              "\n" +
              "FOR MEMORY REQUESTS:\n" +
              "- If the user asks you to remember something (like a password, preference, or fact), use the `store_memory` tool to save it.\n" +
              "- If the user asks about something they've told you before (like passwords, preferences, or facts), use the `query_memory` tool to retrieve that information.\n" +
              "\n" +
              "FOR COMMAND-RELATED REQUESTS:\n" +
              "- If the user asks HOW to use commands or WHAT commands are available (e.g., 'what commands can I use?', 'how do I get stock prices?'), " +
              "  use `handoff_to_command_discovery` - the Command_Discovery_Agent will handle it.\n" +
              "- If the user wants to PERFORM an action in plain language (e.g., 'get stock price for AAPL', 'create a Canva design', 'search for X'), " +
              "  use `handoff_to_command_discovery` - it will route to MCP_Tool_Agent to execute automatically.\n" +
              "\n" +
              "FOR KEY MANAGEMENT:\n" +
              "- If the user asks about API keys, managing keys, or key-related operations, they should use the `/key` command directly.\n" +
              "\n" +
              "FOR DATA/TOOL REQUESTS:\n" +
              "If it requires external data or a tool (like stock prices, prediction markets, document analysis, or browser automation with Playwright), " +
              "use the `handoff_to_command_discovery` handoff - it will route appropriately. " +
              "For Polymarket queries where the market ID might be unclear, the MCP_Tool_Agent will automatically use browser automation to search if needed. " +
              "If you receive tool results and further synthesis is needed, use the `handoff_to_final_answer` handoff.",
            handoffs: [commandDiscoveryHandoff, mcpHandoff, finalHandoff],
            tools: toolsWithCommands, // Set tools on the agent so they're available during handoffs - always an array
          });

          // Pass conversation history - Agents SDK Runner handles full context
          // Convert conversation to AgentInputItem format
          // CRITICAL: The SDK REQUIRES content to ALWAYS be an array of content blocks
          // Each content block must be { type: "text", text: "..." } for text content
          // IMPORTANT: Ensure strict typing - text must be a string, not optional
          const conversationHistory: AgentInputItem[] = conversation.map((msg, index) => {
            let contentArray: Array<{ type: "text"; text: string }>;
            
            if (Array.isArray(msg.content)) {
              // Already an array - ensure each item has the EXACT right format
              contentArray = msg.content.map((item) => {
                if (typeof item === "string") {
                  return { type: "text" as const, text: item };
                } else if (typeof item === "object" && item !== null) {
                  // If it's an object, extract text and ensure proper format
                  const textValue = (item as any).text || String(item);
                  if (typeof textValue === "string") {
                    return { type: "text" as const, text: textValue };
                  }
                  return { type: "text" as const, text: String(textValue) };
                }
                return { type: "text" as const, text: String(item) };
              });
            } else if (typeof msg.content === "string") {
              // String content - MUST wrap in array with proper format
              contentArray = [{ type: "text" as const, text: msg.content }];
            } else {
              // Fallback for other types
              contentArray = [{ type: "text" as const, text: String(msg.content) }];
            }
            
            // Ensure the array is not empty
            if (contentArray.length === 0) {
              contentArray = [{ type: "text" as const, text: "" }];
            }
            
            // Log the format for debugging
            if (index === 0 || index === conversation.length - 1) {
              console.log(`Message ${index} (${msg.role}): content format:`, JSON.stringify(contentArray).slice(0, 200));
            }
            
            return {
              role: msg.role as "user" | "assistant",
              content: contentArray,
            };
          });

          const lastUserMessage = conversation.length
            ? conversation[conversation.length - 1]?.content ?? ""
            : "";

          // Reset state for this request - important for handling multiple sequential requests
          const contentParts: string[] = [];
          const seenContent = new Set<string>(); // Track seen content to prevent duplicates
          finalOutput = ""; // Reset finalOutput for this request
          errorOccurred = false; // Reset error flag
          errorMessage = ""; // Reset error message
          
          console.log("=== Starting Agents SDK Runner ===");
          console.log("Message:", lastUserMessage.slice(0, 100));
          console.log("Conversation history length:", conversationHistory.length);
          console.log("OPENAI_API_KEY exists:", !!apiKey);
          console.log("MCP_GATEWAY_URL:", MCP_GATEWAY_URL);
          
          try {
            // Try with conversation history first, fallback to just last message if that fails
            let events: AsyncIterable<{ type: string; [key: string]: unknown }>;
            
            try {
              // The Runner.run() signature accepts conversation history as AgentInputItem[]
              // For version 0.3.2, try passing content as string for simple text messages
              const inputToPass = conversationHistory.map((item) => {
                // If content is an array with a single text block, simplify to just the text string
                if (Array.isArray(item.content) && item.content.length === 1 && item.content[0]?.type === "text") {
                  return {
                    role: item.role,
                    content: item.content[0].text,
                  };
                }
                // Otherwise keep the original format
                return item;
              });
              
              events = await runner.run(
                currentOrchestratorAgent,
                inputToPass.length > 0 ? inputToPass : [{ role: "user", content: lastUserMessage }],
                {
                  // Don't pass tools here - they're already on the agents
                  // Passing tools here AND on agents causes SDK to have undefined tools array during handoffs
                  maxTurns: 20, // Increased to allow for retry workflows (initial attempt + browser search + retry)
                  stream: true,
                },
              );
            } catch (runError) {
              console.log("Failed with conversation history, trying with last message only:", runError);
              // Fallback: try with just the last message as a simple string
              try {
                events = await runner.run(
                  currentOrchestratorAgent,
                  [{ role: "user", content: lastUserMessage }],
                  {
                    // Don't pass tools here - they're already on the agents
                    // Passing tools here AND on agents causes SDK to have undefined tools array during handoffs
                    maxTurns: 20, // Increased to allow for retry workflows (initial attempt + browser search + retry)
                    stream: true,
                  },
                );
              } catch (fallbackError) {
                // Both attempts failed - throw to outer catch
                throw fallbackError;
              }
            }
            
            // Send initial event to confirm connection
            eventStream.sendEvent({
              type: "system",
              timestamp: Date.now(),
              metadata: { message: "Agents SDK Runner started" },
            });
            
            // Collect all content from the streaming events.
            let eventCount = 0;
            for await (const event of events as AsyncIterable<{ 
              type: string; 
              output?: unknown; 
              error?: unknown;
              content?: string | unknown;
              text?: string;
              delta?: unknown;
              textDelta?: unknown;
              message?: unknown;
              agentMessage?: unknown;
              agent?: unknown;
              tool?: unknown;
              toolCall?: unknown;
              toolResult?: unknown;
            }>) {
              eventCount++;
              const eventStr = JSON.stringify(event).slice(0, 300);
              console.log(`Event #${eventCount} - Type: ${event.type}`, eventStr);
              
              // Send MCP event to frontend for logging
              const timestamp = Date.now();
              const eventData: {
                type: string;
                timestamp: number;
                agent?: string;
                tool?: string;
                command?: string;
                result?: unknown;
                error?: string;
                metadata?: Record<string, unknown>;
              } = {
                type: event.type,
                timestamp,
              };

              // Extract agent information
              if ((event as any).agent) {
                eventData.agent = String((event as any).agent);
              } else if ((event as any).agentMessage?.agent) {
                eventData.agent = String((event as any).agentMessage.agent);
              }

              // Extract tool call information
              if ((event as any).toolCall) {
                const toolCall = (event as any).toolCall;
                eventData.tool = toolCall.name || toolCall.tool;
                eventData.command = toolCall.input?.command || toolCall.arguments?.command || JSON.stringify(toolCall.input || toolCall.arguments);
                eventData.metadata = { toolCall };
              } else if ((event as any).tool) {
                eventData.tool = String((event as any).tool);
              }

              // Extract tool result
              if ((event as any).toolResult) {
                const toolResult = (event as any).toolResult;
                eventData.result = toolResult.result || toolResult.output || toolResult;
                if (toolResult.error) {
                  eventData.error = String(toolResult.error);
                }
              }

              // Extract MCP command from tool calls
              if (eventData.tool === "mcp_proxy" && eventData.command) {
                eventData.metadata = { ...eventData.metadata, mcpCommand: eventData.command };
              }

              if (event.type === "error") {
                errorOccurred = true;
                errorMessage = event.error instanceof Error ? event.error.message : String(event.error);
                eventData.error = errorMessage;
                eventStream.sendEvent(eventData);
                console.error("Agent runner error:", event.error);
                break;
              } else if (event.type === "finalOutput") {
                // finalOutput events contain the complete response - use this as the primary source
                // IMPORTANT: Don't stream here if we've already streamed the content from other events
                // The finalOutput is just for setting the final value, not for streaming
                if (event.output !== undefined) {
                  if (typeof event.output === "string") {
                    const outputStr = event.output.trim();
                    // Use Set to track exact content strings
                    if (!seenContent.has(outputStr)) {
                      seenContent.add(outputStr);
                      finalOutput = outputStr;
                      // Only stream if we haven't already streamed this content
                      // Check if any of the content parts match this output
                      const alreadyStreamed = contentParts.some(part => {
                        const partTrimmed = part.trim();
                        return partTrimmed === outputStr || 
                               (partTrimmed.length > 0 && outputStr.includes(partTrimmed)) ||
                               (outputStr.length > 0 && partTrimmed.includes(outputStr));
                      });
                      if (!alreadyStreamed && outputStr.length > 0) {
                        eventStream.sendContent(outputStr);
                        contentParts.push(outputStr);
                      }
                    }
                  } else {
                    try {
                      const outputStr = JSON.stringify(event.output);
                      const outputHash = outputStr.trim();
                      if (!seenContent.has(outputHash)) {
                        seenContent.add(outputHash);
                        finalOutput = outputStr;
                        eventStream.sendContent(outputStr);
                        contentParts.push(outputStr);
                      }
                    } catch {
                      const outputStr = String(event.output);
                      const outputHash = outputStr.trim();
                      if (!seenContent.has(outputHash)) {
                        seenContent.add(outputHash);
                        finalOutput = outputStr;
                        eventStream.sendContent(outputStr);
                        contentParts.push(outputStr);
                      }
                    }
                  }
                }
                eventData.result = event.output;
                eventStream.sendEvent(eventData);
              } else if (event.type === "content" || event.type === "text" || event.type === "textDelta" || event.type === "delta") {
                // Collect streaming content from various event types
                const content = (event as any).content || (event as any).text || (event as any).textDelta || (event as any).delta;
                if (content) {
                  const contentStr = typeof content === "string" ? content : String(content);
                  if (contentStr.trim()) {
                    // Use Set to track exact content strings (more reliable than string includes)
                    const contentHash = contentStr.trim();
                    if (!seenContent.has(contentHash)) {
                      seenContent.add(contentHash);
                      contentParts.push(contentStr);
                      finalOutput = (finalOutput || "") + contentStr;
                      console.log("Collected content chunk:", contentStr.slice(0, 50));
                      // Stream content immediately
                      eventStream.sendContent(contentStr);
                    } else {
                      console.log("Skipping duplicate content chunk:", contentStr.slice(0, 50));
                    }
                  }
                }
                eventData.result = content;
                eventStream.sendEvent(eventData);
              } else if (event.type === "newMessage" || event.type === "message" || event.type === "agentMessage") {
                // Some SDK versions use newMessage/message/agentMessage events
                const message = event as any;
                const messageContent = message.content || message.text || message.message || (message.agentMessage?.content);
                if (messageContent && typeof messageContent === "string") {
                  const contentStr = messageContent.trim();
                  if (contentStr) {
                    // Use Set to track exact content strings
                    const contentHash = contentStr.trim();
                    if (!seenContent.has(contentHash)) {
                      seenContent.add(contentHash);
                      contentParts.push(contentStr);
                      finalOutput = (finalOutput || "") + contentStr;
                      console.log("Collected message content:", contentStr.slice(0, 50));
                      // Stream content immediately
                      eventStream.sendContent(contentStr);
                    } else {
                      console.log("Skipping duplicate message content:", contentStr.slice(0, 50));
                    }
                  }
                }
                eventData.result = messageContent;
                eventStream.sendEvent(eventData);
              } else if (event.type === "toolCall" || event.type === "toolResult") {
                // Explicitly handle tool call events
                eventStream.sendEvent(eventData);
              } else if (event.type === "raw_model_stream_event") {
                // Handle raw model stream events - these contain the actual response text
                const rawEvent = event as any;
                console.log(`Raw model stream event:`, JSON.stringify(rawEvent).slice(0, 200));
                
                // Extract content from various nested structures
                let extractedText = null;
                
                // Check data.event structure
                if (rawEvent.data?.event) {
                  const modelEvent = rawEvent.data.event;
                  // Look for text in various fields
                  if (modelEvent.text) {
                    extractedText = modelEvent.text;
                  } else if (modelEvent.content) {
                    extractedText = modelEvent.content;
                  } else if (modelEvent.delta?.text) {
                    extractedText = modelEvent.delta.text;
                  } else if (modelEvent.delta?.content) {
                    extractedText = modelEvent.delta.content;
                  }
                }
                
                // Check data.response structure
                if (!extractedText && rawEvent.data?.response) {
                  const response = rawEvent.data.response;
                  if (response.output) {
                    // Output might be an array of items
                    if (Array.isArray(response.output)) {
                      const textItems = response.output
                        .map((item: any) => item.text || item.content || item.message?.text || item.message?.content)
                        .filter((text: any) => text && typeof text === "string")
                        .join("");
                      if (textItems) extractedText = textItems;
                    } else if (typeof response.output === "string") {
                      extractedText = response.output;
                    }
                  }
                  if (!extractedText && response.text) {
                    extractedText = response.text;
                  }
                  if (!extractedText && response.content) {
                    extractedText = response.content;
                  }
                }
                
                // Check for text in the event itself
                if (!extractedText) {
                  if (rawEvent.text) extractedText = rawEvent.text;
                  else if (rawEvent.content) extractedText = rawEvent.content;
                  else if (rawEvent.data?.text) extractedText = rawEvent.data.text;
                  else if (rawEvent.data?.content) extractedText = rawEvent.data.content;
                }
                
                if (extractedText && typeof extractedText === "string" && extractedText.trim()) {
                  const textStr = extractedText.trim();
                  // Use Set to track exact content strings
                  const contentHash = textStr;
                  if (!seenContent.has(contentHash)) {
                    seenContent.add(contentHash);
                    console.log(`Extracted text from raw_model_stream_event:`, textStr.slice(0, 100));
                    contentParts.push(textStr);
                    finalOutput = (finalOutput || "") + textStr;
                    eventStream.sendContent(textStr);
                  } else {
                    console.log(`Skipping duplicate text from raw_model_stream_event:`, textStr.slice(0, 100));
                  }
                }
                
                eventData.result = extractedText || rawEvent.data;
                eventStream.sendEvent(eventData);
              } else if (event.type === "run_item_stream_event") {
                // Handle run item stream events
                const runItemEvent = event as any;
                console.log(`Run item stream event:`, JSON.stringify(runItemEvent).slice(0, 200));
                
                // Extract text from run item events
                let extractedText = null;
                if (runItemEvent.item?.text) {
                  extractedText = runItemEvent.item.text;
                } else if (runItemEvent.item?.content) {
                  extractedText = runItemEvent.item.content;
                } else if (runItemEvent.text) {
                  extractedText = runItemEvent.text;
                } else if (runItemEvent.content) {
                  extractedText = runItemEvent.content;
                }
                
                if (extractedText && typeof extractedText === "string" && extractedText.trim()) {
                  const textStr = extractedText.trim();
                  // Use Set to track exact content strings
                  const contentHash = textStr;
                  if (!seenContent.has(contentHash)) {
                    seenContent.add(contentHash);
                    console.log(`Extracted text from run_item_stream_event:`, textStr.slice(0, 100));
                    contentParts.push(textStr);
                    finalOutput = (finalOutput || "") + textStr;
                    eventStream.sendContent(textStr);
                  } else {
                    console.log(`Skipping duplicate text from run_item_stream_event:`, textStr.slice(0, 100));
                  }
                }
                
                eventData.result = extractedText || runItemEvent.item || runItemEvent;
                eventStream.sendEvent(eventData);
              } else if (event.type === "run" || event.type === "runStart" || event.type === "runEnd") {
                // Handle run lifecycle events
                console.log(`Run event: ${event.type}`, eventStr);
                eventStream.sendEvent(eventData);
              } else if ((event as any).output !== undefined) {
                // Some events might have output directly
                const output = (event as any).output;
                const outputStr = typeof output === "string" ? output : JSON.stringify(output);
                if (outputStr && outputStr.trim()) {
                  // Use Set to track exact content strings
                  const contentHash = outputStr.trim();
                  if (!seenContent.has(contentHash)) {
                    seenContent.add(contentHash);
                    console.log(`Found output in event type ${event.type}:`, outputStr.slice(0, 100));
                    contentParts.push(outputStr);
                    finalOutput = (finalOutput || "") + outputStr;
                    eventStream.sendContent(outputStr);
                  } else {
                    console.log(`Skipping duplicate output from ${event.type}:`, outputStr.slice(0, 100));
                  }
                }
                eventData.result = output;
                eventStream.sendEvent(eventData);
              } else {
                // Log all other event types for debugging and send to frontend
                console.log(`Unhandled event type: ${event.type}`, eventStr);
                // Try to extract any text content from the event
                const eventAny = event as any;
                if (eventAny.text || eventAny.message || eventAny.response) {
                  const extractedText = eventAny.text || eventAny.message || eventAny.response;
                  const textStr = typeof extractedText === "string" ? extractedText : String(extractedText);
                  if (textStr && textStr.trim()) {
                    // Use Set to track exact content strings
                    const contentHash = textStr.trim();
                    if (!seenContent.has(contentHash)) {
                      seenContent.add(contentHash);
                      console.log(`Extracted text from ${event.type}:`, textStr.slice(0, 100));
                      contentParts.push(textStr);
                      finalOutput = (finalOutput || "") + textStr;
                      eventStream.sendContent(textStr);
                    } else {
                      console.log(`Skipping duplicate text from ${event.type}:`, textStr.slice(0, 100));
                    }
                  }
                }
                eventStream.sendEvent(eventData);
              }
            }
            
            console.log(`Processed ${eventCount} events, collected ${contentParts.length} content parts`);
            
            // If we collected content parts but no finalOutput, combine them (deduplicating)
            if (!finalOutput && contentParts.length > 0) {
              // Use Set to deduplicate - more reliable than string includes
              const uniqueParts: string[] = [];
              const seenParts = new Set<string>();
              for (const part of contentParts) {
                const partTrimmed = part.trim();
                if (partTrimmed && !seenParts.has(partTrimmed)) {
                  seenParts.add(partTrimmed);
                  uniqueParts.push(part);
                }
              }
              finalOutput = uniqueParts.join("");
              console.log(`Combined ${contentParts.length} content parts into ${uniqueParts.length} unique parts, finalOutput length: ${finalOutput.length}`);
            }
            
            // IMPORTANT: Don't stream finalOutput again if we've already streamed content incrementally
            // Content was streamed during the event loop, so we just need to close the stream
            if (finalOutput && finalOutput.trim().length > 0) {
              console.log("Content was streamed incrementally, closing stream");
              
              // Summarize long conversations if user is authenticated (async, don't block response)
              if (memoryService && conversation.length > 20) {
                memoryService.summarizeConversation(conversation).catch((summaryError) => {
                  console.error("Error summarizing conversation:", summaryError);
                });
              }
              
              eventStream.close();
              return new Response(eventStream.stream, {
                headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
              });
            } else if (contentParts.length > 0) {
              // If we have content parts but no finalOutput, send them (deduplicated)
              const uniqueParts: string[] = [];
              const seenParts = new Set<string>();
              for (const part of contentParts) {
                const partTrimmed = part.trim();
                if (partTrimmed && !seenParts.has(partTrimmed)) {
                  seenParts.add(partTrimmed);
                  uniqueParts.push(part);
                }
              }
              const combinedContent = uniqueParts.join("").trim();
              if (combinedContent) {
                console.log("Streaming combined content parts to client");
                eventStream.sendContent(combinedContent);
                
                // Summarize long conversations if user is authenticated (async, don't block response)
                if (memoryService && conversation.length > 20) {
                  memoryService.summarizeConversation(conversation).catch((summaryError) => {
                    console.error("Error summarizing conversation:", summaryError);
                  });
                }
                
                eventStream.close();
                return new Response(eventStream.stream, {
                  headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
                });
              }
            }
            
            // No content at all - fall back to direct API
            console.warn("No content generated from Agents SDK, will fall back to direct API");
            // Don't close the stream here - let it fall through to the direct API fallback
            // The direct API will use the same event stream
            useAgentsSdk = false;
            // Don't reset errorOccurred here - keep it as is
          } catch (runnerError) {
            errorOccurred = true;
            errorMessage = runnerError instanceof Error ? runnerError.message : String(runnerError);
            console.error("=== Runner Error ===");
            console.error("Error message:", errorMessage);
            console.error("Error stack:", runnerError instanceof Error ? runnerError.stack : 'No stack trace');
            
            // Check if this is the hosted_tool error
            const isHostedToolError = errorMessage.includes("hosted_tool") || errorMessage.includes("Unsupported tool type");
            
            // Send error to stream and fall through to direct API
            eventStream.sendEvent({
              type: "error",
              timestamp: Date.now(),
              error: errorMessage,
              metadata: { isHostedToolError },
            });
            
            if (isHostedToolError) {
              // Send technical error to MCP Event Log (system log)
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                error: errorMessage,
                metadata: {
                  category: "sdk_compatibility",
                  sdkVersion: "0.3.2",
                  issue: "hosted_tool_not_supported",
                  action: "fallback_to_direct_api",
                  message: "Agents SDK runner error: hosted_tool type not supported",
                },
              });
              // User-friendly message in chat
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: "Switching to direct API mode (fallback mode)" },
              });
            } else {
              // Send technical error to MCP Event Log
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                error: errorMessage,
                metadata: {
                  category: "runner_error",
                  action: "fallback_to_direct_api",
                },
              });
              // User-friendly message in chat
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: "Switching to direct API mode (fallback mode)" },
              });
            }
          }

          // If Runner succeeded but produced no output, fall back to direct API
          if (!errorOccurred && (!finalOutput || finalOutput.trim().length === 0)) {
            console.warn("No output from Runner, falling back to direct OpenAI API");
            useAgentsSdk = false;
          }
        } catch (sdkError) {
          console.error("Failed to initialize Runner, falling back to direct API:", sdkError);
          useAgentsSdk = false;
          errorOccurred = true;
          errorMessage = sdkError instanceof Error ? sdkError.message : String(sdkError);
          
          const isHostedToolError = errorMessage.includes("hosted_tool") || errorMessage.includes("Unsupported tool type");
          
          eventStream.sendEvent({
            type: "error",
            timestamp: Date.now(),
            error: errorMessage,
            metadata: { isHostedToolError },
          });
          
          if (isHostedToolError) {
            // Send technical error to MCP Event Log (system log)
            eventStream.sendEvent({
              type: "system",
              timestamp: Date.now(),
              error: errorMessage,
              metadata: {
                category: "sdk_initialization_error",
                sdkVersion: "0.3.2",
                issue: "hosted_tool_not_supported",
                action: "fallback_to_direct_api",
                message: "Failed to initialize Agents SDK: hosted_tool type not supported",
              },
            });
            // Send status to MCP Event Log (not chat - chat is read aloud)
            eventStream.sendEvent({
              type: "system",
              timestamp: Date.now(),
              metadata: { message: "Switching to direct API mode (fallback mode)" },
            });
          } else {
            // Send technical error to MCP Event Log
            eventStream.sendEvent({
              type: "system",
              timestamp: Date.now(),
              error: errorMessage,
              metadata: {
                category: "sdk_initialization_error",
                action: "fallback_to_direct_api",
                message: "Switching to direct API mode (fallback mode)",
              },
            });
          }
        }
      }

      // Fallback to direct OpenAI API if Agents SDK didn't work
      if (!useAgentsSdk || errorOccurred) {
        console.log("=== Using Direct OpenAI API (Fallback Mode) ===");
        console.log("Reason:", errorOccurred ? "error" : "no_output");
        if (errorOccurred) {
          console.log("Error message:", errorMessage);
        }
        eventStream.sendEvent({
          type: "fallback",
          timestamp: Date.now(),
          metadata: { reason: errorOccurred ? "error" : "no_output" },
        });
        
        // Send a content event to indicate we're using direct API
        eventStream.sendEvent({
          type: "system",
          timestamp: Date.now(),
          metadata: { message: "Using direct OpenAI API (Agents SDK unavailable)" },
        });
        
        // Enhanced system prompt for fallback mode with MCP command support
        const fallbackSystemPrompt = systemPrompt + "\n\n" +
          "IMPORTANT: You can execute MCP (Model Context Protocol) commands to access external data and tools. " +
          "When the user requests information that requires external data, respond with the appropriate MCP command in this format: " +
          "`/mcp-server-name command_name param1=value1 param2=value2`\n\n" +
          "Available MCP commands:\n" +
          "- Search Grokipedia: `/grokipedia-mcp search query=\"TOPIC\"` (also works for 'Brockopedia', 'Broccopedia' variations)\n" +
          "- Get stock quote: `/alphavantage-mcp get_quote symbol=SYMBOL`\n" +
          "- Get stock chart: `/alphavantage-mcp get_stock_chart symbol=SYMBOL interval=1day range=3M`\n" +
          "- Search web: `/search-mcp web_search query=\"QUERY\"`\n" +
          "- Find businesses/locations: `/google-places-mcp search_places query=\"Starbucks in Des Moines\"` (returns formatted results with addresses, ratings, hours, and map links)\n" +
          "  When you receive Google Places results, format them nicely:\n" +
          "  - List each location with name, address, phone, rating\n" +
          "  - Show if open now (✅/❌)\n" +
          "  - Include map links for each location\n" +
          "  - Use clear formatting with emojis\n\n" +
          "IMPORTANT: Technical messages and system status go to the MCP Event Log (right panel), NOT the chat.\n" +
          "The chat is read aloud, so keep responses conversational. Technical details are logged separately.\n" +
          "- Create Canva design: `/canva-mcp create_design template=presentation text=\"TEXT\"`\n\n" +
          "IMPORTANT: For location/business queries (e.g., 'nearest Starbucks', 'find restaurants in X'), use Google Places API, NOT web search.\n" +
          "Examples: 'Find Starbucks in Des Moines' → `/google-places-mcp search_places query=\"Starbucks in Des Moines\"`\n\n" +
          "When you need to execute a command, format it exactly as shown above. The system will execute it and return results.";
        
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
            body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: fallbackSystemPrompt },
              ...conversation,
            ],
            stream: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("OpenAI API error:", response.status, errorText);
          const errorMsg = `OpenAI API request failed: ${errorText}`;
          eventStream.sendEvent({
            type: "error",
            timestamp: Date.now(),
            error: errorMsg,
          });
          eventStream.sendContent(`I apologize, but I encountered an error: ${errorMsg}. Please try again.`);
          eventStream.close();
          
          return new Response(eventStream.stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
          });
        }

        if (!response.body) {
          eventStream.sendEvent({
            type: "error",
            timestamp: Date.now(),
            error: "No response body from OpenAI API",
          });
          eventStream.sendContent("I apologize, but I couldn't connect to the AI service. Please try again.");
          eventStream.close();
          
          return new Response(eventStream.stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
          });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";
        let hasContent = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          textBuffer += decoder.decode(value, { stream: true });
          
          const lines = textBuffer.split("\n");
          textBuffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  finalOutput += content;
                  eventStream.sendContent(content);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        if (!finalOutput || finalOutput.trim().length === 0) {
          finalOutput = "I was not able to generate a response. Please try rephrasing your question or asking again in a moment.";
          eventStream.sendContent(finalOutput);
        } else {
          // Check if the response contains MCP commands and execute them
          // Match commands like: /grokipedia-mcp search query="nachos" or `/grokipedia-mcp search query="nachos"`
          const mcpCommandRegex = /`?(\/[a-z-]+-mcp\s+[^`\n]+?)(?:`|$)/gi;
          const matches = Array.from(finalOutput.matchAll(mcpCommandRegex)).map(m => m[1].trim());
          
          if (matches && matches.length > 0) {
            // Found MCP commands - execute them
            for (const match of matches) {
              const command = match.replace(/`/g, "").trim();
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: `Executing MCP command: ${command}` },
              });
              
              try {
                // Execute MCP command with auth header from the original request
                const result = await executeMcpCommand(command, authHeader);
                eventStream.sendEvent({
                  type: "tool",
                  timestamp: Date.now(),
                  command: command,
                  result: result,
                });
                
                // Append result to final output
                finalOutput += `\n\n**Command Result:**\n${result}`;
                eventStream.sendContent(`\n\n**Command Result:**\n${result}`);
              } catch (cmdError) {
                const errorMsg = cmdError instanceof Error ? cmdError.message : String(cmdError);
                eventStream.sendEvent({
                  type: "error",
                  timestamp: Date.now(),
                  error: `Failed to execute MCP command: ${errorMsg}`,
                  metadata: { command },
                });
                finalOutput += `\n\n**Error executing command:** ${errorMsg}`;
                eventStream.sendContent(`\n\n**Error executing command:** ${errorMsg}`);
              }
            }
          }
        }
        
        // Summarize long conversations if user is authenticated (async, don't block response)
        if (memoryService && conversation.length > 20) {
          memoryService.summarizeConversation(conversation).catch((summaryError) => {
            console.error("Error summarizing conversation:", summaryError);
          });
        }
        
        eventStream.close();
        return new Response(eventStream.stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // This should not be reached, but ensure we always return a stream
      // If we somehow get here without closing the stream, close it and return
      if (eventStream) {
        if (finalOutput) {
          eventStream.sendContent(finalOutput);
        } else {
          eventStream.sendContent("I apologize, but I was unable to generate a response. Please try again.");
        }
        eventStream.close();
        return new Response(eventStream.stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }
      
      // Last resort fallback
      return respondWithStreamedText(finalOutput || "I apologize, but I was unable to generate a response. Please try again.", corsHeaders);
    }

    if (selectedProvider === "anthropic") {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          system: systemPrompt,
          max_tokens: 1024,
          messages: mapMessagesForAnthropic(conversation),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Anthropic error:", response.status, errorText);
        // Return stream even for provider errors
        const errorStream = createEventStream(corsHeaders);
        errorStream.sendEvent({
          type: "error",
          timestamp: Date.now(),
          error: `Anthropic request failed: ${errorText}`,
          metadata: { category: "provider_error", status: response.status },
        });
        errorStream.sendContent("I apologize, but there was an error with the Anthropic API. Please try again.");
        errorStream.close();
        return new Response(errorStream.stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const data = await response.json();
      const text = Array.isArray(data?.content)
        ? data.content
            .map((part: { text?: string }) => part?.text ?? "")
            .join("\n")
            .trim()
        : "";

      // Summarize long conversations if user is authenticated (async, don't block response)
      if (memoryService && conversation.length > 20) {
        memoryService.summarizeConversation(conversation).catch((summaryError) => {
          console.error("Error summarizing conversation:", summaryError);
        });
      }

      return respondWithStreamedText(text, corsHeaders);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: mapMessagesForGemini(conversation),
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini error:", response.status, errorText);
      // Return stream even for provider errors
      const errorStream = createEventStream(corsHeaders);
      errorStream.sendEvent({
        type: "error",
        timestamp: Date.now(),
        error: `Gemini request failed: ${errorText}`,
        metadata: { category: "provider_error", status: response.status },
      });
      errorStream.sendContent("I apologize, but there was an error with the Gemini API. Please try again.");
      errorStream.close();
      return new Response(errorStream.stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text ?? "")
      .join("\n")
      .trim() ?? "";

    // Summarize long conversations if user is authenticated
    if (memoryService && conversation.length > 20) {
      try {
        await memoryService.summarizeConversation(conversation);
      } catch (summaryError) {
        console.error("Error summarizing conversation:", summaryError);
        // Don't fail the request if summarization fails
      }
    }

    return respondWithStreamedText(text, corsHeaders);
  } catch (error) {
    console.error("=== Chat Function Error ===");
    console.error("Error type:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 1000));
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Always return a stream, even for errors
    eventStream.sendEvent({
      type: "system",
      timestamp: Date.now(),
      error: errorMessage,
      metadata: {
        category: "function_error",
        stack: errorStack,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
    });
    eventStream.sendContent(`I apologize, but I encountered an error processing your request. Please try again.`);
    eventStream.close();
    
    return new Response(eventStream.stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  }
});
