/**
 * OAuth token utilities for accessing user's provider tokens
 * When users sign in with OAuth (e.g., Google), Supabase stores provider tokens
 * that can be used for making API calls to third-party services.
 */

import { supabaseClient } from "./supabaseClient";

export interface OAuthProviderToken {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * Get the user's OAuth provider token for a specific provider
 * This extracts provider tokens from the Supabase session
 * 
 * Note: Supabase stores provider tokens in the auth.identities table,
 * but they're not directly accessible via the client SDK. This function
 * attempts to get them from the session or user metadata.
 * 
 * For full access to provider tokens, edge functions need to use the
 * service role key to query auth.identities.
 */
export async function getUserOAuthToken(provider: string): Promise<OAuthProviderToken | null> {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session?.user) {
      return null;
    }

    // Check if provider token is in user metadata
    const userMetadata = session.user.user_metadata as Record<string, unknown> | undefined;
    if (userMetadata) {
      const providerToken = userMetadata[`${provider}_token`] as string | undefined;
      const providerRefreshToken = userMetadata[`${provider}_refresh_token`] as string | undefined;
      
      if (providerToken) {
        return {
          provider,
          accessToken: providerToken,
          refreshToken: providerRefreshToken,
        };
      }
    }

    // For Google OAuth, check app_metadata
    const appMetadata = session.user.app_metadata as Record<string, unknown> | undefined;
    if (appMetadata?.provider === provider && appMetadata?.providers) {
      const providers = appMetadata.providers as Record<string, unknown>;
      const providerData = providers[provider] as { access_token?: string; refresh_token?: string } | undefined;
      
      if (providerData?.access_token) {
        return {
          provider,
          accessToken: providerData.access_token,
          refreshToken: providerData.refresh_token,
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`Failed to get OAuth token for ${provider}:`, error);
    return null;
  }
}

/**
 * Get all available OAuth provider tokens for the current user
 */
export async function getAllUserOAuthTokens(): Promise<OAuthProviderToken[]> {
  const providers = ["google", "github", "discord", "azure", "facebook"];
  const tokens: OAuthProviderToken[] = [];

  for (const provider of providers) {
    const token = await getUserOAuthToken(provider);
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Check if the user is signed in with a specific OAuth provider
 */
export async function isSignedInWithProvider(provider: string): Promise<boolean> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (!session?.user) {
    return false;
  }

  // Check app_metadata for provider
  const appMetadata = session.user.app_metadata as Record<string, unknown> | undefined;
  if (appMetadata?.provider === provider) {
    return true;
  }

  // Check identities (if available in metadata)
  const identities = session.user.identities as Array<{ provider: string }> | undefined;
  if (identities?.some(identity => identity.provider === provider)) {
    return true;
  }

  return false;
}

