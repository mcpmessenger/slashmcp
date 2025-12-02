import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { Database } from "../_shared/database.types.ts";

interface ProxyRequest {
  serverId?: string;
  path?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function decodeSecret(secret?: string | null): string | null {
  if (!secret) return null;
  const binary = atob(secret);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/Bearer\s+/i, "").trim();
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ProxyRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serverId = body.serverId?.trim();
  if (!serverId) {
    return new Response(JSON.stringify({ error: "serverId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unable to authenticate user" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Look up server by id OR name (to support friendly names like "search-mcp")
  const { data: server, error } = await supabase
    .from("mcp_servers")
    .select("id, user_id, gateway_url, auth_type, auth_secret, metadata, is_active")
    .eq("user_id", user.id)
    .or(`id.eq.${serverId},name.eq.${serverId}`)
    .maybeSingle();

  if (error || !server) {
    return new Response(JSON.stringify({ error: "Server not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!server.is_active) {
    return new Response(JSON.stringify({ error: "Server is disabled" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Normalize gateway URL (ensure it ends with /)
  let baseUrl = server.gateway_url;
  if (!baseUrl.endsWith("/")) {
    baseUrl = `${baseUrl}/`;
  }
  
  // Determine the correct path
  // If path is provided, use it; otherwise default to "mcp/invoke" for standard MCP servers
  let relativePath = body.path?.replace(/^\//, "");
  if (!relativePath) {
    // Check if gateway_url already contains /mcp/ - if so, just use "invoke"
    // Otherwise, use "mcp/invoke" for standard MCP protocol servers
    if (baseUrl.includes("/mcp/")) {
      relativePath = "invoke";
    } else {
      relativePath = "mcp/invoke";
    }
  }
  
  const method = body.method?.toUpperCase() ?? "POST";
  const targetUrl = new URL(relativePath, baseUrl).toString();
  
  console.log("[mcp-proxy] Gateway URL:", baseUrl);
  console.log("[mcp-proxy] Relative path:", relativePath);
  console.log("[mcp-proxy] Target URL:", targetUrl);

  const downstreamHeaders = new Headers(body.headers ?? {});
  if (!downstreamHeaders.has("Content-Type")) {
    downstreamHeaders.set("Content-Type", "application/json");
  }

  // For Supabase Edge Functions, include authentication headers
  const isSupabaseFunction = gatewayUrl.includes(".supabase.co/functions/v1/");
  if (isSupabaseFunction) {
    // Get anon key from request headers (client sends it as 'apikey')
    const anonKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (anonKey && !downstreamHeaders.has("apikey")) {
      downstreamHeaders.set("apikey", anonKey);
    }
    // Also forward the Authorization header if present (for user-authenticated requests)
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !downstreamHeaders.has("Authorization")) {
      downstreamHeaders.set("Authorization", authHeader);
    }
  }

  const secret = decodeSecret(server.auth_secret);
  if (secret && server.auth_type !== "none") {
    const authHeaderKey = server.metadata?.authHeaderKey as string | undefined;
    if (authHeaderKey) {
      downstreamHeaders.set(authHeaderKey, secret);
    } else {
      downstreamHeaders.set("Authorization", `Bearer ${secret}`);
    }
  }

  // Transform SlashMCP invocation format to MCP protocol format
  // SlashMCP format: { serverId, command, args, positionalArgs, rawInput }
  // MCP protocol format: { tool, arguments }
  let requestBody = body.body;
  if (requestBody && typeof requestBody === "object" && "command" in requestBody) {
    const invocation = requestBody as { command?: string; args?: Record<string, string>; positionalArgs?: string[] };
    if (invocation.command) {
      // Transform to MCP protocol format
      requestBody = {
        tool: invocation.command,
        arguments: invocation.args || {},
      };
      console.log("[mcp-proxy] Transformed SlashMCP format to MCP protocol:", JSON.stringify(requestBody).slice(0, 200));
    }
  }

  let response: Response;
  try {
    console.log("[mcp-proxy] Forwarding to:", targetUrl);
    console.log("[mcp-proxy] Request body:", JSON.stringify(requestBody).slice(0, 500));
    
    response = await fetch(targetUrl, {
      method,
      headers: downstreamHeaders,
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(requestBody ?? {}),
    });
    
    console.log("[mcp-proxy] Response status:", response.status);
  } catch (proxyError) {
    console.error("[mcp-proxy] Fetch error:", proxyError);
    return new Response(JSON.stringify({ error: "Failed to contact gateway", details: proxyError instanceof Error ? proxyError.message : String(proxyError) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const responseBody = await response.text();
  
  // Log error responses for debugging
  if (!response.ok) {
    console.error("[mcp-proxy] Error response from server:", response.status);
    console.error("[mcp-proxy] Error body:", responseBody);
    
    // Try to parse error response and include more details
    try {
      const errorData = JSON.parse(responseBody);
      console.error("[mcp-proxy] Parsed error:", JSON.stringify(errorData, null, 2));
    } catch {
      // If not JSON, log as text
      console.error("[mcp-proxy] Error response (text):", responseBody.slice(0, 1000));
    }
  }
  
  return new Response(responseBody, {
    status: response.status,
    headers: {
      ...corsHeaders,
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
});
