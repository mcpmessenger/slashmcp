# Debugging MCP Events Not Appearing

## Issue
MCP events are not appearing in the Event Log panel, even for simple chat queries.

## Possible Causes

### 1. Supabase Function Not Deployed
The chat function needs to be deployed with the latest changes that include event streaming.

**Check:**
- Is the function deployed to Supabase?
- Are you using the deployed function or local development?

**Fix:**
```bash
npx supabase functions deploy chat --project-ref <your-project-ref>
```

### 2. Events Being Sent But Not Parsed
The frontend might be receiving events but not parsing them correctly.

**Check:**
- Open browser console (F12)
- Look for "Received MCP event:" logs
- Check Network tab → `/functions/v1/chat` → Response preview

**Debug:**
- Added console.log statements in `useChat.ts` to log received events
- Check if events are in the response but not being parsed

### 3. Using Fallback Path
The chat function might be falling back to direct OpenAI API, which only sends a "fallback" event.

**Check:**
- Look for "Using direct OpenAI API" in Supabase function logs
- Check if Agents SDK is failing to initialize

**Fix:**
- Ensure `OPENAI_API_KEY` is set in Supabase secrets
- Check if Agents SDK is properly installed

### 4. SSE Connection Issues
Server-Sent Events might not be connecting properly.

**Check:**
- Network tab → `/functions/v1/chat` → Check if it's using EventStream
- Look for connection errors in console

## Testing Steps

1. **Check Browser Console:**
   - Open F12 → Console tab
   - Send a message
   - Look for "Received MCP event:" logs
   - If you see these, events are being received but not displayed

2. **Check Network Tab:**
   - Open F12 → Network tab
   - Send a message
   - Find `/functions/v1/chat` request
   - Click on it → Preview or Response tab
   - Look for `data: {"mcpEvent":...}` lines

3. **Check Supabase Logs:**
   - Go to Supabase Dashboard → Edge Functions → chat → Logs
   - Look for "Event #X - Type: ..." messages
   - Look for "Agents SDK Runner started" or "Using direct OpenAI API"

4. **Test with Simple Query:**
   - Try: "Hello"
   - Should see at least a "system" event if Agents SDK is working
   - Should see a "fallback" event if using direct API

## Quick Fixes

### If events are being sent but not displayed:
- Check `mcpEvents` state in React DevTools
- Verify `setMcpEvents` is being called
- Check if component is re-rendering

### If no events are being sent:
- Deploy the latest chat function
- Check Supabase function logs for errors
- Verify environment variables are set

### If using fallback path:
- Check if Agents SDK is available
- Verify OPENAI_API_KEY is set
- Check function logs for initialization errors

