# LangChain MCP Server 500 Error - Root Cause Analysis

## Test Results

**Direct Server Test:**
```json
Request:
{
  "tool": "agent_executor",
  "arguments": {
    "query": "What is 2+2?",
    "system_instruction": "You are a pirate. Say Arr!"
  }
}

Response: 500 Internal Server Error
```

## Conclusion

✅ **SlashMCP Integration:** Working correctly
- Command recognition: ✅
- Command parsing: ✅  
- Format transformation: ✅
- Path routing: ✅ (`/mcp/invoke`)

❌ **LangChain Server:** Returning 500 error
- Server is accessible
- Request format is correct
- Server is rejecting/erroring on the request

## The Issue

The LangChain MCP server is returning a **500 Internal Server Error** when receiving valid MCP protocol requests. This indicates:

1. **Server-side error** - The server code has a bug or missing dependency
2. **Implementation issue** - The `system_instruction` parameter might not be properly implemented
3. **Environment issue** - Missing environment variables or dependencies
4. **Code error** - Exception being thrown in the server code

## What to Check on LangChain Server

### 1. Check Server Logs

In Google Cloud Run console:
- Go to: Cloud Run → `langchain-agent-mcp-server` → Logs
- Look for error messages when the request is received
- Check for stack traces or exception details

### 2. Verify Implementation

Ensure the LangChain server code has:

1. **Updated `invoke_tool` function** to accept `system_instruction`:
   ```python
   async def invoke_tool(request: ToolInvocationRequest):
       tool_name = request.tool  # Should be "agent_executor"
       arguments = request.arguments or {}
       
       query = arguments.get("query")
       system_instruction = arguments.get("system_instruction")  # Must be extracted
       
       if not query:
           return {"error": "query parameter is required"}
       
       # Create agent with system_instruction
       agent = get_agent(system_instruction=system_instruction)
       result = agent.invoke({"input": query})
       
       return {"result": result}
   ```

2. **Updated `get_agent` function** to accept `system_instruction`:
   ```python
   def get_agent(system_instruction: Optional[str] = None):
       # Implementation must handle system_instruction parameter
   ```

### 3. Test Without system_instruction

Try a request without `system_instruction` to see if that works:

```json
{
  "tool": "agent_executor",
  "arguments": {
    "query": "What is 2+2?"
  }
}
```

If this works, the issue is specifically with `system_instruction` handling.

### 4. Check Server Dependencies

Verify all required packages are installed:
- LangChain
- OpenAI (or other LLM provider)
- FastAPI/Flask (or whatever framework is used)
- Any other dependencies

## Next Steps

1. **Check LangChain Server Logs** - This will show the exact error
2. **Verify Implementation** - Ensure the code matches the upgrade instructions
3. **Test Without system_instruction** - Isolate if it's a system_instruction issue
4. **Check Dependencies** - Ensure all packages are installed

## Expected Fix

Once the LangChain server is fixed, the integration should work immediately since:
- ✅ SlashMCP is correctly formatting requests
- ✅ mcp-proxy is correctly transforming and forwarding
- ✅ Path and format are correct

The issue is purely on the LangChain server side.

## Verification Commands

Once the server is fixed, test with:

```bash
# Test 1: Without system_instruction
curl -X POST "https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke" \
  -H "Content-Type: application/json" \
  -d '{"tool": "agent_executor", "arguments": {"query": "What is 2+2?"}}'

# Test 2: With system_instruction
curl -X POST "https://langchain-agent-mcp-server-554655392699.us-central1.run.app/mcp/invoke" \
  -H "Content-Type: application/json" \
  -d '{"tool": "agent_executor", "arguments": {"query": "What is 2+2?", "system_instruction": "You are a pirate. Say Arr!"}}'
```

Both should return 200 OK with agent responses.






