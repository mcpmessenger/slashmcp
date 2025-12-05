# Debug Guide: Guest Mode Not Working

## Issue
- Guest users can enter text
- Text disappears after sending
- No response received
- Logged-in users work fine

## Logs to Check (After Deployment)

After deployment completes (2-5 minutes), test as a guest user and check the console for these logs:

### 1. Initial State Check
Look for:
```
[useChat] Guest mode: true  ← Should be TRUE for guest users
[useChat] Session: none     ← Should be "none" for guest users
[useChat] Auth ready: true  ← Should be true
```

### 2. Auth Setup
Look for:
```
[useChat] ===== AUTH SETUP FOR GUEST MODE =====
[useChat] Guest mode: true
[useChat] Session token exists: false  ← Should be false
[useChat] Publishable key exists: true  ← Should be true
[useChat] Using publishable key for auth (guest mode or no session)
[useChat] Authorization header set: Bearer ***  ← Should show "Bearer ***"
```

**If you see:**
- `Publishable key exists: false` → **Problem:** `VITE_SUPABASE_PUBLISHABLE_KEY` not set
- `ERROR: VITE_SUPABASE_PUBLISHABLE_KEY is missing!` → **Problem:** Key is undefined
- `ERROR: No auth token available!` → **Problem:** Neither session nor publishable key available

### 3. Fetch Request
Look for:
```
[useChat] ===== ABOUT TO SEND FETCH REQUEST =====
[useChat] Guest mode: true
[useChat] Sending request to: https://...supabase.co/functions/v1/chat
[useChat] Headers: { Authorization: "Bearer ***", ... }
```

**If you DON'T see this:** Execution stopped before fetch (check earlier logs)

### 4. Fetch Execution
Look for:
```
[useChat] ===== STARTING FETCH REQUEST =====
[useChat] Guest mode: true
[useChat] Starting fetch to: ...
```

**If you see this but nothing after:** Fetch is hanging (check Network tab)

### 5. Fetch Response
Look for:
```
[useChat] ===== FETCH COMPLETED =====
[useChat] Guest mode: true
[useChat] Response status: 200  ← Should be 200
[useChat] Response ok: true      ← Should be true
```

**If you see:**
- `Response status: 401` → **Problem:** Authentication failed (publishable key invalid)
- `Response status: 403` → **Problem:** Forbidden (guest mode not allowed)
- `Response status: 405` → **Problem:** Method not allowed
- `Response status: 500` → **Problem:** Server error

### 6. Error Cases
Look for:
```
[useChat] ===== FETCH ERROR =====
[useChat] Response not OK: [status] [statusText]
[useChat] Error response body: [error message]
```

Or:
```
[useChat] ===== NO RESPONSE BODY =====
[useChat] Response has no body!
```

## Common Issues and Fixes

### Issue 1: Publishable Key Missing
**Symptoms:**
- `Publishable key exists: false`
- `ERROR: VITE_SUPABASE_PUBLISHABLE_KEY is missing!`

**Fix:**
1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Add `VITE_SUPABASE_PUBLISHABLE_KEY` with your Supabase anon key
3. Redeploy

### Issue 2: 401 Unauthorized
**Symptoms:**
- `Response status: 401`
- `Response not OK: 401 Unauthorized`

**Fix:**
- Publishable key is incorrect or expired
- Check Vercel environment variables
- Verify the key matches your Supabase project

### Issue 3: 403 Forbidden
**Symptoms:**
- `Response status: 403`
- `Response not OK: 403 Forbidden`

**Fix:**
- Chat function might require authentication
- Check Supabase Edge Function RLS policies
- May need to allow anonymous access

### Issue 4: Text Disappears
**Symptoms:**
- Message appears, then disappears
- No error logs

**Possible Causes:**
- Early return in code (check for `return;` statements)
- Error in message handling
- State update issue

**Check:**
- Look for logs showing `setMessages(prev => prev.slice(0, -1))` - this removes the last message
- Check if there's an error that causes early return

### Issue 5: No Network Request
**Symptoms:**
- Logs stop before "STARTING FETCH REQUEST"
- No request in Network tab

**Check:**
- Look for the last log that appears
- Check if there's an early return or error before fetch

## Testing Steps

1. **Enable Guest Mode:**
   - Click "Continue as guest" or enable guest mode
   - Verify `guestMode: true` in logs

2. **Send a Test Message:**
   - Type "test" and send
   - Watch console immediately

3. **Check Logs in Order:**
   - `[useChat] Guest mode: true` (should appear multiple times)
   - `[useChat] ===== AUTH SETUP FOR GUEST MODE =====`
   - `[useChat] Using publishable key for auth`
   - `[useChat] ===== STARTING FETCH REQUEST =====`
   - `[useChat] ===== FETCH COMPLETED =====`

4. **Check Network Tab:**
   - Look for `/functions/v1/chat` request
   - Check status code
   - Check response body

5. **Share Results:**
   - Copy all console logs
   - Note which logs appear and which don't
   - Share the last log that appears

## Quick Checklist

- [ ] Guest mode is `true` in logs
- [ ] Publishable key exists
- [ ] Authorization header is set
- [ ] Fetch request is made (check Network tab)
- [ ] Response status is 200
- [ ] Response body exists
- [ ] Stream is being read

## Next Steps

After testing, share:
1. All console logs (especially error-level ones)
2. Network tab screenshot showing the chat request
3. Which step fails (auth setup, fetch, response, stream)

This will help identify the exact issue with guest mode.

