import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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
    // Provide a more helpful error message with search suggestion
    const searchTerm = marketId.replace(/[-_]/g, " ").replace(/\s+/g, "+");
    const searchUrl = `https://polymarket.com/search?q=${encodeURIComponent(marketId.replace(/[-_]/g, " "))}`;
    
    const errorMsg = errors.length
      ? `Polymarket market "${marketId}" was not found. The market ID must match the exact slug from Polymarket.com. ` +
        `Tried variations: ${errors.slice(0, 3).map(e => e.split('→')[0].trim()).join(', ')}. ` +
        `To find the correct market, try searching on Polymarket.com or use browser automation to navigate to: ${searchUrl}`
      : `Polymarket market "${marketId}" was not found. Please verify the market ID matches the exact slug from Polymarket.com. ` +
        `You can search for markets at: ${searchUrl}`;
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

type QuoteProvider = "alphavantage-daily" | "alphavantage-global" | "twelvedata";

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

async function fetchTwelveDataQuote(symbol: string): Promise<StockInsights> {
  const apiKey = Deno.env.get("TWELVEDATA_API_KEY");
  if (!apiKey) {
    throw new Error("TWELVEDATA_API_KEY is not configured.");
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

async function handleAlphaVantage(invocation: McpInvocation): Promise<McpInvocationResponse> {
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
      const twelveKey = Deno.env.get("TWELVEDATA_API_KEY");
      if (!twelveKey) {
        errors.push("TWELVEDATA_API_KEY is not configured.");
      } else {
        try {
          stock = await fetchTwelveDataQuote(symbol);
          provider = "twelvedata";
        } catch (error) {
          errors.push(`[Twelve Data] ${(error as Error)?.message ?? String(error)}`);
        }
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
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const args = invocation.args ?? {};
  const command = invocation.command ?? "generate_text";

  if (command !== "generate_text") {
    return {
      invocation,
      result: {
        type: "error",
        message: `Unsupported Gemini command: ${command}`,
      },
      timestamp: new Date().toISOString(),
    };
  }

  const prompt = args.prompt ?? invocation.positionalArgs?.[0];
  if (!prompt) {
    return {
      invocation,
      result: {
        type: "error",
        message: "Missing required parameter: prompt",
      },
      timestamp: new Date().toISOString(),
    };
  }

  const model = args.model ?? invocation.positionalArgs?.[1] ?? "gemini-1.5-flash";
  const temperature = parseOptionalNumber(args.temperature, 0, 1);
  const maxOutputTokens = parseOptionalNumber(args.max_output_tokens, 1, 8192);
  const systemInstruction = args.system?.trim();

  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  url.searchParams.set("key", apiKey);

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
  if (systemInstruction) {
    body.systemInstruction = {
      role: "system",
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text = extractGeminiText(payload);

  if (!text) {
    throw new Error("Gemini response did not include any text candidates.");
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

  if (!invocation?.serverId) {
    return respondWithError(400, "Missing serverId", origin);
  }

  try {
    if (invocation.serverId === "alphavantage-mcp") {
      const response = await handleAlphaVantage(invocation);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invocation.serverId === "polymarket-mcp") {
      const response = await handlePolymarket(invocation);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invocation.serverId === "gemini-mcp") {
      const response = await handleGemini(invocation);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return respondWithError(400, `Unsupported MCP server: ${invocation.serverId}`, origin);
  } catch (error) {
    console.error("MCP handler error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return respondWithError(500, message, origin);
  }
});

