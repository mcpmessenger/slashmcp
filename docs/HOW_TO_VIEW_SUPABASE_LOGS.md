# How to View Supabase Edge Function Logs

## 🎯 What We Need

We need to see **server-side logs** from the Supabase `uploads` function, not browser console logs.

## 📋 Steps to View Production Logs

### Step 1: Open Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr
2. Or navigate manually: Dashboard → Your Project

### Step 2: Navigate to Edge Functions

1. Click **"Edge Functions"** in the left sidebar
2. You should see a list of functions: `chat`, `uploads`, `textract-worker`, etc.

### Step 3: Open Uploads Function Logs

**Option A: Direct Link**
```
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs
```

**Option B: Manual Navigation**
1. Click on the **`uploads`** function in the list
2. Click the **"Logs"** tab (next to "Overview" and "Invocations")

### Step 4: Filter for Recent Logs

1. Set the time filter to **"Last 5 minutes"** or **"Last hour"**
2. Look for POST requests (not GET or OPTIONS)
3. The most recent POST should be from your upload attempt

### Step 5: Find the Credential Log

Look for a log entry that contains:
```
Presigned URL generation details: {
  bucket: "tubbyai-products-catalog",
  region: "us-east-1",
  contentType: "...",
  hasAccessKeyId: true,
  hasSecretAccessKey: true,
  accessKeyIdPrefix: "AKIAVYV5..."  // ← THIS IS WHAT WE NEED!
}
```

## 🔍 What to Look For

- **Method:** POST
- **Path:** `/functions/v1/uploads`
- **Status:** 201 (Created)
- **Log message:** "Presigned URL generation details"

## 📸 How to Share the Log

1. Expand the log entry
2. Find the "Presigned URL generation details" section
3. Copy the `accessKeyIdPrefix` value
4. Share it with me

## ⚠️ Important Notes

- **Browser console ≠ Supabase logs**
- Browser console shows client-side logs
- Supabase Dashboard shows server-side logs
- We need the server-side logs to see which credentials are being used

---

**Go to Supabase Dashboard → Edge Functions → uploads → Logs to find the credential details! 🔍**




