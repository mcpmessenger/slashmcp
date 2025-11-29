# Using OAuth Provider Tokens

## Overview

When users sign in with OAuth (e.g., Google), Supabase stores the provider tokens (access tokens, refresh tokens) in the `auth.identities` table. The app now uses these tokens for making API calls to third-party services on behalf of the signed-in user.

## How It Works

### Client-Side (Frontend)

1. **User signs in with OAuth** (e.g., Google)
2. **Supabase stores provider tokens** in the user's identity
3. **Client sends user's session token** to edge functions
4. **Edge functions extract OAuth tokens** from the user's identity

### Server-Side (Edge Functions)

1. **Edge function receives user's session token** in Authorization header
2. **Extracts user ID** from the session token
3. **Queries auth.identities** using service role key to get provider tokens
4. **Uses provider tokens** for API calls to third-party services

## Implementation

### Client-Side Changes

All API calls now use `getAuthHeaders()` which:
- Gets the user's session token
- Sends it to edge functions
- Allows edge functions to access OAuth provider tokens

```typescript
// src/lib/api.ts
import { supabaseClient } from "./supabaseClient";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (session?.access_token) {
    // Send user's session token so edge functions can extract OAuth tokens
    return {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    };
  }
  // Fallback to anon key if not signed in
  return {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  };
}
```

### Server-Side Utilities

Edge functions can use `getOAuthTokenFromRequest()` to extract provider tokens:

```typescript
// supabase/functions/_shared/oauth.ts
import { getOAuthTokenFromRequest } from "../_shared/oauth.ts";

serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");
  
  // Get user's Google OAuth token
  const googleToken = await getOAuthTokenFromRequest(
    authHeader,
    "google",
    SUPABASE_URL,
    SERVICE_ROLE_KEY
  );
  
  if (googleToken) {
    // Use googleToken.accessToken for Google API calls
    const response = await fetch("https://www.googleapis.com/...", {
      headers: {
        Authorization: `Bearer ${googleToken.accessToken}`,
      },
    });
  }
});
```

## Example: Using Google OAuth Token

Here's how to use a user's Google OAuth token in an edge function:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getOAuthTokenFromRequest } from "../_shared/oauth.ts";

serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");
  
  // Get user's Google OAuth token
  const googleToken = await getOAuthTokenFromRequest(
    authHeader,
    "google",
    SUPABASE_URL,
    SERVICE_ROLE_KEY
  );
  
  if (!googleToken) {
    return new Response(
      JSON.stringify({ error: "User must sign in with Google" }),
      { status: 401 }
    );
  }
  
  // Use the token to call Google APIs
  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    headers: {
      Authorization: `Bearer ${googleToken.accessToken}`,
    },
  });
  
  const data = await response.json();
  return new Response(JSON.stringify(data));
});
```

## Supported Providers

The OAuth utility supports these providers:
- `google` - Google OAuth
- `github` - GitHub OAuth
- `discord` - Discord OAuth
- `azure` - Azure AD OAuth
- `facebook` - Facebook OAuth

## Benefits

1. **User-specific API calls**: Each user's API calls use their own OAuth tokens
2. **No shared credentials**: No need to store API keys in environment variables
3. **Automatic token management**: Supabase handles token refresh
4. **Better security**: Tokens are scoped to individual users

## Limitations

1. **Service role key required**: Edge functions need the service role key to access `auth.identities`
2. **Token format varies**: Different providers store tokens in different formats
3. **Token expiration**: Tokens may expire and need refresh (Supabase handles this automatically)

## Troubleshooting

### "No OAuth token found"

- User must sign in with the specific OAuth provider
- Check that the provider is enabled in Supabase Dashboard
- Verify the user's identity exists in `auth.identities`

### "Token expired"

- Supabase automatically refreshes tokens
- If refresh fails, user may need to re-authenticate
- Check Supabase logs for refresh errors

### "Access denied"

- Verify the OAuth scopes requested during sign-in
- Some APIs require specific scopes (e.g., Google Drive needs `drive.readonly`)
- Check provider's API documentation for required scopes

## Next Steps

1. **Update edge functions** to use `getOAuthTokenFromRequest()` for API calls
2. **Request appropriate scopes** during OAuth sign-in
3. **Handle token refresh** if needed (Supabase handles this automatically)
4. **Test with different providers** to ensure compatibility

