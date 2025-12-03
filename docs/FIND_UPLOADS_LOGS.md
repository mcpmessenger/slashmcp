# How to Find Uploads Edge Function Logs in Supabase

## Method 1: Direct Navigation (Easiest)

1. **Go to Edge Functions:**
   - Click **"Edge Functions"** in the left sidebar (not "Logs & Analytics")
   - Or go directly to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions

2. **Click on `uploads` function:**
   - Find the `uploads` function in the list
   - Click on it

3. **Click "Logs" tab:**
   - You should see tabs: "Overview", "Logs", "Invocations"
   - Click **"Logs"** tab

4. **Filter for recent logs:**
   - Set time filter to **"Last 5 minutes"** or **"Last hour"**
   - Look for logs around your upload time (22:39:06)

## Method 2: Direct Link

**Click this link:**
https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/uploads/logs

## Method 3: SQL Query (If you're in Logs & Analytics)

If you're already in the SQL query editor, modify your query to filter for uploads function:

```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from edge_logs
where 
  metadata->>'function_name' = 'uploads'
  or event_message like '%uploads%'
  or event_message like '%Uploads Edge Function%'
order by timestamp desc
limit 20
```

Or search for your specific upload time:

```sql
select
  cast(timestamp as datetime) as timestamp,
  event_message,
  metadata
from edge_logs
where 
  cast(timestamp as datetime) >= '2025-12-02 22:39:00'
  and cast(timestamp as datetime) <= '2025-12-02 22:40:00'
  and (
    metadata->>'function_name' = 'uploads'
    or event_message like '%uploads%'
    or event_message like '%Upload%'
  )
order by timestamp desc
```

## What You Should See

If the function was called, you should see logs like:

```
=== Uploads Edge Function Request Start ===
Method: POST
URL: ...
Timestamp: 2025-12-02T22:39:06.658Z
Processing POST request - parsing body...
Request body parsed: { fileName: "...", ... }
Creating presigned URL for storage path: ...
Presigned URL created in Xms
Inserting job into database...
Job inserted in Xms, jobId: ...
=== Uploads Edge Function Request Complete in Xms ===
```

## If You See No Logs

If you don't see any logs for the uploads function:
1. Check the **"Invocations"** tab - this shows if the function was called at all
2. Check browser Network tab to see if the request was sent
3. Verify the function is deployed and active

