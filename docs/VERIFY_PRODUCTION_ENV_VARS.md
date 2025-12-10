# Verify Production Environment Variables Are Working

## Current Status
✅ Environment variables exist in Vercel:
- `VITE_SUPABASE_REDIRECT_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_FUNCTIONS_URL`

## Next Steps to Verify They're Working

### Step 1: Verify Values Are Correct

**Click the eye icon next to each variable to reveal the value:**

1. **`VITE_SUPABASE_URL`** should be:
   - `https://akxdroedpsvmckvqvggr.supabase.co`

2. **`VITE_SUPABASE_FUNCTIONS_URL`** should be:
   - `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`

3. **`VITE_SUPABASE_PUBLISHABLE_KEY`** should be:
   - Your Supabase anon key (starts with `eyJ...`)

**If values are wrong:**
- Click the `...` menu → Edit
- Update the value
- Save
- Redeploy (see Step 2)

### Step 2: Verify App Has Been Redeployed

**After setting/updating environment variables:**

1. **Go to Deployments tab** in Vercel
2. **Check the latest deployment:**
   - Should be recent (after you set the variables)
   - Status should be "Ready" or "Building"

3. **If deployment is old:**
   - Click `...` on latest deployment
   - Click **"Redeploy"**
   - Wait 2-3 minutes for build to complete

### Step 3: Test in Production Browser

**After redeploy:**

1. **Open your production site**
2. **Hard refresh** (Ctrl+Shift+R or Cmd+Shift+R)
3. **Open browser console** (F12)
4. **Look for this log:**
   ```
   [api.ts] FUNCTIONS_URL configured: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
   ```

**If you see this:** ✅ Environment variables are working!

**If you see this instead:** ❌ Variables not loaded
   ```
   Missing VITE_SUPABASE_FUNCTIONS_URL. Upload API calls will fail until configured.
   ```

### Step 4: Test Document Upload

**Try uploading a document:**

1. **Upload a test file**
2. **Watch browser console** for:
   - `[triggerTextractJob] Calling: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker`
   - Should NOT see: "Network error - Failed to fetch"

3. **Check Network tab:**
   - Look for request to `/functions/v1/textract-worker`
   - Status should be 200 (not 404/500/failed)

## Quick Diagnostic Script

**Run this in browser console on production site:**

```javascript
// Check environment variables
console.log('=== Environment Variables Check ===');
console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_FUNCTIONS_URL:', import.meta.env.VITE_SUPABASE_FUNCTIONS_URL);
console.log('VITE_SUPABASE_PUBLISHABLE_KEY:', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'SET' : 'MISSING');

// Check computed FUNCTIONS_URL
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || 
  (import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : undefined);
console.log('Computed FUNCTIONS_URL:', FUNCTIONS_URL);

// Expected output:
// VITE_SUPABASE_URL: https://akxdroedpsvmckvqvggr.supabase.co
// VITE_SUPABASE_FUNCTIONS_URL: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
// Computed FUNCTIONS_URL: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
```

## Common Issues

### Issue 1: Variables Set But App Not Redeployed

**Symptom:** Variables exist but console shows "Missing VITE_SUPABASE_FUNCTIONS_URL"

**Fix:**
1. Go to Deployments tab
2. Click `...` on latest deployment
3. Click "Redeploy"
4. Wait for build to complete
5. Hard refresh browser

### Issue 2: Variables Set for Wrong Environment

**Symptom:** Variables exist but only for "Preview" or "Development"

**Fix:**
1. Edit each variable
2. Ensure "All Environments" is selected
3. Or specifically add for "Production"
4. Redeploy

### Issue 3: Values Are Incorrect

**Symptom:** Variables exist but URL is wrong

**Fix:**
1. Click `...` → Edit
2. Update value to: `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
3. Save
4. Redeploy

## Verification Checklist

- [ ] `VITE_SUPABASE_URL` value is: `https://akxdroedpsvmckvqvggr.supabase.co`
- [ ] `VITE_SUPABASE_FUNCTIONS_URL` value is: `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
- [ ] Variables are set for "All Environments" or "Production"
- [ ] App has been redeployed after setting variables
- [ ] Browser console shows `FUNCTIONS_URL configured: https://...`
- [ ] Document upload doesn't show "Network error"
- [ ] Network tab shows successful request to `/functions/v1/textract-worker`

## If Still Not Working

If variables are correct and app is redeployed but still getting errors:

1. **Check Function Deployment:**
   ```powershell
   npx supabase functions list --project-ref akxdroedpsvmckvqvggr
   ```
   - Should see `textract-worker` in the list

2. **Check Function Logs:**
   - https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/textract-worker/logs
   - Look for incoming requests
   - If no logs, function isn't being called (CORS issue)

3. **Test Function Directly:**
   - Use browser console to test:
   ```javascript
   fetch('https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/textract-worker', {
     method: 'OPTIONS',
     headers: {
       'Origin': window.location.origin
     }
   }).then(r => console.log('CORS test:', r.status, r.headers.get('access-control-allow-origin')));
   ```

