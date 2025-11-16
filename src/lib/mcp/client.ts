import type { McpInvocation, McpInvocationResponse, McpInvocationResult, McpRegistryEntry } from "./types";
import { supabaseClient } from "../supabaseClient";

const fallbackFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

// Static servers (like alphavantage-mcp, polymarket-mcp, gemini-mcp) use the
// built-in MCP gateway function.
const MCP_STATIC_GATEWAY_URL =
  import.meta.env.VITE_MCP_GATEWAY_URL && import.meta.env.VITE_MCP_GATEWAY_URL.trim() !== ""
    ? import.meta.env.VITE_MCP_GATEWAY_URL.trim()
    : fallbackFunctionsUrl
    ? `${fallbackFunctionsUrl.replace(/\/+$/, "")}/mcp`
    : undefined;

// Dynamic, user-registered servers (srv_...) are accessed via the mcp-proxy
// Supabase function, which resolves per-user gateway URLs from the registry.
const MCP_PROXY_URL = fallbackFunctionsUrl
  ? `${fallbackFunctionsUrl.replace(/\/+$/, "")}/mcp-proxy`
  : undefined;

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const MCP_TIMEOUT_MS = 60_000;

export class McpClientNotConfiguredError extends Error {
  constructor() {
    super("MCP gateway URL is not configured. Set VITE_MCP_GATEWAY_URL to enable MCP commands.");
    this.name = "McpClientNotConfiguredError";
  }
}

export async function invokeMcpCommand(
  invocation: McpInvocation,
  registry?: McpRegistryEntry[],
): Promise<McpInvocationResponse> {
  // Check if this server is registered in the user's registry (by id or name)
  const isRegistered =
    registry?.some(
      entry => entry.id === invocation.serverId || entry.name === invocation.serverId,
    ) ?? false;

  // Use mcp-proxy if it's a dynamic server (srv_...) OR if it's registered
  // in the user's registry (even if it's also in the static registry)
  const isDynamicServer = invocation.serverId.toLowerCase().startsWith("srv_") || isRegistered;
  const targetUrl = isDynamicServer ? MCP_PROXY_URL : MCP_STATIC_GATEWAY_URL;

  if (!targetUrl) {
    throw new McpClientNotConfiguredError();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), MCP_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isDynamicServer) {
      // For user-registered servers, authenticate as the current Supabase user
      // so the edge function can look up servers scoped to that user.
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Please sign in to use registered MCP servers (e.g. /slashmcp and srv_... ids).");
      }

      headers.Authorization = `Bearer ${session.access_token}`;
      if (SUPABASE_ANON_KEY) {
        headers.apikey = SUPABASE_ANON_KEY;
      }
    } else if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const body = isDynamicServer
      ? {
          serverId: invocation.serverId,
          path: "invoke",
          method: "POST",
          body: invocation,
        }
      : invocation;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => undefined);
      const message = errorPayload?.error || `MCP gateway request failed with status ${response.status}`;
      throw new Error(message);
    }

    const data = (await response.json()) as McpInvocationResponse | McpInvocationResult;

    if ("result" in data && data.result) {
      return data;
    }

    // Normalize bare result payloads into the wrapper shape.
    const result = data as McpInvocationResult;
    return {
      invocation,
      result,
      timestamp: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function isTextualResult(result: McpInvocationResult): result is { type: "text" | "markdown"; content: string } {
  return result.type === "text" || result.type === "markdown";
}

export function isErrorResult(result: McpInvocationResult): result is { type: "error"; message: string } {
  return result.type === "error";
}

