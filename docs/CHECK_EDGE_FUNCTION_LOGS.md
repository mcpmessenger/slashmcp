# How to Check Edge Function Logs for Chat Function

## Step 1: Navigate to Edge Functions Logs

1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/logs/edge-logs
2. Or: Dashboard → Logs & Analytics → Edge Functions

## Step 2: Filter for Chat Function

In the logs interface:
- Look for a filter/search box
- Type: `chat` or filter by function name = `chat`
- This will show only logs from the chat edge function

## Step 3: What to Look For

After you send a message like "Find me a shuttle bus on Craigslist and email the results", look for:

### Key Log Entries:

1. **Request Start:**
   ```
   === Chat Function Request Start ===
   Message: Find me a shuttle bus...
   ```

2. **Tools Available:**
   ```
   Tools available: [{"name":"mcp_proxy","description":"Executes MCP commands to browse websites..."}]
   ```

3. **Agent Instructions:**
   ```
   MCP Tool Agent instructions length: [some number]
   ```

4. **Tool Calls (Most Important!):**
   ```
   🔧 TOOL CALL: mcp_proxy {"command":"/playwright-wrapper browser_navigate url=https://craigslist.org"}
   ```

5. **Tool Results:**
   ```
   ✅ TOOL RESULT: {...}
   ```

6. **Events:**
   ```
   Event #1 - Type: agentMessage
   Event #2 - Type: toolCall
   Event #3 - Type: toolResult
   ```

## Step 4: If You Don't See Tool Calls

If you see:
- ✅ Request start logs
- ✅ Tools available logs
- ❌ NO `🔧 TOOL CALL:` entries

**This means:**
- The AI is not recognizing it should use tools
- The instructions aren't being followed
- We need to adjust the agent instructions

## Step 5: Check Recent Logs

Make sure you're looking at logs from AFTER you sent the message:
1. Send your test message
2. Immediately check Edge Functions logs
3. Look for the most recent entries (should be from just now)

## Alternative: Check via Supabase CLI

**Note:** The Supabase CLI `functions logs` command may not be available in all versions. The dashboard method above is recommended.

If you want to try the CLI:
1. First link your project: `npx supabase link --project-ref akxdroedpsvmckvqvggr`
2. Check available commands: `npx supabase logs --help`
3. The exact command syntax may vary by CLI version

**Recommended:** Use the Supabase Dashboard method above for the most reliable log access.

