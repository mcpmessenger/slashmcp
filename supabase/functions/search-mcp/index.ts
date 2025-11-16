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
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_redirect", "1");
  url.searchParams.set("no_html", "1");

  const response = await fetch(url.toString());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DuckDuckGo request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
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

  const results: SearchResult[] = [];

  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.Heading || data.AbstractText.slice(0, 80),
      url: data.AbstractURL,
      snippet: data.AbstractText,
    });
  }

  if (Array.isArray(data.RelatedTopics)) {
    for (const topic of data.RelatedTopics) {
      if ("Text" in topic && topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 80),
          url: topic.FirstURL,
          snippet: topic.Text,
        });
      } else if ("Topics" in topic && Array.isArray(topic.Topics)) {
        for (const nested of topic.Topics) {
          if (nested.Text && nested.FirstURL) {
            results.push({
              title: nested.Text.split(" - ")[0] || nested.Text.slice(0, 80),
              url: nested.FirstURL,
              snippet: nested.Text,
            });
          }
        }
      }
      if (results.length >= maxResults) break;
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
        message: "Search request failed",
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


