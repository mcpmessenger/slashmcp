import type { McpServerDefinition } from "./types";

export const MCP_SERVER_REGISTRY: McpServerDefinition[] = [
  {
    id: "alphavantage-mcp",
    label: "Alpha Vantage",
    description: "Financial market data including quotes, fundamentals, and chart-friendly series.",
    category: "financial",
    install: "manus-mcp-cli install alphavantage-mcp",
    environment: ["ALPHAVANTAGE_API_KEY"],
    docUrl: "https://www.alphavantage.co/documentation/",
    commands: [
      {
        name: "get_stock_chart",
        title: "Get Stock Chart",
        description: "Fetch historical price data for a symbol at the requested interval.",
        parameters: [
          {
            name: "symbol",
            description: "Ticker symbol to look up.",
            required: true,
            example: "TSLA",
          },
          {
            name: "interval",
            description: "Chart resolution (1day, 1wk, 1mo).",
            required: false,
            example: "1wk",
          },
          {
            name: "range",
            description: "Time range window (1M, 3M, 6M, 1Y).",
            required: false,
            example: "3M",
          },
        ],
        example: "/alphavantage-mcp get_stock_chart symbol=TSLA interval=1wk",
      },
      {
        name: "get_quote",
        title: "Get Quote",
        description: "Retrieve the latest quote data and key stats for a symbol.",
        parameters: [
          {
            name: "symbol",
            description: "Ticker symbol to look up.",
            required: true,
            example: "NVDA",
          },
        ],
        example: "/alphavantage-mcp get_quote symbol=NVDA",
      },
    ],
  },
  {
    id: "polymarket-mcp",
    label: "Polymarket",
    description: "Prediction market prices and metadata.",
    category: "prediction",
    install: "manus-mcp-cli install polymarket-mcp",
    commands: [
      {
        name: "get_market_price",
        title: "Get Market Price",
        description: "Fetch the latest pricing information for a Polymarket market.",
        parameters: [
          {
            name: "market_id",
            description: "Slug or identifier for the market.",
            required: true,
            example: "us_election_2024",
          },
        ],
        example: "/polymarket-mcp get_market_price market_id=us_election_2024",
      },
    ],
  },
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
  },
  {
    id: "canva-mcp",
    label: "Canva Designs",
    description: "Create and manage Canva designs via templates.",
    category: "design",
    install: "manus-mcp-cli install canva-mcp",
    environment: ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"],
    commands: [
      {
        name: "create_design",
        title: "Create Design",
        description: "Generate a new Canva design from a template with text prompts.",
        parameters: [
          {
            name: "template",
            description: "Template identifier to use.",
            required: true,
            example: "social_post",
          },
          {
            name: "text",
            description: "Text content to inject into the template.",
            required: true,
            example: "\"New Research Findings\"",
          },
        ],
        example: "/canva-mcp create_design template=social_post text=\"New Research Findings\"",
      },
    ],
  },
  {
    id: "gemini-mcp",
    label: "Gemini Nano Banana",
    description: "Lightweight Gemini text generation for rapid ideation and summarization.",
    category: "llm",
    install: "manus-mcp-cli install gemini-mcp",
    environment: ["GEMINI_API_KEY"],
    commands: [
      {
        name: "generate_text",
        title: "Generate Text",
        description: "Call Gemini to create or transform text based on a prompt.",
        parameters: [
          {
            name: "prompt",
            description: "Instruction or content Gemini should respond to.",
            required: true,
            example: "\"Brainstorm nano banana use cases\"",
          },
          {
            name: "model",
            description: "Gemini model identifier to target (defaults to gemini-1.5-flash).",
            required: false,
            example: "gemini-1.5-pro",
          },
          {
            name: "system",
            description: "Optional system message to steer behavior.",
            required: false,
            example: "\"You are an enthusiastic foodie.\"",
          },
          {
            name: "temperature",
            description: "Sampling temperature between 0 and 1 (defaults to service preset).",
            required: false,
            example: "0.6",
          },
          {
            name: "max_output_tokens",
            description: "Maximum tokens to return (capped at 8192).",
            required: false,
            example: "1024",
          },
        ],
        example:
          "/gemini-mcp generate_text prompt=\"Write a playful nano banana product description\" model=gemini-1.5-flash",
      },
    ],
  },
  {
    id: "playwright-mcp",
    label: "Playwright Automation",
    description: "Headless browser automation for scraping and scripted interactions.",
    category: "automation",
    install: "manus-mcp-cli install playwright-mcp",
    commands: [
      {
        name: "navigate_and_scrape",
        title: "Navigate and Scrape",
        description: "Navigate to a page and extract text using a CSS selector.",
        parameters: [
          {
            name: "url",
            description: "Page URL to visit.",
            required: true,
            example: "https://example.com",
          },
          {
            name: "selector",
            description: "CSS selector to extract content from.",
            required: true,
            example: "article",
          },
        ],
        example: "/playwright-mcp navigate_and_scrape url=https://example.com selector=article",
      },
      {
        name: "screenshot",
        title: "Screenshot Page",
        description: "Capture a screenshot of the page (optionally a selector).",
        parameters: [
          {
            name: "url",
            description: "Page URL to visit.",
            required: true,
            example: "https://example.com",
          },
          {
            name: "selector",
            description: "CSS selector to focus the screenshot on.",
            required: false,
          },
        ],
        example: "/playwright-mcp screenshot url=https://example.com selector=header",
      },
    ],
  },
  {
    id: "search-mcp",
    label: "Web Search",
    description: "Open-source web search powered by DuckDuckGo Instant Answer API.",
    category: "knowledge",
    install: "See https://github.com/mcpmessenger/search",
    commands: [
      {
        name: "web_search",
        title: "Web Search",
        description: "Search the web using DuckDuckGo and return top results with titles, URLs, and snippets.",
        parameters: [
          {
            name: "query",
            description: "Search query string.",
            required: true,
            example: "Model Context Protocol",
          },
          {
            name: "max_results",
            description: "Maximum number of results to return (default: 5).",
            required: false,
            example: "3",
          },
        ],
        example: "/search-mcp web_search query=\"Model Context Protocol\" max_results=3",
      },
    ],
  },
];

export function findServerDefinition(serverId: string) {
  return MCP_SERVER_REGISTRY.find(server => server.id === serverId);
}

