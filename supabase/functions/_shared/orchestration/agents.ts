/**
 * Shared agent definitions for orchestration
 */

import {
  Agent,
  type AgentInputItem,
  type Handoff,
  type Tool,
} from "https://esm.sh/@openai/agents@0.3.2";
import { listCommandsTool } from "./tools.ts";

/**
 * Command Discovery Agent - knows all available MCP commands and can translate AND execute
 */
export function createCommandDiscoveryAgent(mcpToolAgent: Agent): Agent {
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

/**
 * MCP Tool Agent - executes MCP commands
 */
export function createMcpToolAgent(tools: Tool[]): Agent {
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

/**
 * Final Answer Agent - synthesizes final responses
 */
export const finalAnswerAgent = new Agent({
  name: "Final_Answer_Agent",
  instructions:
    "You are the final response generator. Your task is to take the results from the MCP_Tool_Agent and the user's original query, " +
    "and synthesize a concise, helpful, and professional final answer. Do not use any tools.",
});

/**
 * Create handoffs between agents
 */
export function createHandoffs(mcpToolAgent: Agent, commandDiscoveryAgent: Agent): [Handoff, Handoff, Handoff] {
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

/**
 * Create orchestrator agent
 */
export function createOrchestratorAgent(
  tools: Tool[],
  commandDiscoveryHandoff: Handoff,
  mcpHandoff: Handoff,
  finalHandoff: Handoff,
): Agent {
  // Ensure tools is always an array
  const toolsWithCommands = [...(Array.isArray(tools) ? tools : []), listCommandsTool];
  
  return new Agent({
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
}

