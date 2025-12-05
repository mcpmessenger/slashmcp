# Note for LangChain MCP Server Team

## Issue Summary

The LangChain MCP Server is returning **500 Internal Server Error** for all `/mcp/invoke` requests, even for basic queries without `system_instruction`.

## Server Details

- **Service URL:** `https://langchain-agent-mcp-server-554655392699.us-central1.run.app`
- **Version:** 1.1.0 (with system_instruction support)
- **Status:** Deployed and accessible, but returning 500 errors

## Test Results

### Test 1: Basic Request (Without system_instruction)

**Request:**
```json
POST https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke
Content-Type: application/json

{
  "tool": "agent_executor",
  "arguments": {
    "query": "What is 2+2?"
  }
}
```

**Response:** `500 Internal Server Error` (empty error body)

### Test 2: Request With system_instruction

**Request:**
```json
POST https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke
Content-Type: application/json

{
  "tool": "agent_executor",
  "arguments": {
    "query": "What is 2+2?",
    "system_instruction": "You are a pirate. Say Arr!"
  }
}
```

**Response:** `500 Internal Server Error` (empty error body)

### Manifest Endpoint Test

**Request:**
```json
GET https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/manifest
```

**Status:** Please verify this endpoint works

## What We've Verified (SlashMCP Side)

✅ **SlashMCP Integration is Working:**
- Commands are correctly recognized and parsed
- Request format is correctly transformed to MCP protocol: `{tool: "agent_executor", arguments: {...}}`
- Path is correct: `/mcp/invoke`
- Request is properly forwarded to the server

**The issue is 100% on the server side, not in the integration.**

## What to Check

### 1. Server Logs

Check Google Cloud Run logs for the `langchain-agent-mcp-server` service:
- Look for stack traces or exception details
- Check for any error messages when `/mcp/invoke` is called
- Verify if requests are reaching the server

**Location:** Google Cloud Console → Cloud Run → `langchain-agent-mcp-server` → Logs

### 2. Implementation Verification

Please verify the following code is implemented:

#### A. Invoke Endpoint Handler

The `/mcp/invoke` endpoint should handle requests like this:

```python
async def invoke_tool(request: ToolInvocationRequest):
    tool_name = request.tool  # Should be "agent_executor"
    arguments = request.arguments or {}
    
    if tool_name == "agent_executor":
        query = arguments.get("query")
        system_instruction = arguments.get("system_instruction")  # Optional
        
        if not query:
            return {"error": "query parameter is required"}
        
        # Create agent with optional system_instruction
        agent = get_agent(system_instruction=system_instruction)
        result = agent.invoke({"input": query})
        
        return {"result": result}
    
    return {"error": f"Unknown tool: {tool_name}"}
```

**Key Points:**
- `request.tool` should contain "agent_executor"
- `request.arguments` should be a dict with `query` and optionally `system_instruction`
- The function should handle both cases (with and without `system_instruction`)

#### B. Agent Initialization

The `get_agent()` function should accept `system_instruction`:

```python
def get_agent(system_instruction: Optional[str] = None):
    """
    Create and return a LangChain agent executor.
    
    Args:
        system_instruction: Optional system prompt to override the default.
    """
    default_prompt = "..."  # Your default prompt
    
    # Use provided instruction or fall back to default
    system_prompt = system_instruction if system_instruction else default_prompt
    
    # Create agent with system_prompt
    # ... rest of implementation
```

### 3. Common Issues to Check

1. **Missing Error Handling:**
   - Is there a try/except around the agent invocation?
   - Are exceptions being caught and returned as proper error responses?

2. **Missing Dependencies:**
   - Are all required packages installed in the container?
   - Check: LangChain, OpenAI SDK, FastAPI/Flask, etc.

3. **Environment Variables:**
   - Is `OPENAI_API_KEY` set?
   - Are any other required environment variables missing?

4. **Request Parsing:**
   - Is the request body being parsed correctly?
   - Is `request.tool` and `request.arguments` being extracted properly?

5. **Agent Creation:**
   - Is the agent being created successfully?
   - Are there any errors during agent initialization?

### 4. Expected Request Format

The server should receive requests in this format:

```json
{
  "tool": "agent_executor",
  "arguments": {
    "query": "The user's question or task",
    "system_instruction": "Optional custom instruction"  // May be omitted
  }
}
```

**Note:** The `system_instruction` parameter is optional. The server should work with or without it.

### 5. Expected Response Format

On success, the server should return:

```json
{
  "result": "The agent's response text"
}
```

On error, the server should return:

```json
{
  "error": "Error message describing what went wrong"
}
```

## Debugging Steps

1. **Add Logging:**
   ```python
   import logging
   logging.basicConfig(level=logging.DEBUG)
   
   async def invoke_tool(request: ToolInvocationRequest):
       logging.info(f"Received request: tool={request.tool}, arguments={request.arguments}")
       try:
           # ... your code
       except Exception as e:
           logging.error(f"Error in invoke_tool: {e}", exc_info=True)
           return {"error": str(e)}
   ```

2. **Test Locally:**
   - Run the server locally
   - Test with the same request format
   - Check local logs for errors

3. **Check Cloud Run Logs:**
   - Look for the log entries when requests come in
   - Check for any exception stack traces

## Integration Status

**SlashMCP is ready and waiting.** Once the server is fixed:
- ✅ Commands will be recognized automatically
- ✅ Requests will be formatted correctly
- ✅ Responses will be displayed in the chat interface

**No changes needed on the SlashMCP side.**

## Contact

If you need any clarification about:
- The expected request format
- The integration approach
- Testing procedures

Please refer to:
- [LANGCHAIN_MCP_UPGRADE_INSTRUCTIONS.md](./LANGCHAIN_MCP_UPGRADE_INSTRUCTIONS.md) - Full implementation guide
- [AGENT_MCP_SERVER_INTEGRATION.md](./AGENT_MCP_SERVER_INTEGRATION.md) - Integration details

## Test Script

We've created a test script that you can use to verify the server:

**File:** `test-langchain-server.ps1`

Run it with:
```powershell
powershell -ExecutionPolicy Bypass -File test-langchain-server.ps1
```

This will test both with and without `system_instruction` and show the exact error responses.

---

**Priority:** High - The server needs to be fixed before the integration can work.

**Timeline:** Once the server returns 200 OK responses, the SlashMCP integration will work immediately.





