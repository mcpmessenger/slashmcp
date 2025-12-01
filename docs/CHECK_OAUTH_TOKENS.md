# How to Check OAuth Token Capture

## Step 1: Check Browser Console

After signing in with Google, look for these messages in the browser console:

- `[OAuth] Tokens captured:` - Success message with token count
- `[OAuth] Failed to capture tokens:` - Error message
- `[OAuth] No tokens were stored` - Warning that no tokens found

## Step 2: Check Supabase Edge Function Logs

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions)
2. Click on **capture-oauth-tokens** function
3. Go to **Logs** tab
4. Look for messages like:
   - `Processing X identity(ies) for user...`
   - `Checking identity for provider google:`
   - `Token extraction for google:`
   - `⚠️ No access_token found in identity_data for google`

## Step 3: Manual Token Capture Test

In the browser console, run:

```javascript
// Get the session data from localStorage
const sessionKey = 'sb-akxdroedpsvmckvqvggr-auth-token';
const sessionData = localStorage.getItem(sessionKey);

if (!sessionData) {
  console.error("No session data found in localStorage");
} else {
  const parsed = JSON.parse(sessionData);
  console.log("Session data structure:", parsed);
  
  // Try different possible session locations
  const session = parsed.currentSession || parsed.session || parsed;
  console.log("Extracted session:", session);
  
  if (session?.access_token) {
    const SUPABASE_URL = "https://akxdroedpsvmckvqvggr.supabase.co";
    const response = await fetch(`${SUPABASE_URL}/functions/v1/capture-oauth-tokens`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const result = await response.json();
    console.log("Capture result:", result);
  } else {
    console.error("No access_token found in session");
  }
}
```

## Expected Results

### If tokens are found:
```json
{
  "message": "Stored 1 OAuth token(s)",
  "stored": 1,
  "providers": ["google"]
}
```

### If tokens are NOT found:
```json
{
  "message": "No OAuth identities found",
  "stored": 0
}
```

OR the logs will show:
- `⚠️ No access_token found in identity_data for google`
- `Identity data sample: {...}` (showing what IS in identity_data)

## The Problem

Supabase **encrypts** OAuth provider tokens and doesn't expose them in `identity_data` by default. The tokens are stored but encrypted, so we can't access them via the admin API.

## Solution Options

1. **Use Supabase Webhooks** - Set up a webhook that fires on user sign-in to capture tokens
2. **Get tokens from Google directly** - Use Google OAuth on frontend, get tokens, send to backend
3. **Use Supabase's built-in token refresh** - If we can get refresh tokens, we can refresh access tokens

## Next Steps

Share what you see in:
1. Browser console (any `[OAuth]` messages?)
2. Supabase Edge Function logs (what does `capture-oauth-tokens` show?)

This will help determine the best solution.

