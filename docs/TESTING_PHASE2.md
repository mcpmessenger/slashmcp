# Phase 2 Testing Guide: Dual-Terminal Playground

## Quick Start

1. **Start the dev server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Open your browser** to `http://localhost:8080` (or the port shown in terminal)

3. **Verify the UI**:
   - You should see the chat interface on the left
   - On large screens (≥1024px), you should see the MCP Event Log panel on the right
   - On mobile/small screens, the event log is hidden by default

## Testing Scenarios

### Test 1: Basic Event Logging
1. Type a simple message: `"Hello, what can you do?"`
2. **Expected**: 
   - Chat response appears on the left
   - MCP events appear in the right panel showing:
     - Agent handoffs (Orchestrator_Agent, MCP_Tool_Agent, Final_Answer_Agent)
     - Content streaming events
     - Final output events

### Test 2: MCP Tool Calls
1. Ask a question that triggers an MCP tool: `"What's the stock price of AAPL?"`
2. **Expected**:
   - Events show `toolCall` with `mcp_proxy` tool
   - Command shows the MCP command being executed
   - `toolResult` event shows the response
   - Error badge appears if there are any errors

### Test 3: Filtering and Search
1. After generating some events, try:
   - **Search**: Type "tool" in the search box - should filter to tool-related events
   - **Type Filter**: Select "Tool Call" from the dropdown - should show only tool call events
   - **Clear**: Click "Clear" button to reset search

### Test 4: Error Highlighting
1. Try an invalid command or trigger an error
2. **Expected**:
   - Error events are highlighted with red border/background
   - Error count badge appears in the header
   - Error icon (AlertCircle) is visible on error events

### Test 5: Event Log Collapse/Expand
1. Click the X/Terminal icon in the event log header
2. **Expected**: Event log collapses/expands

### Test 6: Real-time Updates
1. Send a message that takes time to process
2. **Expected**: Events appear in real-time as they occur, not all at once

## What to Look For

✅ **Working Correctly**:
- Events appear in chronological order
- Timestamps are accurate
- Event types are correctly labeled
- Tool commands are displayed
- Errors are highlighted
- Search and filter work
- Auto-scroll to latest events

❌ **Potential Issues**:
- Events not appearing (check browser console for errors)
- Events appearing but not updating (check network tab for SSE connection)
- Layout breaking on different screen sizes
- Scroll not working properly

## Debugging

If events aren't appearing:

1. **Check Browser Console** (F12):
   - Look for JavaScript errors
   - Check Network tab for `/functions/v1/chat` requests
   - Verify SSE (Server-Sent Events) are streaming

2. **Check Backend Logs**:
   - Supabase Edge Function logs should show event emission
   - Look for `Event #X - Type: ...` messages

3. **Verify Environment**:
   - Ensure `VITE_SUPABASE_URL` is set correctly
   - Ensure chat function is deployed/accessible

## Next Steps After Testing

Once testing is complete:
- Report any issues found
- Verify all Phase 2 requirements are met
- Consider moving to Phase 3 (Multi-Agent Orchestration)

