# LangChain MCP Server Troubleshooting Guide

## Your Server Details

Based on your registry listing:
- **Server Name:** `langchain-agent`
- **Server ID:** `srv_9d4322f1349c`
- **Status:** Active ✅
- **Last Check:** 11/23/2025, 9:48:43 PM

## Try These Commands

### Option 1: Use Server ID (Most Reliable)

```
/srv_9d4322f1349c agent_executor query="Find the three most cited academic papers on the use of large language models in supply chain optimization and summarize their key findings." system_instruction="You are a research analyst. Provide detailed summaries with citations."
```

### Option 2: Use Server Name

```
/langchain-agent agent_executor query="Find the three most cited academic papers on the use of large language models in supply chain optimization and summarize their key findings." system_instruction="You are a research analyst. Provide detailed summaries with citations."
```

### Option 3: Simplified Test

```
/srv_9d4322f1349c agent_executor query="What is 2+2?" system_instruction="You are a pirate. Say Arr!"
```

## Debugging Steps

### 1. Check Browser Console

Open the browser console (F12 → Console tab) and look for these logs when you send a command:

**Expected logs:**
```
[useChat] Attempting to parse MCP command. Input: /langchain-agent...
[useChat] Registry state: 8 entries: [{id: "srv_9d4322f1349c", name: "langchain-agent"}, ...]
[MCP Parser] Parsing command: /langchain-agent...
[MCP Parser] Tokens: ["langchain-agent", "agent_executor", "query=...", ...]
[MCP Parser] Registry entries: [{id: "srv_9d4322f1349c", name: "langchain-agent"}, ...]
[MCP Parser] Found server in registry: srv_9d4322f1349c for input: langchain-agent
[MCP Parser] Resolved server ID: srv_9d4322f1349c
[useChat] Parse result: MCP command detected
[useChat] MCP invocation: {serverId: "srv_9d4322f1349c", command: "agent_executor", ...}
```

**If you see:**
- `[MCP Parser] Server ID not found for: langchain-agent` → Registry matching issue
- `[MCP Parser] Registry is empty or not provided` → Registry not loaded
- `[useChat] Parse result: Not an MCP command` → Parser rejected the command

### 2. Verify Registry is Loaded

The registry should be loaded when you're signed in. Check:
- Are you signed in? (Look for your email in the top right)
- Does `/slashmcp list` show your servers?

### 3. Test Direct Server ID

If the name doesn't work, always try the server ID:
```
/srv_9d4322f1349c agent_executor query="test"
```

## Common Issues

### Issue: Command Goes to Chat Instead of MCP

**Symptoms:**
- Command is sent to chat API
- AI responds with "I can't execute that command"
- No MCP event logs

**Possible Causes:**
1. Registry not loaded (check console for "Registry is empty")
2. Server name mismatch (use server ID instead)
3. Command format issue (check quotes)

**Solution:**
- Use server ID: `/srv_9d4322f1349c agent_executor query="..."`
- Check console logs to see why parser rejected it
- Ensure you're signed in

### Issue: Server Not Found

**Symptoms:**
- `[MCP Parser] Server ID not found for: langchain-agent`

**Solution:**
- Use the server ID directly: `/srv_9d4322f1349c`
- Re-register the server: `/slashmcp add langchain-agent https://langchain-agent-mcp-server-554655392699.us-central1.run.app`

### Issue: Command Format Error

**Symptoms:**
- Command parsed but returns validation error
- "Available commands: ..." message

**Solution:**
- Ensure `agent_executor` is included
- Check quote escaping (use double quotes for values with spaces)
- Format: `/server-id agent_executor query="..." system_instruction="..."`

## Quick Test Sequence

1. **Test with server ID:**
   ```
   /srv_9d4322f1349c agent_executor query="What is 2+2?"
   ```

2. **Test with system instruction:**
   ```
   /srv_9d4322f1349c agent_executor query="What is 2+2?" system_instruction="You are a pirate. Say Arr!"
   ```

3. **Test with server name:**
   ```
   /langchain-agent agent_executor query="What is 2+2?"
   ```

4. **Check console logs** for each attempt

## Expected Behavior

When working correctly:
- ✅ Command is recognized as MCP command (check console)
- ✅ MCP Event Log shows tool call
- ✅ Response comes from LangChain agent (not chat AI)
- ✅ Response matches system instruction (e.g., pirate persona)

## Still Not Working?

Share the console logs from when you send the command. Look for:
- `[useChat]` logs
- `[MCP Parser]` logs
- Any error messages

This will help identify the exact issue.

