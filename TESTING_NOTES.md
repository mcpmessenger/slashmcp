# Testing Notes - Phase 2 Implementation

## Issue Found

The stock query "What's the stock price of AAPL?" is handled directly in the frontend via `runStockLookup()`, which bypasses the chat function. This means **no MCP events are captured** for stock queries.

## How to See MCP Events

To see MCP events in the Event Log, you need to ask questions that go through the **chat function** (which uses the OpenAI Agents SDK). Here are some test queries:

### ✅ Queries That Will Show Events:

1. **Simple chat** (will show agent handoffs):
   ```
   "Tell me a joke"
   ```
   - Should show: Orchestrator_Agent events, content events, finalOutput

2. **Questions that trigger MCP tools** (will show tool calls):
   ```
   "Can you search the web for recent AI news?"
   ```
   - Should show: toolCall events with mcp_proxy, toolResult events

3. **Browser automation** (if playwright-wrapper is registered):
   ```
   "Visit google.com and tell me what you see"
   ```
   - Should show: toolCall events with browser commands

### ❌ Queries That Won't Show Events:

- Stock queries like "What's the stock price of AAPL?" - handled directly
- Direct MCP commands like `/alphavantage-mcp get_quote symbol=AAPL` - handled directly
- Polymarket queries (if handled directly)

## Debugging

1. **Open browser console** (F12) and look for:
   - `"Received MCP event:"` logs - confirms events are being received
   - Any parse errors or warnings

2. **Check Network tab**:
   - Look for `/functions/v1/chat` request
   - Verify it's using Server-Sent Events (SSE)
   - Check response stream for `mcpEvent` objects

3. **Verify backend**:
   - Check Supabase Edge Function logs
   - Look for `Event #X - Type: ...` console logs

## Next Steps

To fix stock queries showing events:
- Option 1: Remove the direct stock handling and let the Agents SDK handle it
- Option 2: Manually emit events for direct MCP invocations
- Option 3: Document that only chat-based queries show events

