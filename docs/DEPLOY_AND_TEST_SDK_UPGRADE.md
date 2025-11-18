# Deploy and Test SDK 0.3.2 Upgrade

## Will This Fix the Bug?

**Yes, very likely!** The bug you encountered is a known issue in SDK version 0.0.9. Version 0.3.2 includes many bug fixes and improvements. The handoff tools array undefined error should be resolved.

However, we need to test to confirm. Follow the steps below.

## Step 1: Deploy the Updated Chat Function

Deploy the chat function with the upgraded SDK:

```bash
npx supabase functions deploy chat --project-ref akxdroedpsvmckvqvggr
```

**Note**: Make sure you're logged in to Supabase CLI:
```bash
npx supabase login
```

## Step 2: Verify Deployment

After deployment, check the logs to ensure the function deployed successfully:

```bash
npx supabase functions logs chat --project-ref akxdroedpsvmckvqvggr
```

You should see the function is using the new SDK version (0.3.2) in the import.

## Step 3: Test Handoff Functionality

### Test Case 1: Simple Stock Query (Should Trigger Handoff)

1. **Open your chat interface** at https://slashmcp.vercel.app (or your deployed URL)
2. **Send a message** that requires a handoff:
   ```
   Get the stock price for AAPL
   ```
   or
   ```
   What's NVDA trading at?
   ```

3. **Expected Behavior** (if bug is fixed):
   - ✅ Orchestrator agent receives the request
   - ✅ Handoff to MCP Tool Agent is triggered
   - ✅ MCP Tool Agent calls `mcp_proxy` tool
   - ✅ Stock data is retrieved
   - ✅ Handoff to Final Answer Agent
   - ✅ Final answer is synthesized and returned
   - ✅ **NO ERRORS** about "Cannot read properties of undefined (reading 'map')"

### Test Case 2: Check Logs for Errors

Monitor the Supabase function logs while testing:

```bash
# In a separate terminal, watch logs in real-time
npx supabase functions logs chat --project-ref akxdroedpsvmckvqvggr --follow
```

**Look for**:
- ✅ No `TypeError: Cannot read properties of undefined (reading 'map')` errors
- ✅ `handoff_requested` events appear
- ✅ `handoff_completed` or successful tool execution events
- ✅ Content is streamed back to the user

**If you still see errors**:
- Note the exact error message
- Check if it's the same error or a different one
- Update the GitHub bug report if needed

### Test Case 3: Complex Multi-Step Handoff

Test a more complex scenario:

```
Get the stock price for NVDA, then check if it's above $500
```

This should:
1. Handoff to MCP Tool Agent → Get stock price
2. Handoff back to Orchestrator or Final Answer Agent
3. Process the comparison
4. Return the result

## Step 4: Verify Success Indicators

### ✅ Bug is FIXED if you see:

1. **No errors in logs**: No `TypeError: Cannot read properties of undefined (reading 'map')`
2. **Handoffs complete**: You see `handoff_requested` events followed by successful tool execution
3. **Content is returned**: The chat returns actual answers (not just errors)
4. **Multiple handoffs work**: Complex queries with multiple handoffs complete successfully

### ❌ Bug still EXISTS if you see:

1. **Same error**: `TypeError: Cannot read properties of undefined (reading 'map')`
2. **Handoff fails**: `handoff_requested` events appear but then errors occur
3. **No content**: Chat returns errors or falls back to direct API
4. **Stream breaks**: The event stream stops after handoff is triggered

## Step 5: If Bug is Fixed

1. ✅ **Celebrate!** The upgrade worked
2. ✅ **Update documentation**: Note that SDK 0.3.2 resolves the handoff issue
3. ✅ **Submit bug report anyway**: Still submit the GitHub bug report to help others stuck on 0.0.9
4. ✅ **Monitor**: Keep an eye on logs for any new issues

## Step 6: If Bug Persists

If you still see errors after upgrading:

1. **Check SDK version**: Verify the deployed function is actually using 0.3.2
   ```bash
   # Check the deployed function code
   npx supabase functions inspect chat --project-ref akxdroedpsvmckvqvggr
   ```

2. **Check error details**: Is it the same error or different?
   - Same error → May need to check if there's a newer version
   - Different error → New issue, document it

3. **Try alternative patterns**: Consider the "agents-as-tools" pattern instead of handoffs

4. **Update GitHub issue**: If you submitted the bug report, add a comment that the issue persists in 0.3.2

## Quick Test Commands

### Deploy
```bash
npx supabase functions deploy chat --project-ref akxdroedpsvmckvqvggr
```

### Watch Logs
```bash
npx supabase functions logs chat --project-ref akxdroedpsvmckvqvggr --follow
```

### Test Query (via curl)
```bash
curl -X POST https://akxdroedpsvmckvqvggr.supabase.co/functions/v1/chat \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Get stock price for AAPL"}],"provider":"openai"}'
```

## Expected Timeline

- **Deployment**: 1-2 minutes
- **Testing**: 5-10 minutes
- **Verification**: Should be immediate - either it works or it doesn't

## Success Criteria

The handoff functionality is **working** if:
- ✅ Stock queries return actual stock prices
- ✅ No undefined tools array errors
- ✅ Handoffs complete successfully
- ✅ Multi-agent workflow functions end-to-end

Good luck! The upgrade should fix the issue. 🚀

