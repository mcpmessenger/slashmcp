# Debugging Email and Browser Commands

## Issue
The AI is saying "I can't browse websites" or "I can't send emails" instead of using MCP commands.

## Debugging Steps

### 1. Check Browser Console (F12 → Console Tab)

Look for:
- Errors related to MCP commands
- Errors about `e.content.map is not a function` (frontend issue)
- Any JavaScript errors

**What to look for:**
```javascript
// Should see MCP events being logged
"Received MCP event: { type: 'toolCall', tool: 'mcp_proxy', ... }"
```

### 2. Check Network Tab (F12 → Network Tab)

**Filter by:** `chat` or `functions/v1/chat`

**What to check:**
1. Is the request being sent to `/functions/v1/chat`?
2. What's the request payload? (Click request → Payload tab)
3. What's the response? (Click request → Response tab)
4. Look for SSE (Server-Sent Events) stream - should see `data: {...}` events

**Expected request:**
```json
{
  "messages": [...],
  "provider": "openai"
}
```

**Expected response (SSE stream):**
```
data: {"choices":[{"delta":{"content":"..."}}]}
data: {"mcpEvent":{"type":"toolCall","tool":"mcp_proxy",...}}
```

### 3. Check Supabase Logs

**Go to:** https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/edge-logs

**Filter by:** Function name = `chat`

**What to look for:**
1. `=== Chat Function Request Start ===` - confirms request received
2. `Event #X - Type: toolCall` - confirms AI is calling tools
3. `Event #X - Type: toolResult` - confirms tool execution
4. `Event #X - Type: agentMessage` - shows which agent is responding

**Key log patterns:**
```
Event #1 - Type: agentMessage
Event #2 - Type: toolCall, tool: mcp_proxy, command: /playwright-wrapper browser_navigate...
Event #3 - Type: toolResult
```

**If you DON'T see toolCall events:**
- The AI is not recognizing it should use tools
- Check if agent instructions are being loaded
- Check if tools array is being created

### 4. Check MCP Event Log (Right Sidebar)

**What to look for:**
- Tool Call events
- Tool Result events
- Error events
- System Log events

**If you see:**
- ✅ Tool Call events → AI is trying to use tools (good!)
- ❌ No Tool Call events → AI isn't recognizing it should use tools (problem)
- ❌ Error events → Tool execution is failing (different problem)

### 5. Verify Agent Instructions Are Loaded

**In Supabase logs, look for:**
```
=== Starting Agents SDK Runner ===
Message: Find me a shuttle bus...
Conversation history length: X
```

**Check if tools are being created:**
```
Added X memory tools to agent
```

### 6. Test Direct MCP Command

Try typing the command directly:
```
/playwright-wrapper browser_navigate url=https://craigslist.org
```

**If this works:**
- MCP infrastructure is fine
- Problem is AI not recognizing when to use it

**If this doesn't work:**
- Check if playwright-wrapper is registered
- Check MCP Event Log for errors

### 7. Check Tool Description

The AI reads the tool description to understand capabilities. Verify in Supabase logs that the tool description includes:
- "You CAN browse ANY website"
- "You CAN send emails"
- Examples with Craigslist and email

## Common Issues

### Issue 1: AI Not Calling Tools
**Symptoms:**
- No `toolCall` events in logs
- AI says "I can't do that"

**Possible causes:**
- Agent instructions not clear enough
- Tool description not explicit enough
- AI model being too conservative

**Solution:**
- Check Supabase logs for agent creation
- Verify tool description in code
- May need even more explicit instructions

### Issue 2: Tool Calls Failing
**Symptoms:**
- `toolCall` events exist
- `toolResult` shows errors

**Possible causes:**
- MCP server not responding
- Authentication issues
- Invalid command format

**Solution:**
- Check MCP Event Log for specific errors
- Verify MCP gateway URL is correct
- Check if user is authenticated

### Issue 3: Frontend Not Displaying Results
**Symptoms:**
- Tools execute successfully (logs show success)
- But user doesn't see results in chat

**Possible causes:**
- Frontend error (e.content.map)
- Event stream parsing issue
- Response format mismatch

**Solution:**
- Check browser console for errors
- Check Network tab for response format
- May need to fix frontend event handling

## Quick Test Commands

1. **Test email directly:**
   ```
   /email-mcp send_test_email
   ```

2. **Test browser navigation:**
   ```
   /playwright-wrapper browser_navigate url=https://example.com
   ```

3. **Test natural language:**
   ```
   send me a test email
   ```

4. **Test multi-step:**
   ```
   Find me a shuttle bus on Craigslist and email the results
   ```

## What to Share for Debugging

If the issue persists, share:
1. **Browser Console errors** (screenshot or copy)
2. **Network tab** - Request/Response for `/functions/v1/chat` (screenshot)
3. **Supabase Logs** - Filter by `chat` function, last 5 minutes (screenshot or copy)
4. **MCP Event Log** - Screenshot of events
5. **Exact user message** that's failing

