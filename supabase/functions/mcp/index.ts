import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { Database } from "../_shared/database.types.ts";

type ChartRange = "1M" | "3M" | "6M" | "1Y";

const RANGE_TO_POINTS: Record<ChartRange, number> = {
  "1M": 22,
  "3M": 66,
  "6M": 132,
  "1Y": 252,
};

type McpInvocation = {
  serverId: string;
  command?: string;
  args?: Record<string, string>;
  positionalArgs?: string[];
};

type McpInvocationResult =
  | {
      type: "json";
      data: unknown;
      summary?: string;
    }
  | {
      type: "text" | "markdown";
      content: string;
    }
  | {
      type: "error";
      message: string;
      details?: unknown;
    };

type McpInvocationResponse = {
  invocation: McpInvocation;
  result: McpInvocationResult;
  timestamp: string;
  latencyMs?: number;
  raw?: unknown;
};

type StockInsights = {
  symbol: string;
  companyName?: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume?: number;
  currency?: string;
  marketCap?: number;
  lastRefreshed: string;
  timezone?: string;
  range: ChartRange;
  chart: Array<{ date: string; close: number }>;
};

type AlphaVantageResponse = Record<string, unknown>;
type PolymarketMarketResponse = {
  id: string;
  question: string;
  slug: string;
  endDate?: string;
  outcomes: Array<{
    id: string;
    name: string;
    price?: number;
    probability?: number;
  }>;
  liquidity?: number;
  volume?: number;
};

type PolymarketMarketSummary = {
  id: string;
  question: string;
  slug: string;
  bestBid: number | null;
  bestAsk: number | null;
  impliedProbability: number | null;
  outcomes: Array<{
    id: string;
    name: string;
    price: number | null;
    probability: number | null;
  }>;
  liquidity?: number;
  volume?: number;
  endDate?: string;
};

function formatPolymarketSummary(summary: PolymarketMarketSummary): string {
  const prob = summary.impliedProbability;
  const probabilityText = prob !== null ? `${(prob * 100).toFixed(1)}%` : "N/A";
  const bidText = summary.bestBid !== null && summary.bestBid !== undefined ? summary.bestBid.toFixed(2) : "N/A";
  const askText = summary.bestAsk !== null && summary.bestAsk !== undefined ? summary.bestAsk.toFixed(2) : "N/A";
  const outcomeSnapshot = (summary.outcomes ?? [])
    .slice(0, 3)
    .map(outcome => `${outcome.name}: ${outcome.price !== null && outcome.price !== undefined ? outcome.price.toFixed(2) : "N/A"}`)
    .join(" • ");
  return `${summary.question} — Prob: ${probabilityText} (bid ${bidText} / ask ${askText})${outcomeSnapshot ? ` • ${outcomeSnapshot}` : ""}`;
}

function generatePolymarketCandidates(rawId: string): Array<{ url: string; parser: (payload: unknown, url: string) => PolymarketMarketResponse | null }>
{
  const baseUrl = "https://gamma-api.polymarket.com/markets";
  const addIfValid = (value: string | null | undefined, set: Set<string>) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed);
  };

  const variants = new Set<string>();
  addIfValid(rawId, variants);
  addIfValid(rawId.replace(/_/g, "-"), variants);
  addIfValid(rawId.replace(/-/g, "_"), variants);
  addIfValid(rawId.replace(/_/g, " "), variants);
  addIfValid(rawId.replace(/-/g, " "), variants);
  addIfValid(rawId.replace(/%20/g, " "), variants);
  const lower = rawId.toLowerCase();
  const upper = rawId.toUpperCase();
  addIfValid(lower, variants);
  addIfValid(upper, variants);

  const parseMarket = (payload: unknown, variant: string): PolymarketMarketResponse | null => {
    if (!payload || typeof payload !== "object") return null;
    const direct = payload as PolymarketMarketResponse;
    if (direct?.id && (direct.slug === variant || direct.id === variant)) return direct;

    const withData = payload as { data?: PolymarketMarketResponse[] };
    if (Array.isArray(withData.data)) {
      const matched = withData.data.find(entry => entry?.slug === variant || entry?.id === variant);
      if (matched?.id) return matched;
    }

    const withMarkets = payload as { markets?: PolymarketMarketResponse[] };
    if (Array.isArray(withMarkets.markets)) {
      const matched = withMarkets.markets.find(entry => entry?.slug === variant || entry?.id === variant);
      if (matched?.id) return matched;
    }

    if (Array.isArray(payload)) {
      const matched = (payload as PolymarketMarketResponse[]).find(
        entry => entry?.slug === variant || entry?.id === variant,
      );
      if (matched?.id) return matched;
    }

    return null;
  };

  type Candidate = {
    url: string;
    variant: string;
    parser: (payload: unknown, variant: string) => PolymarketMarketResponse | null;
  };

  const candidates: Candidate[] = [];
  for (const variant of variants) {
    const encoded = encodeURIComponent(variant);
    candidates.push({ url: `${baseUrl}/${encoded}`, variant, parser: parseMarket });
    candidates.push({ url: `${baseUrl}?slug=${encoded}&limit=5`, variant, parser: parseMarket });
    candidates.push({ url: `${baseUrl}?id=${encoded}&limit=5`, variant, parser: parseMarket });
    candidates.push({ url: `${baseUrl}?search=${encoded}&limit=5`, variant, parser: parseMarket });
  }

  return candidates;
}

async function fetchPolymarketMarket(marketId: string): Promise<PolymarketMarketSummary> {
  const candidates = generatePolymarketCandidates(marketId);

  let market: PolymarketMarketResponse | null = null;
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url);
      if (!response.ok) {
        const errorText = await response.text();
        errors.push(`${candidate.url} → ${response.status}: ${errorText}`);
        continue;
      }

      const payload = (await response.json()) as unknown;
      market = candidate.parser(payload, candidate.variant);
      if (market && market.id) break;
    } catch (error) {
      errors.push(`${candidate.url} → ${(error as Error)?.message ?? String(error)}`);
    }
  }

  if (!market || !market.id) {
    // Try searching Polymarket API for similar markets
    let searchSuggestions: string[] = [];
    try {
      const searchQuery = marketId.replace(/[-_]/g, " ");
      const searchUrl = `https://gamma-api.polymarket.com/markets?query=${encodeURIComponent(searchQuery)}&limit=5`;
      const searchResponse = await fetch(searchUrl);
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as unknown;
        let markets: PolymarketMarketResponse[] = [];
        
        // Handle different response formats
        if (Array.isArray(searchData)) {
          markets = searchData;
        } else if (searchData && typeof searchData === "object") {
          const withData = searchData as { data?: PolymarketMarketResponse[] };
          const withMarkets = searchData as { markets?: PolymarketMarketResponse[] };
          markets = withData.data || withMarkets.markets || [];
        }
        
        if (markets.length > 0) {
          searchSuggestions = markets.slice(0, 5).map(m => `"${m.slug || m.id}" (${m.question || m.title || "Unknown"})`);
        }
      }
    } catch (searchError) {
      // Ignore search errors, we'll just provide the basic error message
      console.log("Polymarket search failed:", searchError);
    }
    
    // Build error message with search suggestions if available
    const searchUrl = `https://polymarket.com/search?q=${encodeURIComponent(marketId.replace(/[-_]/g, " "))}`;
    let errorMsg = `Polymarket market "${marketId}" was not found.`;
    
    if (searchSuggestions.length > 0) {
      errorMsg += `\n\nDid you mean one of these?\n${searchSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
      errorMsg += `\n\nUse the slug from the list above, or search at: ${searchUrl}`;
    } else {
      errorMsg += ` The market slug may not be the exact slug from Polymarket.com.`;
      if (errors.length > 0) {
        errorMsg += ` Tried variations: ${errors.slice(0, 3).map(e => e.split('→')[0].trim()).join(', ')}.`;
      }
      errorMsg += ` To find the correct market, try searching on Polymarket.com: ${searchUrl}`;
    }
    
    throw new Error(errorMsg);
  }

  const normalize = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  let bestBid: number | null = null;
  let bestAsk: number | null = null;
  let impliedProbability: number | null = null;

  const outcomesSource = Array.isArray(market.outcomes) ? market.outcomes : [];
  const outcomes = outcomesSource.map(outcome => {
    const price = normalize(outcome?.price ?? null);
    const probability = normalize(outcome?.probability ?? null);
    if (price !== null) {
      if (bestBid === null || price > bestBid) bestBid = price;
      if (bestAsk === null || price < bestAsk) bestAsk = price;
    }
    if (probability !== null) {
      impliedProbability = impliedProbability === null ? probability : Math.max(impliedProbability, probability);
    }
    return {
      id: outcome?.id ?? "",
      name: outcome?.name ?? "Outcome",
      price,
      probability,
    };
  });

  if (impliedProbability === null && bestBid !== null) {
    impliedProbability = bestBid;
  }

  return {
    id: market.id,
    question: market.question,
    slug: market.slug,
    bestBid,
    bestAsk,
    impliedProbability,
    outcomes,
    liquidity: normalize(market.liquidity ?? null) ?? undefined,
    volume: normalize(market.volume ?? null) ?? undefined,
    endDate: market.endDate,
  };
}

function buildImpliedProbability(summary: PolymarketMarketSummary): number | null {
  if (summary.impliedProbability !== null) return summary.impliedProbability;
  const outcomes = Array.isArray(summary.outcomes) ? summary.outcomes : [];
  const yesOutcome = outcomes.find(outcome => {
    const name = outcome?.name?.toLowerCase();
    if (!name) return false;
    return name.includes("yes") || name.includes("will");
  });
  if (yesOutcome && yesOutcome.probability !== null && yesOutcome.probability !== undefined) {
    return yesOutcome.probability;
  }
  if (summary.bestBid !== null && summary.bestBid !== undefined) return summary.bestBid;
  if (summary.bestAsk !== null && summary.bestAsk !== undefined) return summary.bestAsk;
  return null;
}

const ALPHAVANTAGE_BASE_URL = "https://www.alphavantage.co/query";
const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",").map(origin => origin.trim()) ?? ["*"];
const encoder = new TextEncoder();
const QUOTE_CACHE_TTL_MS = Number(Deno.env.get("ALPHAVANTAGE_CACHE_TTL_MS") ?? 5 * 60 * 1000);
const POLYMARKET_CACHE_TTL_MS = Number(Deno.env.get("POLYMARKET_CACHE_TTL_MS") ?? 2 * 60 * 1000);

type QuoteProvider = "alphavantage-daily" | "alphavantage-global" | "twelvedata" | "google-finance";

type CachedQuote = {
  stock: StockInsights;
  fetchedAt: number;
  provider: QuoteProvider;
};

const quoteCache = new Map<string, CachedQuote>();
const polymarketCache = new Map<string, { summary: PolymarketMarketSummary; fetchedAt: number }>();

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
  return new Response(JSON.stringify({ error: message, details }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseNumeric(value: unknown): number | undefined {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function toChartRange(range?: string | null): ChartRange {
  if (!range) return "1M";
  const normalized = range.toUpperCase() as ChartRange;
  return RANGE_TO_POINTS[normalized] ? normalized : "1M";
}

async function callAlphaVantage(params: Record<string, string>, apiKey: string): Promise<AlphaVantageResponse> {
  const url = new URL(ALPHAVANTAGE_BASE_URL);
  Object.entries({ ...params, apikey: apiKey }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Alpha Vantage request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as AlphaVantageResponse;
  if ("Note" in data) {
    throw new Error("Alpha Vantage rate limit reached. Please wait a moment and retry.");
  }
  if ("Information" in data) {
    throw new Error(String(data["Information"]));
  }
  if ("Error Message" in data) {
    throw new Error(String(data["Error Message"]));
  }

  return data;
}

async function fetchStockInsights(symbol: string, range?: string): Promise<StockInsights> {
  const apiKey = Deno.env.get("ALPHAVANTAGE_API_KEY");
  if (!apiKey) {
    throw new Error("ALPHAVANTAGE_API_KEY is not configured.");
  }

  const effectiveRange = toChartRange(range);
  const outputSize = effectiveRange === "1Y" ? "full" : "compact";
  const upperSymbol = symbol.toUpperCase();

  const [seriesData, overviewData] = await Promise.all([
    callAlphaVantage(
      {
        function: "TIME_SERIES_DAILY_ADJUSTED",
        symbol: upperSymbol,
        outputsize: outputSize,
      },
      apiKey,
    ),
    callAlphaVantage(
      {
        function: "OVERVIEW",
        symbol: upperSymbol,
      },
      apiKey,
    ).catch(() => ({})),
  ]);

  const meta = seriesData["Meta Data"] as Record<string, string> | undefined;
  const series = seriesData["Time Series (Daily)"] as Record<string, Record<string, string>> | undefined;

  if (!series || Object.keys(series).length === 0) {
    throw new Error(`No daily price data found for symbol ${upperSymbol}.`);
  }

  const orderedEntries = Object.entries(series)
    .map(([date, values]) => ({
      date,
      close: parseNumeric(values["4. close"]) ?? parseNumeric(values["5. adjusted close"]),
      open: parseNumeric(values["1. open"]),
      high: parseNumeric(values["2. high"]),
      low: parseNumeric(values["3. low"]),
      volume: parseNumeric(values["6. volume"]),
    }))
    .filter(entry => typeof entry.close === "number")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (orderedEntries.length === 0) {
    throw new Error(`Unable to parse price history for ${upperSymbol}.`);
  }

  const latestEntry = orderedEntries[orderedEntries.length - 1];
  const previousEntry = orderedEntries[orderedEntries.length - 2] ?? latestEntry;
  const points = RANGE_TO_POINTS[effectiveRange];
  const chartSlice = orderedEntries.slice(-Math.min(points, orderedEntries.length));

  const price = latestEntry.close as number;
  const previousClose = previousEntry.close as number;
  const change = price - previousClose;
  const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

  const overview = overviewData as Record<string, string>;

  return {
    symbol: upperSymbol,
    companyName: overview?.Name ?? upperSymbol,
    price,
    previousClose,
    change,
    changePercent,
    open: latestEntry.open ?? price,
    high: latestEntry.high ?? price,
    low: latestEntry.low ?? price,
    volume: latestEntry.volume,
    currency: overview?.Currency ?? "USD",
    marketCap: overview?.MarketCapitalization ? Number(overview.MarketCapitalization) : undefined,
    lastRefreshed: meta?.["3. Last Refreshed"] ?? latestEntry.date,
    timezone: meta?.["5. Time Zone"] ?? overview?.Country,
    range: effectiveRange,
    chart: chartSlice.map(point => ({
      date: point.date,
      close: point.close as number,
    })),
  };
}

async function fetchGlobalQuote(symbol: string): Promise<StockInsights> {
  const apiKey = Deno.env.get("ALPHAVANTAGE_API_KEY");
  if (!apiKey) {
    throw new Error("ALPHAVANTAGE_API_KEY is not configured.");
  }

  const upperSymbol = symbol.toUpperCase();
  const data = await callAlphaVantage(
    {
      function: "GLOBAL_QUOTE",
      symbol: upperSymbol,
    },
    apiKey,
  );

  const quote = data["Global Quote"] as Record<string, string> | undefined;
  if (!quote) {
    throw new Error(`No quote data returned for ${upperSymbol}.`);
  }

  const price = parseNumeric(quote["05. price"]);
  const previousClose = parseNumeric(quote["08. previous close"]);
  const open = parseNumeric(quote["02. open"]) ?? price ?? 0;
  const high = parseNumeric(quote["03. high"]) ?? price ?? 0;
  const low = parseNumeric(quote["04. low"]) ?? price ?? 0;
  const volume = parseNumeric(quote["06. volume"]);
  const change = parseNumeric(quote["09. change"]) ?? (price && previousClose ? price - previousClose : 0);
  const changePercentRaw = quote["10. change percent"];
  const changePercent =
    typeof changePercentRaw === "string" ? Number(changePercentRaw.replace("%", "")) : undefined;

  if (typeof price !== "number" || typeof previousClose !== "number") {
    throw new Error(`Incomplete quote data returned for ${upperSymbol}.`);
  }

  return {
    symbol: upperSymbol,
    companyName: upperSymbol,
    price,
    previousClose,
    change: typeof change === "number" ? change : price - previousClose,
    changePercent: typeof changePercent === "number" ? changePercent : previousClose !== 0 ? ((price - previousClose) / previousClose) * 100 : 0,
    open,
    high,
    low,
    volume: typeof volume === "number" ? volume : undefined,
    currency: undefined,
    marketCap: undefined,
    lastRefreshed: quote["07. latest trading day"] ?? new Date().toISOString(),
    timezone: undefined,
    range: "1M",
    chart: [
      {
        date: quote["07. latest trading day"] ?? new Date().toISOString().slice(0, 10),
        close: price,
      },
    ],
  };
}

async function fetchGoogleFinanceQuote(symbol: string): Promise<StockInsights> {
  const upperSymbol = symbol.toUpperCase();
  const url = `https://www.google.com/finance/quote/${upperSymbol}:NASDAQ`;
  
  // Try multiple exchanges
  const exchanges = ["NASDAQ", "NYSE", "NSE", "BSE"];
  let html = "";
  let lastError: Error | null = null;
  
  for (const exchange of exchanges) {
    try {
      const financeUrl = `https://www.google.com/finance/quote/${upperSymbol}:${exchange}`;
      const response = await fetch(financeUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      if (response.ok) {
        html = await response.text();
        // Check if we got actual data (not a 404 page)
        if (html.includes(upperSymbol) && (html.includes("data-last-price") || html.includes("data-price"))) {
          break;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }
  
  if (!html) {
    throw lastError || new Error(`Unable to fetch Google Finance data for ${upperSymbol}`);
  }
  
  // Extract price from HTML (Google Finance uses data attributes)
  const priceMatch = html.match(/data-last-price="([^"]+)"/) || html.match(/data-price="([^"]+)"/);
  const changeMatch = html.match(/data-change="([^"]+)"/);
  const changePercentMatch = html.match(/data-change-percent="([^"]+)"/);
  
  if (!priceMatch) {
    throw new Error(`Could not extract price from Google Finance for ${upperSymbol}`);
  }
  
  const price = parseNumeric(priceMatch[1]);
  if (typeof price !== "number") {
    throw new Error(`Invalid price format from Google Finance for ${upperSymbol}`);
  }
  
  const change = changeMatch ? parseNumeric(changeMatch[1]) : 0;
  const changePercent = changePercentMatch 
    ? parseNumeric(changePercentMatch[1]?.replace("%", "")) 
    : (change && price ? (change / (price - change)) * 100 : 0);
  
  // For Google Finance, we'll create a minimal chart with just the current price
  // since we don't have historical data easily available
  return {
    symbol: upperSymbol,
    companyName: upperSymbol,
    price,
    previousClose: price - (change ?? 0),
    change: change ?? 0,
    changePercent: changePercent ?? 0,
    open: price,
    high: price,
    low: price,
    volume: undefined,
    currency: "USD",
    marketCap: undefined,
    lastRefreshed: new Date().toISOString(),
    timezone: undefined,
    range: "1M",
    chart: [
      {
        date: new Date().toISOString().slice(0, 10),
        close: price,
      },
    ],
  };
}

// Helper function to get API key from key manager database
async function getTwelveDataApiKey(userId?: string): Promise<string | null> {
  // First check environment variable (Supabase secret)
  const envKey = Deno.env.get("TWELVEDATA_API_KEY");
  if (envKey) {
    return envKey;
  }

  // If no env key and user is authenticated, check key manager database
  if (userId) {
    try {
      const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") ?? "default-encryption-key-change-in-production";

      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return null;
      }

      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Look for a key with provider "twelvedata" for this user
      const { data: keyData, error } = await supabase
        .from("api_keys")
        .select("encrypted_key")
        .eq("user_id", userId)
        .eq("provider", "twelvedata")
        .eq("is_active", true)
        .maybeSingle();

      if (error || !keyData) {
        return null;
      }

      // Decrypt the key
      const { data: decryptedKey, error: decryptError } = await supabase.rpc("decrypt_key_value", {
        key_value: keyData.encrypted_key,
        encryption_key: ENCRYPTION_KEY,
      });

      if (decryptError || !decryptedKey) {
        console.error("Failed to decrypt key:", decryptError);
        return null;
      }

      return decryptedKey;
    } catch (error) {
      console.error("Error getting key from key manager:", error);
      return null;
    }
  }

  return null;
}

async function fetchTwelveDataQuote(symbol: string, userId?: string): Promise<StockInsights> {
  const apiKey = await getTwelveDataApiKey(userId);
  if (!apiKey) {
    if (!userId) {
      throw new Error("AUTH_REQUIRED:TWELVEDATA_API_KEY is not configured. Please log in to add your API key securely.");
    }
    throw new Error("TWELVEDATA_API_KEY is not configured. Add it via /key add twelvedata <name> key=YOUR_KEY or set TWELVEDATA_API_KEY as a Supabase secret.");
  }

  const upperSymbol = symbol.toUpperCase();
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", upperSymbol);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", "120");
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twelve Data request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data === "object" && data !== null) {
    const status = (data as { status?: string }).status;
    if (status && status.toLowerCase() === "error") {
      const code = (data as { code?: string | number }).code;
      const message = (data as { message?: string }).message;
      throw new Error(`Twelve Data error${code ? ` [${code}]` : ""}: ${message ?? "Unknown error"}`);
    }
  }

  const values = Array.isArray((data as { values?: unknown[] }).values)
    ? ((data as { values: Array<Record<string, string>> }).values)
    : [];

  if (!values.length) {
    throw new Error(`No Twelve Data time series returned for ${upperSymbol}.`);
  }

  const parsed = values
    .map(value => ({
      date: value.datetime,
      close: parseNumeric(value.close),
      open: parseNumeric(value.open),
      high: parseNumeric(value.high),
      low: parseNumeric(value.low),
      volume: parseNumeric(value.volume),
    }))
    .filter(entry => entry.date && typeof entry.close === "number") as Array<{
      date: string;
      close: number;
      open?: number | undefined;
      high?: number | undefined;
      low?: number | undefined;
      volume?: number | undefined;
    }>;

  if (!parsed.length) {
    throw new Error(`Unable to parse Twelve Data time series for ${upperSymbol}.`);
  }

  const sorted = parsed.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latestEntry = sorted[sorted.length - 1];
  const previousEntry = sorted[sorted.length - 2] ?? latestEntry;
  const points = RANGE_TO_POINTS["1M"];
  const chartSlice = sorted.slice(-Math.min(points, sorted.length));

  const price = latestEntry.close;
  const previousClose = previousEntry.close;
  const change = price - previousClose;
  const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

  const meta = (data as { meta?: Record<string, string> }).meta ?? {};

  return {
    symbol: upperSymbol,
    companyName: meta?.symbol ?? upperSymbol,
    price,
    previousClose,
    change,
    changePercent,
    open: latestEntry.open ?? price,
    high: latestEntry.high ?? price,
    low: latestEntry.low ?? price,
    volume: latestEntry.volume,
    currency: meta?.currency ?? "USD",
    marketCap: undefined,
    lastRefreshed: meta?.last_updated ?? latestEntry.date,
    timezone: meta?.exchange_timezone,
    range: "1M",
    chart: chartSlice.map(point => ({
      date: point.date,
      close: point.close,
    })),
  };
}

// Helper function to create authentication required error response (defined before handlers)
function createAuthRequiredResponse(invocation: McpInvocation, reason: string): McpInvocationResponse {
  return {
    invocation,
    result: {
      type: "error",
      message: "Authentication Required",
      details: {
        reason: reason,
        explanation: "This feature requires you to be logged in to access your personal data and settings.",
        whatIsSaved: {
          apiKeys: "Your API keys are encrypted and stored securely. Only you can access them.",
          preferences: "Your preferences (model selection, response style, etc.) are saved across sessions.",
          conversationHistory: "Your conversation history is saved so the AI can remember context.",
          memories: "The AI remembers important facts and preferences you've shared.",
          mcpServers: "Your registered MCP servers and configurations are saved per-user.",
        },
        howToLogin: {
          step1: "Click the 'Sign in' button in the top right corner of the page",
          step2: "Sign in with Google",
          step3: "Once logged in, you can use all features including API key management",
        },
        benefits: [
          "Secure storage of your API keys",
          "Personalized AI responses based on your preferences",
          "Conversation history and context memory",
          "Access to user-specific MCP servers",
          "Cross-device synchronization",
        ],
      },
    },
    timestamp: new Date().toISOString(),
    latencyMs: 0,
  };
}

async function handleAlphaVantage(invocation: McpInvocation, userId?: string): Promise<McpInvocationResponse> {
  const startedAt = performance.now();
  const args = invocation.args ?? {};
  const command = invocation.command ?? "get_stock_chart";
  const symbol = args.symbol || invocation.positionalArgs?.[0];

  if (!symbol) {
    return {
      invocation,
      result: {
        type: "error",
        message: "Missing required parameter: symbol",
      },
      timestamp: new Date().toISOString(),
    };
  }

  if (command === "get_stock_chart") {
    const stock = await fetchStockInsights(symbol, args.range);
    const summary = `${stock.symbol} ${stock.price.toFixed(2)} ${stock.currency ?? ""} (${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}, ${stock.changePercent.toFixed(2)}%)`.trim();
    return {
      invocation,
      result: {
        type: "json",
        data: { stock },
        summary,
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  if (command === "get_quote") {
    const cacheKey = symbol.toUpperCase();
    const cached = quoteCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < QUOTE_CACHE_TTL_MS) {
      const summary = `${cached.stock.symbol} ${cached.stock.price.toFixed(2)} ${cached.stock.currency ?? ""} (${cached.stock.change >= 0 ? "+" : ""}${cached.stock.change.toFixed(2)}, ${cached.stock.changePercent.toFixed(2)}%)`.trim();
      return {
        invocation,
        result: {
          type: "json",
          data: {
            stock: cached.stock,
            cacheHit: true,
            cachedAt: new Date(cached.fetchedAt).toISOString(),
            ttlMs: QUOTE_CACHE_TTL_MS,
            provider: cached.provider,
          },
          summary,
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    const errors: string[] = [];
    let stock: StockInsights | null = null;
    let provider: QuoteProvider | null = null;

    try {
      stock = await fetchStockInsights(symbol, "1M");
      provider = "alphavantage-daily";
    } catch (error) {
      errors.push(`[Alpha Vantage daily] ${(error as Error)?.message ?? String(error)}`);
    }

    if (!stock) {
      try {
        stock = await fetchGlobalQuote(symbol);
        provider = "alphavantage-global";
      } catch (error) {
        errors.push(`[Alpha Vantage global] ${(error as Error)?.message ?? String(error)}`);
      }
    }

    if (!stock) {
      try {
        stock = await fetchTwelveDataQuote(symbol, userId);
        provider = "twelvedata";
      } catch (error) {
        const errorMsg = (error as Error)?.message ?? String(error);
        // Check if this is an auth required error
        if (errorMsg.includes("AUTH_REQUIRED:")) {
          return createAuthRequiredResponse(
            invocation,
            "Twelve Data API requires an API key. Log in to securely store your API key using the Key Manager."
          );
        }
        errors.push(`[Twelve Data] ${errorMsg}`);
      }
    }

    // Final fallback: Try Google Finance via browser automation
    if (!stock) {
      try {
        stock = await fetchGoogleFinanceQuote(symbol);
        provider = "google-finance";
      } catch (error) {
        errors.push(`[Google Finance] ${(error as Error)?.message ?? String(error)}`);
      }
    }

    if (!stock || !provider) {
      throw new Error(errors.join(" | ") || "Unable to retrieve stock quote.");
    }

    const summary = `${stock.symbol} ${stock.price.toFixed(2)} ${stock.currency ?? ""} (${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}, ${stock.changePercent.toFixed(2)}%)`.trim();
    quoteCache.set(cacheKey, { stock, fetchedAt: Date.now(), provider });
    return {
      invocation,
      result: {
        type: "json",
        data: {
          stock,
          cacheHit: false,
          cachedAt: new Date().toISOString(),
          ttlMs: QUOTE_CACHE_TTL_MS,
          provider,
        },
        summary,
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  return {
    invocation,
    result: {
      type: "error",
      message: `Unknown Alpha Vantage command: ${command}`,
    },
    timestamp: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

async function handlePolymarket(invocation: McpInvocation): Promise<McpInvocationResponse> {
  const startedAt = performance.now();
  const args = invocation.args ?? {};
  const marketId = args.market_id || args.slug || args.id || invocation.positionalArgs?.[0];

  if (!marketId) {
    return {
      invocation,
      result: {
        type: "error",
        message: "Missing required parameter: market_id",
      },
      timestamp: new Date().toISOString(),
    };
  }

  const cacheKey = marketId.toLowerCase();
  const cached = polymarketCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < POLYMARKET_CACHE_TTL_MS) {
    const enriched = {
      ...cached.summary,
      impliedProbability: buildImpliedProbability(cached.summary),
    };
    return {
      invocation,
      result: {
        type: "json",
        data: {
          market: enriched,
          cacheHit: true,
          cachedAt: new Date(cached.fetchedAt).toISOString(),
          ttlMs: POLYMARKET_CACHE_TTL_MS,
        },
        summary: formatPolymarketSummary(enriched),
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  const summary = await fetchPolymarketMarket(marketId);
  const enriched = { ...summary, impliedProbability: buildImpliedProbability(summary) };
  polymarketCache.set(cacheKey, { summary: enriched, fetchedAt: now });

  return {
    invocation,
    result: {
      type: "json",
      data: {
        market: enriched,
        cacheHit: false,
        cachedAt: new Date().toISOString(),
        ttlMs: POLYMARKET_CACHE_TTL_MS,
      },
      summary: formatPolymarketSummary(enriched),
    },
    timestamp: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

function parseOptionalNumber(value: string | undefined, min?: number, max?: number): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (typeof min === "number" && parsed < min) return min;
  if (typeof max === "number" && parsed > max) return max;
  return parsed;
}

type GeminiCandidate = {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
  finishReason?: string;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: Record<string, unknown>;
};

function extractGeminiText(payload: GeminiResponse): string | null {
  if (!Array.isArray(payload?.candidates)) return null;
  for (const candidate of payload.candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts
      .map(part => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

async function handleGemini(invocation: McpInvocation): Promise<McpInvocationResponse> {
  const startedAt = performance.now();
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return {
      invocation,
      result: {
        type: "error",
        message: "Gemini API key is not configured on the server. Please contact the administrator.",
        details: "GEMINI_API_KEY environment variable is missing. The administrator needs to set this in Supabase Edge Function secrets.",
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
  
  // Log for debugging (will appear in Supabase function logs)
  console.log(`[Gemini MCP] API key present: ${apiKey ? "Yes" : "No"}, length: ${apiKey?.length || 0}`);

  const args = invocation.args ?? {};
  const command = invocation.command ?? "generate_text";

  // If no command is provided, provide helpful error message
  if (!command || command === "") {
    return {
      invocation,
      result: {
        type: "error",
        message: "Missing command. Use: /gemini-mcp generate_text prompt=\"YOUR_PROMPT\" [model=MODEL_NAME]",
        details: "Available commands: generate_text",
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  if (command !== "generate_text") {
    return {
      invocation,
      result: {
        type: "error",
        message: `Unsupported Gemini command: ${command}`,
        details: "Available commands: generate_text",
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  const prompt = args.prompt ?? invocation.positionalArgs?.[0];
  if (!prompt) {
    return {
      invocation,
      result: {
        type: "error",
        message: "Missing required parameter: prompt",
        details: "Usage: /gemini-mcp generate_text prompt=\"YOUR_PROMPT\" [model=gemini-1.5-flash-001]",
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  let model = args.model ?? invocation.positionalArgs?.[1] ?? "gemini-2.5-flash";
  
  // Normalize model name - handle common variations and map to API-compatible versions
  const modelLower = model.toLowerCase().trim();
  
  // Map common model name aliases
  // Note: If availableModels is populated, we'll filter to only use available models
  // Map older model names to newer available ones
  const modelMap: Record<string, string[]> = {
    // Map 1.5 models to 2.0/2.5 equivalents (since API key only has access to 2.0+)
    "gemini-1.5-flash": ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-001"],
    "gemini-1.5-pro": ["gemini-2.5-pro", "gemini-2.0-flash-exp"],
    "gemini-1.5-flash-latest": ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-001"],
    "gemini-1.5-pro-latest": ["gemini-2.5-pro", "gemini-2.0-flash-exp"],
    "gemini-1.5-flash-001": ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-001"],
    "gemini-1.5-pro-001": ["gemini-2.5-pro", "gemini-2.0-flash-exp"],
    // Direct mappings for 2.0/2.5 models
    "gemini-2.5-flash": ["gemini-2.5-flash"],
    "gemini-2.0-flash": ["gemini-2.0-flash", "gemini-2.0-flash-001"],
    "gemini-2.5-pro": ["gemini-2.5-pro"],
    "gemini-2.0-flash-exp": ["gemini-2.0-flash-exp"],
    "gemini-pro": ["gemini-2.5-pro", "gemini-2.0-flash-exp"],
    "gemini-pro-vision": ["gemini-2.5-pro"],
    "gemini-2.5-flash-image": ["gemini-2.0-flash-exp-image-generation"],
  };
  
  // First, try to get the list of available models from the API
  let availableModels: string[] = [];
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const listResponse = await fetch(listUrl);
    if (listResponse.ok) {
      const listData = await listResponse.json() as { models?: Array<{ name: string }> };
      if (listData.models) {
        availableModels = listData.models.map(m => m.name.replace('models/', ''));
        console.log(`[Gemini MCP] Available models: ${availableModels.join(", ")}`);
      }
    }
  } catch (err) {
    console.log(`[Gemini MCP] Could not fetch model list: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  // Get candidate model names to try
  const candidateModels = modelMap[modelLower] || [model];
  
  // If we have the list of available models, filter candidates to only try available ones
  const modelsToTry = availableModels.length > 0
    ? candidateModels.filter(m => availableModels.includes(m) || availableModels.some(am => am.includes(m.replace('models/', ''))))
    : candidateModels;
  
  if (modelsToTry.length === 0 && availableModels.length > 0) {
    // Suggest the best alternative model
    const suggestedModel = availableModels.find(m => m.includes("flash")) || availableModels[0];
    return {
      invocation,
      result: {
        type: "error",
        message: `Model "${model}" is not available for your API key.`,
        details: `The model "${model}" is not in the list of available models. ` +
          `Available models: ${availableModels.join(", ")}. ` +
          `Try using "${suggestedModel}" instead, or specify one of the available models. ` +
          `Note: If you requested a Gemini 1.5 model, your API key only has access to Gemini 2.0+ models.`,
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
  
  // List of valid Gemini API model names for validation (used only if we don't have available models list)
  const validGeminiModels = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
    "gemini-1.5-pro-001",
    "gemini-1.5-pro-latest",
    "gemini-pro",
    "gemini-pro-vision",
    "gemini-2.0-flash-exp",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
  ];
  
  // Check if it's a non-Gemini model (like gpt-4o-mini)
  const isNonGeminiModel = modelLower.includes("gpt") || 
                           modelLower.includes("claude") || 
                           modelLower.includes("anthropic") ||
                           modelLower.includes("openai");
  
  if (isNonGeminiModel) {
    return {
      invocation,
      result: {
        type: "error",
        message: `Invalid model: ${model}. This is a Gemini MCP server and only supports Gemini models.`,
        details: `You specified "${model}" which is not a Gemini model. ` +
          (availableModels.length > 0 
            ? `Available Gemini models: ${availableModels.join(", ")}.`
            : `Valid Gemini models: ${validGeminiModels.join(", ")}.`),
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
  
  // If we have the available models list, skip the hardcoded validation
  // and let the API call determine if the model is valid
  if (availableModels.length > 0) {
    // Check if the requested model (or any candidate) is in the available models
    const isAvailable = candidateModels.some(m => availableModels.includes(m));
    if (!isAvailable && !modelMap[modelLower]) {
      // Model not in available list and not in our mapping - but still try it in case it's a new model
      console.log(`[Gemini MCP] Model "${model}" not in available list, but will try it anyway`);
    }
  }
  
  // No need to validate further - let the API call determine if the model is valid
  // If we have available models, we've already filtered. If not, we'll try the model anyway.

  const temperature = parseOptionalNumber(args.temperature, 0, 1);
  const maxOutputTokens = parseOptionalNumber(args.max_output_tokens, 1, 8192);
  const systemInstruction = args.system?.trim();

  // Try each candidate model name until one works
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;
  let lastErrorText = "";
  
  // Use modelsToTry if we filtered by available models, otherwise use all candidates
  const finalModelsToTry = modelsToTry.length > 0 ? modelsToTry : candidateModels;
  
  console.log(`[Gemini MCP] Will try models: ${finalModelsToTry.join(", ")}`);
  
  for (const candidateModel of finalModelsToTry) {
    // Try v1beta first (this is what the working chat function uses), then v1
    const apiVersions = ["v1beta", "v1"];
    
    for (const apiVersion of apiVersions) {
      try {
        // Construct URL exactly like the working chat function does
        const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${candidateModel}:generateContent?key=${apiKey}`;

        const body: Record<string, unknown> = {
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        };

        const generationConfig: Record<string, unknown> = {};
        if (typeof temperature === "number") generationConfig.temperature = temperature;
        if (typeof maxOutputTokens === "number") generationConfig.maxOutputTokens = Math.round(maxOutputTokens);
        if (Object.keys(generationConfig).length > 0) {
          body.generationConfig = generationConfig;
        }
        // Use system_instruction (snake_case) like the working chat function
        if (systemInstruction) {
          body.system_instruction = {
            parts: [{ text: systemInstruction }],
          };
        }

        console.log(`[Gemini MCP] Trying model: ${candidateModel}, API version: ${apiVersion}, URL: ${url.substring(0, 100)}...`);
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        
        console.log(`[Gemini MCP] Response status: ${response.status} for model: ${candidateModel}, API: ${apiVersion}`);
        
        if (response.ok) {
          // Success! Use this model and response
          const payload = (await response.json()) as GeminiResponse;
          const text = extractGeminiText(payload);

          if (!text) {
            return {
              invocation,
              result: {
                type: "error",
                message: "Gemini response did not include any text content",
                details: "The API returned a response but it did not contain any generated text.",
              },
              timestamp: new Date().toISOString(),
              latencyMs: Math.round(performance.now() - startedAt),
            };
          }

          return {
            invocation,
            result: {
              type: "text",
              content: text,
            },
            timestamp: new Date().toISOString(),
            latencyMs: Math.round(performance.now() - startedAt),
            raw: payload,
          };
        }
        
        // Save the response for error reporting (even 404s, so we can show what was tried)
        lastResponse = response;
        const errorText = await response.text();
        console.log(`[Gemini MCP] Error response for ${candidateModel} (${apiVersion}):`, errorText.substring(0, 500));
        lastErrorText = errorText;
        
        if (response.status === 404) {
          // For 404s, try next model/version
        } else {
          // For other errors, break (don't try more)
          break;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Continue to next attempt, but save the error
        if (!lastErrorText) {
          lastErrorText = err instanceof Error ? err.message : String(err);
        }
      }
    }
    
    // If we got a non-404 error, don't try more models
    if (lastResponse && lastResponse.status !== 404) {
      break;
    }
  }
  
  // If we get here, all attempts failed
  let errorMessage = "Failed to communicate with Gemini API";
  let errorDetails = `Tried ${candidateModels.length} model name variation(s): ${candidateModels.join(", ")} with API versions v1 and v1beta, but all failed.`;
  
  if (lastResponse) {
    const errorText = lastErrorText || "Unknown error";
    errorMessage = `Gemini API request failed (${lastResponse.status})`;
    errorDetails = errorText;
    
    // Provide user-friendly error messages
    if (lastResponse.status === 404) {
      // Try to get more details from the error response
      let apiErrorDetails = "";
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          apiErrorDetails = errorJson.error.message;
        }
      } catch {
        // Keep original error text
      }
      
      errorMessage = `Model "${model}" not found. Tried multiple model name variations but none were recognized by the Gemini API.`;
      errorDetails = `Tried model names: ${candidateModels.join(", ")} with API versions v1 and v1beta. ` +
        `API error: ${apiErrorDetails || errorText}. ` +
        `Please check that your GEMINI_API_KEY has access to Gemini models, or try a different model name.`;
    } else if (lastResponse.status === 400) {
      errorMessage = "Invalid request to Gemini API";
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorDetails = errorJson.error.message;
        }
      } catch {
        // Keep original error text
      }
    } else if (lastResponse.status === 401 || lastResponse.status === 403) {
      errorMessage = "Gemini API authentication failed";
      errorDetails = "The API key may be invalid or expired. Please contact the administrator.";
    }
  } else if (lastError) {
    errorMessage = "Network error communicating with Gemini API";
    errorDetails = lastError.message || String(lastError);
  } else {
    // This shouldn't happen, but provide a helpful message
    errorDetails += " No response or error was captured. This may indicate a network connectivity issue or the API endpoint is unreachable.";
  }
  
  return {
    invocation,
    result: {
      type: "error",
      message: errorMessage,
      details: errorDetails,
    },
    timestamp: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

// Helper function to get Google Places API key
async function getGooglePlacesApiKey(userId?: string): Promise<string | null> {
  // First check environment variable (Supabase secret)
  const envKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (envKey) {
    return envKey;
  }

  // If no env key and user is authenticated, check key manager database
  if (userId) {
    try {
      const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") ?? "default-encryption-key-change-in-production";

      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return null;
      }

      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Look for a key with provider "google_places", "google_places_api_key", or "google_maps" for this user
      // Try multiple queries to find the key
      let keyData: { encrypted_key: string } | null = null;
      let queryError: any = null;
      
      // First try: exact provider match
      console.log(`[Google Places] Query 1: Looking for provider="google_places_api_key"`);
      const { data: data1, error: error1 } = await supabase
        .from("api_keys")
        .select("encrypted_key, provider, name")
        .eq("user_id", userId)
        .eq("provider", "google_places_api_key")
        .eq("is_active", true)
        .maybeSingle();
      
      console.log(`[Google Places] Query 1 result:`, { found: !!data1, error: error1, data: data1 ? { provider: data1.provider, name: data1.name } : null });
      
      if (!error1 && data1) {
        keyData = { encrypted_key: data1.encrypted_key };
      } else {
        queryError = error1;
        // Second try: other provider names
        console.log(`[Google Places] Query 2: Looking for provider="google_places" or "google_maps"`);
        const { data: data2, error: error2 } = await supabase
          .from("api_keys")
          .select("encrypted_key, provider, name")
          .eq("user_id", userId)
          .or("provider.eq.google_places,provider.eq.google_maps")
          .eq("is_active", true)
          .maybeSingle();
        
        console.log(`[Google Places] Query 2 result:`, { found: !!data2, error: error2, data: data2 ? { provider: data2.provider, name: data2.name } : null });
        
        if (!error2 && data2) {
          keyData = { encrypted_key: data2.encrypted_key };
        } else {
          // Third try: name-based search
          console.log(`[Google Places] Query 3: Looking for name containing "google_places" or "google_maps"`);
          const { data: data3, error: error3 } = await supabase
            .from("api_keys")
            .select("encrypted_key, provider, name")
            .eq("user_id", userId)
            .or("name.ilike.%google_places%,name.ilike.%google_maps%")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          
          console.log(`[Google Places] Query 3 result:`, { found: !!data3, error: error3, data: data3 ? { provider: data3.provider, name: data3.name } : null });
          
          if (!error3 && data3) {
            keyData = { encrypted_key: data3.encrypted_key };
          } else {
            queryError = error3 || error2 || error1;
          }
        }
      }

      if (!keyData) {
        // Let's also check what keys exist for this user to help debug
        const { data: allKeys, error: listError } = await supabase
          .from("api_keys")
          .select("id, name, provider, is_active")
          .eq("user_id", userId);
        
        console.log(`[Google Places] All keys for user ${userId}:`, { keys: allKeys, listError });
        console.log("[Google Places] API key not found. Searched for providers: google_places_api_key, google_places, google_maps");
        console.log("[Google Places] Query errors:", queryError);
        
        // Last resort: try to find any key with "google" in the name or provider
        if (allKeys && allKeys.length > 0) {
          const googleKey = allKeys.find((k: any) => 
            (k.name && (k.name.toLowerCase().includes("google") || k.name.toLowerCase().includes("places"))) ||
            (k.provider && (k.provider.toLowerCase().includes("google") || k.provider.toLowerCase().includes("places")))
          );
          
          if (googleKey) {
            console.log(`[Google Places] Found potential Google key:`, googleKey);
            // Try to get this key
            const { data: foundKey, error: foundError } = await supabase
              .from("api_keys")
              .select("encrypted_key")
              .eq("id", googleKey.id)
              .eq("is_active", true)
              .single();
            
            if (!foundError && foundKey) {
              console.log(`[Google Places] Using fallback key: ${googleKey.name} (provider: ${googleKey.provider})`);
              keyData = foundKey;
            }
          }
        }
        
        if (!keyData) {
          return null;
        }
      }

      // Decrypt the key
      try {
        const { data: decryptedKey, error: decryptError } = await supabase.rpc("decrypt_key_value", {
          key_value: keyData.encrypted_key,
          encryption_key: ENCRYPTION_KEY,
        });

        if (decryptError || !decryptedKey) {
          console.error("Failed to decrypt Google Places API key:", decryptError);
          return null;
        }

        console.log("Successfully retrieved Google Places API key from key manager");
        return decryptedKey;
      } catch (decryptException) {
        console.error("Exception decrypting Google Places API key:", decryptException);
        return null;
      }
    } catch (error) {
      console.error("Error getting Google Places API key from key manager:", error);
      return null;
    }
  }

  return null;
}

async function handleGooglePlaces(invocation: McpInvocation, userId?: string): Promise<McpInvocationResponse> {
  const startedAt = performance.now();
  const args = invocation.args ?? {};
  const command = invocation.command ?? "get_place_details";

  // Get API key
  const apiKey = await getGooglePlacesApiKey(userId);
  if (!apiKey) {
    // If user is not authenticated, provide helpful login prompt
    if (!userId) {
      return createAuthRequiredResponse(
        invocation,
        "Google Places API requires an API key. Log in to securely store your API key using the Key Manager."
      );
    }
    
    // User is authenticated but no key found
    return {
      invocation,
      result: {
        type: "error",
        message: "Google Places API key is not configured.",
        details: {
          explanation: "You need to add your Google Places API key to use this feature.",
          setup: "Get your API key from Google Cloud Console: https://console.cloud.google.com/",
          keyManager: "Use the Key Manager Agent: /key add google_places_api_key <name> key=YOUR_API_KEY",
          envVar: "Or set GOOGLE_PLACES_API_KEY as a Supabase secret",
          docs: "https://developers.google.com/maps/documentation/places/web-service/get-api-key",
        },
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  try {
    if (command === "get_place_details") {
      const placeId = args.place_id;
      if (!placeId) {
        return {
          invocation,
          result: {
            type: "error",
            message: "Missing required parameter: place_id",
          },
          timestamp: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      }

      // Use Places API (New) - Place Details endpoint
      const url = `https://places.googleapis.com/v1/places/${placeId}`;
      
      // Build field mask from requested fields or use defaults
      const requestedFields = args.fields?.split(",").map((f: string) => f.trim()) || [];
      const defaultFields = [
        "id",
        "displayName",
        "formattedAddress",
        "nationalPhoneNumber",
        "websiteUri",
        "regularOpeningHours",
        "rating",
        "userRatingCount",
        "location",
        "photos",
        "reviews",
      ];
      
      const fieldMask = requestedFields.length > 0 
        ? requestedFields.join(",")
        : defaultFields.join(",");

      const response = await fetch(`${url}?fields=${encodeURIComponent(fieldMask)}`, {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Places API request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // Handle errors in new API format
      if (data.error) {
        throw new Error(`Google Places API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      // New API returns place data directly
      const place = data;
      
      // Format result for compatibility
      const enhancedResult: any = {
        name: place.displayName?.text || place.name,
        formatted_address: place.formattedAddress || "",
        place_id: place.id,
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        formatted_phone_number: place.nationalPhoneNumber || "",
        website: place.websiteUri || "",
        opening_hours: place.regularOpeningHours || null,
        reviews: place.reviews || [],
        photos: place.photos || [],
      };
      
      // Generate Google Maps URL if we have coordinates
      if (place.location) {
        const lat = place.location.latitude;
        const lng = place.location.longitude;
        enhancedResult.map_url = `https://www.google.com/maps?q=${lat},${lng}`;
        enhancedResult.map_embed_url = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${lat},${lng}`;
        enhancedResult.geometry = {
          location: {
            lat: lat,
            lng: lng,
          },
        };
      }
      // Generate place URL if we have place_id
      if (place.id) {
        enhancedResult.place_url = `https://www.google.com/maps/place/?q=place_id:${place.id}`;
      }

      return {
        invocation,
        result: {
          type: "json",
          data: enhancedResult,
          summary: enhancedResult.name 
            ? `Retrieved details for ${enhancedResult.name}. Map link: ${enhancedResult.map_url || enhancedResult.place_url || "N/A"}` 
            : "Place not found",
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } else if (command === "search_places") {
      const query = args.query;
      if (!query) {
        return {
          invocation,
          result: {
            type: "error",
            message: "Missing required parameter: query",
          },
          timestamp: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      }

      // Use Places API (New) - Text Search endpoint
      const url = "https://places.googleapis.com/v1/places:searchText";
      
      const requestBody: any = {
        textQuery: query,
      };
      
      // Add location bias if provided
      if (args.location) {
        const [lat, lng] = args.location.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          requestBody.locationBias = {
            circle: {
              center: {
                latitude: lat,
                longitude: lng,
              },
              radius: 50000.0, // 50km radius
            },
          };
        }
      }

      // Required field mask for Places API (New)
      const fieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Places API request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // Handle errors in new API format
      if (data.error) {
        throw new Error(`Google Places API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      // New API returns places in data.places array
      const places = data.places || [];
      
      console.log(`[Google Places] Search query: "${query}", Found ${places.length} places`);
      
      if (places.length === 0) {
        return {
          invocation,
          result: {
            type: "json",
            data: {
              query,
              results: [],
              total_results: 0,
            },
            summary: `No places found for "${query}". Try a different search term or check the spelling.`,
          },
          timestamp: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      }
      
      // Enhance results with map URLs and format for compatibility
      const enhancedResults = places.map((place: any) => {
        const result: any = {
          name: place.displayName?.text || place.name,
          formatted_address: place.formattedAddress || "",
          place_id: place.id,
          rating: place.rating,
          user_ratings_total: place.userRatingCount,
          geometry: place.location ? {
            location: {
              lat: place.location.latitude,
              lng: place.location.longitude,
            },
          } : null,
        };
        
        // Generate Google Maps URL if we have coordinates
        if (place.location) {
          const lat = place.location.latitude;
          const lng = place.location.longitude;
          result.map_url = `https://www.google.com/maps?q=${lat},${lng}`;
          result.map_embed_url = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${lat},${lng}`;
        }
        // Generate place URL if we have place_id
        if (place.id) {
          result.place_url = `https://www.google.com/maps/place/?q=place_id:${place.id}`;
        }
        
        // Add other available fields
        if (place.nationalPhoneNumber) {
          result.formatted_phone_number = place.nationalPhoneNumber;
        }
        if (place.websiteUri) {
          result.website = place.websiteUri;
        }
        if (place.regularOpeningHours) {
          result.opening_hours = place.regularOpeningHours;
        }
        
        return result;
      });

      // Format opening hours for display
      const formatOpeningHours = (hours: any): string => {
        if (!hours || !hours.weekdayDescriptions) return '';
        const openNow = hours.openNow ? '✅ Open Now' : '❌ Closed';
        const nextTime = hours.openNow 
          ? (hours.nextCloseTime ? ` (Closes at ${new Date(hours.nextCloseTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})` : '')
          : (hours.nextOpenTime ? ` (Opens at ${new Date(hours.nextOpenTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})` : '');
        return `${openNow}${nextTime}\n   ${hours.weekdayDescriptions.slice(0, 3).join('\n   ')}${hours.weekdayDescriptions.length > 3 ? '\n   ...' : ''}`;
      };

      const summary = enhancedResults.length > 0
        ? `Found ${enhancedResults.length} location(s) for "${query}":\n\n${enhancedResults.map((r: any, i: number) => {
            const hours = formatOpeningHours(r.opening_hours);
            return `${i + 1}. **${r.name}**\n` +
              `   📍 ${r.formatted_address || 'Address not available'}\n` +
              (r.formatted_phone_number ? `   📞 ${r.formatted_phone_number}\n` : '') +
              (r.rating ? `   ⭐ ${r.rating}/5 (${r.user_ratings_total || 0} reviews)\n` : '') +
              (hours ? `   🕐 ${hours}\n` : '') +
              (r.map_url ? `   🗺️ [View on Google Maps](${r.map_url}) | [Get Directions](${r.map_url})\n` : '') +
              (r.website ? `   🌐 [Website](${r.website})\n` : '');
          }).join('\n')}`
        : `No results found for "${query}". Try a different search term or check the spelling.`;

      // Create a more user-friendly response format
      const userFriendlyResponse = {
        query,
        total_results: enhancedResults.length,
        locations: enhancedResults.map((r: any) => ({
          name: r.name,
          address: r.formatted_address,
          phone: r.formatted_phone_number,
          rating: r.rating ? `${r.rating}/5 (${r.user_ratings_total || 0} reviews)` : null,
          open_now: r.opening_hours?.openNow ?? null,
          hours: r.opening_hours?.weekdayDescriptions?.slice(0, 3) || null,
          map_link: r.map_url,
          directions_link: r.map_url,
          website: r.website,
          place_id: r.place_id,
        })),
      };

      return {
        invocation,
        result: {
          type: "json",
          data: userFriendlyResponse,
          summary: summary,
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } else if (command === "autocomplete") {
      const input = args.input;
      if (!input) {
        return {
          invocation,
          result: {
            type: "error",
            message: "Missing required parameter: input",
          },
          timestamp: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      }

      // Use Places API (New) - Autocomplete endpoint
      const url = "https://places.googleapis.com/v1/places:autocomplete";
      
      const requestBody: any = {
        input: input,
      };
      
      // Add location bias if provided
      if (args.location) {
        const [lat, lng] = args.location.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          requestBody.locationBias = {
            circle: {
              center: {
                latitude: lat,
                longitude: lng,
              },
              radius: 50000.0, // 50km radius
            },
          };
        }
      }

      // Required field mask for Places API (New) - autocomplete
      const fieldMask = "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Places API request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // Handle errors in new API format
      if (data.error) {
        throw new Error(`Google Places API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      // New API returns suggestions in data.suggestions array
      const suggestions = data.suggestions || [];
      
      // Format predictions for compatibility
      const predictions = suggestions.map((suggestion: any) => ({
        place_id: suggestion.placePrediction?.placeId || suggestion.placePrediction?.place?.id,
        description: suggestion.placePrediction?.text?.text || suggestion.placePrediction?.text,
        structured_formatting: suggestion.placePrediction?.structuredFormat || null,
      }));

      return {
        invocation,
        result: {
          type: "json",
          data: {
            input,
            predictions: predictions,
            total_predictions: predictions.length,
          },
          summary: `Found ${predictions.length} suggestion(s) for "${input}"`,
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } else {
      return {
        invocation,
        result: {
          type: "error",
          message: `Unsupported command: ${command}. Supported commands: get_place_details, search_places, autocomplete`,
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Google Places] Error in ${command}:`, message);
    return {
      invocation,
      result: {
        type: "error",
        message: "Google Places API request failed",
        details: message,
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

async function handleSearch(invocation: McpInvocation): Promise<McpInvocationResponse> {
  const startedAt = performance.now();
  const args = invocation.args ?? {};
  const command = invocation.command ?? "web_search";
  const query = args.query ?? invocation.positionalArgs?.[0];
  const maxResultsRaw = args.max_results ?? args.maxResults;

  if (command !== "web_search") {
    return {
      invocation,
      result: {
        type: "error",
        message: `Unsupported command: ${command}`,
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  if (!query || typeof query !== "string") {
    return {
      invocation,
      result: {
        type: "error",
        message: "Missing required parameter: query",
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  let maxResults = 5;
  if (typeof maxResultsRaw === "string") {
    const parsed = Number(maxResultsRaw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 20) {
      maxResults = parsed;
    }
  }

  try {
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
    const results: Array<{ title: string; url: string; snippet: string }> = [];

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

    const finalResults = results.slice(0, maxResults);
    const latencyMs = Math.round(performance.now() - startedAt);

    return {
      invocation: { ...invocation, serverId: "search-mcp", command, args: { query, max_results: String(maxResults) } },
      result: {
        type: "json",
        data: {
          query,
          maxResults,
          results: finalResults,
        },
        summary:
          finalResults.length === 0
            ? `No results found for "${query}".`
            : `Found ${finalResults.length} result(s) for "${query}".`,
      },
      timestamp: new Date().toISOString(),
      latencyMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      invocation: { ...invocation, serverId: "search-mcp", command },
      result: {
        type: "error",
        message: "Web search failed. Please try again or rephrase your query.",
        details: message,
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

async function handleGrokipedia(invocation: McpInvocation): Promise<McpInvocationResponse> {
  const startedAt = performance.now();
  const args = invocation.args ?? {};
  const command = invocation.command ?? "search";
  const query = args.query || args.q || invocation.positionalArgs?.[0];

  if (command === "search") {
    if (!query) {
      return {
        invocation,
        result: {
          type: "error",
          message: "Missing required parameter: query",
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    const limit = parseInt(args.limit || "12", 10);
    const offset = parseInt(args.offset || "0", 10);
    
    try {
      // Grokipedia API endpoint - using their public API
      // Base URL: https://grokipedia.com
      // Endpoint: /api/full-text-search
      const searchUrl = `https://grokipedia.com/api/full-text-search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Grokipedia Python SDK)",
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        // If direct API doesn't work, try alternative approach
        // Grokipedia might require different authentication or endpoints
        throw new Error(`Grokipedia API returned ${response.status}: ${await response.text().catch(() => "Unknown error")}`);
      }

      const data = await response.json();

      // Grokipedia API returns: { results: [...], total: number }
      const results = Array.isArray(data.results) ? data.results : [];
      const total = typeof data.total === "number" ? data.total : results.length;
      
      // Format results for display
      const textLines: string[] = [`Found ${results.length} result(s) for '${query}'`];
      if (total > results.length) {
        textLines[0] += ` (showing ${results.length} of ${total} total)`;
      }
      textLines.push("");
      
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        const title = item.title || item.slug || `Result ${i + 1}`;
        const slug = item.slug || "";
        const snippet = item.snippet || "";
        const relevance = typeof item.relevance_score === "number" ? item.relevance_score.toFixed(3) : "N/A";
        const views = typeof item.view_count === "number" ? item.view_count : "N/A";
        
        textLines.push(`${i + 1}. ${title}`);
        if (slug) textLines.push(`   Slug: ${slug}`);
        if (snippet) textLines.push(`   Snippet: ${snippet}`);
        textLines.push(`   Relevance: ${relevance}`);
        textLines.push(`   Views: ${views}`);
        textLines.push("");
      }
      
      const summary = results.length > 0
        ? `Found ${results.length} result(s) for "${query}"`
        : `No results found for "${query}"`;

      return {
        invocation,
        result: {
          type: "text",
          content: textLines.join("\n"),
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide helpful error message
      return {
        invocation,
        result: {
          type: "error",
          message: `Grokipedia search failed: ${errorMessage}. Note: Grokipedia API may require authentication or use different endpoints. Consider using the grokipedia-mcp Python package directly.`,
          details: {
            suggestion: "The grokipedia-mcp Python package implements the full MCP protocol. For direct integration, you may need to implement a proper MCP protocol gateway or use the package's API SDK.",
          },
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }
  }

  return {
    invocation,
    result: {
      type: "error",
      message: `Unknown Grokipedia command: ${command}. Supported commands: search`,
    },
    timestamp: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

async function getCanvaCredentials(userId?: string): Promise<{ clientId: string; clientSecret: string | null; accessToken: string | null; refreshToken: string | null } | null> {
  // Check environment variables first
  const envClientId = Deno.env.get("CANVA_CLIENT_ID");
  const envClientSecret = Deno.env.get("CANVA_CLIENT_SECRET");
  const envAccessToken = Deno.env.get("CANVA_ACCESS_TOKEN");
  const envRefreshToken = Deno.env.get("CANVA_REFRESH_TOKEN");
  
  if (envClientId) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret || null,
      accessToken: envAccessToken || null,
      refreshToken: envRefreshToken || null,
    };
  }
  
  // Try to get from user's key manager if userId is provided
  if (userId) {
    try {
      const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        
        // Look for canva credentials in user's stored keys
        // We'll look for keys with provider "canva" or "canva_client_id", "canva_client_secret", "canva_access_token", "canva_refresh_token"
        const { data: keys, error } = await supabase
          .from("api_keys")
          .select("name, encrypted_key")
          .eq("user_id", userId)
          .or("provider.eq.canva,provider.ilike.%canva%,name.ilike.%canva%")
          .eq("is_active", true);
        
        if (!error && keys && keys.length > 0) {
          const credentials: { clientId?: string; clientSecret?: string; accessToken?: string; refreshToken?: string } = {};
          
          for (const key of keys) {
            const { data: decryptedKey, error: decryptError } = await supabase.rpc("decrypt_key_value", {
              key_value: key.encrypted_key,
            });
            
            if (!decryptError && decryptedKey) {
              const name = (key.name || "").toLowerCase();
              if (name.includes("client_id") || name.includes("clientid")) {
                credentials.clientId = decryptedKey;
              } else if (name.includes("client_secret") || name.includes("clientsecret")) {
                credentials.clientSecret = decryptedKey;
              } else if (name.includes("access_token") || name.includes("accesstoken")) {
                credentials.accessToken = decryptedKey;
              } else if (name.includes("refresh_token") || name.includes("refreshtoken")) {
                credentials.refreshToken = decryptedKey;
              } else if (!credentials.clientId) {
                // Default to first key as client ID if no specific match
                credentials.clientId = decryptedKey;
              }
            }
          }
          
          if (credentials.clientId) {
            return {
              clientId: credentials.clientId,
              clientSecret: credentials.clientSecret || null,
              accessToken: credentials.accessToken || null,
              refreshToken: credentials.refreshToken || null,
            };
          }
        }
      }
    } catch (error) {
      console.log("Could not fetch Canva credentials from key manager:", error);
    }
  }
  
  return null;
}

// Generate PKCE code verifier and challenge
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // Generate a random code verifier (43-128 characters, URL-safe)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
    .substring(0, 43);
  
  // Generate code challenge (SHA256 hash of verifier, base64url encoded)
  // Note: In Deno, we can use Web Crypto API
  // For now, we'll return a placeholder - actual implementation needs async crypto
  const codeChallenge = codeVerifier; // Placeholder - should be SHA256 hash
  
  return { codeVerifier, codeChallenge };
}

// Refresh an access token using a refresh token
async function refreshCanvaToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = "https://api.canva.com/rest/v1/oauth/token";
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to refresh Canva access token (${response.status}): ${errorText}`);
  }

  const data = await response.json() as { access_token?: string; refresh_token?: string; token_type?: string; expires_in?: number };
  
  if (!data.access_token) {
    throw new Error("Canva token refresh did not return an access token");
  }

  // Optionally update the stored refresh token if a new one is provided
  // For now, we just return the access token

  return data.access_token;
}

async function handleCanva(invocation: McpInvocation, userId?: string): Promise<McpInvocationResponse> {
  const startedAt = performance.now();
  const args = invocation.args ?? {};
  const command = invocation.command ?? "create_design";
  
  // Canva API uses OAuth2 with Client ID and Client Secret
  // Check for credentials in environment or user's key manager
  const credentials = await getCanvaCredentials(userId);
  
  if (!credentials || !credentials.clientId) {
    return {
      invocation,
      result: {
        type: "error",
        message: "Canva Client ID is not configured. Please set CANVA_CLIENT_ID as a Supabase secret or add it via the Key Manager Agent.",
        details: {
          setup: "Canva API uses OAuth2 authentication. You need a Client ID and Client Secret. Get them from https://www.canva.com/developers/",
          keyManager: "Use the Key Manager Agent: /key add canva_client_id <name> key=YOUR_CLIENT_ID",
          envVars: "Or set CANVA_CLIENT_ID and CANVA_CLIENT_SECRET as Supabase secrets",
        },
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  // Canva API requires OAuth2 authorization code flow - users must provide an access token
  // Client credentials grant is NOT supported by Canva (only authorization_code and refresh_token)
  let accessToken: string | null = credentials.accessToken;
  
  // If no access token but we have a refresh token, try to refresh
  if (!accessToken && credentials.refreshToken && credentials.clientSecret) {
    try {
      accessToken = await refreshCanvaToken(credentials.refreshToken, credentials.clientId, credentials.clientSecret);
      // Note: In a production system, you'd want to store the new access token
    } catch (error) {
      console.log("Failed to refresh Canva token:", error);
      // Fall through to show error message
    }
  }
  
  // If access token exists but might be expired, check if we should refresh proactively
  // For now, we'll let the API call fail with 401 and then refresh on error
  
  if (!accessToken) {
    const redirectUri = "http://127.0.0.1:3000/callback"; // This should be configured in your Canva app settings
    // Generate PKCE parameters
    const pkce = generatePKCE();
    // Request the scopes that are enabled in your Canva integration
    // Note: Canva uses granular scopes like design:content:write, design:content:read, etc.
    const scopes = "design:content:write design:meta:read design:content:read design:permission:write design:permission:read";
    const authUrl = `https://www.canva.com/api/oauth/authorize?code_challenge_method=s256&response_type=code&client_id=${encodeURIComponent(credentials.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&code_challenge=${encodeURIComponent(pkce.codeChallenge)}`;
    
    return {
      invocation,
      result: {
        type: "error",
        message: "Canva access token is required. Canva API uses OAuth2 authorization code flow and requires user authorization.",
        details: {
          setup: "To use Canva MCP, you need to obtain an access token through OAuth2:",
          steps: [
            "1. Authorize your app using the OAuth authorization URL",
            "2. Exchange the authorization code for an access token (and refresh token) using your client ID and secret",
            "3. Set the access token as CANVA_ACCESS_TOKEN or via Key Manager",
            "4. Optionally set CANVA_REFRESH_TOKEN for automatic token refresh",
          ],
          authorizationUrl: authUrl,
          docs: "See https://www.canva.dev/docs/connect/api-reference/authentication/ for OAuth flow details",
          keyManager: "Once you have tokens, set them via: /key add canva_access_token <name> key=YOUR_ACCESS_TOKEN",
          envVar: "Or set CANVA_ACCESS_TOKEN (and CANVA_REFRESH_TOKEN) as Supabase secrets",
          note: "Canva does NOT support client_credentials grant type. You must use authorization_code flow.",
        },
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  if (command === "create_design") {
    // Get template - default to "social_post" if not provided
    const template = args.template || args.template_id || invocation.positionalArgs?.[0] || "social_post";
    const text = args.text || args.content || invocation.positionalArgs?.[1];

    try {
      // Skip token verification for now - Canva API endpoint structure may differ
      // The token was just obtained, so it should be valid
      // If design creation fails, we'll handle it in the error response
      
      // Canva Design API endpoint
      // The error shows GET /rest/v1/designs doesn't exist
      // For creating designs, Canva API might use:
      // - POST /rest/v1/designs (standard REST)
      // - Different endpoint structure
      // Based on Canva API docs, try POST to create
      // Note: The actual endpoint might need to be verified in Canva's API documentation
      const canvaApiUrl = "https://api.canva.com/rest/v1/designs";
      
      // Alternative: If the above doesn't work, Canva might use:
      // - https://api.canva.com/v1/designs (without /rest)
      // - https://www.canva.com/api/v1/designs
      // - Or require a different base path
      
      // Canva API request format based on error messages:
      // Requires BOTH 'design_type' (or 'asset_id') AND 'type' fields
      // - 'design_type' OR 'asset_id' must be defined
      // - 'type' must not be null
      const requestBody: Record<string, unknown> = {};
      
      // Map user-friendly template names to valid Canva API preset names
      // Valid preset names per API: doc, whiteboard, presentation
      const presetNameMap: Record<string, string> = {
        "social_post": "presentation",  // Map to closest valid option
        "post": "presentation",
        "presentation": "presentation",
        "doc": "doc",
        "document": "doc",
        "whiteboard": "whiteboard",
        "board": "whiteboard",
        "poster": "presentation",  // Map to closest valid option
        "flyer": "presentation",   // Map to closest valid option
        "story": "presentation",   // Map to closest valid option
        "video": "presentation",   // Map to closest valid option
      };
      
      // Canva API requires:
      // 1. Either 'design_type' OR 'asset_id' must be defined
      // 2. 'design_type' must be an OBJECT with 'type' and 'name' properties
      // 3. Valid preset 'name' values: "doc", "whiteboard", "presentation" (per API error)
      
      // Determine valid preset name
      const normalizedTemplate = template.toLowerCase();
      const validPresetName = presetNameMap[normalizedTemplate] || "presentation"; // Default to presentation
      
      // Set design_type OR asset_id (one of these is required)
      if (args.asset_id) {
        // When using asset_id, create design from template/asset
        requestBody.asset_id = args.asset_id;
      } else if (args.width && args.height) {
        // Custom dimensions - design_type should be an object with type: "custom"
        requestBody.design_type = {
          type: "custom",
          width: parseInt(args.width, 10),
          height: parseInt(args.height, 10),
        };
      } else {
        // Preset design type - design_type must be an object with type: "preset" and name
        // Valid preset names: "doc", "whiteboard", "presentation"
        requestBody.design_type = {
          type: "preset",
          name: validPresetName,
        };
      }
      
      // Add title if text is provided (Canva uses 'title' for design name)
      if (text) {
        requestBody.title = text;
      }
      
      // Add brand_id if provided
      if (args.brand_id) {
        requestBody.brand_id = args.brand_id;
      }
      
      // Log request body for debugging
      console.log("Canva API request body:", JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(canvaApiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        
        // If token is invalid/expired and we have a refresh token, try to refresh
        if (response.status === 401 && credentials.refreshToken && credentials.clientSecret) {
          try {
            const newAccessToken = await refreshCanvaToken(credentials.refreshToken, credentials.clientId, credentials.clientSecret);
            
            // Retry the request with the new token
            const retryResponse = await fetch(canvaApiUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${newAccessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            });
            
            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              const designUrl = retryData.design_url || retryData.url || retryData.id;
              const summary = designUrl
                ? `Created Canva design: ${designUrl} (token refreshed automatically)`
                : `Created Canva design with template "${template}" (token refreshed)`;

              return {
                invocation,
                result: {
                  type: "json",
                  data: {
                    design_id: retryData.id || retryData.design_id,
                    design_url: designUrl,
                    template: template,
                    ...retryData,
                  },
                  summary,
                },
                timestamp: new Date().toISOString(),
                latencyMs: Math.round(performance.now() - startedAt),
              };
            }
          } catch (refreshError) {
            // If refresh fails, fall through to show the original error with helpful message
            const refreshErrorMsg = refreshError instanceof Error ? refreshError.message : String(refreshError);
            throw new Error(`Canva API returned 401 (invalid access token). Token refresh also failed: ${refreshErrorMsg}. Please get a new access token through OAuth2 flow.`);
          }
        }
        
        // Check if it's an invalid token error
        if (response.status === 401) {
          let errorDetails: { code?: string; message?: string } = {};
          try {
            errorDetails = JSON.parse(errorText);
          } catch {
            errorDetails = { code: "unknown", message: errorText };
          }
          const errorCode = errorDetails.code || "unknown";
          
          let helpfulMessage = `Canva API returned 401: Access token is invalid or expired.`;
          
          if (errorCode === "invalid_access_token") {
            helpfulMessage += `\n\nThe access token "${accessToken.substring(0, 20)}..." appears to be invalid.`;
            helpfulMessage += `\n\nPossible issues:`;
            helpfulMessage += `\n1. Token format might be incorrect`;
            helpfulMessage += `\n2. Token might have expired`;
            helpfulMessage += `\n3. Token might need to be obtained through OAuth2 user authorization flow`;
            helpfulMessage += `\n4. API endpoint might be incorrect (currently using: ${canvaApiUrl})`;
            helpfulMessage += `\n\nTo fix:`;
            helpfulMessage += `\n1. Verify the token was obtained through proper OAuth2 flow: https://www.canva.dev/docs/apps/authenticating-users/oauth/`;
            helpfulMessage += `\n2. Check if the token needs user-specific authorization (not just client credentials)`;
            helpfulMessage += `\n3. Verify the API endpoint is correct in Canva's documentation`;
            helpfulMessage += `\n4. Ensure the token has required scopes: design:read design:write`;
          }
          
          if (credentials.refreshToken) {
            helpfulMessage += `\n\nNote: Token refresh was attempted but failed.`;
          } else {
            helpfulMessage += `\n\nNote: No refresh token available. You'll need to get a new access token through OAuth2 flow.`;
          }
          
          throw new Error(helpfulMessage);
        }
        
        // Include request body in error for debugging
        const requestBodyStr = JSON.stringify(requestBody, null, 2);
        throw new Error(`Canva API returned ${response.status}: ${errorText}\n\nRequest body sent:\n${requestBodyStr}`);
      }

      const data = await response.json();
      
      // Handle nested design object in response
      const design = data.design || data;
      const designId = design.id || data.id || data.design_id;
      const editUrl = design.urls?.edit_url;
      const viewUrl = design.urls?.view_url;
      const designUrl = editUrl || viewUrl || design.design_url || data.design_url || data.url;
      const designTitle = design.title || data.title || template;
      
      // If text content was provided, add it to the design using Design Editing API
      if (text && designId) {
        try {
          // Add text element to the design
          // Endpoint: POST /rest/v1/designs/{design_id}/native-elements
          const addElementUrl = `https://api.canva.com/rest/v1/designs/${designId}/native-elements`;
          const elementResponse = await fetch(addElementUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "TEXT",
              text: text,
              // Position in center of design (approximate)
              x: 0.5,
              y: 0.5,
              width: 0.8,
              height: 0.2,
            }),
          });
          
          if (!elementResponse.ok) {
            const errorText = await elementResponse.text().catch(() => "Unknown error");
            console.log(`Warning: Failed to add text to design (${elementResponse.status}): ${errorText}`);
            // Log the request body for debugging
            console.log(`Attempted to add text element with body:`, JSON.stringify({
              type: "TEXT",
              text: text,
              x: 0.5,
              y: 0.5,
              width: 0.8,
              height: 0.2,
            }, null, 2));
            // Continue anyway - design was created successfully
          } else {
            console.log(`Successfully added text element to design ${designId}`);
          }
        } catch (addError) {
          console.log(`Warning: Error adding text to design: ${addError}`);
          // Continue anyway - design was created successfully
        }
      }
      
      // Create a summary with clickable links (using raw URLs so they auto-linkify)
      let summary = `✅ Created Canva design "${designTitle}"`;
      if (text) {
        summary += ` with text: "${text}"`;
      }
      if (editUrl && viewUrl) {
        summary += `\n\n🔗 Edit: ${editUrl}\n🔗 View: ${viewUrl}`;
      } else if (editUrl) {
        summary += `\n\n🔗 Edit: ${editUrl}`;
      } else if (viewUrl) {
        summary += `\n\n🔗 View: ${viewUrl}`;
      } else if (designUrl) {
        summary += `\n\n🔗 Open: ${designUrl}`;
      }

      return {
        invocation,
        result: {
          type: "json",
          data: {
            template: template,
            design_id: designId,
            design_url: designUrl,
            edit_url: design.urls?.edit_url,
            view_url: design.urls?.view_url,
            title: designTitle,
            ...data,
          },
          summary,
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        invocation,
        result: {
          type: "error",
          message: `Canva design creation failed: ${errorMessage}`,
          details: {
            note: "Canva API integration may require specific authentication or endpoint configuration. Please verify your API key and check Canva API documentation.",
            docs: "https://www.canva.com/developers/",
          },
        },
        timestamp: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }
  }

  return {
    invocation,
    result: {
      type: "error",
      message: `Unknown Canva command: ${command}. Supported commands: create_design`,
    },
    timestamp: new Date().toISOString(),
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

async function handleEmail(invocation: McpInvocation, userId?: string, userEmail?: string, authHeader?: string | null): Promise<McpInvocationResponse> {
  const startedAt = performance.now();
  const args = invocation.args ?? {};
  const rawCommand = invocation.command ?? "send_test_email";
  const normalizedCommand = rawCommand.trim().toLowerCase();

  // Require authentication for email sending
  if (!userId || !userEmail) {
    return {
      invocation,
      result: {
        type: "error",
        message: "Authentication required",
        details: {
          explanation: "You must be logged in to send emails. Please sign in to continue.",
        },
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  try {
    if (normalizedCommand === "send_test_email") {
      const subject = args.subject || "Test Email";
      const body = args.body || args.content || "test";
      const provider = args.provider || "gmail"; // Default to Gmail, can be "gmail", "outlook", "icloud"

      const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return {
          invocation,
          result: {
            type: "error",
            message: "Email service is not configured",
            details: {
              explanation: "Supabase email service is not properly configured on the server.",
            },
          },
          timestamp: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      }

      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Try to use provider-specific API based on provider parameter
      if (provider === "gmail") {
        // Try to get Google OAuth token if auth header is available
        let googleToken = null;
        if (authHeader) {
          const { getOAuthTokenFromRequest } = await import("../_shared/oauth.ts");
          googleToken = await getOAuthTokenFromRequest(authHeader, "google", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          console.log("OAuth token retrieval:", {
            hasAuthHeader: !!authHeader,
            hasToken: !!googleToken?.accessToken,
            userId,
            userEmail,
          });
        } else {
          console.log("No auth header provided for Gmail API", { userId, userEmail });
        }

        if (googleToken?.accessToken) {
          // Verify token has Gmail scope by making a test API call
          try {
            const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
              headers: {
                "Authorization": `Bearer ${googleToken.accessToken}`,
              },
            });
            
            if (!profileResponse.ok) {
              console.error("Token validation failed:", {
                status: profileResponse.status,
                statusText: profileResponse.statusText,
              });
              // Token might be invalid or expired
              googleToken = null;
            } else {
              const profile = await profileResponse.json();
              console.log("Google OAuth token validated:", {
                email: profile.email,
                verified: profile.verified_email,
              });
            }
          } catch (tokenError) {
            console.error("Token validation error:", tokenError);
            googleToken = null;
          }
        }

        if (googleToken?.accessToken) {
          try {
            // Create email message in RFC 2822 format
            const emailContent = [
              `To: ${userEmail}`,
              `Subject: ${subject}`,
              `Content-Type: text/plain; charset=utf-8`,
              ``,
              body,
            ].join("\n");

            // Encode message in base64url format (Gmail API requirement)
            const encodedMessage = btoa(emailContent)
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            // Send email via Gmail API
            const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${googleToken.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                raw: encodedMessage,
              }),
            });

            if (gmailResponse.ok) {
              const gmailData = await gmailResponse.json().catch(() => ({}));
              console.log("Gmail API success:", { messageId: gmailData.id, userEmail });
              return {
                invocation,
                result: {
                  type: "text",
                  content: `✅ Test email sent successfully via Gmail to ${userEmail}!\n\nSubject: ${subject}\nBody: ${body.substring(0, 200)}${body.length > 200 ? '...' : ''}\n\nCheck your inbox!`,
                },
                timestamp: new Date().toISOString(),
                latencyMs: Math.round(performance.now() - startedAt),
              };
            } else {
              const errorData = await gmailResponse.json().catch(() => ({}));
              const errorText = await gmailResponse.text().catch(() => "");
              console.error("Gmail API failed:", {
                status: gmailResponse.status,
                statusText: gmailResponse.statusText,
                error: errorData,
                errorText: errorText.substring(0, 500),
                userEmail,
                hasToken: !!googleToken?.accessToken,
              });
              // Return error instead of falling through - user needs to fix Gmail setup
              return {
                invocation,
                result: {
                  type: "error",
                  message: `Gmail API failed: ${errorData.error?.message || gmailResponse.statusText || 'Unknown error'}`,
                  details: {
                    explanation: "Could not send email via Gmail API. This usually means:",
                    possibleCauses: [
                      "You haven't signed in with Google OAuth",
                      "You haven't granted Gmail permissions (gmail.send scope)",
                      "Your Google OAuth token has expired",
                      "Gmail API is not enabled in your Google Cloud project",
                    ],
                    userEmail: userEmail,
                    gmailError: errorData.error || errorText.substring(0, 200),
                    instructions: "1. Sign out and sign back in with Google\n2. Make sure you grant Gmail permissions\n3. Check Supabase Edge Function logs for more details",
                  },
                },
                timestamp: new Date().toISOString(),
                latencyMs: Math.round(performance.now() - startedAt),
              };
            }
          } catch (gmailError) {
            console.error("Gmail API exception:", {
              error: gmailError instanceof Error ? gmailError.message : String(gmailError),
              stack: gmailError instanceof Error ? gmailError.stack : undefined,
              userEmail,
            });
            // Return error instead of falling through
            return {
              invocation,
              result: {
                type: "error",
                message: `Gmail API error: ${gmailError instanceof Error ? gmailError.message : String(gmailError)}`,
                details: {
                  explanation: "An exception occurred while trying to send email via Gmail API.",
                  userEmail: userEmail,
                  error: gmailError instanceof Error ? gmailError.message : String(gmailError),
                },
              },
              timestamp: new Date().toISOString(),
              latencyMs: Math.round(performance.now() - startedAt),
            };
          }
        } else {
          console.log("No Google OAuth token available for Gmail API", { userEmail, hasAuthHeader: !!authHeader });
          // If we get here, Gmail API is not available
          // Return helpful error with setup instructions for Gmail OAuth
          return {
            invocation,
            result: {
              type: "error",
              message: "Gmail OAuth tokens not available",
              details: {
                explanation: "To send emails via Gmail API, you need to sign in with Google OAuth and grant Gmail permissions.",
                steps: [
                  "1. Sign out completely from the app",
                  "2. Sign back in using 'Sign in with Google' (not email/password)",
                  "3. When Google asks for permissions, grant Gmail permissions",
                  "4. The system will automatically capture and store your OAuth tokens",
                  "5. Try sending email again",
                ],
                userEmail: userEmail,
                currentStatus: "Gmail API: Not available (no OAuth token stored)\n\nNote: After signing in with Google OAuth, tokens are automatically captured and stored.",
                troubleshooting: "If you've already signed in with Google but still see this error:\n- Make sure you granted Gmail permissions during sign-in\n- Check Supabase Edge Function logs for token capture errors\n- Try signing out and signing back in again",
              },
            },
            timestamp: new Date().toISOString(),
            latencyMs: Math.round(performance.now() - startedAt),
          };
        }
      } else if (provider === "outlook") {
        // Try to get Microsoft OAuth token
        let microsoftToken = null;
        if (authHeader) {
          const { getOAuthTokenFromRequest } = await import("../_shared/oauth.ts");
          microsoftToken = await getOAuthTokenFromRequest(authHeader, "azure", SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          console.log("Microsoft OAuth token retrieval:", {
            hasAuthHeader: !!authHeader,
            hasToken: !!microsoftToken?.accessToken,
            userId,
            userEmail,
          });
        }

        if (microsoftToken?.accessToken) {
          try {
            // Send email via Microsoft Graph API
            const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${microsoftToken.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: {
                  subject: subject,
                  body: {
                    contentType: "Text",
                    content: body,
                  },
                  toRecipients: [
                    {
                      emailAddress: {
                        address: userEmail,
                      },
                    },
                  ],
                },
              }),
            });

            if (graphResponse.ok) {
              console.log("Microsoft Graph API success:", { userEmail });
              return {
                invocation,
                result: {
                  type: "text",
                  content: `✅ Test email sent successfully via Outlook to ${userEmail}!\n\nSubject: ${subject}\nBody: ${body.substring(0, 200)}${body.length > 200 ? '...' : ''}\n\nCheck your inbox!`,
                },
                timestamp: new Date().toISOString(),
                latencyMs: Math.round(performance.now() - startedAt),
              };
            } else {
              const errorData = await graphResponse.json().catch(() => ({}));
              console.error("Microsoft Graph API failed:", {
                status: graphResponse.status,
                statusText: graphResponse.statusText,
                error: errorData,
                userEmail,
              });
              return {
                invocation,
                result: {
                  type: "error",
                  message: `Outlook API failed: ${errorData.error?.message || graphResponse.statusText || 'Unknown error'}`,
                  details: {
                    explanation: "Could not send email via Microsoft Graph API.",
                    possibleCauses: [
                      "You haven't signed in with Microsoft/Azure OAuth",
                      "You haven't granted Mail.Send permissions",
                      "Your Microsoft OAuth token has expired",
                      "Microsoft Graph API permissions not configured",
                    ],
                    userEmail: userEmail,
                    instructions: "1. Sign in with Microsoft/Azure OAuth\n2. Grant Mail.Send permissions\n3. Check Supabase Edge Function logs for more details",
                  },
                },
                timestamp: new Date().toISOString(),
                latencyMs: Math.round(performance.now() - startedAt),
              };
            }
          } catch (outlookError) {
            console.error("Outlook API exception:", outlookError);
            return {
              invocation,
              result: {
                type: "error",
                message: `Outlook API error: ${outlookError instanceof Error ? outlookError.message : String(outlookError)}`,
                details: {
                  explanation: "An exception occurred while trying to send email via Microsoft Graph API.",
                  userEmail: userEmail,
                },
              },
              timestamp: new Date().toISOString(),
              latencyMs: Math.round(performance.now() - startedAt),
            };
          }
        } else {
          return {
            invocation,
            result: {
              type: "error",
              message: "Outlook OAuth tokens not available",
              details: {
                explanation: "To send emails via Outlook, you need to sign in with Microsoft/Azure OAuth and grant Mail.Send permissions.",
                steps: [
                  "1. Sign out completely from the app",
                  "2. Sign back in using 'Sign in with Microsoft' (if available)",
                  "3. Grant Mail.Send permissions when prompted",
                  "4. The system will automatically capture and store your OAuth tokens",
                  "5. Try sending email again",
                ],
                userEmail: userEmail,
                note: "Microsoft/Azure OAuth provider must be configured in Supabase Authentication settings.",
              },
            },
            timestamp: new Date().toISOString(),
            latencyMs: Math.round(performance.now() - startedAt),
          };
        }
      } else if (provider === "icloud") {
        // iCloud doesn't have a standard OAuth API for sending emails
        // We would need to use IMAP/SMTP with app-specific passwords
        // For now, return an informative error
        return {
          invocation,
          result: {
            type: "error",
            message: "iCloud email sending not yet fully implemented",
            details: {
              explanation: "iCloud doesn't provide a standard OAuth API for sending emails. Implementation options:",
              options: [
                "1. Use IMAP/SMTP with app-specific passwords (requires user to set up)",
                "2. Use Apple's Mail API (requires Apple Developer account and special setup)",
                "3. Use a third-party email service that supports iCloud",
              ],
              userEmail: userEmail,
              note: "For now, please use Gmail or Outlook for email sending. iCloud support is planned for a future update.",
            },
          },
          timestamp: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      } else {
        // Unknown provider
        return {
          invocation,
          result: {
            type: "error",
            message: `Unknown email provider: ${provider}`,
            details: {
              explanation: `The provider "${provider}" is not supported.`,
              supportedProviders: ["gmail", "outlook", "icloud"],
              userEmail: userEmail,
            },
          },
          timestamp: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      }
    }

    return {
      invocation,
      result: {
        type: "error",
        message: `Unknown email command: ${rawCommand}. Supported commands: send_test_email`,
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    console.error("Email handler error:", error);
    return {
      invocation,
      result: {
        type: "error",
        message: error instanceof Error ? error.message : "Failed to send email",
      },
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
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
    return new Response(encoder.encode("Not Found"), {
      status: 404,
      headers: corsHeaders,
    });
  }

  let invocation: McpInvocation;
  try {
    invocation = await req.json();
  } catch (error) {
    console.error("Invalid JSON payload:", error);
    return respondWithError(400, "Invalid JSON body", origin);
  }

  if (!invocation?.serverId || !invocation.serverId.trim()) {
    return respondWithError(400, "Missing serverId", origin);
  }

  const rawServerId = invocation.serverId;
  const normalizedServerId = rawServerId.trim().toLowerCase();

  // Helper function to create authentication required error response
  function createAuthRequiredResponse(invocation: McpInvocation, reason: string): McpInvocationResponse {
    return {
      invocation,
      result: {
        type: "error",
        message: "Authentication Required",
        details: {
          reason: reason,
          explanation: "This feature requires you to be logged in to access your personal data and settings.",
          whatIsSaved: {
            apiKeys: "Your API keys are encrypted and stored securely. Only you can access them.",
            preferences: "Your preferences (model selection, response style, etc.) are saved across sessions.",
            conversationHistory: "Your conversation history is saved so the AI can remember context.",
            memories: "The AI remembers important facts and preferences you've shared.",
            mcpServers: "Your registered MCP servers and configurations are saved per-user.",
          },
          howToLogin: {
            step1: "Click the 'Sign in' button in the top right corner of the page",
            step2: "Sign in with Google, GitHub, or email",
            step3: "Once logged in, you can use all features including API key management",
          },
          benefits: [
            "Secure storage of your API keys",
            "Personalized AI responses based on your preferences",
            "Conversation history and context memory",
            "Access to user-specific MCP servers",
            "Cross-device synchronization",
          ],
        },
      },
      timestamp: new Date().toISOString(),
      latencyMs: 0,
    };
  }

  // Try to get authenticated user (required for email sending)
  let userId: string | undefined;
  let userEmail: string | undefined;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    try {
      const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const accessToken = authHeader.replace(/Bearer\s+/i, "").trim();
        const { data: { user }, error: getUserError } = await supabase.auth.getUser(accessToken);
        if (getUserError) {
          console.error("[MCP] Error getting user from token:", getUserError.message);
        }
        if (user) {
          userId = user.id;
          userEmail = user.email || undefined;
          console.log("[MCP] User extracted:", { userId, userEmail: userEmail ? `${userEmail.substring(0, 5)}...` : "none" });
        } else {
          console.warn("[MCP] No user found from auth token");
        }
      } else {
        console.warn("[MCP] Missing SUPABASE_URL or SERVICE_ROLE_KEY for user lookup");
      }
    } catch (error) {
      console.error("[MCP] Exception getting user from auth header:", error);
    }
  } else {
    console.warn("[MCP] No Authorization header provided");
  }

  try {
    if (normalizedServerId === "alphavantage-mcp") {
      const response = await handleAlphaVantage(invocation, userId);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalizedServerId === "polymarket-mcp") {
      const response = await handlePolymarket(invocation);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalizedServerId === "gemini-mcp") {
      const response = await handleGemini(invocation);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalizedServerId === "grokipedia-mcp") {
      const response = await handleGrokipedia(invocation);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalizedServerId === "canva-mcp") {
      const response = await handleCanva(invocation, userId);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalizedServerId === "search-mcp") {
      const response = await handleSearch(invocation);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalizedServerId === "google-places-mcp") {
      const response = await handleGooglePlaces(invocation, userId);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalizedServerId === "email-mcp") {
      const response = await handleEmail(invocation, userId, userEmail, authHeader);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (normalizedServerId === "playwright-wrapper") {
      // Forward to playwright-wrapper edge function
      const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
      if (!PROJECT_URL) {
        return respondWithError(500, "PROJECT_URL not configured", origin);
      }
      
      const playwrightUrl = `${PROJECT_URL.replace(/\/+$/, "")}/functions/v1/playwright-wrapper`;
      
      try {
        const playwrightResponse = await fetch(playwrightUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { "Authorization": authHeader } : {}),
          },
          body: JSON.stringify({
            command: invocation.command,
            args: invocation.args,
            positionalArgs: invocation.positionalArgs,
          }),
        });

        if (!playwrightResponse.ok) {
          const errorText = await playwrightResponse.text().catch(() => "Unknown error");
          return respondWithError(playwrightResponse.status, `Playwright wrapper error: ${errorText}`, origin);
        }

        const playwrightData = await playwrightResponse.json();
        
        // Format response to match MCP gateway format
        const response: McpInvocationResponse = {
          invocation,
          result: playwrightData.result || {
            type: "error",
            message: "No result from playwright-wrapper",
          },
          timestamp: playwrightData.timestamp || new Date().toISOString(),
          latencyMs: playwrightData.latencyMs,
          raw: playwrightData,
        };

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Playwright wrapper proxy error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return respondWithError(500, `Failed to proxy to playwright-wrapper: ${message}`, origin);
      }
    }

    return respondWithError(400, `Unsupported MCP server: ${rawServerId}`, origin);
  } catch (error) {
    console.error("MCP handler error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return respondWithError(500, message, origin);
  }
});

