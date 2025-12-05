# Quick Guide: Check Logs When Request is Hanging

## 🚀 Fastest Way (3 clicks)

1. **Click the "View logs in Supabase" link** that appears below the "Thinking..." message
2. Or go directly to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/chat/logs
3. Look for the most recent logs (should be from just now)

## 📋 What to Look For

### If Request is Hanging, Check:

1. **Last Event Received:**
   - Look for the most recent log entry
   - Check the timestamp - if it's been more than 1 minute, the stream might be stuck

2. **Event Count:**
   - Look for: `Event #X - Type: ...`
   - If events stopped coming, the Agents SDK might be stuck

3. **Tool Calls:**
   - Look for: `🔧 TOOL CALL: ...`
   - If you see tool calls but no results, the tool might be hanging

4. **Timeout Messages:**
   - Look for: `Processing timeout` or `Stream appears to be hanging`
   - These indicate the timeout system detected a hang

5. **Error Messages:**
   - Any red error messages
   - Check for API errors, network errors, or authentication issues

## 🔍 Common Hanging Scenarios

### Scenario 1: No Events After "Agents SDK Runner started"
**Problem:** Agents SDK isn't streaming events
**Solution:** Check if OPENAI_API_KEY is set correctly

### Scenario 2: Tool Call Started But No Result
**Problem:** MCP tool is hanging (e.g., browser automation stuck)
**Solution:** Check MCP gateway logs or browser service logs

### Scenario 3: Events Stopped Mid-Stream
**Problem:** Network issue or timeout
**Solution:** Check for timeout messages, try again with a simpler request

## 🛠️ Alternative: Check Logs via CLI

**Note:** The Supabase CLI doesn't currently support viewing function logs directly. Use the dashboard instead.

If you have the Supabase CLI linked to your project, you can try:
```bash
# Link your project first (if not already linked)
npx supabase link --project-ref akxdroedpsvmckvqvggr

# Then check if logs command is available (may vary by CLI version)
npx supabase logs --help
```

**Recommended:** Use the Supabase Dashboard instead (most reliable method).

## 📊 Other Log Locations

- **Edge Functions Logs:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/edge-logs
- **Functions Page:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
- **Browser Console:** Open DevTools (F12) → Console tab (for frontend logs)

## 💡 Pro Tips

1. **Filter by time:** In Supabase dashboard, filter logs to "Last 5 minutes" to see recent activity
2. **Search for keywords:** Search for "timeout", "error", or "TOOL CALL" to find relevant entries
3. **Check MCP Event Log:** The right panel in the UI shows real-time MCP events (if visible)
4. **Browser DevTools:** Check Network tab to see if the SSE stream is still connected

