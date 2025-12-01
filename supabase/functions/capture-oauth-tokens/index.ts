import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { Database } from "../../_shared/database.types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if request body contains provider tokens (from frontend localStorage)
    let requestBody: { provider_token?: string; provider_refresh_token?: string; expires_at?: number } | null = null;
    try {
      const bodyText = await req.text();
      console.log("Request body text length:", bodyText?.length || 0);
      if (bodyText && bodyText.trim()) {
        requestBody = JSON.parse(bodyText);
        console.log("Request body parsed successfully:", {
          hasProviderToken: !!requestBody?.provider_token,
          hasRefreshToken: !!requestBody?.provider_refresh_token,
          expiresAt: requestBody?.expires_at,
          keys: Object.keys(requestBody || {}),
        });
      } else {
        console.log("Request body is empty or whitespace only");
      }
    } catch (e) {
      // No body or invalid JSON, continue
      console.log("Error parsing request body:", e instanceof Error ? e.message : String(e));
    }

    const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get user from auth header
    const sessionToken = authHeader.replace(/Bearer\s+/i, "").trim();
    const { data: { user }, error: userError } = await supabase.auth.getUser(sessionToken);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First, check if provider tokens were sent in request body (from frontend localStorage)
    console.log("Checking request body for provider tokens:", {
      hasRequestBody: !!requestBody,
      hasProviderToken: !!requestBody?.provider_token,
      providerTokenLength: requestBody?.provider_token?.length || 0,
    });
    
    if (requestBody?.provider_token) {
      // Determine provider from request body or user's identity
      let provider = requestBody.provider || "google"; // Default to google for backward compatibility
      
      // Try to detect provider from user's identities
      const { data: { user: fullUser } } = await supabase.auth.admin.getUserById(user.id);
      if (fullUser?.identities && fullUser.identities.length > 0) {
        // Get the most recent identity (likely the one that just signed in)
        const latestIdentity = fullUser.identities[fullUser.identities.length - 1];
        if (latestIdentity.provider === "azure") {
          provider = "azure";
        } else if (latestIdentity.provider === "google") {
          provider = "google";
        }
      }
      
      console.log(`Found provider_token in request body, storing for ${provider} provider`);
      console.log("Using Admin API to update app_metadata for user:", user.id);
      
      // Get current user data to preserve existing app_metadata
      const { data: currentUser, error: getUserError } = await supabase.auth.admin.getUserById(user.id);
      
      if (getUserError || !currentUser) {
        console.error("Failed to get current user:", getUserError);
        return new Response(
          JSON.stringify({
            error: "Failed to get user data",
            message: getUserError?.message || "Unknown error",
            stored: 0,
            providers: [],
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      // Build updated app_metadata with OAuth tokens
      const currentMetadata = (currentUser.user.app_metadata || {}) as Record<string, unknown>;
      const oauthTokens = (currentMetadata.oauth_tokens || {}) as Record<string, unknown>;
      
      oauthTokens[provider] = {
        access_token: requestBody.provider_token,
        refresh_token: requestBody.provider_refresh_token || null,
        expires_at: requestBody.expires_at || null,
      };
      
      const updatedMetadata = {
        ...currentMetadata,
        oauth_tokens: oauthTokens,
      };
      
      // Update user's app_metadata using Admin API
      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: updatedMetadata,
      });

      if (!updateError) {
        console.log(`✅ Stored OAuth token from request body for ${provider} for user ${user.id}`);
        return new Response(
          JSON.stringify({
            message: `Stored 1 OAuth token(s) from request body`,
            stored: 1,
            providers: [provider],
            source: "request_body",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } else {
        console.error(`❌ Failed to store token from request body:`, {
          error: updateError,
          message: updateError?.message,
        });
        return new Response(
          JSON.stringify({
            error: "Failed to store OAuth token",
            message: updateError?.message || "Unknown error storing token",
            stored: 0,
            providers: [],
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      console.log("⚠️ No provider_token in request body, will try JWT method");
    }

    // Try to decode the JWT to get provider tokens
    // Supabase stores provider tokens in the JWT payload when using OAuth
    try {
      // Decode JWT (without verification since we trust Supabase)
      const parts = sessionToken.split('.');
      if (parts.length === 3) {
        // Decode base64url
        const base64Url = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const base64 = base64Url + '='.repeat((4 - base64Url.length % 4) % 4);
        const payload = JSON.parse(atob(base64));
        
        console.log("JWT payload keys:", Object.keys(payload));
        
        // Check for provider tokens in JWT payload
        const providerToken = payload.provider_token as string | undefined;
        const providerRefreshToken = payload.provider_refresh_token as string | undefined;
        const expiresAt = payload.expires_at as number | undefined;
        
        if (providerToken) {
          console.log("Found provider_token in JWT payload, storing for google provider");
          const { error: storeError } = await supabase.rpc("store_oauth_token", {
            p_user_id: user.id,
            p_provider: "google",
            p_access_token: providerToken,
            p_refresh_token: providerRefreshToken || null,
            p_expires_at: expiresAt || null,
          });

          if (!storeError) {
            console.log(`✅ Stored OAuth token from JWT for google for user ${user.id}`);
            return new Response(
              JSON.stringify({
                message: `Stored 1 OAuth token(s) from JWT`,
                stored: 1,
                providers: ["google"],
                source: "jwt",
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          } else {
            console.error(`Failed to store token from JWT:`, storeError);
          }
        } else {
          console.log("No provider_token in JWT payload");
        }
      }
    } catch (jwtError) {
      console.log("Could not extract tokens from JWT, trying identity_data method:", jwtError);
    }

    // Get user's identities to extract OAuth tokens
    const { data: { user: fullUser }, error: adminError } = await supabase.auth.admin.getUserById(user.id);

    if (adminError || !fullUser) {
      return new Response(JSON.stringify({ error: "Failed to get user data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const identities = fullUser.identities as Array<{
      provider: string;
      identity_data?: Record<string, unknown>;
    }> | undefined;

    if (!identities || identities.length === 0) {
      return new Response(JSON.stringify({ message: "No OAuth identities found", stored: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract and store tokens for each OAuth provider
    let storedCount = 0;
    const storedProviders: string[] = [];

    console.log(`Processing ${identities.length} identity(ies) for user ${user.id}`);
    
    for (const identity of identities) {
      const provider = identity.provider;
      const identityData = identity.identity_data as Record<string, unknown> | undefined;

      console.log(`Checking identity for provider ${provider}:`, {
        hasIdentityData: !!identityData,
        identityDataKeys: identityData ? Object.keys(identityData) : [],
      });

      if (!identityData) {
        console.log(`No identity_data for provider ${provider}`);
        continue;
      }

      const accessToken = identityData.access_token as string | undefined;
      const refreshToken = identityData.refresh_token as string | undefined;
      const expiresAt = identityData.expires_at as number | undefined;

      console.log(`Token extraction for ${provider}:`, {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        expiresAt: expiresAt,
      });

      if (accessToken) {
        // Store token using our database function
        console.log(`Attempting to store token for ${provider}`);
        const { error: storeError } = await supabase.rpc("store_oauth_token", {
          p_user_id: user.id,
          p_provider: provider,
          p_access_token: accessToken,
          p_refresh_token: refreshToken || null,
          p_expires_at: expiresAt || null,
        });

        if (!storeError) {
          storedCount++;
          storedProviders.push(provider);
          console.log(`✅ Stored OAuth token for ${provider} for user ${user.id}`);
        } else {
          console.error(`❌ Failed to store token for ${provider}:`, storeError);
        }
      } else {
        console.log(`⚠️ No access_token found in identity_data for ${provider}`);
        console.log(`Identity data sample:`, JSON.stringify(identityData).substring(0, 500));
      }
    }

    return new Response(
      JSON.stringify({
        message: `Stored ${storedCount} OAuth token(s)`,
        stored: storedCount,
        providers: storedProviders,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Capture OAuth tokens error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

