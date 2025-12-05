# How to Check Logs When Request is Hanging

## ✅ **EASIEST METHOD: Use Supabase Dashboard**

### Option 1: Direct Link to Chat Function Logs
**Click here:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/chat/logs

### Option 2: From the UI
When a request is processing, click the **"View logs in Supabase"** link that appears below the "Thinking..." message.

### Option 3: Navigate Manually
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr
2. Click **"Edge Functions"** in the left sidebar
3. Click on **"chat"** function
4. Click the **"Logs"** tab

### Option 4: Edge Functions Logs (All Functions)
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/edge-logs
2. Filter by function name: `chat`
3. Filter by time: "Last 5 minutes" or "Last hour"

---

## ❌ **CLI Method (NOT AVAILABLE)**

The Supabase CLI does **NOT** currently support viewing function logs via command line. The `functions logs` command doesn't exist in the CLI.

**Use the Dashboard method above instead.**

---

## 🔍 **What to Look For in Logs**

When a request is hanging, check for:

### 1. **Last Event Received**
- Look at the timestamp of the most recent log entry
- If it's been more than 1 minute, the stream might be stuck

### 2. **Event Count**
- Look for: `Event #X - Type: ...`
- If events stopped coming, the Agents SDK might be stuck

### 3. **Tool Calls**
- Look for: `🔧 TOOL CALL: ...`
- If you see tool calls but no results, the tool might be hanging

### 4. **Warnings**
- Look for: `⚠️ No events received in Xs`
- This indicates the system detected a potential hang

### 5. **Timeout Messages**
- Look for: `Processing timeout` or `Stream appears to be hanging`
- These indicate the timeout system detected a hang

### 6. **Error Messages**
- Any red error messages
- Check for API errors, network errors, or authentication issues

---

## 📊 **Common Hanging Scenarios**

### Scenario 1: No Events After "Agents SDK Runner started"
**Problem:** Agents SDK isn't streaming events  
**Check:** Look for `=== Starting Agents SDK Runner ===`  
**Solution:** Check if OPENAI_API_KEY is set correctly in Supabase secrets

### Scenario 2: Tool Call Started But No Result
**Problem:** MCP tool is hanging (e.g., browser automation stuck)  
**Check:** Look for `🔧 TOOL CALL:` followed by no `✅ TOOL RESULT:`  
**Solution:** Check MCP gateway logs or browser service logs

### Scenario 3: Events Stopped Mid-Stream
**Problem:** Network issue or timeout  
**Check:** Look for timeout warnings or error messages  
**Solution:** Try again with a simpler request

---

## 💡 **Pro Tips**

1. **Filter by time:** In Supabase dashboard, filter logs to "Last 5 minutes" to see recent activity
2. **Search for keywords:** Search for "timeout", "error", "TOOL CALL", or "Event #" to find relevant entries
3. **Check MCP Event Log:** The right panel in the UI shows real-time MCP events (if visible)
4. **Browser DevTools:** Check Network tab (F12) to see if the SSE stream is still connected
5. **Check Console:** Open Browser DevTools (F12) → Console tab for frontend errors

---

## 🚨 **Quick Troubleshooting**

1. **Request hanging?** → Check dashboard logs immediately
2. **No events?** → Check API keys and authentication
3. **Tool calls but no results?** → Check MCP gateway/service logs
4. **Timeout errors?** → Request is too complex, try breaking it into smaller parts

---

## ⚠️ **If Logs Show "No results found"**

If you see "No results found" in the Supabase logs page:

### 1. **Adjust Time Filter**
- Change from "Last hour" to "Last 24 hours" or "Last 7 days"
- Logs might be older than expected, or there's a delay in log propagation

### 2. **Check Invocations Tab**
- Click the **"Invocations"** tab (next to "Logs")
- This shows if the function is being called at all
- Look for recent invocations with timestamps

### 3. **Try Edge Functions Logs (All Functions)**
- Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/edge-logs
- This shows logs from ALL functions, not just the chat function
- Filter by function name: `chat`
- Filter by time: "Last 5 minutes" or "Last hour"

### 4. **Send a Test Request While Watching**
- Open the logs page
- Send a test message in the chat (even something simple like "hello")
- Watch the logs page in real-time - logs should appear within seconds
- If nothing appears, the function might not be deployed or there's a routing issue

### 5. **Check Function Deployment**
- Go to the **"Overview"** tab
- Check the "Last deployed" timestamp
- Make sure the function is actually deployed and active

### 6. **Check Browser Console**
- Open Browser DevTools (F12) → Console tab
- Send a request and check for errors
- Look for network errors or connection issues

