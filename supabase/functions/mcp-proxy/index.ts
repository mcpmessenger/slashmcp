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

  const gatewayUrl = server.gateway_url.endsWith("/") ? server.gateway_url : `${server.gateway_url}/`;
  const relativePath = body.path?.replace(/^\//, "") ?? "invoke";
  const method = body.method?.toUpperCase() ?? "POST";
  const targetUrl = new URL(relativePath, gatewayUrl).toString();

  const downstreamHeaders = new Headers(body.headers ?? {});
  if (!downstreamHeaders.has("Content-Type")) {
    downstreamHeaders.set("Content-Type", "application/json");
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

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers: downstreamHeaders,
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body.body ?? {}),
    });
  } catch (proxyError) {
    console.error("mcp/proxy fetch error", proxyError);
    return new Response(JSON.stringify({ error: "Failed to contact gateway" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      ...corsHeaders,
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
});
