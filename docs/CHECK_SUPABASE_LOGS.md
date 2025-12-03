# How to Check Supabase Logs for DocumentsSidebar Issues

## If Console Logs Are Missing

If you're not seeing console logs from DocumentsSidebar, it could mean:
1. The component isn't rendering (check Index.tsx condition)
2. JavaScript errors are preventing execution
3. Console filters are hiding the logs
4. The build isn't deployed yet

## Checking Supabase Logs

Even if frontend logs are missing, we can check if queries are reaching Supabase:

### Method 1: Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr
2. Navigate to **Logs** → **Postgres Logs** or **API Logs**
3. Look for queries to `processing_jobs` table
4. Check for:
   - SELECT queries with `user_id` filter
   - Any errors or timeouts
   - RLS policy violations

### Method 2: Network Tab in Browser
1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Filter by "supabase" or "rest"
4. Look for requests to:
   - `/rest/v1/processing_jobs`
   - Check request headers (should include `authorization`)
   - Check response status (200, 401, 403, 500, etc.)
   - Check response body for errors

### Method 3: Check RLS Policies
1. Go to Supabase Dashboard → **Database** → **Policies**
2. Check `processing_jobs` table policies
3. Verify:
   - Policy exists for SELECT
   - Policy uses `auth.uid() = user_id`
   - Policy is enabled

## What to Look For

### If Query Reaches Supabase:
- **200 OK**: Query succeeded, check response data
- **401 Unauthorized**: Session token invalid/expired
- **403 Forbidden**: RLS policy blocking (user_id mismatch)
- **500 Internal Server Error**: Database/query error
- **Timeout**: Query taking too long (>10 seconds)

### If Query Doesn't Reach Supabase:
- Component not rendering
- JavaScript error preventing fetch
- Network connectivity issue
- CORS issue (shouldn't happen with Supabase)

## Quick Diagnostic Commands

### Check if component is rendering:
```javascript
// In browser console:
document.querySelector('[class*="Documents"]') // Should find the sidebar
```

### Check if session exists:
```javascript
// In browser console:
window.supabase?.auth?.getSession().then(r => console.log('Session:', r.data.session))
```

### Check localStorage for session:
```javascript
// In browser console:
Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('auth'))
```

### Manually test the query:
```javascript
// In browser console (replace USER_ID with actual user ID):
const { data, error } = await window.supabase
  .from('processing_jobs')
  .select('*')
  .eq('user_id', 'USER_ID')
  .limit(10);
console.log('Data:', data, 'Error:', error);
```

