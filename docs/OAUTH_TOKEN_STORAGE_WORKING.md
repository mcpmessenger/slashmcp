# OAuth Token Storage - Working Solution

## What Works

The OAuth token storage system is now fully functional. Here's what was implemented and what works:

### ✅ Working Components

1. **Token Capture Function** (`supabase/functions/capture-oauth-tokens/index.ts`)
   - Captures OAuth tokens from localStorage after Google sign-in
   - Uses Supabase Admin API to store tokens in `user.app_metadata.oauth_tokens`
   - Automatically called after Google OAuth sign-in

2. **Token Storage Location**
   - Tokens are stored in: `user.app_metadata.oauth_tokens.google`
   - Format:
     ```json
     {
       "oauth_tokens": {
         "google": {
           "access_token": "...",
           "refresh_token": "...",
           "expires_at": "1234567890"
         }
       }
     }
     ```

3. **Token Retrieval** (`supabase/functions/_shared/oauth.ts`)
   - `getOAuthTokenFromRequest()` retrieves tokens from `app_metadata.oauth_tokens`
   - Falls back to checking `identity_data` if not found in app_metadata
   - Works seamlessly with Gmail API

4. **Email Sending** (`supabase/functions/mcp/index.ts`)
   - `handleEmail()` function retrieves stored tokens
   - Uses Gmail API to send emails
   - Automatically uses logged-in user's email address

## How It Works

### Step 1: User Signs In with Google

1. User clicks "Sign in with Google"
2. Frontend (`src/hooks/useChat.ts`) requests OAuth scopes:
   - `openid email profile`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar`
3. Google shows consent screen
4. User grants permissions

### Step 2: Token Capture

1. After successful sign-in, `onAuthStateChange` listener triggers
2. Frontend calls `capture-oauth-tokens` Edge Function
3. Function extracts `provider_token` and `provider_refresh_token` from localStorage
4. Function uses Supabase Admin API to update `user.app_metadata`:
   ```typescript
   await supabase.auth.admin.updateUserById(user.id, {
     app_metadata: {
       ...currentMetadata,
       oauth_tokens: {
         google: {
           access_token: provider_token,
           refresh_token: provider_refresh_token,
           expires_at: expires_at,
         }
       }
     }
   });
   ```

### Step 3: Token Retrieval

1. When sending email, `handleEmail()` calls `getOAuthTokenFromRequest()`
2. Function retrieves token from `app_metadata.oauth_tokens.google`
3. Token is used to authenticate Gmail API requests

### Step 4: Email Sending

1. Gmail API is called with the stored OAuth token
2. Email is sent to the logged-in user's email address
3. User receives the email

## Key Implementation Details

### Why Admin API Instead of Database Function?

Initially, we tried using a PostgreSQL function (`store_oauth_token`) to update `auth.users.app_metadata`, but this failed with "column app_metadata does not exist" error. This is because:

1. Supabase restricts direct SQL access to `auth.users` table
2. The `auth` schema requires special permissions
3. Admin API is the recommended way to update user metadata

**Solution:** Use `supabase.auth.admin.updateUserById()` which has proper permissions.

### Token Storage Format

```typescript
// Stored in user.app_metadata
{
  oauth_tokens: {
    google: {
      access_token: "ya29.a0ATi6K2v...",
      refresh_token: "1//011icsoUSljA4...",
      expires_at: "1764483584"
    }
  }
}
```

### Frontend Integration

The frontend automatically captures tokens after Google sign-in:

```typescript
// In src/hooks/useChat.ts
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.provider_token) {
    // Automatically capture OAuth tokens
    await captureOAuthTokens();
  }
});
```

## Testing

### Manual Token Capture

You can manually trigger token capture from browser console:

```javascript
// Get session from localStorage
const sessionKey = 'sb-akxdroedpsvmckvqvggr-auth-token';
const sessionData = localStorage.getItem(sessionKey);
const parsed = sessionData ? JSON.parse(sessionData) : null;

if (parsed?.provider_token) {
  const SUPABASE_URL = "https://akxdroedpsvmckvqvggr.supabase.co";
  const response = await fetch(`${SUPABASE_URL}/functions/v1/capture-oauth-tokens`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${parsed.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider_token: parsed.provider_token,
      provider_refresh_token: parsed.provider_refresh_token,
      expires_at: parsed.expires_at,
    }),
  });
  const result = await response.json();
  console.log("Capture result:", result);
}
```

### Test Email Sending

```javascript
// Via chat interface
"Send me an email with a story about penguins"

// Or via browser console
const sessionKey = 'sb-akxdroedpsvmckvqvggr-auth-token';
const sessionData = localStorage.getItem(sessionKey);
const parsed = sessionData ? JSON.parse(sessionData) : null;

if (parsed?.access_token) {
  const SUPABASE_URL = "https://akxdroedpsvmckvqvggr.supabase.co";
  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${parsed.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      serverId: "email-mcp",
      command: "send_test_email",
      args: {
        subject: "Test Email",
        body: "This is a test email!",
      },
    }),
  });
  const result = await response.json();
  console.log("Email result:", result);
}
```

## Troubleshooting

### "Gmail OAuth tokens not available"

**Cause:** Tokens haven't been captured yet.

**Solution:**
1. Sign out completely
2. Sign back in with Google
3. Grant all requested permissions
4. Tokens should be automatically captured

### "Stored 0 OAuth token(s)"

**Cause:** Token capture failed.

**Check:**
1. Supabase Edge Function logs for `capture-oauth-tokens`
2. Browser console for errors
3. Verify `provider_token` exists in localStorage

**Solution:**
- Manually trigger token capture (see Testing section above)
- Check that you're signed in with Google (not email/password)

### Email Not Sending

**Check:**
1. Verify tokens are stored: Check Supabase logs for "Found token in app_metadata.oauth_tokens.google"
2. Verify Gmail API is enabled in Google Cloud Console
3. Check Edge Function logs for Gmail API errors

## Files Modified

1. `supabase/functions/capture-oauth-tokens/index.ts` - Token capture using Admin API
2. `supabase/functions/mcp/index.ts` - Email handler with Gmail API
3. `supabase/functions/_shared/oauth.ts` - Token retrieval from app_metadata
4. `src/hooks/useChat.ts` - Automatic token capture after sign-in
5. `src/lib/mcp/registry.ts` - Email MCP server registration

## Next Steps

- ✅ Gmail OAuth working
- ⏳ Add Outlook OAuth support
- ⏳ Add iCloud OAuth support
- ⏳ Implement token refresh for expired tokens
- ⏳ Add Google Calendar integration

