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
  {
    id: "playwright-wrapper",
    label: "Playwright Browser Automation",
    description: "Browser automation wrapper for testing and crawling your dev app. Uses JSON gateway format compatible with SlashMCP.",
    category: "automation",
    install: "Deployed as Supabase Edge Function",
    commands: [
      {
        name: "browser_navigate",
        title: "Navigate to URL",
        description: "Navigate browser to a URL and wait for page load.",
        parameters: [
          {
            name: "url",
            description: "URL to navigate to (e.g., http://localhost:5173).",
            required: true,
            example: "http://localhost:5173",
          },
        ],
        example: "/playwright-wrapper browser_navigate url=http://localhost:5173",
      },
      {
        name: "browser_snapshot",
        title: "Get Page Snapshot",
        description: "Capture accessibility snapshot of current page (better than screenshot for automation).",
        parameters: [],
        example: "/playwright-wrapper browser_snapshot",
      },
      {
        name: "browser_click",
        title: "Click Element",
        description: "Click an element on the page using element description and ref from snapshot.",
        parameters: [
          {
            name: "element",
            description: "Human-readable element description.",
            required: true,
            example: "Sign in button",
          },
          {
            name: "ref",
            description: "Element reference from page snapshot.",
            required: true,
            example: "button#sign-in",
          },
        ],
        example: "/playwright-wrapper browser_click element=\"Sign in button\" ref=button#sign-in",
      },
      {
        name: "browser_extract_text",
        title: "Extract Page Text",
        description: "Extract all visible text content from a page (useful for research and content analysis).",
        parameters: [
          {
            name: "url",
            description: "URL to extract text from.",
            required: true,
            example: "https://example.com",
          },
        ],
        example: "/playwright-wrapper browser_extract_text url=https://example.com",
      },
      {
        name: "browser_take_screenshot",
        title: "Take Screenshot",
        description: "Capture screenshot of current page or specific element.",
        parameters: [
          {
            name: "filename",
            description: "Optional filename for screenshot.",
            required: false,
            example: "homepage.png",
          },
          {
            name: "fullPage",
            description: "Capture full scrollable page (true/false).",
            required: false,
            example: "true",
          },
        ],
        example: "/playwright-wrapper browser_take_screenshot filename=homepage.png fullPage=true",
      },
    ],
  },
  {
    id: "google-earth-engine-mcp",
    label: "Google Earth Engine",
    description: "Geospatial data analysis and satellite imagery processing using Google Earth Engine.",
    category: "geospatial",
    install: "npm install -g planetary-mcp-server@1.0.0",
    environment: ["GOOGLE_EARTH_ENGINE_CREDENTIALS"],
    docUrl: "https://mcpmarket.com/server/google-earth-engine",
    commands: [
      {
        name: "search_datasets",
        title: "Search Datasets",
        description: "Search for available satellite datasets in Google Earth Engine catalog.",
        parameters: [
          {
            name: "query",
            description: "Search query for dataset names or keywords.",
            required: true,
            example: "Landsat",
          },
        ],
        example: "/google-earth-engine-mcp search_datasets query=\"Landsat\"",
      },
      {
        name: "get_image",
        title: "Get Image",
        description: "Retrieve satellite imagery for a specific location and time period.",
        parameters: [
          {
            name: "dataset",
            description: "Dataset name (e.g., 'LANDSAT/LC08/C02/T1_L2').",
            required: true,
            example: "LANDSAT/LC08/C02/T1_L2",
          },
          {
            name: "location",
            description: "Location coordinates or place name.",
            required: true,
            example: "San Francisco, CA",
          },
          {
            name: "start_date",
            description: "Start date (YYYY-MM-DD).",
            required: false,
            example: "2024-01-01",
          },
          {
            name: "end_date",
            description: "End date (YYYY-MM-DD).",
            required: false,
            example: "2024-12-31",
          },
        ],
        example: "/google-earth-engine-mcp get_image dataset=\"LANDSAT/LC08/C02/T1_L2\" location=\"San Francisco\" start_date=\"2024-01-01\"",
      },
      {
        name: "analyze_vegetation",
        title: "Analyze Vegetation",
        description: "Calculate NDVI (Normalized Difference Vegetation Index) for an area.",
        parameters: [
          {
            name: "location",
            description: "Location coordinates or place name.",
            required: true,
            example: "Amazon Rainforest",
          },
          {
            name: "date",
            description: "Date for analysis (YYYY-MM-DD).",
            required: false,
            example: "2024-06-01",
          },
        ],
        example: "/google-earth-engine-mcp analyze_vegetation location=\"Amazon Rainforest\" date=\"2024-06-01\"",
      },
    ],
  },
  {
    id: "google-places-mcp",
    label: "Google Places",
    description: "Access business details, locations, reviews, and place information via Google Places API.",
    category: "location",
    install: "Built-in (requires Google Maps API key)",
    environment: ["GOOGLE_PLACES_API_KEY"],
    docUrl: "https://developers.google.com/maps/documentation/places/web-service",
    commands: [
      {
        name: "get_place_details",
        title: "Get Place Details",
        description: "Get detailed information about a place using its Place ID.",
        parameters: [
          {
            name: "place_id",
            description: "The Place ID from Google Places API.",
            required: true,
            example: "ChIJN1t_tDeuEmsRUsoyG83frY4",
          },
          {
            name: "fields",
            description: "Comma-separated list of fields to return (e.g., 'name,address,phone,website,opening_hours,reviews,photos,geometry').",
            required: false,
            example: "name,address,phone,website",
          },
        ],
        example: "/google-places-mcp get_place_details place_id=\"ChIJN1t_tDeuEmsRUsoyG83frY4\" fields=\"name,address,phone\"",
      },
      {
        name: "search_places",
        title: "Search Places",
        description: "Search for places by text query (business name, address, etc.).",
        parameters: [
          {
            name: "query",
            description: "Search query (business name, address, or location).",
            required: true,
            example: "Starbucks near Times Square",
          },
          {
            name: "location",
            description: "Latitude,longitude for location bias (optional).",
            required: false,
            example: "40.7580,-73.9855",
          },
        ],
        example: "/google-places-mcp search_places query=\"Starbucks near Times Square\"",
      },
      {
        name: "autocomplete",
        title: "Place Autocomplete",
        description: "Get place suggestions as user types (returns place_id).",
        parameters: [
          {
            name: "input",
            description: "The text string on which to search.",
            required: true,
            example: "Starbucks",
          },
          {
            name: "location",
            description: "Latitude,longitude for location bias (optional).",
            required: false,
            example: "40.7580,-73.9855",
          },
        ],
        example: "/google-places-mcp autocomplete input=\"Starbucks\" location=\"40.7580,-73.9855\"",
      },
    ],
  },
];

export function findServerDefinition(serverId: string) {
  return MCP_SERVER_REGISTRY.find(server => server.id === serverId);
}

