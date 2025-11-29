import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

type McpResultType = "text" | "markdown" | "json" | "table" | "binary" | "error";

type McpJsonResult = {
  type: "json";
  data: unknown;
  summary?: string;
};

type McpErrorResult = {
  type: "error";
  message: string;
  details?: unknown;
};

type McpInvocationResult = McpJsonResult | McpErrorResult;

type McpInvocation = {
  serverId?: string;
  command?: string;
  args?: Record<string, string>;
  positionalArgs?: string[];
};

type McpInvocationResponse = {
  invocation: McpInvocation;
  result: McpInvocationResult;
  timestamp: string;
  latencyMs?: number;
};

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const encoder = new TextEncoder();

const allowedOrigins =
  Deno.env.get("ALLOWED_ORIGINS")?.split(",").map(origin => origin.trim()) ?? ["*"];

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

function respondWithError(
  status: number,
  message: string,
  origin: string | null,
  details?: unknown,
): Response {
  const corsHeaders = getCorsHeaders(origin);
  const payload: McpInvocationResponse = {
    invocation: {},
    result: {
      type: "error",
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function performDuckDuckGoSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  // Use DuckDuckGo HTML search which works better for general queries
  // than the Instant Answer API which only works for specific topics
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  
  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo request failed (${response.status})`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Parse HTML results - DuckDuckGo HTML structure
  // Try multiple patterns to handle different HTML structures
  const patterns = [
    // Pattern 1: Modern DuckDuckGo structure with result__a
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g,
    // Pattern 2: Alternative structure
    /<a[^>]*class="[^"]*result[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g,
    // Pattern 3: Generic link in result div
    /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g,
  ];

  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex
    
    while ((match = pattern.exec(html)) !== null && results.length < maxResults) {
      const url = match[1];
      let title = match[2].replace(/<[^>]+>/g, "").trim();
      
      // Skip if we've already seen this URL
      if (results.some(r => r.url === url)) continue;
      
      // Clean up the URL (remove tracking parameters)
      const cleanUrl = url.split("&uddg=")[0].split("&rut=")[0].split("?uddg=")[0];
      
      // Try to extract snippet from nearby text
      let snippet = "";
      const resultContext = html.substring(Math.max(0, match.index - 500), match.index + 1000);
      const snippetMatch = resultContext.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)<\/a>/i) ||
                         resultContext.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)<\/div>/i);
      if (snippetMatch) {
        snippet = snippetMatch[1].replace(/<[^>]+>/g, "").trim();
      }
      
      if (title && cleanUrl && cleanUrl.startsWith("http")) {
        results.push({
          title: title.slice(0, 200),
          url: cleanUrl,
          snippet: snippet.slice(0, 300) || `Search result for: ${query}`,
        });
      }
    }
    
    // If we found results with this pattern, stop trying others
    if (results.length > 0) break;
  }

  // Fallback: If HTML parsing didn't work, try Instant Answer API
  if (results.length === 0) {
    const instantAnswerUrl = new URL("https://api.duckduckgo.com/");
    instantAnswerUrl.searchParams.set("q", query);
    instantAnswerUrl.searchParams.set("format", "json");
    instantAnswerUrl.searchParams.set("no_redirect", "1");
    instantAnswerUrl.searchParams.set("no_html", "1");

    const instantAnswerResponse = await fetch(instantAnswerUrl.toString());
    if (instantAnswerResponse.ok) {
      const data = (await instantAnswerResponse.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: Array<
          | {
              Text?: string;
              FirstURL?: string;
            }
          | {
              Topics?: Array<{ Text?: string; FirstURL?: string }>;
            }
        >;
      };

      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || data.AbstractText.slice(0, 80),
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= maxResults) break;
          if ("Text" in topic && topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 80),
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          } else if ("Topics" in topic && Array.isArray(topic.Topics)) {
            for (const nested of topic.Topics) {
              if (results.length >= maxResults) break;
              if (nested.Text && nested.FirstURL) {
                results.push({
                  title: nested.Text.split(" - ")[0] || nested.Text.slice(0, 80),
                  url: nested.FirstURL,
                  snippet: nested.Text,
                });
              }
            }
          }
        }
      }
    }
  }

  return results.slice(0, maxResults);
}

serve(async req => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return respondWithError(405, "Method not allowed", origin);
  }

  let invocation: McpInvocation;
  try {
    invocation = (await req.json()) as McpInvocation;
  } catch (error) {
    return respondWithError(400, "Invalid JSON body", origin, error instanceof Error ? error.message : String(error));
  }

  const startedAt = performance.now();

  const command = invocation.command ?? "web_search";
  const args = invocation.args ?? {};
  const positionalArgs = invocation.positionalArgs ?? [];

  if (command !== "web_search") {
    const payload: McpInvocationResponse = {
      invocation: { ...invocation, serverId: "search-mcp", command },
      result: {
        type: "error",
        message: `Unsupported command: ${command}`,
      },
      timestamp: new Date().toISOString(),
    };
    return new Response(JSON.stringify(payload), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const query = args.query ?? positionalArgs[0];
  const maxResultsRaw = args.max_results ?? args.maxResults;

  if (!query || typeof query !== "string") {
    const payload: McpInvocationResponse = {
      invocation: { ...invocation, serverId: "search-mcp", command },
      result: {
        type: "error",
        message: "Missing required parameter: query",
      },
      timestamp: new Date().toISOString(),
    };
    return new Response(JSON.stringify(payload), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let maxResults = 5;
  if (typeof maxResultsRaw === "string") {
    const parsed = Number(maxResultsRaw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 20) {
      maxResults = parsed;
    }
  }

  try {
    const results = await performDuckDuckGoSearch(query, maxResults);
    const latencyMs = Math.round(performance.now() - startedAt);

    const responsePayload: McpInvocationResponse = {
      invocation: { ...invocation, serverId: "search-mcp", command, args: { query, max_results: String(maxResults) } },
      result: {
        type: "json",
        data: {
          query,
          maxResults,
          results,
        },
        summary:
          results.length === 0
            ? `No results found for "${query}".`
            : `Top ${results.length} results for "${query}".`,
      },
      timestamp: new Date().toISOString(),
      latencyMs,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const responsePayload: McpInvocationResponse = {
      invocation: { ...invocation, serverId: "search-mcp", command },
      result: {
        type: "error",
        message: "Web search failed. Please try again or rephrase your query.",
        details: message,
      },
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


