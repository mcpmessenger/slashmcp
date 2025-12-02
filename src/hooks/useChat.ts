import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Session } from "@supabase/supabase-js";
import type { StockInsights } from "@/lib/alphaVantage";
import { generateImages } from "@/lib/api";
import { parseMcpCommand } from "@/lib/mcp/parser";
import {
  invokeMcpCommand,
  isTextualResult,
  isErrorResult,
  McpClientNotConfiguredError,
} from "@/lib/mcp/client";
import { listMcpServers, registerMcpServer, removeMcpServer } from "@/lib/mcp/registryClient";
import type { RegisterMcpServerPayload } from "@/lib/mcp/registryClient";
import { findProviderPreset, MCP_PROVIDER_PRESETS, MCP_PROVIDER_COMMANDS } from "@/lib/mcp/presets";
import type { McpInvocation, McpInvocationResult, McpRegistryEntry } from "@/lib/mcp/types";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  addApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  deleteApiKey,
  getAuditLogs,
  getStaleKeys,
  checkApiKey,
} from "@/lib/keyManager";
import type { McpEvent } from "@/components/McpEventLog";

export type Provider = "openai" | "anthropic" | "gemini";

const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI (GPT-4o Mini)",
  anthropic: "Anthropic (Claude 3 Haiku)",
  gemini: "Google Gemini 1.5 Flash",
};

export const PROVIDER_OPTIONS: Array<{ value: Provider; label: string }> = Object.entries(PROVIDER_LABEL).map(
  ([value, label]) => ({
    value: value as Provider,
    label,
  }),
);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PROJECT_REF =
  SUPABASE_URL?.replace("https://", "")?.split(".supabase.co")?.[0]?.split(".")[0] ?? null;
const SUPABASE_STORAGE_KEY = SUPABASE_PROJECT_REF ? `sb-${SUPABASE_PROJECT_REF}-auth-token` : null;
const CUSTOM_SUPABASE_SESSION_KEY = SUPABASE_PROJECT_REF ? `slashmcp-session-${SUPABASE_PROJECT_REF}` : null;

const persistSessionToStorage = (session: Session | null) => {
  if (typeof window === "undefined" || !CUSTOM_SUPABASE_SESSION_KEY) return;
  try {
    if (!session) {
      window.localStorage.removeItem(CUSTOM_SUPABASE_SESSION_KEY);
      return;
    }
    const serializableSession = {
      ...session,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
      provider_token: (session as any).provider_token,
      provider_refresh_token: (session as any).provider_refresh_token,
    };
    window.localStorage.setItem(CUSTOM_SUPABASE_SESSION_KEY, JSON.stringify(serializableSession));
  } catch (error) {
    console.warn("Failed to persist Supabase session", error);
  }
};

const getStoredSupabaseSession = (): Session | null => {
  if (typeof window === "undefined" || !SUPABASE_STORAGE_KEY) return null;
  try {
    const raw = window.localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const session = parsed?.currentSession ?? parsed?.session ?? null;
      if (session) {
        return session;
      }
    }
  } catch (error) {
    console.warn("Unable to parse stored Supabase session", error);
  }
  if (typeof window === "undefined" || !CUSTOM_SUPABASE_SESSION_KEY) return null;
  try {
    const fallbackRaw = window.localStorage.getItem(CUSTOM_SUPABASE_SESSION_KEY);
    if (!fallbackRaw) return null;
    return JSON.parse(fallbackRaw);
  } catch (error) {
    console.warn("Unable to parse fallback Supabase session", error);
    return null;
  }
  return null;
};


type BaseMessage = {
  role: "user" | "assistant";
  type: "text" | "stock" | "image";
  content: string;
};

type StockMessage = BaseMessage & {
  role: "assistant";
  type: "stock";
  stock: StockInsights;
};

type TextMessage = BaseMessage & {
  type: "text";
};

type ImageMessage = BaseMessage & {
  role: "assistant";
  type: "image";
  images: Array<{
    base64: string;
    mimeType: string;
    width?: number | null;
    height?: number | null;
    index?: number;
  }>;
  metadata?: {
    safetyRatings?: unknown[];
    finishReasons?: unknown[];
  };
};

export type Message = TextMessage | StockMessage | ImageMessage;

type ParsedStockCommand = {
  symbol: string;
  range?: "1M" | "3M" | "6M" | "1Y";
};

const STOCK_COMMAND_REGEX =
  /^\/?\s*(?:quote|stock|ticker)\s+([a-zA-Z.\-:]{1,10})(?:\s+(1m|3m|6m|1y))?\s*$/i;

const MODEL_COMMAND_REGEX = /^\/model\s+(openai|anthropic|gemini)\s*$/i;
const IMAGE_COMMAND_REGEX = /^\/imagine\s+(.+)/i;

const IMAGE_VERBS = ["create", "make", "generate", "draw", "paint", "design", "render", "illustrate", "produce"];
const IMAGE_NOUNS = ["image", "picture", "art", "illustration", "drawing", "rendering", "photo", "portrait", "scene", "visual"];

function extractImagePrompt(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  for (const pattern of [
    /^(?:please\s+)?(?:create|make|generate|draw|paint|design|render|illustrate)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|art|illustration|drawing|rendering|scene|visual)\s*(?:of|about)?\s*(.+)$/i,
    /^(?:could|can)\s+you\s+(?:create|make|generate|draw|paint|design|render)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|art|illustration|drawing|rendering|scene|visual)\s*(?:of|about)?\s*(.+)$/i,
  ]) {
    const match = pattern.exec(trimmed);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim();
    }
  }

  const lower = trimmed.toLowerCase();
  const hasVerb = IMAGE_VERBS.some(verb => lower.includes(verb));
  const hasNoun = IMAGE_NOUNS.some(noun => lower.includes(noun));
  if (hasVerb && hasNoun) {
    return trimmed;
  }
  return null;
}

const SLASH_MCP_PREFIX = "/slashmcp";

const SLASH_MCP_HELP = `Usage:
/slashmcp list
/slashmcp add <name> <https://gateway-url> [auth=none|api_key|oauth] [key=TOKEN] [header=Header-Name]
/slashmcp add <provider> [name=CustomName] [key=TOKEN]
/slashmcp remove <name|serverId>
/slashmcp login email=user@example.com password=secret

Available providers:
${Object.values(MCP_PROVIDER_PRESETS)
  .map(preset => `• ${preset.id} — ${preset.description ?? preset.label}`)
  .join("\n")}

Provider shortcuts:
${MCP_PROVIDER_COMMANDS.join("  ")}`;

const KEY_COMMAND_PREFIX = "/key";

const KEY_COMMAND_HELP = `Key Manager Agent (KMA) - Secure API Key Management

Usage:
/key add <provider> <name> [type=api_key|mcp_key|oauth_token] [expires=YYYY-MM-DD] [scope=read-only]
/key list                    - List all your API keys
/key get <name|keyId>        - Get key details (use with caution - key value will be shown)
/key check <name|keyId>      - Check key status and permissions
/key update <keyId> [name=...] [expires=...] [scope=...] [is_active=true|false]
/key delete <name|keyId>     - Delete a key
/key audit                   - View audit logs
/key stale [days=90]         - Find keys not used in last N days

Examples:
/key add openai my-openai-key type=api_key scope=full-access
/key add anthropic claude-key type=api_key expires=2025-12-31
/key list
/key stale days=60
/key audit`;

type KeyCommand =
  | { kind: "help" }
  | { kind: "add"; provider: string; name: string; options: Record<string, string> }
  | { kind: "list" }
  | { kind: "get"; identifier: string }
  | { kind: "check"; identifier: string }
  | { kind: "update"; keyId: string; options: Record<string, string> }
  | { kind: "delete"; identifier: string }
  | { kind: "audit" }
  | { kind: "stale"; daysThreshold?: number }
  | { kind: "error"; message: string };

type SlashMcpCommand =
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "addCustom"; payload: RegisterMcpServerPayload }
  | { kind: "addPreset"; presetId: string; options: Record<string, string> }
  | { kind: "remove"; identifier: { serverId?: string; name?: string } }
  | { kind: "loginPrompt" }
  | { kind: "login"; email: string; password: string }
  | { kind: "error"; message: string };

const AUTH_REQUIRED_COMMANDS: Array<SlashMcpCommand["kind"]> = ["list", "addCustom", "addPreset", "remove"];

function commandRequiresSession(command: SlashMcpCommand): boolean {
  return AUTH_REQUIRED_COMMANDS.includes(command.kind);
}

function parseKeyValueOptions(tokens: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (const token of tokens) {
    const eqIndex = token.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = token.slice(0, eqIndex).toLowerCase();
    let value = token.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    options[key] = value;
  }
  return options;
}

function matchProviderShortcut(rawInput: string): SlashMcpCommand | null {
  const trimmed = rawInput.trim();
  if (!trimmed.startsWith("/")) return null;
  const [command, ...rest] = trimmed.split(/\s+/);
  const alias = command.slice(1).toLowerCase();
  const preset = findProviderPreset(alias);
  if (!preset) return null;

  const tokens = [...rest];
  let explicitName: string | undefined;
  if (tokens.length > 0 && !tokens[0].includes("=")) {
    explicitName = tokens.shift();
  }
  const options = parseKeyValueOptions(tokens);
  if (explicitName && !options.name) {
    options.name = explicitName;
  }
  return { kind: "addPreset", presetId: preset.id, options };
}

function normalizeAuthType(value: string | undefined, fallback: "none" | "api_key" | "oauth" = "none"): "none" | "api_key" | "oauth" {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "api_key" || normalized === "apikey") return "api_key";
  if (normalized === "oauth" || normalized === "oauth2") return "oauth";
  return "none";
}

function parseKeyCommand(rawInput: string): KeyCommand | null {
  const trimmed = rawInput.trim();
  if (!trimmed.toLowerCase().startsWith(KEY_COMMAND_PREFIX)) return null;

  const parts = trimmed.split(/\s+/);
  parts.shift(); // remove /key
  if (parts.length === 0) {
    return { kind: "help" };
  }

  const action = parts.shift()!.toLowerCase();
  switch (action) {
    case "help":
      return { kind: "help" };
    case "list":
      return { kind: "list" };
    case "add": {
      if (parts.length < 2) {
        return { kind: "error", message: "Usage: /key add <provider> <name> [options...]" };
      }
      const provider = parts.shift()!;
      const name = parts.shift()!;
      const options = parseKeyValueOptions(parts);
      return { kind: "add", provider, name, options };
    }
    case "get":
    case "check": {
      if (parts.length === 0) {
        return { kind: "error", message: `Usage: /key ${action} <name|keyId>` };
      }
      return { kind: action as "get" | "check", identifier: parts.join(" ") };
    }
    case "update": {
      if (parts.length === 0) {
        return { kind: "error", message: "Usage: /key update <keyId> [options...]" };
      }
      const keyId = parts.shift()!;
      const options = parseKeyValueOptions(parts);
      return { kind: "update", keyId, options };
    }
    case "delete": {
      if (parts.length === 0) {
        return { kind: "error", message: "Usage: /key delete <name|keyId>" };
      }
      return { kind: "delete", identifier: parts.join(" ") };
    }
    case "audit":
      return { kind: "audit" };
    case "stale": {
      const options = parseKeyValueOptions(parts);
      const days = options.days ? parseInt(options.days, 10) : undefined;
      return { kind: "stale", daysThreshold: days || 90 };
    }
    default:
      return { kind: "error", message: `Unknown /key command: ${action}` };
  }
}

function parseSlashMcpCommand(rawInput: string): SlashMcpCommand | null {
  const trimmed = rawInput.trim();
  if (!trimmed.toLowerCase().startsWith(SLASH_MCP_PREFIX)) return null;

  const parts = trimmed.split(/\s+/);
  parts.shift(); // remove /slashmcp
  if (parts.length === 0) {
    return { kind: "help" };
  }

  const action = parts.shift()!.toLowerCase();
  switch (action) {
    case "help":
      return { kind: "help" };
    case "list":
      return { kind: "list" };
    case "add": {
      if (parts.length === 0) {
        return { kind: "error", message: "Usage: /slashmcp add <name> <https://gateway-url> [...]" };
      }
      const target = parts.shift()!;
      const preset = findProviderPreset(target.toLowerCase());

      if (parts.length === 0 && preset) {
        return { kind: "addPreset", presetId: preset.id, options: {} };
      }

      let url: string | undefined;
      const optionTokens: string[] = [];
      for (const token of parts) {
        if (!url && /^https?:\/\//i.test(token)) {
          url = token;
        } else {
          optionTokens.push(token);
        }
      }
      const options = parseKeyValueOptions(optionTokens);
      if (!url && options.url) {
        url = options.url;
        delete options.url;
      }
      if (!url && preset?.gatewayUrl) {
        url = preset.gatewayUrl;
      }
      if (!url) {
        return { kind: "error", message: "Missing gateway URL. Provide an https:// URL or use url=..." };
      }

      const authType = normalizeAuthType(options.auth, preset?.authType ?? "none");
      const authSecret = options.key ?? options.secret ?? null;
      const headerKey = options.header ?? options.authheader ?? undefined;
      const name = options.name ?? target;

      const metadata: Record<string, unknown> | null = headerKey
        ? { ...(preset?.metadata ?? {}), authHeaderKey: headerKey }
        : preset?.metadata ?? null;

      return {
        kind: "addCustom",
        payload: {
          name,
          gatewayUrl: url,
          authType,
          authSecret,
          metadata,
        },
      };
    }
    case "login": {
      if (parts.length === 0) {
        return { kind: "loginPrompt" };
      }
      const options = parseKeyValueOptions(parts);
      const email = options.email ?? options.user ?? options.username;
      const password = options.password ?? options.pass;
      if (!email || !password) {
        return { kind: "error", message: "Usage: /slashmcp login email=user@example.com password=secret" };
      }
      return { kind: "login", email, password };
    }
    case "remove": {
      if (parts.length === 0) {
        return { kind: "error", message: "Usage: /slashmcp remove <name|serverId>" };
      }
      const first = parts.shift()!;
      const options = parseKeyValueOptions(parts);
      let serverId: string | undefined;
      let name: string | undefined;

      if (first.startsWith("srv_")) {
        serverId = first;
      } else {
        name = first;
      }

      if (options.id) serverId = options.id;
      if (options.name) name = options.name;

      if (!serverId && !name) {
        return { kind: "error", message: "Provide a server name or id" };
      }

      return { kind: "remove", identifier: { serverId, name } };
    }
    default:
      return { kind: "error", message: `Unknown /slashmcp command: ${action}` };
  }
}

const COMPANY_TICKERS: Record<string, string> = {
  tesla: "TSLA",
  "tesla inc": "TSLA",
  apple: "AAPL",
  "apple inc": "AAPL",
  microsoft: "MSFT",
  "microsoft corp": "MSFT",
  alphabet: "GOOGL",
  google: "GOOGL",
  amazon: "AMZN",
  "amazon.com": "AMZN",
  nvidia: "NVDA",
  meta: "META",
  "meta platforms": "META",
};

const TICKER_STOP_WORDS = new Set([
  // Question words
  "WHAT",
  "WHATS",
  "WHAT'S",
  "HOW",
  "WHEN",
  "WHERE",
  "WHY",
  "WHO",
  "WHICH",
  // Common verbs
  "IS",
  "ARE",
  "WAS",
  "WERE",
  "BE",
  "BEEN",
  "BEING",
  "HAVE",
  "HAS",
  "HAD",
  "DO",
  "DOES",
  "DID",
  "WILL",
  "WOULD",
  "CAN",
  "COULD",
  "SHOULD",
  "MAY",
  "MIGHT",
  "MUST",
  "SHALL",
  // Articles and determiners
  "A",
  "AN",
  "THE",
  "THIS",
  "THAT",
  "THESE",
  "THOSE",
  // Prepositions
  "FOR",
  "AND",
  "OR",
  "BUT",
  "WITH",
  "ABOUT",
  "INTO",
  "THROUGH",
  "DURING",
  "INCLUDING",
  "AGAINST",
  "AMONG",
  "THROUGHOUT",
  "DESPITE",
  "TOWARDS",
  "UPON",
  "CONCERNING",
  "TO",
  "OF",
  "IN",
  "ON",
  "AT",
  "BY",
  "FROM",
  "UP",
  // Common request words
  "SHOW",
  "PLEASE",
  "TELL",
  "PRICE",
  "STOCK",
  "QUOTE",
  "FOR",
  "THE",
  "ME",
  "OF",
  "A",
  "AN",
  "AT",
  "IS",
  "TODAY",
  "CURRENT",
  "CAN",
  "YOU",
  "HOW",
  "S",
  "POLYMARKET",
  "POLYMKT",
  "POLLY",
  "MARKET",
  "ODDS",
  "ELECTION",
]);

const POLYMARKET_KEYWORDS = [
  "polymarket",
  "paulymarket",
  "pauly market",
  "pollymarket",
  "polly market",
  "pauli market",
  "poly market",
  "prediction market",
];
const POLYMARKET_INTENT_MARKERS = [
  "about",
  "on",
  "for",
  "regarding",
  "if",
  "whether",
  "odds",
  "probability",
  "chance",
  "chances",
  "odds on",
  "odds of",
  "regards",
  "re:",
];
const POLYMARKET_SLUG_ALIASES: Record<string, string> = {
  "election-odds-2024": "us-election-2024",
  "polymarket-election-odds-2024": "us-election-2024",
  "pauly-market-election-odds-2024": "us-election-2024",
  "polly-market-election-odds-2024": "us-election-2024",
  "pauli-market-election-odds-2024": "us-election-2024",
  "poly-market-election-odds-2024": "us-election-2024",
  "paul-market-election-odds-2024": "us-election-2024",
  "hawley-market-election-odds-2024": "us-election-2024",
  "us-election-odds-2024": "us-election-2024",
  "us-election-2024-odds": "us-election-2024",
  "us-election-2024": "us-election-2024",
  "us-presidential-election-2024": "us-election-2024",
  "presidential-election-2024": "us-election-2024",
};

const ELECTION_ODDS_MARKERS = ["who will win", "odds", "chances", "probability", "win the", "win in"];

function formatStockSummary(stock: StockInsights): string {
  const currency = stock.currency ? ` ${stock.currency}` : "";
  const change = `${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}`;
  const changePercent = `${stock.changePercent >= 0 ? "+" : ""}${stock.changePercent.toFixed(2)}%`;
  return `${stock.symbol} ${stock.price.toFixed(2)}${currency} (${change}, ${changePercent})`.trim();
}

function formatMcpResult(result: McpInvocationResult): string {
  if (isTextualResult(result)) {
    return result.content;
  }

  if (isErrorResult(result)) {
    return result.message;
  }

  if (result.type === "json") {
    try {
      const dataStr = JSON.stringify(result.data, null, 2);
      // For search results, format them nicely
      if (result.data && typeof result.data === "object" && "results" in result.data) {
        const searchData = result.data as { query?: string; maxResults?: number; results?: Array<{ title: string; url: string; snippet: string }> };
        const results = searchData.results ?? [];
        if (results.length > 0) {
          const lines = results.map((r, i) => {
            return `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`;
          });
          const header = result.summary ? `${result.summary}\n\n` : "";
          return `${header}${lines.join("\n\n")}`;
        }
      }
      // For other JSON, show summary if available, otherwise show formatted JSON
      if (result.summary) {
        return `${result.summary}\n\n\`\`\`json\n${dataStr}\n\`\`\``;
      }
      return `\`\`\`json\n${dataStr}\n\`\`\``;
    } catch {
      return result.summary || "Received JSON response from MCP command.";
    }
  }

  if (result.type === "table") {
    const header = result.columns.join(" | ");
    const divider = result.columns.map(() => "---").join(" | ");
    const rows = result.rows.map(row => row.join(" | ")).join("\n");
    const summary = result.summary ? `\n\n${result.summary}` : "";
    return `${header}\n${divider}\n${rows}${summary}`;
  }

  if (result.type === "binary") {
    const metadata = [
      result.filename ? `File: ${result.filename}` : null,
      `Content-Type: ${result.contentType}`,
      result.note ?? null,
    ]
      .filter(Boolean)
      .join("\n");
    return metadata || "Binary content returned from MCP command.";
  }

  return "Command executed.";
}

function extractStockFromResult(result: McpInvocationResult): StockInsights | null {
  if (result.type !== "json") return null;
  const data = result.data;
  if (!data || typeof data !== "object") return null;
  const stockCandidate = (data as Record<string, unknown>).stock;
  if (!stockCandidate || typeof stockCandidate !== "object") return null;
  const stock = stockCandidate as Record<string, unknown>;
  if (
    typeof stock.symbol !== "string" ||
    typeof stock.price !== "number" ||
    typeof stock.previousClose !== "number" ||
    typeof stock.change !== "number" ||
    typeof stock.changePercent !== "number" ||
    typeof stock.open !== "number" ||
    typeof stock.high !== "number" ||
    typeof stock.low !== "number" ||
    typeof stock.range !== "string" ||
    !Array.isArray(stock.chart)
  ) {
    return null;
  }
  return stockCandidate as StockInsights;
}

function parseStockCommand(rawInput: string): ParsedStockCommand | null {
  const match = rawInput.trim().match(STOCK_COMMAND_REGEX);
  if (!match) return null;
  const [, symbol, rawRange] = match;
  const normalizedRange = rawRange?.toUpperCase() as ParsedStockCommand["range"] | undefined;
  return {
    symbol: symbol.toUpperCase(),
    range: normalizedRange,
  };
}

function parseModelCommand(rawInput: string): Provider | null {
  const match = rawInput.trim().match(MODEL_COMMAND_REGEX);
  if (!match) return null;
  return match[1].toLowerCase() as Provider;
}

function detectRangeFromText(rawInput: string): ParsedStockCommand["range"] | undefined {
  const text = rawInput.toLowerCase();
  if (/\b(1m|one month|1 month|30 days|thirty days)\b/.test(text)) return "1M";
  if (/\b(3m|three months|3 months|90 days|ninety days)\b/.test(text)) return "3M";
  if (/\b(6m|six months|6 months|180 days|six-month)\b/.test(text)) return "6M";
  if (/\b(1y|one year|1 year|12 months|twelve months|a year)\b/.test(text)) return "1Y";
  return undefined;
}

const STOCK_INTENT_KEYWORDS = [
  "stock",
  "stocks",
  "shares",
  "share",
  "price",
  "quote",
  "ticker",
  "trading",
  "trade",
  "market",
  "worth",
  "value",
];

// Stronger indicators that the user is explicitly asking about a stock,
// not just mentioning prices or markets in a general/e‑commerce context.
const STRONG_STOCK_INTENT_KEYWORDS = [
  "stock",
  "stocks",
  "stock price",
  "share price",
  "stock quote",
  "ticker",
  "stock ticker",
  "share",
  "shares",
];

function extractTickerFromTokens(tokens: string[]): string | null {
  for (const token of tokens) {
    if (!token) continue;
    const cleaned = token.replace(/'s$/i, "").replace(/[^a-zA-Z0-9.\-:]/g, "");
    if (!cleaned) continue;
    const upper = cleaned.toUpperCase();
    if (upper.length < 1 || upper.length > 5) continue;
    if (TICKER_STOP_WORDS.has(upper)) continue;
    if (/^[A-Z]{1,5}$/.test(upper)) {
      return upper;
    }
  }
  return null;
}

function extractTickerFromText(rawInput: string): string | null {
  const lower = rawInput.toLowerCase();
  
  // First, check for company names (before token extraction to avoid false positives)
  for (const [company, ticker] of Object.entries(COMPANY_TICKERS)) {
    if (lower.includes(company)) {
      return ticker;
    }
  }

  // Then try to extract from tokens (but filter out common words)
  const tokens = rawInput.split(/[\s,!?]+/);
  const tickerFromTokens = extractTickerFromTokens(tokens);
  if (tickerFromTokens) return tickerFromTokens;

  // Try pattern matching for "what/for/about [company]" format
  const match = lower.match(/\b(?:what|whats|what's|for|about|on|the)\s+(?:price|price\s+of|stock|stock\s+of|trading\s+at)?\s*([a-z]{1,15})\b/);
  if (match?.[1]) {
    const candidate = match[1];
    const ticker = COMPANY_TICKERS[candidate];
    if (ticker) return ticker;
  }

  return null;
}

function parseNaturalLanguageStockRequest(rawInput: string): ParsedStockCommand | null {
  const lower = rawInput.toLowerCase();
  if (POLYMARKET_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return null;
  }

  // Avoid treating long, complex instructions (e.g. agent workflows, e‑commerce
  // price comparison tasks) as stock lookups unless there is a *strong* stock signal.
  const trimmed = rawInput.trim();
  if (trimmed.length > 220) {
    return null;
  }

  const hasStrongStockIntent = STRONG_STOCK_INTENT_KEYWORDS.some(keyword => lower.includes(keyword));
  const hasStockIntent = hasStrongStockIntent || STOCK_INTENT_KEYWORDS.some(keyword => lower.includes(keyword));

  // Require at least one strong stock keyword so phrases like "Amazon prices"
  // don't accidentally trigger the stock widget instead of normal agent mode.
  if (!hasStockIntent || !hasStrongStockIntent) {
    return null;
  }

  let symbol = extractTickerFromText(rawInput);
  if (!symbol) {
    const upperTokens = rawInput
      .split(/[\s,!?]+/)
      .map(token => token.replace(/'s$/i, "").replace(/[^a-zA-Z0-9.\-:]/g, ""))
      .filter(Boolean);
    symbol = extractTickerFromTokens(upperTokens) ?? null;
  }

  if (!symbol) {
    const fallback = rawInput.match(/\b([A-Z]{1,5})\b/);
    if (fallback) {
      const candidate = fallback[1].toUpperCase();
      if (!TICKER_STOP_WORDS.has(candidate)) {
        symbol = candidate;
      }
    }
  }

  if (!symbol) {
    return null;
  }

  const range = detectRangeFromText(rawInput);
  return {
    symbol,
    range,
  };
}

function slugifyPolymarketPhrase(phrase: string): string | null {
  const cleaned = phrase
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned.length >= 3 ? cleaned : null;
}

function extractPolymarketQuery(rawInput: string): string | null {
  const lower = rawInput.toLowerCase();
  if (!POLYMARKET_KEYWORDS.some(keyword => lower.includes(keyword))) return null;

  const normalized = rawInput
    .replace(/p[oa]u+l+y\s*market/gi, "polymarket")
    .replace(/poly\s*market/gi, "polymarket")
    .replace(/polly\s*market/gi, "polymarket");

  const markerRegex = new RegExp(
    `(?:${POLYMARKET_KEYWORDS.join("|")})(?:\\s+(?:${POLYMARKET_INTENT_MARKERS.join("|")}))?\\s+(.+)`,
    "i",
  );
  const match = normalized.match(markerRegex);
  if (match?.[1]) {
    return slugifyPolymarketPhrase(match[1]);
  }

  const stripped = normalized.replace(new RegExp(POLYMARKET_KEYWORDS.join("|"), "gi"), "");
  return slugifyPolymarketPhrase(stripped);
}

function parseNaturalLanguagePolymarketRequest(rawInput: string): { marketId: string } | null {
  const trimmed = rawInput.trim();
  if (trimmed.startsWith("/") || trimmed.includes("-mcp")) return null;
  const slug = extractPolymarketQuery(rawInput);
  if (!slug) return null;
  const normalized = POLYMARKET_SLUG_ALIASES[slug] ?? slug;
  return { marketId: normalized };
}

function parseElectionOddsIntent(rawInput: string): { marketId: string } | null {
  const lower = rawInput.toLowerCase();
  const hasElection = lower.includes("election") || lower.includes("presidential");
  const hasYear = /2024/.test(lower);
  const hasMarker = ELECTION_ODDS_MARKERS.some(marker => lower.includes(marker));
  if (hasElection && hasYear && hasMarker) {
    return { marketId: POLYMARKET_SLUG_ALIASES["us-election-2024"] ?? "us-election-2024" };
  }
  return null;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mcpEvents, setMcpEvents] = useState<McpEvent[]>([]);

  const appendAssistantText = useCallback((text: string) => {
    setMessages(prev => [...prev, { role: "assistant", type: "text", content: text }]);
  }, []);
  const resetChat = useCallback(() => {
    setMessages([]);
    setMcpEvents([]);
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai");
  const [registry, setRegistry] = useState<McpRegistryEntry[]>([]);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const updateSession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    persistSessionToStorage(nextSession);
  }, []);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const { toast } = useToast();
  
  // Safety mechanism: Reset isLoading if it's been stuck for too long
  useEffect(() => {
    if (!isLoading) return;
    
    const LOADING_TIMEOUT_MS = 60_000; // 60 seconds max loading time
    const timeoutId = setTimeout(() => {
      console.warn("[useChat] Loading state stuck for 60+ seconds, resetting...");
      setIsLoading(false);
      setMessages(prev => {
        // Remove the last "Thinking..." message if it exists
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content?.includes("Thinking")) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      toast({
        title: "Request Timeout",
        description: "The request timed out. The input has been re-enabled. Please try again.",
        variant: "destructive",
      });
    }, LOADING_TIMEOUT_MS);
    
    return () => clearTimeout(timeoutId);
  }, [isLoading, toast]);

  useEffect(() => {
    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Check if Supabase client is properly initialized
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables:", {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
      });
      setAuthReady(true);
      updateSession(null);
      return;
    }

    // Check for OAuth hash stored by index.html script
    const hasOAuthHash = typeof window !== "undefined" && 
      (window as any).oauthHash && 
      (window as any).oauthHash.includes("access_token");

    console.log("[Auth] Initializing auth check", { hasOAuthHash });

    // If no OAuth hash, try to restore session from localStorage first
    if (!hasOAuthHash) {
      console.log("[Auth] No OAuth hash - checking localStorage for session");
      
      // Don't restore session if we're in the middle of signing out (but allow OAuth)
      const isSigningOut = typeof window !== "undefined" && sessionStorage.getItem('signing-out');
      if (isSigningOut) {
        console.log("[Auth] Sign-out in progress, skipping session restoration");
        setAuthReady(true);
        updateSession(null);
        return;
      }
      
      // Check if OAuth just completed - if so, wait longer and check more aggressively
      const oauthJustCompleted = typeof window !== "undefined" && sessionStorage.getItem('oauth_just_completed') === 'true';
      if (oauthJustCompleted) {
        console.log("[Auth] OAuth just completed - waiting for session to be available...");
        setAuthReady(true); // Set immediately so UI doesn't block
        
        // Try multiple times with increasing delays to find the session
        let attempt = 0;
        const maxAttempts = 5;
        const checkSession = () => {
          if (isCancelled) return;
          attempt++;
          
          // Try localStorage first (fastest)
          const storedSession = getStoredSupabaseSession();
          if (storedSession) {
            console.log(`[Auth] Found session in localStorage after OAuth completion (attempt ${attempt})`);
            updateSession(storedSession);
            return;
          }
          
          // Then try getSession
          supabaseClient.auth
            .getSession()
            .then(({ data, error }) => {
              if (isCancelled) return;
              if (error) {
                console.warn(`[Auth] getSession error after OAuth completion (attempt ${attempt}):`, error);
                // Retry if we haven't exceeded max attempts
                if (attempt < maxAttempts) {
                  setTimeout(checkSession, 500 * attempt); // Exponential backoff
                } else {
                  console.warn("[Auth] Max attempts reached, will wait for onAuthStateChange");
                  // Don't set session to null - onAuthStateChange will handle it
                }
              } else if (data.session) {
                console.log(`[Auth] Session found via getSession after OAuth completion (attempt ${attempt})`);
                updateSession(data.session);
              } else {
                console.log(`[Auth] No session yet after OAuth completion (attempt ${attempt}/${maxAttempts})`);
                // Retry if we haven't exceeded max attempts
                if (attempt < maxAttempts) {
                  setTimeout(checkSession, 500 * attempt); // Exponential backoff
                } else {
                  console.log("[Auth] Max attempts reached, will wait for onAuthStateChange");
                  // Don't set session to null - onAuthStateChange will handle it
                }
              }
            })
            .catch((error) => {
              if (isCancelled) return;
              console.warn(`[Auth] getSession error after OAuth completion (attempt ${attempt}):`, error);
              // Retry if we haven't exceeded max attempts
              if (attempt < maxAttempts) {
                setTimeout(checkSession, 500 * attempt); // Exponential backoff
              }
            });
        };
        
        // Start checking immediately, then with delays
        checkSession();
        return;
      }
      
      // Try to restore session from localStorage directly (faster than getSession)
      const storedSession = getStoredSupabaseSession();
      if (storedSession) {
        console.log("[Auth] Found session in localStorage, restoring...");
        updateSession(storedSession);
        setAuthReady(true);
        
        // Verify with getSession in background (non-blocking)
        supabaseClient.auth
          .getSession()
          .then(({ data, error }) => {
            if (isCancelled) return;
            if (error) {
              console.warn("[Auth] getSession verification failed", error);
              // Keep the localStorage session if getSession fails
            } else if (data.session) {
              // Update with fresh session if available
              updateSession(data.session);
            }
          })
          .catch((error) => {
            if (isCancelled) return;
            console.warn("[Auth] getSession verification error", error);
            // Keep the localStorage session
          });
        return;
      }
      
      // No session in localStorage - set authReady and check getSession
      console.log("[Auth] No session in localStorage - setting authReady");
      setAuthReady(true);
      
      // Check for existing session in background (non-blocking)
      supabaseClient.auth
        .getSession()
        .then(({ data, error }) => {
          if (isCancelled) return;
          if (error) {
            console.warn("[Auth] Failed to fetch Supabase session", error);
            updateSession(null);
          } else if (data.session) {
            updateSession(data.session);
          } else {
            updateSession(null);
          }
        })
        .catch((error) => {
          if (isCancelled) return;
          console.error("[Auth] Supabase getSession error", error);
          updateSession(null);
        });
      return;
    }

    // We have an OAuth hash - let Supabase SDK handle it via onAuthStateChange
    // The hash is already stripped in index.html, so GoTrue won't see it
    // But Supabase will process it from the redirect and fire SIGNED_IN event
    // We just need to wait for onAuthStateChange to fire
    
    // Clear signing-out flag if present (OAuth means we're signing in, not out)
    if (sessionStorage.getItem('signing-out')) {
      console.log("[Auth] Clearing signing-out flag - OAuth redirect detected");
      sessionStorage.removeItem('signing-out');
    }

    // Clear the hash from window.oauthHash (already stripped from URL in index.html)
    if ((window as any).oauthHash) {
      delete (window as any).oauthHash;
    }

    // Set authReady immediately - onAuthStateChange will handle the session
    console.log("[Auth] OAuth redirect detected - waiting for onAuthStateChange");
    setAuthReady(true);
    
    // Check for session - Supabase should have processed it by now
    // If not, onAuthStateChange will fire when it does
    supabaseClient.auth
      .getSession()
      .then(({ data, error }) => {
        if (isCancelled) return;
        if (error) {
          console.warn("[Auth] getSession error after OAuth redirect", error);
          // Don't set session to null - onAuthStateChange might still fire
        } else if (data.session) {
          console.log("[Auth] Session found after OAuth redirect");
          updateSession(data.session);
        } else {
          console.log("[Auth] No session yet - waiting for onAuthStateChange");
          // Don't set to null - onAuthStateChange will handle it
        }
      })
      .catch((error) => {
        if (isCancelled) return;
        console.warn("[Auth] getSession error", error);
        // Don't set to null - onAuthStateChange will handle it
      });

    // Safety: Ensure authReady is always set, even if something goes wrong
    // This prevents the app from being stuck on loading screen
    const safetyTimeout = setTimeout(() => {
      if (!isCancelled) {
        console.warn("[Auth] Safety timeout - forcing authReady to true");
        setAuthReady(true);
      }
    }, 1000); // 1 second safety net

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      clearTimeout(safetyTimeout);
    };
  }, [updateSession]);

  useEffect(() => {
    let isSigningOut = false;
    
    const { data: listener } = supabaseClient.auth.onAuthStateChange(async (event, nextSession) => {
      // Ignore auth state changes if we're in the middle of signing out
      if (isSigningOut && event === "SIGNED_OUT") {
        console.log("[Auth] Ignoring SIGNED_OUT event during signOut process");
        return;
      }
      
      // Always update session state based on auth state change
      updateSession(nextSession);
      
      // If OAuth just completed and we get a SIGNED_IN event, ensure authReady is set and session is updated
      const oauthJustCompleted = typeof window !== "undefined" && sessionStorage.getItem('oauth_just_completed') === 'true';
      if (oauthJustCompleted && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        console.log("[Auth] OAuth completion detected with SIGNED_IN/TOKEN_REFRESHED event");
        setAuthReady(true);
        // Session is already updated by updateSession(nextSession) above, but log it
        if (nextSession) {
          console.log("[Auth] Session restored via onAuthStateChange after OAuth completion");
        }
      }
      
      if (event === "SIGNED_OUT") {
        // Clear registry and login prompt on sign out
        setRegistry([]);
        setLoginPrompt(false);
        // Note: Don't clear localStorage here - let signOut function handle it
        // to avoid interfering with OAuth flow
        return;
      }
      if (event === "SIGNED_IN" && nextSession?.user) {
        setLoginPrompt(false);
        
        // Capture OAuth tokens after sign-in
        // This stores Google OAuth tokens (Gmail, Calendar, Drive) for later use
        try {
          const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
          if (currentSession?.access_token) {
            // Get provider tokens from localStorage (they're stored there by Supabase)
            const sessionKey = `sb-${import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`;
            const sessionData = typeof window !== 'undefined' ? localStorage.getItem(sessionKey) : null;
            const parsedSession = sessionData ? JSON.parse(sessionData) : null;
            
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(`${SUPABASE_URL}/functions/v1/capture-oauth-tokens`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${currentSession.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                provider_token: parsedSession?.provider_token,
                provider_refresh_token: parsedSession?.provider_refresh_token,
                expires_at: parsedSession?.expires_at,
                provider: parsedSession?.provider || "google", // Pass provider if available
              }),
            });
            
            if (response.ok) {
              const result = await response.json();
              console.log("[OAuth] Tokens captured:", result);
              if (result.stored > 0) {
                toast({
                  title: "OAuth tokens stored",
                  description: `Captured tokens for ${result.providers.join(", ")}`,
                });
              } else {
                console.warn("[OAuth] No tokens were stored. Check Supabase logs.");
              }
            } else {
              const errorText = await response.text();
              console.error("[OAuth] Failed to capture tokens:", errorText);
              toast({
                title: "Token capture failed",
                description: "OAuth tokens may not be available. Check browser console.",
                variant: "destructive",
              });
            }
          }
        } catch (error) {
          console.error("[OAuth] Error capturing tokens:", error);
          // Don't block sign-in if token capture fails
        }
      }
    });

    return () => {
      if (listener?.subscription) {
        listener.subscription.unsubscribe();
      }
    };
  }, [toast, updateSession]);

  useEffect(() => {
    let isMounted = true;
    if (!session) {
      setRegistry([]);
      return () => {
        isMounted = false;
      };
    }
    (async () => {
      try {
        const servers = await listMcpServers();
        if (isMounted) {
          setRegistry(servers);
        }
      } catch (error) {
        console.warn("Failed to load MCP registry", error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [session]);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") {
      toast({
        title: "Sign-in unavailable",
        description: "Google sign-in is only supported in the browser.",
        variant: "destructive",
      });
      return false;
    }

    if (isAuthLoading) {
      return false;
    }

    setIsAuthLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL || window.location.origin;
      // Remove trailing slash if present, then append /auth/callback
      const redirectTo = `${baseUrl.replace(/\/$/, '')}/auth/callback`;
      console.log("[OAuth] Redirect URL:", redirectTo);
      console.log("[OAuth] Window origin:", window.location.origin);
      console.log("[OAuth] Env var:", import.meta.env.VITE_SUPABASE_REDIRECT_URL);
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
            // Request Gmail and Calendar scopes
            scope: "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar",
          },
        },
      });
      if (error) {
        throw error;
      }
      return true;
    } catch (error) {
      console.error("Google sign-in failed", error);
      toast({
        title: "Google sign-in failed",
        description: error instanceof Error ? error.message : "Unable to start Google sign-in.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  }, [isAuthLoading, toast]);

  const signInWithMicrosoft = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") {
      toast({
        title: "Sign-in unavailable",
        description: "Microsoft sign-in is only supported in the browser.",
        variant: "destructive",
      });
      return false;
    }

    if (isAuthLoading) {
      return false;
    }

    setIsAuthLoading(true);
    try {
      const redirectTo = window.location.origin;
      console.log("[OAuth] Microsoft redirect URL:", redirectTo);
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo,
          queryParams: {
            // Request Mail.Send and Calendar scopes for Outlook
            scope: "openid email profile offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.ReadWrite",
          },
        },
      });
      if (error) {
        throw error;
      }
      return true;
    } catch (error) {
      console.error("Microsoft sign-in failed", error);
      toast({
        title: "Microsoft sign-in failed",
        description: error instanceof Error ? error.message : "Unable to start Microsoft sign-in.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  }, [isAuthLoading, toast]);

  const signOut = useCallback(async () => {
    console.log("[SignOut] Starting sign out process...");
    
    // Set a flag to prevent auth state change listener from restoring session
    if (typeof window !== "undefined") {
      sessionStorage.setItem('signing-out', 'true');
    }
    
    try {
      // 3. Reset local state FIRST to prevent UI from showing session
      updateSession(null);
      setGuestMode(false);
      setRegistry([]);
      setLoginPrompt(false);
      
      // 2. Clear custom local storage session
      persistSessionToStorage(null);
      if (typeof window !== "undefined") {
        // Clear all Supabase-related storage
        if (SUPABASE_STORAGE_KEY) {
          window.localStorage.removeItem(SUPABASE_STORAGE_KEY);
        }
        if (CUSTOM_SUPABASE_SESSION_KEY) {
          window.localStorage.removeItem(CUSTOM_SUPABASE_SESSION_KEY);
        }
        // Clear all Supabase auth tokens (they use project ref in key)
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.startsWith('sb-')) {
            console.log("[SignOut] Removing localStorage key:", key);
            localStorage.removeItem(key);
          }
        });
        if ((window as any).oauthHash) {
          delete (window as any).oauthHash;
        }
        // Also clear sessionStorage OAuth tracking
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('oauth_hash_processed_')) {
            sessionStorage.removeItem(key);
          }
        });
      }
      
      // 1. Call Supabase sign-out (after clearing local state)
      const { error } = await supabaseClient.auth.signOut();
      
      if (error) {
        console.error("[SignOut] Supabase sign-out failed:", error);
        toast({
          title: "Sign-out Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        console.log("[SignOut] Successfully signed out from Supabase");
        toast({
          title: "Signed out",
          description: "You have been successfully signed out.",
        });
        
        // Navigate to home page after successful sign-out to prevent session re-detection
        // Use setTimeout to allow toast to display briefly before navigation
        setTimeout(() => {
          if (typeof window !== "undefined") {
            window.location.href = "/";
          }
        }, 500);
        return; // Exit early to prevent further execution
      }
      
      // Clear the sign-out flag
      sessionStorage.removeItem('signing-out');
    } catch (error) {
      console.error("[SignOut] Sign-out error:", error);
      // Even if sign-out fails, ensure local state is cleared
      updateSession(null);
      setGuestMode(false);
      setRegistry([]);
      setLoginPrompt(false);
      persistSessionToStorage(null);
      if (typeof window !== "undefined") {
        // Clear all Supabase-related storage
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
        if ((window as any).oauthHash) {
          delete (window as any).oauthHash;
        }
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('oauth_hash_processed_')) {
            sessionStorage.removeItem(key);
          }
        });
      }
      toast({
        title: "Signed out",
        description: "You have been signed out locally.",
      });
      
      // Navigate to home page after sign-out (even on error)
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
      }, 500);
      
      // Clear the sign-out flag
      sessionStorage.removeItem('signing-out');
    }
  }, [toast, updateSession]);

  const runImageGeneration = useCallback(
    async (promptText: string) => {
      const trimmedPrompt = promptText.trim();
      if (!trimmedPrompt) {
        appendAssistantText("Image prompts must include a description. Try `/imagine a cozy cabin in the snow`.");
        return;
      }

      setIsLoading(true);
      try {
        const response = await generateImages({ prompt: trimmedPrompt });
        const images = response.images ?? [];

        if (images.length === 0) {
          appendAssistantText("Gemini did not return any images. Try refining your prompt.");
        } else {
          const imageMessage: ImageMessage = {
            role: "assistant",
            type: "image",
            content: response.prompt ?? trimmedPrompt,
            images: images.map(image => ({
              base64: image.base64,
              mimeType: image.mimeType,
              width: image.width ?? null,
              height: image.height ?? null,
              index: image.index,
            })),
            metadata: {
              safetyRatings: response.safetyRatings ?? undefined,
              finishReasons: response.finishReasons ?? undefined,
            },
          };
          setMessages(prev => [...prev, imageMessage]);
        }
      } catch (error) {
        console.error("Image generation failed", error);
        appendAssistantText(
          error instanceof Error
            ? `Image generation failed: ${error.message}`
            : "Image generation failed. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [appendAssistantText],
  );

  type DocumentContextReference = {
    jobId: string;
    fileName: string;
    textLength?: number;
  };

  const sendMessage = useCallback(async (input: string, documentContext?: DocumentContextReference[]) => {
    const userMsg: Message = { role: "user", type: "text", content: input };
    setMessages(prev => [...prev, userMsg]);

    const trimmedInput = input.trim();

    const imagineMatch = IMAGE_COMMAND_REGEX.exec(trimmedInput);
    if (imagineMatch) {
      const promptText = imagineMatch[1]?.trim() ?? "";
      await runImageGeneration(promptText);
      return;
    }

    // If this looks like a slash command that is NOT /imagine,
    // skip natural-language image detection so commands like
    // /image-mcp generate_image ... don't get routed through
    // the image generator.
    if (!(trimmedInput.startsWith("/") && !IMAGE_COMMAND_REGEX.test(trimmedInput))) {
      const naturalImagePrompt = extractImagePrompt(input);
      if (naturalImagePrompt) {
        await runImageGeneration(naturalImagePrompt);
        return;
      }
    }

    const ensureAuthForCommand = (command: SlashMcpCommand): boolean => {
      if (!commandRequiresSession(command)) {
        return true;
      }
      if (!authReady && !guestMode) {
        appendAssistantText("Still checking your Supabase session. Try again in a moment.");
        return false;
      }
      // Allow guest mode for most commands, but some sensitive ones still need auth
      if (!session && !guestMode) {
        appendAssistantText(
          "Sign in first: run /slashmcp login to open Google sign-in or provide email/password credentials. Or continue as guest for basic features.",
        );
        return false;
      }
      return true;
    };

    const handleKeyCommand = async (command: KeyCommand) => {
      if (command.kind === "help") {
        appendAssistantText(KEY_COMMAND_HELP);
        return;
      }
      if (command.kind === "error") {
        appendAssistantText(`❌ ${command.message}`);
        return;
      }

      if (!session?.user) {
        appendAssistantText("⚠️ Please sign in to manage API keys. Use /slashmcp login to sign in.");
        return;
      }

      setIsLoading(true);
      try {
        switch (command.kind) {
          case "add": {
            const { provider, name, options } = command;
            const keyType = (options.type || "api_key") as "api_key" | "mcp_key" | "oauth_token";
            const keyValue = options.key || options.value || options.secret;
            
            if (!keyValue) {
              appendAssistantText(
                "⚠️ Key value is required. Use: /key add <provider> <name> key=YOUR_KEY_VALUE\n" +
                "For security, the key value will not be stored in chat history."
              );
              break;
            }

            const expiresAt = options.expires || options.expires_at || null;
            const scope = options.scope || null;

            const key = await addApiKey(provider, name, keyType, keyValue, {
              expiresAt: expiresAt || undefined,
              scope: scope || undefined,
              metadata: options.metadata ? JSON.parse(options.metadata) : undefined,
            });

            appendAssistantText(
              `✅ Added API key "${key.name}" for ${key.provider} (id: ${key.id})\n` +
              `Type: ${key.key_type}, Scope: ${key.scope || "not specified"}\n` +
              (key.expires_at ? `Expires: ${new Date(key.expires_at).toLocaleDateString()}\n` : "") +
              `\n⚠️ Keep your key secure. It is encrypted and stored securely.`
            );
            break;
          }
          case "list": {
            const keys = await listApiKeys();
            if (keys.length === 0) {
              appendAssistantText("No API keys stored yet. Use /key add to add one.");
            } else {
              const lines = keys.map(key => {
                const status = key.is_active ? "✅" : "❌";
                const expires = key.expires_at
                  ? `, expires: ${new Date(key.expires_at).toLocaleDateString()}`
                  : "";
                const lastUsed = key.last_used_at
                  ? `, last used: ${new Date(key.last_used_at).toLocaleDateString()}`
                  : ", never used";
                return `${status} ${key.name} (${key.id}) — ${key.provider}, type: ${key.key_type}${expires}${lastUsed}`;
              });
              appendAssistantText(`Your API keys (${keys.length}):\n${lines.join("\n")}`);
            }
            break;
          }
          case "get": {
            const key = await getApiKey(command.identifier, true);
            appendAssistantText(
              `Key: ${key.name} (${key.id})\n` +
              `Provider: ${key.provider}\n` +
              `Type: ${key.key_type}\n` +
              `Status: ${key.is_active ? "active" : "inactive"}\n` +
              (key.expires_at ? `Expires: ${new Date(key.expires_at).toLocaleDateString()}\n` : "") +
              (key.scope ? `Scope: ${key.scope}\n` : "") +
              (key.last_used_at ? `Last used: ${new Date(key.last_used_at).toLocaleDateString()}\n` : "Never used\n") +
              `Usage count: ${key.usage_count}\n` +
              (key.keyValue ? `\n⚠️ Key value: ${key.keyValue.substring(0, 8)}...${key.keyValue.substring(key.keyValue.length - 4)}\n` : "")
            );
            break;
          }
          case "check": {
            const key = await checkApiKey(command.identifier);
            const isExpired = key.expires_at && new Date(key.expires_at) < new Date();
            appendAssistantText(
              `Key Status: ${key.name} (${key.id})\n` +
              `Provider: ${key.provider}\n` +
              `Active: ${key.is_active ? "Yes" : "No"}\n` +
              (isExpired ? "⚠️ EXPIRED\n" : "") +
              (key.expires_at ? `Expires: ${new Date(key.expires_at).toLocaleDateString()}\n` : "No expiration\n") +
              (key.scope ? `Scope: ${key.scope}\n` : "") +
              `Last used: ${key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}\n` +
              `Usage count: ${key.usage_count}`
            );
            break;
          }
          case "update": {
            const { keyId, options } = command;
            const updates: Parameters<typeof updateApiKey>[1] = {};
            
            if (options.name) updates.name = options.name;
            if (options.key || options.value || options.secret) {
              updates.keyValue = options.key || options.value || options.secret;
            }
            if (options.expires || options.expires_at) {
              updates.expiresAt = options.expires || options.expires_at || null;
            }
            if (options.scope) updates.scope = options.scope || null;
            if (options.is_active !== undefined) {
              updates.is_active = options.is_active === "true" || options.is_active === "1";
            }

            const updated = await updateApiKey(keyId, updates);
            appendAssistantText(`✅ Updated key "${updated.name}" (${updated.id})`);
            break;
          }
          case "delete": {
            await deleteApiKey(command.identifier);
            appendAssistantText(`🗑️ Deleted key "${command.identifier}"`);
            break;
          }
          case "audit": {
            const logs = await getAuditLogs();
            if (logs.length === 0) {
              appendAssistantText("No audit logs found.");
            } else {
              const lines = logs.slice(0, 20).map(log => {
                const date = new Date(log.created_at).toLocaleString();
                return `• ${date} — ${log.action}${log.key_name ? ` (${log.key_name})` : ""}${log.provider ? ` [${log.provider}]` : ""}`;
              });
              appendAssistantText(`Recent audit logs (showing ${Math.min(20, logs.length)} of ${logs.length}):\n${lines.join("\n")}`);
            }
            break;
          }
          case "stale": {
            const staleKeys = await getStaleKeys(command.daysThreshold);
            if (staleKeys.length === 0) {
              appendAssistantText(`No stale keys found (checked last ${command.daysThreshold || 90} days).`);
            } else {
              const lines = staleKeys.map(key => {
                return `• ${key.name} (${key.id}) — ${key.provider}, unused for ${key.days_since_use} days`;
              });
              appendAssistantText(
                `Found ${staleKeys.length} stale key(s) (not used in last ${command.daysThreshold || 90} days):\n${lines.join("\n")}\n\n` +
                `Consider rotating or deleting these keys for better security.`
              );
            }
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("/key command error", error);
        toast({ title: "Key Manager error", description: message, variant: "destructive" });
        appendAssistantText(`⚠️ ${message}`);
      } finally {
        setIsLoading(false);
      }
    };

    const handleSlashMcpCommand = async (command: SlashMcpCommand) => {
      if (command.kind === "help") {
        appendAssistantText(SLASH_MCP_HELP);
        return;
      }
      if (command.kind === "error") {
        appendAssistantText(`❌ ${command.message}`);
        return;
      }

      setIsLoading(true);
      try {
        switch (command.kind) {
          case "list": {
            const servers = await listMcpServers();
            setRegistry(servers);
            if (!servers.length) {
              appendAssistantText("No MCP servers registered yet. Use /slashmcp add <name> <https://gateway> to add one.");
            } else {
              const lines = servers.map(server => {
                const status = server.is_active ? "active" : "inactive";
                const last = server.last_health_check
                  ? new Date(server.last_health_check).toLocaleString()
                  : "never";
                const auth = server.auth_type === "none" ? "no auth" : server.auth_type;
                return `• ${server.name} (${server.id}) — ${status}, auth: ${auth}, last check: ${last}`;
              });
              appendAssistantText(`Registered MCP servers:\n${lines.join("\n")}`);
            }
            break;
          }
          case "loginPrompt": {
            if (session?.user) {
              appendAssistantText(`You're already signed in as ${session.user.email ?? "your Supabase account"}.`);
              setLoginPrompt(false);
              break;
            }
            appendAssistantText("Opening Google sign-in. Complete the Google auth window to continue.");
            const started = await signInWithGoogle();
            if (started) {
              setLoginPrompt(true);
            } else {
              appendAssistantText(
                "If the Google window didn't open, check pop-up blockers or run /slashmcp login email=user@example.com password=secret.",
              );
            }
            break;
          }
          case "login": {
            if (session?.user) {
              appendAssistantText(`You're already signed in as ${session.user.email ?? "your Supabase account"}.`);
              setLoginPrompt(false);
              break;
            }
            if (!command.email || !command.password) {
              appendAssistantText("❌ Usage: /slashmcp login email=user@example.com password=secret");
              break;
            }
            const { email, password } = command;
            const { error: signInError } = await supabaseClient.auth.signInWithPassword({
              email,
              password,
            });
            if (signInError) {
              appendAssistantText(`❌ Sign-in failed: ${signInError.message}`);
            } else {
              setLoginPrompt(false);
            }
            break;
          }
          case "addCustom": {
            if (command.payload.authType !== "none" && !command.payload.authSecret) {
              appendAssistantText("This gateway requires credentials. Provide key=YOUR_TOKEN when adding it.");
              break;
            }
            const result = await registerMcpServer(command.payload);
            const updated = await listMcpServers();
            setRegistry(updated);
            appendAssistantText(
              `✅ Registered MCP server "${result.name ?? command.payload.name}" (id: ${result.id ?? "unknown"}).` +
                (result.toolCount ? ` Tools reported: ${result.toolCount}.` : "") +
                ` Invoke MCP tools with /${result.id ?? command.payload.name}:tool_name`,
            );
            break;
          }
          case "addPreset": {
            const preset = findProviderPreset(command.presetId);
            if (!preset) {
              appendAssistantText(`Preset "${command.presetId}" is not recognized.`);
              break;
            }
            const options = command.options ?? {};
            const name = options.name ?? preset.id;
            const gatewayUrl = options.url ?? preset.gatewayUrl;
            if (!gatewayUrl) {
              appendAssistantText(
                `Preset "${preset.id}" requires a gateway URL. Try /slashmcp add ${preset.id} https://your-gateway ...`,
              );
              break;
            }
            const authType = normalizeAuthType(options.auth, preset.authType);
            const authSecret = options.key ?? options.secret ?? null;
            if (preset.requiresSecret && !authSecret) {
              appendAssistantText(`Preset "${preset.id}" requires credentials. Supply key=YOUR_TOKEN in the command.`);
              break;
            }
            const headerKey = options.header ?? options.authheader;
            const metadata: Record<string, unknown> | null = (() => {
              const base = preset.metadata ?? null;
              if (headerKey) {
                return { ...(base ?? {}), authHeaderKey: headerKey };
              }
              return base;
            })();

            const result = await registerMcpServer({
              name,
              gatewayUrl,
              authType,
              authSecret,
              metadata,
            });
            const updated = await listMcpServers();
            setRegistry(updated);
            appendAssistantText(
              `✅ Registered ${preset.label} as "${result.name ?? name}" (id: ${result.id ?? "unknown"}).` +
                (result.toolCount ? ` Tools reported: ${result.toolCount}.` : "") +
                ` Try /${result.id ?? name}:tool_name to invoke tools.`,
            );
            break;
          }
          case "remove": {
            const response = await removeMcpServer(command.identifier);
            const updated = await listMcpServers();
            setRegistry(updated);
            const removedName =
              response?.removed?.name ?? command.identifier.name ?? command.identifier.serverId ?? "specified server";
            appendAssistantText(`🗑️ Removed MCP server "${removedName}".`);
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("/slashmcp command error", error);
        toast({ title: "MCP registry error", description: message, variant: "destructive" });
        appendAssistantText(`⚠️ ${message}`);
      } finally {
        setIsLoading(false);
      }
    };

    const keyCommand = parseKeyCommand(input);
    if (keyCommand) {
      await handleKeyCommand(keyCommand);
      return;
    }

    const providerShortcutCommand = matchProviderShortcut(input);
    if (providerShortcutCommand) {
      if (!ensureAuthForCommand(providerShortcutCommand)) {
        return;
      }
      await handleSlashMcpCommand(providerShortcutCommand);
      return;
    }

    const slashMcpCommand = parseSlashMcpCommand(input);
    if (slashMcpCommand) {
      if (!ensureAuthForCommand(slashMcpCommand)) {
        return;
      }
      await handleSlashMcpCommand(slashMcpCommand);
      return;
    }

    if (loginPrompt && !session) {
      appendAssistantText(
        "⚠️ Finish signing in via Google or run /slashmcp login email=user@example.com password=secret.",
      );
      return;
    }

    const handleMcpInvocation = async (
      invocation: McpInvocation,
      context: "generic" | "stock" = "generic",
    ) => {
      setIsLoading(true);
      
      // Log tool call event
      setMcpEvents(prev => [...prev, {
        type: "toolCall",
        timestamp: Date.now(),
        tool: "mcp_proxy",
        command: invocation.rawInput || `${invocation.serverId} ${invocation.command}`,
        metadata: { invocation, context },
      }]);
      
      try {
        const response = await invokeMcpCommand(invocation, registry);
        const { result } = response;

        // Log tool result event
        setMcpEvents(prev => [...prev, {
          type: isErrorResult(result) ? "error" : "toolResult",
          timestamp: Date.now(),
          tool: "mcp_proxy",
          command: invocation.rawInput || `${invocation.serverId} ${invocation.command}`,
          result: isTextualResult(result) ? result.content : result,
          error: isErrorResult(result) ? result.message : undefined,
          metadata: { invocation, context },
        }]);
        
        if (isErrorResult(result)) {
          if (context === "stock") {
            toast({
              title: "Stock lookup failed",
              description: result.message,
              variant: "destructive",
            });
            setMessages(prev => [
              ...prev,
              {
                role: "assistant",
                type: "text",
                content:
                  "Sorry, I wasn't able to retrieve that stock quote. Please try again in a moment.",
              },
            ]);
          } else {
            toast({
              title: "MCP command failed",
              description: result.message,
              variant: "destructive",
            });
            setMessages(prev => [
              ...prev,
              {
                role: "assistant",
                type: "text",
                content: `Command error: ${result.message}`,
              },
            ]);
          }
          return;
        }

        const stockPayload = extractStockFromResult(result);
        if (stockPayload) {
          const summary =
            result.type === "json" && result.summary ? result.summary : formatStockSummary(stockPayload);
          const stockMessage: StockMessage = {
            role: "assistant",
            type: "stock",
            content: summary,
            stock: stockPayload,
          };
          setMessages(prev => [...prev, stockMessage]);
        } else {
          const content = formatMcpResult(result);
          setMessages(prev => [
            ...prev,
            {
              role: "assistant",
              type: "text",
              content,
            },
          ]);
        }
      } catch (error) {
        if (error instanceof McpClientNotConfiguredError) {
          toast({
            title: "MCP gateway not configured",
            description: "Set VITE_MCP_GATEWAY_URL to enable MCP integrations.",
            variant: "destructive",
          });
          setMessages(prev => [
            ...prev,
            {
              role: "assistant",
              type: "text",
              content: "MCP gateway is not configured. Please set VITE_MCP_GATEWAY_URL.",
            },
          ]);
        } else {
          console.error("MCP command error:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Log error event
          setMcpEvents(prev => [...prev, {
            type: "error",
            timestamp: Date.now(),
            tool: "mcp_proxy",
            command: invocation.rawInput || `${invocation.serverId} ${invocation.command}`,
            error: errorMessage,
            metadata: { invocation, context },
          }]);
          
          if (context === "stock") {
            let friendlyMessage =
              "Sorry, I wasn't able to retrieve that stock quote. Please try again in a moment.";

            if (/Alpha Vantage/i.test(errorMessage) && /premium/i.test(errorMessage)) {
              friendlyMessage =
                "Alpha Vantage returned a premium-only error for that ticker. Add a `TWELVEDATA_API_KEY` secret (or upgrade your Alpha Vantage plan) and try again.";
            } else if (/TWELVEDATA_API_KEY is not configured/i.test(errorMessage)) {
              friendlyMessage =
                "I couldn't fetch that quote because Twelve Data fallback isn't configured. Set `TWELVEDATA_API_KEY` in Supabase secrets or `.env` to enable the backup provider.";
            } else if (/rate limit/i.test(errorMessage)) {
              friendlyMessage =
                "We're temporarily rate-limited on stock data. Give it a minute and try again.";
            }

            toast({
              title: "Stock lookup failed",
              description: errorMessage,
              variant: "destructive",
            });
            setMessages(prev => [
              ...prev,
              {
                role: "assistant",
                type: "text",
                content: friendlyMessage,
              },
            ]);
          } else {
            toast({
              title: "MCP command failed",
              description: errorMessage,
              variant: "destructive",
            });
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    const runStockLookup = async (command: ParsedStockCommand) => {
      const args: Record<string, string> = { symbol: command.symbol };
      if (command.range) {
        args.range = command.range;
      }
      const invocation: McpInvocation = {
        serverId: "alphavantage-mcp",
        command: "get_quote",
        args,
        positionalArgs: [],
        rawInput: `/alphavantage-mcp get_quote symbol=${command.symbol}${
          command.range ? ` ${command.range.toLowerCase()}` : ""
        }`,
      };
      await handleMcpInvocation(invocation, "stock");
    };

    const modelCommand = parseModelCommand(input);
    if (modelCommand) {
      setProvider(modelCommand);
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          type: "text",
          content: `Switched to ${PROVIDER_LABEL[modelCommand]}.`,
        },
      ]);
      return;
    }

    const electionIntent = parseElectionOddsIntent(input);
    if (electionIntent) {
      const invocation: McpInvocation = {
        serverId: "polymarket-mcp",
        command: "get_market_price",
        args: { market_id: electionIntent.marketId },
        positionalArgs: [],
        rawInput: `/polymarket-mcp get_market_price market_id=${electionIntent.marketId}`,
      };
      await handleMcpInvocation(invocation, "generic");
      return;
    }

    const naturalPolymarketCommand = parseNaturalLanguagePolymarketRequest(input);
    if (naturalPolymarketCommand) {
      const invocation: McpInvocation = {
        serverId: "polymarket-mcp",
        command: "get_market_price",
        args: { market_id: naturalPolymarketCommand.marketId },
        positionalArgs: [],
        rawInput: `/polymarket-mcp get_market_price market_id=${naturalPolymarketCommand.marketId}`,
      };
      await handleMcpInvocation(invocation, "generic");
      return;
    }

    // Explicit stock commands (e.g. "/stock AMZN 1m" or "quote TSLA 3m")
    const stockCommand = parseStockCommand(input);
    if (stockCommand) {
      await runStockLookup(stockCommand);
      return;
    }

    // Natural-language stock detection is disabled by default to avoid
    // hijacking complex prompts (e.g. e‑commerce / scraping workflows)
    // and forcing them into the stock widget. Enable only if you
    // explicitly turn it on via VITE_ENABLE_NL_STOCK=true.
    const enableNaturalLanguageStocks = import.meta.env.VITE_ENABLE_NL_STOCK === "true";
    if (enableNaturalLanguageStocks) {
      const naturalStockCommand = parseNaturalLanguageStockRequest(input);
      if (naturalStockCommand) {
        await runStockLookup(naturalStockCommand);
        return;
      }
    }

    const lowerInput = input.toLowerCase();
    if (POLYMARKET_KEYWORDS.some(keyword => lowerInput.includes(keyword))) {
      toast({
        title: "Polymarket lookup unavailable",
        description: "Please try phrasing the request differently or specify the market slug.",
        variant: "destructive",
      });
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          type: "text",
          content: "I couldn't match that Polymarket market. Please try again with a specific event.",
        },
      ]);
      return;
    }

    // Try to parse as MCP command - check both with and without registry
    console.log("[useChat] Attempting to parse MCP command. Input:", input.slice(0, 100));
    console.log("[useChat] Registry state:", registry.length, "entries:", registry.map(r => ({ id: r.id, name: r.name })));
    
    const mcpCommand = parseMcpCommand(input, registry);
    console.log("[useChat] Parse result:", mcpCommand ? "MCP command detected" : "Not an MCP command");
    
    if (mcpCommand?.isMcpCommand) {
      const { invocation, validationMessage } = mcpCommand;
      console.log("[useChat] MCP invocation:", invocation);

      if (validationMessage) {
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            type: "text",
            content: validationMessage,
          },
        ]);
        return;
      }

      await handleMcpInvocation(invocation, "generic");
      return;
    }

    console.log("[useChat] ===== SEND MESSAGE CALLED =====");
    console.log("[useChat] Input:", input);
    console.log("[useChat] Document context:", documentContext);
    console.log("[useChat] Auth ready:", authReady);
    console.log("[useChat] Session:", session ? "exists" : "none");
    console.log("[useChat] Guest mode:", guestMode);
    
    // Set loading state with safety timeout
    setIsLoading(true);
    // Clear previous MCP events when starting a new message
    setMcpEvents([]);
    
    console.log("[useChat] Loading set to true, proceeding to chat request...");
    
    // Safety: Ensure isLoading is reset even if execution stops unexpectedly
    let loadingResetTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      console.warn("[useChat] Execution appears to have stopped, resetting loading state");
      setIsLoading(false);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content?.includes("Thinking")) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }, 30_000); // 30 second safety net
    
    // Cleanup function to clear timeout if execution completes normally
    const cleanupLoadingTimeout = () => {
      if (loadingResetTimeout) {
        clearTimeout(loadingResetTimeout);
        loadingResetTimeout = null;
      }
    };
    let assistantContent = "";

    const updateAssistantMessage = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.type === "text") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [...prev, { role: "assistant", type: "text", content: assistantContent }];
      });
    };

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      console.log("[useChat] Raw VITE_SUPABASE_URL from env:", supabaseUrl);
      console.log("[useChat] All env vars:", Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
      
      if (!supabaseUrl || supabaseUrl.includes('YOUR_SUPABASE_URL') || supabaseUrl.includes('your-supabase-ref')) {
        const errorMsg = "Supabase URL is not configured. Please set VITE_SUPABASE_URL environment variable.";
        console.error("[useChat]", errorMsg, "Current value:", supabaseUrl);
        setIsLoading(false);
        setMessages(prev => prev.slice(0, -1));
        toast({
          title: "Configuration Error",
          description: errorMsg + " Check your environment variables. Current value: " + (supabaseUrl || 'undefined'),
          variant: "destructive",
        });
        return;
      }
      
      const CHAT_URL = `${supabaseUrl}/functions/v1/chat`;
      console.log("[useChat] ===== CHAT REQUEST DEBUG =====");
      console.log("[useChat] VITE_SUPABASE_URL:", supabaseUrl);
      console.log("[useChat] CHAT_URL:", CHAT_URL);
      console.log("[useChat] Full URL will be:", CHAT_URL);
      console.log("[useChat] ===============================");
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const documentContextPayload =
        documentContext && documentContext.length > 0
          ? documentContext.map((doc) => ({
              jobId: doc.jobId,
              fileName: doc.fileName,
              textLength: doc.textLength ?? 0,
            }))
          : [];
      if (documentContextPayload.length > 0) {
        console.log("[useChat] Including document context payload:", documentContextPayload);
      }
      
      // Get session token for authentication
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      // Use session token if available, otherwise fall back to anon key
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      } else if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
        headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;
      }
      
      const payload: Record<string, unknown> = {
        messages: history,
        provider,
      };
      if (documentContextPayload.length > 0) {
        payload.documentContext = documentContextPayload;
      }

      // Add timeout to the fetch request itself
      const FETCH_TIMEOUT_MS = 30_000; // 30 seconds to establish connection
      const fetchController = new AbortController();
      const fetchTimeoutId = setTimeout(() => {
        fetchController.abort();
      }, FETCH_TIMEOUT_MS);

      console.log("[useChat] Sending request to:", CHAT_URL);
      console.log("[useChat] Payload:", JSON.stringify(payload).slice(0, 200));
      console.log("[useChat] Headers:", headers);
      console.log("[useChat] Method: POST");
      
      // Validate URL before making request
      if (!CHAT_URL || CHAT_URL.includes('undefined') || !CHAT_URL.startsWith('http')) {
        const errorMsg = `Invalid CHAT_URL: ${CHAT_URL}. Check VITE_SUPABASE_URL environment variable.`;
        console.error("[useChat]", errorMsg);
        setIsLoading(false);
        setMessages(prev => prev.slice(0, -1));
        toast({
          title: "Configuration Error",
          description: `Invalid chat URL: ${CHAT_URL}. Please check your environment variables.`,
          variant: "destructive",
        });
        return;
      }
      
      let response: Response;
      try {
        const fetchStartTime = Date.now();
        console.log("[useChat] Starting fetch to:", CHAT_URL);
        response = await fetch(CHAT_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: fetchController.signal,
        });
        const fetchDuration = Date.now() - fetchStartTime;
        console.log("[useChat] Fetch completed in", fetchDuration, "ms, status:", response.status);
        console.log("[useChat] Response headers:", Object.fromEntries(response.headers.entries()));
        clearTimeout(fetchTimeoutId);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          console.error("[useChat] Response not OK:", response.status, response.statusText);
          console.error("[useChat] Error response body:", errorText);
        }
        if (!response.body) {
          console.error("[useChat] Response has no body!");
        }
      } catch (fetchError) {
        clearTimeout(fetchTimeoutId);
        console.error("[useChat] Fetch error:", fetchError);
        console.error("[useChat] Error type:", fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError);
        console.error("[useChat] Error message:", fetchError instanceof Error ? fetchError.message : String(fetchError));
        console.error("[useChat] Error stack:", fetchError instanceof Error ? fetchError.stack : 'No stack');
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          setIsLoading(false);
          setMessages(prev => prev.slice(0, -1));
          toast({
            title: "Connection Timeout",
            description: "The server took too long to respond (30s timeout). Please check if the backend is running.",
            variant: "destructive",
          });
          return;
        }
        setIsLoading(false);
        setMessages(prev => prev.slice(0, -1));
        toast({
          title: "Request Failed",
          description: fetchError instanceof Error ? fetchError.message : "Failed to connect to chat service. Check console for details.",
          variant: "destructive",
        });
        throw fetchError;
      }

      if (!response.ok || !response.body) {
        let errorMessage = "Failed to start stream";
        try {
          const errorData = await response.json().catch(() => null);
          if (errorData?.error) {
            errorMessage = errorData.error;
            if (errorData.details) {
              errorMessage += ` (${errorData.details})`;
            }
          }
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = response.statusText || `HTTP ${response.status}`;
        }

        if (response.status === 429) {
          toast({
            title: "Rate limit exceeded",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        } else if (response.status === 402) {
          toast({
            title: "Payment required",
            description: "Please add credits to your workspace.",
            variant: "destructive",
          });
        } else if (response.status === 500) {
          toast({
            title: "Server Error",
            description: errorMessage,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Connection Error",
            description: errorMessage,
            variant: "destructive",
          });
        }
        console.error("Chat API error:", response.status, errorMessage);
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;
      
      // Add timeout handling for stream reading
      const STREAM_TIMEOUT_MS = 300_000; // 5 minutes max
      const STREAM_HEARTBEAT_TIMEOUT_MS = 60_000; // 1 minute without data = potential hang
      let lastDataTime = Date.now();
      let streamTimeoutId: ReturnType<typeof setTimeout> | null = null;
      
      // Set up timeout to detect hanging streams
      const resetStreamTimeout = () => {
        if (streamTimeoutId) clearTimeout(streamTimeoutId);
        streamTimeoutId = setTimeout(() => {
          const timeSinceLastData = Date.now() - lastDataTime;
          if (timeSinceLastData >= STREAM_HEARTBEAT_TIMEOUT_MS) {
            console.warn("Stream appears to be hanging, no data received in", timeSinceLastData, "ms");
            // Send a progress event to show we're still waiting
            setMcpEvents(prev => [...prev, {
              type: "system",
              timestamp: Date.now(),
              metadata: { 
                message: `Waiting for response... (${Math.floor(timeSinceLastData / 1000)}s elapsed)`,
                category: "stream_timeout_warning"
              },
            } as McpEvent]);
          }
        }, STREAM_HEARTBEAT_TIMEOUT_MS);
      };
      
      resetStreamTimeout();
      
      // Overall timeout
      const overallTimeoutId = setTimeout(() => {
        console.error("Stream timeout: operation took longer than", STREAM_TIMEOUT_MS / 1000, "seconds");
        reader.cancel();
        setIsLoading(false);
        toast({
          title: "Request Timeout",
          description: "The request took too long to complete. Please try again with a simpler request.",
          variant: "destructive",
        });
      }, STREAM_TIMEOUT_MS);

      // Add initial connection timeout - if no data arrives within 10 seconds, cancel
      // Reduced from 30s to 10s to fail faster if backend isn't responding
      console.log("[useChat] Starting stream read, setting initial timeout...");
      const initialConnectionTimeout = setTimeout(() => {
        const timeSinceStart = Date.now() - lastDataTime;
        console.error("[useChat] Initial connection timeout triggered, time since start:", timeSinceStart, "ms");
        if (timeSinceStart > 10_000) {
          console.error("[useChat] No data received within 10 seconds of connection, canceling stream");
          reader.cancel();
          setIsLoading(false);
          toast({
            title: "Stream Timeout",
            description: "The server connected but didn't send any data within 10 seconds. Check Supabase logs for backend errors.",
            variant: "destructive",
          });
          setMessages(prev => prev.slice(0, -1));
        }
      }, 10_000);

      try {
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(initialConnectionTimeout);
            break;
          }
          
          clearTimeout(initialConnectionTimeout); // Clear once we get first data
          lastDataTime = Date.now();
          resetStreamTimeout();
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              streamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              
              // Handle MCP events
              if (parsed.mcpEvent) {
                console.log("Received MCP event:", parsed.mcpEvent);
                setMcpEvents(prev => [...prev, parsed.mcpEvent as McpEvent]);
              }
              
              // Handle content
              const content = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (content) updateAssistantMessage(content);
            } catch (error) {
              // Log parse errors for debugging
              console.warn("Failed to parse SSE line:", jsonStr, error);
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }
      } catch (streamError) {
        console.error("Stream reading error:", streamError);
        reader.cancel();
        setIsLoading(false);
        const errorMsg = streamError instanceof Error ? streamError.message : "Stream error";
        toast({
          title: "Stream Error",
          description: errorMsg || "Failed to read response stream. Please try again.",
          variant: "destructive",
        });
        setMessages(prev => prev.slice(0, -1));
      } finally {
        // Cleanup timeouts
        if (streamTimeoutId) clearTimeout(streamTimeoutId);
        clearTimeout(overallTimeoutId);
        clearTimeout(initialConnectionTimeout);
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            
            // Handle MCP events
            if (parsed.mcpEvent) {
              console.log("Received MCP event (buffer):", parsed.mcpEvent);
              setMcpEvents(prev => [...prev, parsed.mcpEvent as McpEvent]);
            }
            
            // Handle content
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) updateAssistantMessage(content);
          } catch (error) {
            // Log parse errors for debugging
            console.warn("Failed to parse SSE line (buffer):", jsonStr, error);
          }
        }
      }

      setIsLoading(false);
      cleanupLoadingTimeout();
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      
      // Check if it's a timeout error
      if (errorMessage.includes("timeout") || errorMessage.includes("took too long")) {
        toast({
          title: "Request Timeout",
          description: "The request took too long to complete. Please try breaking your request into smaller parts.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage || "Failed to send message. Please try again.",
          variant: "destructive",
        });
      }
      
      setMessages(prev => prev.slice(0, -1));
      setIsLoading(false);
      cleanupLoadingTimeout();
    }
  }, [
    messages,
    toast,
    provider,
    loginPrompt,
    session,
    authReady,
    signInWithGoogle,
    appendAssistantText,
    runImageGeneration,
    registry,
  ]);

  const captureOAuthTokens = useCallback(async () => {
    try {
      const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
      if (!currentSession?.access_token) {
        toast({
          title: "Not signed in",
          description: "Please sign in first",
          variant: "destructive",
        });
        return;
      }

      // Get provider tokens from localStorage (stored by Supabase after OAuth sign-in)
      // The session key format is: sb-{project-ref}-auth-token
      const projectRef = import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0] || 'akxdroedpsvmckvqvggr';
      const sessionKey = `sb-${projectRef}-auth-token`;
      const sessionData = typeof window !== 'undefined' ? localStorage.getItem(sessionKey) : null;
      const parsed = sessionData ? JSON.parse(sessionData) : null;
      
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/capture-oauth-tokens`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentSession.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider_token: parsed?.provider_token || null,
          provider_refresh_token: parsed?.provider_refresh_token || null,
          expires_at: parsed?.expires_at || null,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("[OAuth] Tokens captured:", result);
        toast({
          title: result.stored > 0 ? "Tokens captured" : "No tokens found",
          description: result.stored > 0 
            ? `Stored ${result.stored} token(s) for ${result.providers.join(", ")}`
            : "No OAuth tokens found in identity. You may need to sign out and sign back in with Google.",
          variant: result.stored > 0 ? "default" : "destructive",
        });
        return result;
      } else {
        const errorText = await response.text();
        console.error("[OAuth] Failed to capture tokens:", errorText);
        toast({
          title: "Token capture failed",
          description: errorText,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("[OAuth] Error capturing tokens:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to capture tokens",
        variant: "destructive",
      });
    }
  }, [toast, updateSession]);

  const enableGuestMode = useCallback(() => {
    setGuestMode(true);
    setAuthReady(true);
    toast({
      title: "Guest mode enabled",
      description: "You can now use MCP Messenger without signing in.",
    });
  }, [toast]);

  return {
    messages,
    sendMessage,
    resetChat,
    captureOAuthTokens,
    isLoading,
    provider,
    providerLabel: PROVIDER_LABEL[provider],
    providerOptions: PROVIDER_OPTIONS,
    setProvider,
    registry,
    session,
    authReady,
    isAuthLoading,
    guestMode,
    enableGuestMode,
    signInWithGoogle,
    signInWithMicrosoft,
    signOut,
    appendAssistantText,
    mcpEvents,
  };
}
