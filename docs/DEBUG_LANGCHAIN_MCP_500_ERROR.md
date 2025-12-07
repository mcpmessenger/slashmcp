# Debugging LangChain MCP 500 Error

## Current Status

✅ **Command Recognition:** Working - Commands are being recognized and routed to mcp-proxy  
✅ **Format Transformation:** Added - SlashMCP format is being converted to MCP protocol format  
❌ **Server Response:** 500 error from LangChain server

## What We've Fixed

1. ✅ **Path:** Changed from `invoke` to `mcp/invoke`
2. ✅ **Format:** Added transformation from `{command, args}` to `{tool, arguments}`
3. ✅ **Error Logging:** Enhanced to capture full error details

## Next Steps to Debug

### 1. Check Supabase Edge Function Logs

Go to your Supabase dashboard → Edge Functions → `mcp-proxy` → Logs

Look for these log entries:
- `[mcp-proxy] Target URL: ...` - Should be `https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke`
- `[mcp-proxy] Request body: ...` - Should show `{"tool":"agent_executor","arguments":{...}}`
- `[mcp-proxy] Error response from server: ...` - This will show the actual error

### 2. Test LangChain Server Directly

Test the server to verify it's working:

**PowerShell:**
```powershell
$body = @{
    tool = "agent_executor"
    arguments = @{
        query = "What is 2+2?"
        system_instruction = "You are a pirate. Say Arr!"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke" -Method Post -Body $body -ContentType "application/json"
```

**Or use a tool like Postman/Insomnia:**
- URL: `https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke`
- Method: POST
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "tool": "agent_executor",
  "arguments": {
    "query": "What is 2+2?",
    "system_instruction": "You are a pirate. Say Arr!"
  }
}
```

### 3. Check Browser Console

Open browser console (F12) and look for:
- `[MCP Client] Error payload: ...` - Shows the error from mcp-proxy
- `[MCP Client] Error text: ...` - Shows raw error text

### 4. Verify Server Registration

Check the gateway URL is correct:
```
/slashmcp list
```

Verify the `langchain-agent` entry shows:
- Gateway URL: `https://langchain-agent-mcp-server-554655392699.us-central1.run.app`
- Status: active

## Common Issues

### Issue: Server Returns 500

**Possible Causes:**
1. **Server is down** - Check if the URL is accessible
2. **Wrong endpoint** - Verify it's `/mcp/invoke` not `/invoke`
3. **Request format** - Verify it's `{tool, arguments}` not `{command, args}`
4. **Missing required fields** - Check if `query` is present
5. **Server error** - The LangChain server might have an internal error

**Solution:**
- Test the server directly (see step 2 above)
- Check LangChain server logs (if you have access)
- Verify the server is running and healthy

### Issue: Path Not Found (404)

**Symptom:** Error says "Not Found" or 404

**Solution:**
- Verify the gateway URL is correct
- Check if the server expects a different path
- Try accessing `/mcp/manifest` to verify the server is up

### Issue: Invalid Request Format (400)

**Symptom:** Error says "Bad Request" or 400

**Solution:**
- Verify the request body format matches MCP protocol
- Check that `tool` and `arguments` are present
- Ensure `query` is in the arguments

## Expected Request Format

The mcp-proxy should be sending:

```json
{
  "tool": "agent_executor",
  "arguments": {
    "query": "Find the three most cited academic papers...",
    "system_instruction": "You are a research analyst..."
  }
}
```

To: `https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke`

## What to Share for Further Debugging

If it still doesn't work, share:

1. **Supabase Edge Function Logs** (from mcp-proxy function):
   - `[mcp-proxy] Target URL: ...`
   - `[mcp-proxy] Request body: ...`
   - `[mcp-proxy] Error response from server: ...`

2. **Direct Server Test Result:**
   - What happens when you test the server directly with curl/Postman?

3. **Browser Console Errors:**
   - Any `[MCP Client]` error messages?

This will help identify if the issue is:
- In the proxy transformation
- In the server itself
- In the request format
- In the server configuration






