/**
 * OAuth utility functions for Supabase Edge Functions
 * Extracts OAuth provider tokens from user's identity
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OAuthProviderToken {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * Get the user's OAuth provider token from their Supabase identity
 * 
 * When a user signs in with OAuth (e.g., Google), Supabase stores the provider tokens
 * in the auth.identities table. This function extracts them using the service role key.
 * 
 * @param userId - The user's UUID from Supabase auth
 * @param provider - The OAuth provider name (e.g., "google", "github")
 * @param supabaseUrl - Supabase project URL
 * @param serviceRoleKey - Supabase service role key (required to access auth.identities)
 */
export async function getUserOAuthToken(
  userId: string,
  provider: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<OAuthProviderToken | null> {
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Try querying auth.identities table directly via SQL
    // Supabase stores tokens in the encrypted identity_data JSONB column
    // We need to query it directly to access the tokens
    try {
      const { data: identityRows, error: sqlError } = await supabase.rpc('get_oauth_token', {
        p_user_id: userId,
        p_provider: provider,
      }).catch(() => ({ data: null, error: { message: 'RPC function not available' } }));

      if (!sqlError && identityRows) {
        console.log(`Found OAuth token via RPC for ${provider}`);
        return identityRows as OAuthProviderToken;
      }
    } catch (rpcError) {
      console.log(`RPC method not available, trying direct query`);
    }

    // Fallback: Query auth.identities table directly using SQL
    try {
      // Use PostgREST to query auth schema (requires service role key)
      const { data: identities, error: queryError } = await supabase
        .from('auth.identities')
        .select('identity_data, provider')
        .eq('user_id', userId)
        .eq('provider', provider)
        .single();

      if (!queryError && identities) {
        const identityData = identities.identity_data as Record<string, unknown> | undefined;
        const accessToken = identityData?.access_token as string | undefined;
        const refreshToken = identityData?.refresh_token as string | undefined;
        const expiresAt = identityData?.expires_at as number | undefined;

        if (accessToken) {
          console.log(`Found OAuth token via direct SQL query for ${provider}`);
          return {
            provider,
            accessToken,
            refreshToken,
            expiresAt,
          };
        }
      }
    } catch (sqlError) {
      console.log(`Direct SQL query failed, trying admin API`);
    }

    // Fallback to admin API method
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError || !user) {
      console.error(`Failed to get user ${userId}:`, userError);
      return null;
    }

    // Check identities array for the provider
    const identities = user.identities as Array<{
      provider: string;
      identity_data?: Record<string, unknown>;
    }> | undefined;

    if (!identities) {
      return null;
    }

    const identity = identities.find((id) => id.provider === provider);
    if (!identity) {
      return null;
    }

    // Extract tokens from identity_data
    const identityData = identity.identity_data as Record<string, unknown> | undefined;
    
    // Log what we found for debugging
    console.log(`OAuth token lookup for ${provider}:`, {
      userId,
      hasIdentity: !!identity,
      hasIdentityData: !!identityData,
      identityDataKeys: identityData ? Object.keys(identityData) : [],
      // Don't log actual tokens, but log if they exist
      hasAccessToken: identityData ? !!identityData.access_token : false,
      hasRefreshToken: identityData ? !!identityData.refresh_token : false,
    });
    
    if (!identityData) {
      console.log(`No identity_data found for ${provider} identity`);
      return null;
    }

    // Provider tokens are typically stored in identity_data
    // Format may vary by provider, but common fields:
    const accessToken = identityData.access_token as string | undefined;
    const refreshToken = identityData.refresh_token as string | undefined;
    const expiresAt = identityData.expires_at as number | undefined;

    if (!accessToken) {
      console.log(`No access_token in identity_data for ${provider}, checking app_metadata`);
      
      // Check app_metadata for stored OAuth tokens (from our custom storage function)
      const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
      console.log(`app_metadata check:`, {
        hasAppMetadata: !!appMetadata,
        appMetadataKeys: appMetadata ? Object.keys(appMetadata) : [],
      });
      
      // Check our custom oauth_tokens storage
      const oauthTokens = appMetadata?.oauth_tokens as Record<string, {
        access_token?: string;
        refresh_token?: string;
        expires_at?: string;
      }> | undefined;
      
      // Support both "google" and "azure" provider names
      const providerKey = provider === "microsoft" || provider === "outlook" ? "azure" : provider;
      
      if (oauthTokens?.[providerKey]?.access_token || oauthTokens?.[provider]?.access_token) {
        const tokenData = oauthTokens[providerKey] || oauthTokens[provider];
        console.log(`Found token in app_metadata.oauth_tokens.${providerKey || provider}`);
        return {
          provider,
          accessToken: tokenData.access_token!,
          refreshToken: tokenData.refresh_token,
          expiresAt: tokenData.expires_at ? parseInt(tokenData.expires_at) : undefined,
        };
      }
      
      // Legacy check for old format
      if (appMetadata?.provider === provider) {
        const providerData = appMetadata.providers as Record<string, unknown> | undefined;
        const googleData = providerData?.[provider] as { access_token?: string; refresh_token?: string } | undefined;
        
        if (googleData?.access_token) {
          console.log(`Found token in app_metadata.providers.${provider}`);
          return {
            provider,
            accessToken: googleData.access_token,
            refreshToken: googleData.refresh_token,
          };
        }
      }
      
      // Try to query the raw identity_data JSONB column
      // Note: Supabase encrypts this, but we can try to access it via raw SQL
      console.log(`No OAuth token found via standard methods. Attempting raw SQL query...`);
      
      // The tokens might be encrypted in Supabase's auth schema
      // We need to use a database function or webhook to capture them during OAuth callback
      console.log(`No OAuth token found for ${provider}. Tokens may be encrypted or not stored.`);
      return null;
    }
    
    console.log(`Found OAuth token for ${provider} in identity_data`);

    return {
      provider,
      accessToken,
      refreshToken,
      expiresAt,
    };
  } catch (error) {
    console.error(`Failed to get OAuth token for ${provider}:`, error);
    return null;
  }
}

/**
 * Get all OAuth provider tokens for a user
 */
export async function getAllUserOAuthTokens(
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<OAuthProviderToken[]> {
  const providers = ["google", "github", "discord", "azure", "facebook"];
  const tokens: OAuthProviderToken[] = [];

  for (const provider of providers) {
    const token = await getUserOAuthToken(userId, provider, supabaseUrl, serviceRoleKey);
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Extract user ID and OAuth tokens from an authorization header
 * This is a convenience function for edge functions
 */
export async function getOAuthTokenFromRequest(
  authHeader: string | null,
  provider: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<OAuthProviderToken | null> {
  if (!authHeader) {
    return null;
  }

  try {
    const accessToken = authHeader.replace(/Bearer\s+/i, "").trim();
    if (!accessToken) {
      return null;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    
    if (userError || !user) {
      return null;
    }

    return await getUserOAuthToken(user.id, provider, supabaseUrl, serviceRoleKey);
  } catch (error) {
    console.error("Failed to extract OAuth token from request:", error);
    return null;
  }
}

