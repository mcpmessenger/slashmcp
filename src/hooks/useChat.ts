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

export type Provider = "openai" | "anthropic" | "gemini";

const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI (GPT-4o Mini)",
  anthropic: "Anthropic (Claude 3 Haiku)",
  gemini: "Google Gemini 1.5 Flash",
};

type BaseMessage = {
  role: "user" | "assistant";
  type: "text" | "stock";
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
  "WHAT",
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
    if (result.summary) return result.summary;
    try {
      return `\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
    } catch {
      return "Received JSON response from MCP command.";
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

function parseNaturalLanguageStockRequest(rawInput: string): ParsedStockCommand | null {
  const lower = rawInput.toLowerCase();
  if (POLYMARKET_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return null;
  }
  let symbol = "";
  if (!symbol) {
    const tokens = rawInput.split(/[\s,!?]+/);
    for (const token of tokens) {
      if (!token) continue;
      if (token !== token.toUpperCase()) continue;
      const cleaned = token.replace(/'s$/i, "").replace(/[^a-zA-Z0-9.\-:]/g, "");
      if (!cleaned) continue;
      const upper = cleaned.toUpperCase();
      if (upper.length < 1 || upper.length > 5) continue;
      if (upper !== cleaned.toUpperCase()) continue;
      if (TICKER_STOP_WORDS.has(upper)) continue;
      if (/^[A-Z]{1,5}$/.test(upper)) {
        symbol = upper;
        break;
      }
    }
  }
  const match = rawInput.trim().match(STOCK_COMMAND_REGEX);
  if (!match) return null;
  const [, rawSymbol, rawRange] = match;
  if (symbol) {
    const normalizedRange = rawRange?.toUpperCase() as ParsedStockCommand["range"] | undefined;
    return {
      symbol: symbol,
      range: normalizedRange,
    };
  }
  const normalizedRange = rawRange?.toUpperCase() as ParsedStockCommand["range"] | undefined;
  return {
    symbol: rawSymbol.toUpperCase(),
    range: normalizedRange,
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

  const appendAssistantText = useCallback((text: string) => {
    setMessages(prev => [...prev, { role: "assistant", type: "text", content: text }]);
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai");
  const [, setRegistry] = useState<McpRegistryEntry[]>([]);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let isCancelled = false;

    supabaseClient.auth
      .getSession()
      .then(({ data, error }) => {
        if (isCancelled) return;
        if (error) {
          console.error("Failed to fetch Supabase session", error);
          setSession(null);
        } else {
          setSession(data.session ?? null);
        }
        setAuthReady(true);
      })
      .catch(error => {
        if (!isCancelled) {
          console.error("Supabase getSession error", error);
          setSession(null);
          setAuthReady(true);
        }
      });

    const { data: listener } = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "SIGNED_IN" && nextSession?.user) {
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            type: "text",
            content: `✅ Signed in as ${nextSession.user.email ?? "your account"}.`,
          },
        ]);
        setLoginPrompt(false);
      }
      if (event === "SIGNED_OUT") {
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            type: "text",
            content: "You have signed out of Supabase.",
          },
        ]);
        setRegistry([]);
      }
    });

    return () => {
      isCancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

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
      const redirectTo = import.meta.env.VITE_SUPABASE_REDIRECT_URL ?? window.location.origin;
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
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

  const signOut = useCallback(async () => {
    try {
      await supabaseClient.auth.signOut();
      setSession(null);
      setRegistry([]);
      setLoginPrompt(false);
      toast({
        title: "Signed out",
        description: "Supabase session cleared.",
      });
    } catch (error) {
      console.error("Supabase sign-out failed", error);
      toast({
        title: "Sign-out failed",
        description: error instanceof Error ? error.message : "Unable to sign out right now.",
        variant: "destructive",
      });
    }
  }, [toast]);

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
          setMessages(prev => [
            ...prev,
            {
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
            },
          ]);
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

  const sendMessage = useCallback(async (input: string) => {
    const userMsg: Message = { role: "user", type: "text", content: input };
    setMessages(prev => [...prev, userMsg]);

    const imagineMatch = IMAGE_COMMAND_REGEX.exec(input.trim());
    if (imagineMatch) {
      const promptText = imagineMatch[1]?.trim() ?? "";
      await runImageGeneration(promptText);
      return;
    }

    const naturalImagePrompt = extractImagePrompt(input);
    if (naturalImagePrompt) {
      await runImageGeneration(naturalImagePrompt);
      return;
    }

    const ensureAuthForCommand = (command: SlashMcpCommand): boolean => {
      if (!commandRequiresSession(command)) {
        return true;
      }
      if (!authReady) {
        appendAssistantText("Still checking your Supabase session. Try again in a moment.");
        return false;
      }
      if (!session) {
        appendAssistantText(
          "Sign in first: run /slashmcp login to open Google sign-in or provide email/password credentials.",
        );
        return false;
      }
      return true;
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
      try {
        const response = await invokeMcpCommand(invocation);
        const { result } = response;

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
          if (context === "stock") {
            toast({
              title: "Stock lookup failed",
              description: "Unable to fetch stock data right now.",
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
              description: "Unable to execute the MCP command right now.",
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

    const stockCommand = parseStockCommand(input);
    if (stockCommand) {
      await runStockLookup(stockCommand);
      return;
    }

    const naturalStockCommand = parseNaturalLanguageStockRequest(input);
    if (naturalStockCommand) {
      await runStockLookup(naturalStockCommand);
      return;
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

    const mcpCommand = parseMcpCommand(input);
    if (mcpCommand?.isMcpCommand) {
      const { invocation, validationMessage } = mcpCommand;

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

    setIsLoading(true);
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
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history, provider }),
      });

      if (!response.ok || !response.body) {
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
        } else {
          throw new Error("Failed to start stream");
        }
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
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
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) updateAssistantMessage(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
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
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) updateAssistantMessage(content);
          } catch { /* ignore partial leftovers */ }
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      setMessages(prev => prev.slice(0, -1));
      setIsLoading(false);
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
  ]);

  return {
    messages,
    sendMessage,
    isLoading,
    provider,
    providerLabel: PROVIDER_LABEL[provider],
    session,
    authReady,
    isAuthLoading,
    signInWithGoogle,
    signOut,
    appendAssistantText,
  };
}
