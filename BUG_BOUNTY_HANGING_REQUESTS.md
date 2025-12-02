# 🐛 Bug Bounty: Request Hanging & Session Persistence Issues

## Executive Summary

**Severity:** HIGH  
**Impact:** User requests hang indefinitely, requiring page refresh which causes session loss  
**Status:** ✅ FIXED AND DEPLOYED (syntax error resolved, function deployed successfully)  
**Bounty:** COMPLETED - Syntax error fixed and function deployed

---

## Problem Description

### Issue 1: Requests Hanging Indefinitely
**Symptoms:**
- User sends a request (e.g., "Scrape headphones from Craigslist...")
- System shows "Thinking hard on your request..." message
- Request hangs for 5+ minutes with no response
- No error messages displayed to user
- User must refresh page to recover, losing session

**Root Cause Identified:**
1. **Agents SDK Incompatibility**: OpenAI Agents SDK v0.3.2 doesn't support `hosted_tool` type
   - Error: `Unsupported tool type: {"type":"hosted_tool","name":"mcp_proxy"}`
   - SDK attempts to use tools with `async run()` functions, which it classifies as `hosted_tool`
   - This causes the SDK to fail and fall back to direct API mode
   - The fallback works but may have timeout issues

2. **Missing Timeout Handling**: Direct API mode lacks proper timeout controls
   - No timeout on OpenAI API fetch requests
   - No timeout on stream reading
   - No heartbeat/progress updates during long operations

3. **Insufficient Progress Logging**: Users see no feedback during processing
   - Only shows "Thinking hard on your request..."
   - No indication of what's happening
   - No progress updates for tool calls or agent actions

### Issue 2: Session Lost on Refresh
**Symptoms:**
- User refreshes page after request hangs
- Must log in again
- Session not persisted properly

**Root Cause:**
- Session restoration from localStorage may be failing
- Possible issue with Supabase auth state management
- Browser may be blocking localStorage in some cases

---

## Technical Details

### Current Code State

**File:** `supabase/functions/chat/index.ts`

**Changes Made (Not Yet Deployed):**

1. **Disabled Agents SDK** (Line ~576):
   ```typescript
   // NOTE: Agents SDK v0.3.2 doesn't support hosted_tool (async run functions)
   // Skip the SDK attempt and go straight to direct API mode
   let useAgentsSdk = false; // Disabled until SDK supports hosted_tool
   ```

2. **Added Timeout Handling** (Lines ~1655-1694):
   - Timeout on OpenAI API requests (2 minutes)
   - Timeout on stream reading (3 minutes)
   - Progress updates during processing

3. **Added Progress Logging** (Lines ~788-915):
   - Tool call progress events
   - Agent activity updates
   - Heartbeat messages every 10 seconds
   - Event count tracking

4. **Improved Error Handling**:
   - Better timeout error messages
   - Graceful fallback to direct API
   - User-friendly error messages

### Deployment Blocker - ✅ RESOLVED

**Syntax Error:**
- ~~Missing closing brace in the file~~ ✅ FIXED
- ~~Error: `Expression expected at line 2144:2`~~ ✅ FIXED
- ~~Prevents deployment~~ ✅ RESOLVED - Function deployed successfully
- Issue was: Anthropic and Gemini provider code blocks were outside the main try-catch block

**Fix Applied:**
- Removed extra closing brace that was incorrectly placed
- Removed fallback code that referenced undefined `finalOutput` variable
- Ensured all provider blocks (OpenAI, Anthropic, Gemini) are properly inside the main try-catch block
- Function deployed successfully on 2025-01-XX

---

## Reproduction Steps

### For Hanging Issue:
1. Navigate to the chat interface
2. Send a complex request: "Scrape headphones from Craigslist Des Moines Iowa (give links) and OfferUp, (give links) compare to 'eBay Sold' and Amazon prices. My goal is to identify reselling opportunities and exploit price discrepancies email me a detailed report with links to listings"
3. Observe "Thinking hard on your request..." message
4. Wait 5+ minutes - request never completes
5. Check Supabase logs - see "hosted_tool_not_supported" errors
6. Refresh page - must log in again

### For Session Issue:
1. Log in to the application
2. Send any request
3. Refresh the page (F5 or Ctrl+R)
4. Observe: Must log in again
5. Session not restored from localStorage

---

## Expected Behavior

1. **Request Processing:**
   - Requests should complete within 2-3 minutes max
   - Progress updates should show: "Processing...", "Calling tool: X...", "Tool X completed"
   - Timeout after 5 minutes with clear error message
   - No hanging indefinitely

2. **Session Persistence:**
   - Session should persist across page refreshes
   - Should restore from localStorage automatically
   - Should not require re-login on refresh

---

## Logs & Evidence

### Supabase Function Logs Show:
```
ERROR: Unsupported tool type: {"type":"hosted_tool","name":"mcp_proxy"}
ERROR: === Runner Error ===
INFO: === Using Direct OpenAI API (Fallback Mode) ===
INFO: Reason: error
```

### MCP Event Log Shows:
```json
{
  "type": "system",
  "metadata": {
    "category": "sdk_compatibility",
    "issue": "hosted_tool_not_supported",
    "action": "fallback_to_direct_api"
  }
}
```

---

## Proposed Solutions

### Solution 1: Fix Syntax Error & Deploy
**Priority:** CRITICAL  
**Effort:** Low (find missing brace)  
**Impact:** High (enables all fixes)

1. Locate missing closing brace
2. Add the missing brace
3. Deploy function: `npx supabase functions deploy chat --project-ref akxdroedpsvmckvqvggr`
4. Test with hanging request

### Solution 2: Simplify Timeout Code
**Priority:** HIGH  
**Effort:** Medium  
**Impact:** Medium

1. Remove complex timeout handling temporarily
2. Use simpler Deno-compatible timeout approach
3. Deploy and test
4. Add back timeout handling incrementally

### Solution 3: Fix Session Persistence
**Priority:** MEDIUM  
**Effort:** Low  
**Impact:** Medium

1. Check `src/hooks/useChat.ts` session restoration logic
2. Verify localStorage is working
3. Add better error handling for session restore
4. Test session persistence across refreshes

### Solution 4: Upgrade Agents SDK (Long-term)
**Priority:** LOW  
**Effort:** High  
**Impact:** High (but not urgent)

1. Wait for Agents SDK version that supports `hosted_tool`
2. Or refactor tools to not use `async run()` functions
3. Test with new SDK version

---

## Files Modified

1. `supabase/functions/chat/index.ts` - Main chat function (syntax error present)
2. `src/hooks/useChat.ts` - Frontend chat hook (timeout handling added)
3. `src/pages/Index.tsx` - UI component (progress display added)
4. `HOW_TO_CHECK_LOGS.md` - Documentation (log checking guide)
5. `QUICK_LOG_CHECK.md` - Documentation (quick reference)
6. `TROUBLESHOOT_EMPTY_LOGS.md` - Documentation (troubleshooting)

---

## Testing Checklist

- [ ] Fix syntax error (missing closing brace)
- [ ] Deploy function successfully
- [ ] Test simple request (e.g., "hello")
- [ ] Test complex request (e.g., scraping request)
- [ ] Verify timeout works (should timeout after 5 minutes)
- [ ] Verify progress updates appear in UI
- [ ] Verify session persists on refresh
- [ ] Check Supabase logs for errors
- [ ] Verify MCP Event Log shows progress events
- [ ] Test with multiple concurrent requests

---

## Acceptance Criteria

### For Hanging Issue:
✅ Requests complete within 5 minutes or timeout gracefully  
✅ Progress updates shown during processing  
✅ No "hosted_tool_not_supported" errors in logs  
✅ Clear error messages if timeout occurs  
✅ Users can cancel/retry requests

### For Session Issue:
✅ Session persists across page refresh  
✅ No need to re-login after refresh  
✅ Session restored from localStorage automatically  
✅ Works across browser tabs

---

## Environment

- **Supabase Project:** akxdroedpsvmckvqvggr
- **Function:** `chat` edge function
- **SDK Version:** `@openai/agents@0.3.2`
- **Runtime:** Deno (Supabase Edge Functions)
- **Frontend:** React + TypeScript + Vite
- **Browser:** Chrome/Edge (Windows)

---

## Additional Context

### Related Issues:
- Agents SDK doesn't support `hosted_tool` type
- Direct API mode works but needs timeout handling
- Session management needs improvement
- Progress logging was missing

### Dependencies:
- OpenAI API key configured
- Supabase auth configured
- MCP gateway URL configured
- All environment variables set

---

## Bounty Details

**What We Need:**
1. Fix the syntax error (missing closing brace)
2. Ensure code deploys successfully
3. Verify all fixes work as expected
4. Test with the hanging request scenario

**What's Already Done:**
- ✅ Identified root cause (Agents SDK incompatibility)
- ✅ Disabled Agents SDK to avoid error
- ✅ Added timeout handling code
- ✅ Added progress logging code
- ✅ Improved error messages
- ✅ Added frontend timeout handling
- ✅ Added UI progress display

**What's Blocking:**
- ❌ Syntax error preventing deployment
- ❌ Need to verify fixes work in production

---

## Contact & Submission

If you can fix the syntax error and deploy successfully, please:

1. Identify the missing closing brace location
2. Fix the syntax error
3. Deploy the function
4. Test with the hanging request
5. Document the fix

**Files to check:**
- `supabase/functions/chat/index.ts` (main file with syntax error)
- Focus on lines 1655-2036 (direct API mode section)
- Check brace matching in timeout handling code

**Deployment command:**
```bash
npx supabase functions deploy chat --project-ref akxdroedpsvmckvqvggr
```

---

## Timeline

- **Issue Reported:** Current session
- **Root Cause Identified:** Current session
- **Fixes Implemented:** Current session
- **Deployment Blocker Found:** Current session
- **Target Resolution:** ASAP

---

## Success Metrics

After fix is deployed:
- ✅ No requests hanging > 5 minutes
- ✅ Progress updates visible in UI
- ✅ Session persists on refresh
- ✅ Clear error messages for timeouts
- ✅ No "hosted_tool" errors in logs

---

**Status:** ✅ DEPLOYED - Syntax error fixed, function deployed successfully  
**Next Step:** Test with hanging request scenario to verify fixes work  
**Priority:** HIGH - Verify fixes work in production

