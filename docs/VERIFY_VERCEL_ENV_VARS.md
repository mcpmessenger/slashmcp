# How to Verify Vercel Environment Variables

## Quick Steps

### Step 1: Navigate to Vercel Dashboard

1. Go to: https://vercel.com/dashboard
2. Find your project: `slashmcp` or `seco-mcp`
3. Click on the project

### Step 2: Go to Environment Variables

1. Click **"Settings"** in the top navigation
2. Click **"Environment Variables"** in the left sidebar
3. You should see a list of environment variables

### Step 3: Check Required Variables

**Required for uploads to work:**

1. **`VITE_SUPABASE_URL`** (Primary)
   - **Should be:** `https://akxdroedpsvmckvqvggr.supabase.co`
   - **Used for:** Computing FUNCTIONS_URL if VITE_SUPABASE_FUNCTIONS_URL is not set
   - **Status:** ✅ Check if exists

2. **`VITE_SUPABASE_FUNCTIONS_URL`** (Optional but recommended)
   - **Should be:** `https://akxdroedpsvmckvqvggr.supabase.co/functions/v1`
   - **Used for:** Direct Edge Function calls
   - **Status:** ✅ Check if exists (if not, VITE_SUPABASE_URL will be used)

### Step 4: Verify Values

**For each variable:**
- ✅ **Exists:** Variable is listed
- ✅ **Value is correct:** Matches the expected value above
- ✅ **Environment:** Set for "Production" (or "All Environments")
- ✅ **Not hidden:** You can see the value (or it's set correctly)

### Step 5: If Variables Are Missing

**Option A: Add via Vercel Dashboard**

1. Click **"Add New"** button
2. **Key:** `VITE_SUPABASE_URL`
3. **Value:** `https://akxdroedpsvmckvqvggr.supabase.co`
4. **Environment:** Select "Production" (or "All Environments")
5. Click **"Save"**
6. Repeat for `VITE_SUPABASE_FUNCTIONS_URL` if needed

**Option B: Add via Vercel CLI**

```bash
# Set VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_URL production
# When prompted, enter: https://akxdroedpsvmckvqvggr.supabase.co

# Set VITE_SUPABASE_FUNCTIONS_URL (optional)
vercel env add VITE_SUPABASE_FUNCTIONS_URL production
# When prompted, enter: https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
```

### Step 6: Redeploy After Adding Variables

**After adding/updating environment variables:**

1. **Option A: Automatic Redeploy**
   - Vercel will automatically redeploy if "Auto-redeploy" is enabled
   - Wait 2-3 minutes for deployment

2. **Option B: Manual Redeploy**
   - Go to **"Deployments"** tab
   - Click **"..."** on latest deployment
   - Click **"Redeploy"**

### Step 7: Verify in Production

**After redeploy, check browser console:**

1. Hard refresh the page (Ctrl+Shift+R)
2. Open DevTools → Console
3. Look for: `[api.ts] FUNCTIONS_URL configured: https://...`
4. If you see this, environment variables are working ✅
5. If you see warning about missing URL, variables are not set ❌

---

## Common Issues

### Issue 1: Variable Exists But Wrong Value

**Symptom:** Variable is set but URL is incorrect
**Fix:** Update the value in Vercel dashboard
**Example:** Variable is `https://wrong-project.supabase.co` instead of correct URL

### Issue 2: Variable Set for Wrong Environment

**Symptom:** Variable exists but only for "Development" or "Preview"
**Fix:** Add variable for "Production" environment
**Check:** Environment column should show "Production" or "All Environments"

### Issue 3: Variable Hidden/Encrypted

**Symptom:** Variable exists but you can't see the value
**Fix:** This is fine - as long as it's set, it will work
**Note:** You can verify by checking browser console logs

### Issue 4: Variable Not Propagated

**Symptom:** Variable added but app still shows old value
**Fix:** 
1. Wait 2-3 minutes for auto-redeploy
2. Or manually trigger redeploy
3. Hard refresh browser (Ctrl+Shift+R)

---

## Verification Checklist

- [ ] `VITE_SUPABASE_URL` exists in Vercel
- [ ] `VITE_SUPABASE_URL` value is: `https://akxdroedpsvmckvqvggr.supabase.co`
- [ ] Variable is set for "Production" environment
- [ ] App has been redeployed after adding/updating variable
- [ ] Browser console shows: `[api.ts] FUNCTIONS_URL configured: https://...`
- [ ] No warnings about missing FUNCTIONS_URL in console

---

## Quick Test

**After verifying variables, test upload:**

1. Try uploading a file
2. Check console for: `[registerUploadJob] URL validated: https://...`
3. Check Network tab for request to `/functions/v1/uploads`
4. If request appears, environment variables are working ✅

---

*Last Updated: December 2, 2025*

