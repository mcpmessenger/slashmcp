# Checking Supabase Auth Timeouts

## 🔴 Issue: Supabase Timing Out on Sign-In

If you're experiencing timeouts during OAuth sign-in, check these logs:

---

## 📊 Direct Links to Supabase Logs

### 1. **Auth Logs (Most Important for Sign-In Issues)**
**Direct Link:**
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/auth-logs

**What to look for:**
- OAuth callback requests
- Session creation attempts
- Token refresh failures
- Timeout errors
- Rate limiting errors

### 2. **Edge Functions Logs (For OAuth Callback Processing)**
**Direct Link:**
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/edge-logs

**Filter by:**
- Function: `capture-oauth-tokens` (if OAuth tokens are being captured)
- Time: Last 5 minutes or Last hour

### 3. **Database Logs (For RLS/Query Issues)**
**Direct Link:**
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/postgres-logs

**What to look for:**
- Slow queries
- RLS policy violations
- Connection timeouts
- Query timeouts

### 4. **API Logs (For Auth API Calls)**
**Direct Link:**
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/api-logs

**Filter by:**
- Path: `/auth/v1/*`
- Method: `POST`, `GET`
- Status: `500`, `504`, `timeout`

---

## 🔧 Supabase CLI Commands

### Check if CLI is Installed
```bash
npx supabase --version
```

### Link to Your Project
```bash
npx supabase link --project-ref akxdroedpsvmckvqvggr
```

### View Logs via CLI

**Note:** The Supabase CLI has limited log viewing capabilities. The dashboard method above is more reliable.

#### Option 1: Try Functions Logs (May Not Work)
```bash
# This command may not be available in all CLI versions
npx supabase functions logs --project-ref akxdroedpsvmckvqvggr
```

#### Option 2: Check Database Logs (If Available)
```bash
# Database logs via CLI (if supported)
npx supabase db logs --project-ref akxdroedpsvmckvqvggr
```

#### Option 3: Check Project Status
```bash
# Check project health
npx supabase status --project-ref akxdroedpsvmckvqvggr
```

---

## 🔍 What to Look For in Auth Logs

### 1. OAuth Callback Timeouts

**Look for:**
```
Timeout waiting for OAuth response
OAuth callback took longer than X seconds
```

**Common causes:**
- Google OAuth taking too long to respond
- Network issues between Supabase and Google
- Supabase auth service overloaded

### 2. Session Creation Failures

**Look for:**
```
Failed to create session
Session creation timeout
Error: session_not_found
```

**Common causes:**
- Database connection timeout
- RLS policy blocking session creation
- Token validation timeout

### 3. Token Refresh Failures

**Look for:**
```
Token refresh failed
Refresh token expired
Error refreshing session
```

**Common causes:**
- Refresh token expired
- Invalid token format
- Network timeout during refresh

### 4. Rate Limiting

**Look for:**
```
Rate limit exceeded
Too many requests
429 status code
```

**Common causes:**
- Too many sign-in attempts
- Rapid OAuth redirects (loop)
- API quota exceeded

---

## 📋 SQL Queries to Check Auth Issues

### Check Recent Auth Events

**Run in Supabase SQL Editor:**
```sql
-- Check recent auth events (if auth_logs table exists)
SELECT 
  id,
  event_type,
  created_at,
  metadata
FROM auth.audit_log_entries
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 50;
```

### Check for Stuck Sessions

```sql
-- Check for sessions that might be causing issues
SELECT 
  id,
  user_id,
  created_at,
  updated_at,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry
FROM auth.sessions
WHERE expires_at > NOW()
ORDER BY created_at DESC
LIMIT 20;
```

### Check OAuth Providers

```sql
-- Check OAuth provider configurations
SELECT 
  id,
  provider,
  created_at,
  updated_at
FROM auth.identities
WHERE provider = 'google'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🚨 Common Timeout Scenarios

### Scenario 1: OAuth Callback Timeout

**Symptoms:**
- User clicks "Sign in with Google"
- Redirects to Google
- Google approves
- Stuck on callback page
- Console shows timeout errors

**Check:**
1. Auth logs for callback requests
2. Network tab for slow requests to `/auth/v1/callback`
3. Edge function logs if using custom callback handler

**Fix:**
- Increase timeout in OAuth callback handler
- Check Supabase project health status
- Verify redirect URLs are correct

### Scenario 2: Session Creation Timeout

**Symptoms:**
- OAuth succeeds
- Session never gets created
- User stays on login page

**Check:**
1. Database logs for slow queries
2. RLS policies blocking session creation
3. Database connection pool exhaustion

**Fix:**
- Check database performance
- Review RLS policies
- Increase connection pool size

### Scenario 3: Token Validation Timeout

**Symptoms:**
- Session exists in localStorage
- App can't validate session
- `getSession()` times out

**Check:**
1. API logs for `/auth/v1/token` requests
2. Network tab for slow token validation
3. Supabase project status

**Fix:**
- Check Supabase service status
- Verify network connectivity
- Clear localStorage and retry

---

## 🔗 Quick Access Links

### Main Dashboard
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr

### Auth Settings
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/auth/providers

### URL Configuration (OAuth Redirects)
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/auth/url-configuration

### Project Settings
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/settings/general

### API Settings
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/settings/api

---

## 🛠️ Troubleshooting Steps

### Step 1: Check Supabase Status
1. Go to: https://status.supabase.com/
2. Check if there are any ongoing incidents
3. Check your project's health status

### Step 2: Check Project Health
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr
2. Look for any warning indicators
3. Check database connection status
4. Check API status

### Step 3: Review Auth Logs
1. Open: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/auth-logs
2. Filter by time: Last 5 minutes
3. Look for error patterns
4. Check for timeout messages

### Step 4: Test OAuth Flow
1. Clear browser cache and localStorage
2. Try signing in again
3. Watch logs in real-time
4. Note exact time of timeout

### Step 5: Check Network Tab
1. Open browser DevTools → Network tab
2. Filter by: `supabase.co` or `auth`
3. Look for:
   - Requests taking > 30 seconds
   - 504 Gateway Timeout errors
   - 500 Internal Server Error
   - CORS errors

---

## 📝 Reporting Timeout Issues

When reporting timeout issues, include:

1. **Timestamp** - Exact time when timeout occurred
2. **Auth Logs** - Screenshot or copy of relevant log entries
3. **Network Tab** - Screenshot showing failed requests
4. **Browser Console** - All error messages
5. **Steps to Reproduce** - What you did before timeout
6. **Supabase Status** - Any incidents at that time

---

## 🔄 Quick Fixes to Try

### Fix 1: Clear Browser State
```javascript
// Run in browser console
localStorage.clear();
sessionStorage.clear();
window.location.reload();
```

### Fix 2: Check OAuth Redirect URLs
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/auth/url-configuration
2. Verify redirect URLs include:
   - `https://slashmcp.vercel.app/auth/callback`
   - `http://localhost:5173/auth/callback` (for local dev)

### Fix 3: Increase Timeout in Code
If using custom timeout handlers, increase timeout values:
```typescript
// In OAuthCallback.tsx or similar
const TIMEOUT_MS = 30000; // Increase from 20000 to 30000
```

### Fix 4: Check Database Performance
```sql
-- Check for slow queries
SELECT 
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## 📞 Support Resources

- **Supabase Status:** https://status.supabase.com/
- **Supabase Docs:** https://supabase.com/docs
- **Supabase Discord:** https://discord.supabase.com/
- **Supabase GitHub:** https://github.com/supabase/supabase

---

## 🎯 Most Likely Causes

Based on common issues:

1. **Supabase Service Overload** - Check status page
2. **Database Connection Pool Exhausted** - Check database logs
3. **RLS Policy Blocking** - Check RLS policies
4. **Network Issues** - Check network tab
5. **OAuth Provider Issues** - Check Google OAuth status
6. **Rate Limiting** - Check for too many requests
7. **Invalid Redirect URLs** - Check OAuth configuration



