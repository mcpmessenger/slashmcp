# How to Find Uploads Function Logs

## 🎯 What You're Looking For

The log you showed is from `job-status` function. We need logs from the **`uploads`** function.

## 📋 Steps to Find Uploads Logs

### Step 1: Filter by Function

In Supabase Dashboard → Edge Functions → Logs:

1. Look for a filter or dropdown to select specific functions
2. Select **`uploads`** function (not `job-status` or `textract-worker`)
3. Or look for POST requests to `/functions/v1/uploads`

### Step 2: Look for POST Requests

The `uploads` function handles POST requests. Look for:
- **Method:** `POST`
- **Path:** `/functions/v1/uploads`
- **Status:** Should be `201` (Created) if successful

### Step 3: Check the Log Details

When you find a POST request to `/functions/v1/uploads`, expand it and look for:
- Console logs in the response/body
- Look for "Presigned URL generation details"
- Check the `accessKeyIdPrefix` value

## 🔍 Alternative: Check Function-Specific Logs

1. Go to Supabase Dashboard
2. **Edge Functions** (left sidebar)
3. Click on **`uploads`** function (not the logs page, the function itself)
4. Go to **Logs** tab within that function
5. This should show only logs for the `uploads` function

## 📝 What to Look For

In the `uploads` function logs, after an upload attempt, you should see:

```
Presigned URL generation details: {
  bucket: "tubbyai-products-catalog",
  region: "us-east-1",
  accessKeyIdPrefix: "AKIAVYV5..."  // ← This is what we need!
  ...
}
```

## 🎯 Quick Test

1. Try uploading a file now
2. Immediately go to Supabase Dashboard → Edge Functions → `uploads` → Logs
3. Look for the most recent POST request
4. Check the console logs in that request

---

**Find the `uploads` function logs (POST to `/functions/v1/uploads`) to see which credentials are being used! 🔍**




