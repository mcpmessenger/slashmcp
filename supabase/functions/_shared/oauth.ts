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

    // Get user's identity data
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
    if (!identityData) {
      return null;
    }

    // Provider tokens are typically stored in identity_data
    // Format may vary by provider, but common fields:
    const accessToken = identityData.access_token as string | undefined;
    const refreshToken = identityData.refresh_token as string | undefined;
    const expiresAt = identityData.expires_at as number | undefined;

    if (!accessToken) {
      // Some providers store tokens differently - check alternative locations
      // For Google, tokens might be in app_metadata
      const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
      if (appMetadata?.provider === provider) {
        const providerData = appMetadata.providers as Record<string, unknown> | undefined;
        const googleData = providerData?.[provider] as { access_token?: string; refresh_token?: string } | undefined;
        
        if (googleData?.access_token) {
          return {
            provider,
            accessToken: googleData.access_token,
            refreshToken: googleData.refresh_token,
          };
        }
      }
      
      return null;
    }

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

