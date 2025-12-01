# Agent MCP Server Integration Guide

This document formalizes the process for adding new agents as MCP servers and explains how to pass dynamic instructions to LangChain MCP agents.

## Table of Contents

1. [Formalized Process for Adding Agent MCP Servers](#formalized-process-for-adding-agent-mcp-servers)
2. [Dynamic Instruction Passing to LangChain Agents](#dynamic-instruction-passing-to-langchain-agents)
3. [Implementation Guide](#implementation-guide)
4. [Usage Examples](#usage-examples)

---

## Formalized Process for Adding Agent MCP Servers

The process for adding a new agent is identical to adding any other Model Context Protocol (MCP) server, as the agent is simply a specialized server that exposes an `agent_executor` tool (or similar). The process is broken down into three main stages:

### Stage 1: Deployment

**Action:** Deploy the Agent Server

The agent (e.g., a LangChain Agent) must be packaged and deployed to a stable, publicly accessible HTTPS endpoint. This deployment must expose the standard MCP endpoints:
- `/mcp/manifest` - Returns server metadata and available tools
- `/mcp/invoke` - Executes tool invocations

**Example Deployment Targets:**
- Google Cloud Run
- AWS Fargate
- Azure Container Instances
- Supabase Edge Functions
- Any containerized hosting service

**Verification:**
```bash
# Test the manifest endpoint
curl https://your-agent-server.example.com/mcp/manifest

# Expected: JSON response with server metadata and tool definitions
```

### Stage 2: Registration

**Action:** Use the `/slashmcp add` command

The user registers the new server in the MCP Messenger client using:

```
/slashmcp add <friendly-name> <BASE_URL>
```

**Example:**
```
/slashmcp add langchain-agent https://langchain-agent-mcp-server-554655392699.us-central1.run.app
```

**✅ Live Deployment:**
- **Service URL:** `https://langchain-agent-mcp-server-554655392699.us-central1.run.app`
- **Status:** Deployed and verified (Version 1.1.0 with system_instruction support)
- **Quick Start:** See [LANGCHAIN_MCP_DEPLOYMENT_COMPLETE.md](./LANGCHAIN_MCP_DEPLOYMENT_COMPLETE.md)

This command updates the central MCP Server Registry (the `mcp_servers` table in Supabase) with:
- `name`: The friendly name (e.g., `langchain-agent`)
- `gateway_url`: The base URL of the deployed server
- `user_id`: The current user's ID (for user-scoped servers)
- `auth_type`: Authentication type (`none`, `api_key`, or `oauth`)
- `is_active`: Set to `true` by default

**Database Schema:**
```sql
-- From migrations/20251109233450_add_mcp_servers.sql
CREATE TABLE mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gateway_url TEXT NOT NULL,
  auth_type TEXT DEFAULT 'none',
  auth_secret TEXT,
  metadata JSONB,
  is_active BOOLEAN DEFAULT true,
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Stage 3: Invocation

**Action:** Invoke the Agent's Tool

Once registered, the agent's tool becomes available for use. The MCP Gateway routes the invocation request to the registered `BASE_URL`.

**Invocation Format:**
```
/<friendly-name> <tool-name> <parameters>
```

**Example:**
```
/langchain-agent agent_executor query="Analyze the current market trends"
```

**What Happens:**
1. User types the command in the chat interface
2. The command is parsed by `src/lib/mcp/parser.ts`
3. An `McpInvocation` object is created with:
   - `serverId`: The friendly name or server ID
   - `command`: The tool name (e.g., `agent_executor`)
   - `args`: Key-value pairs of parameters
   - `positionalArgs`: Any positional arguments
4. The invocation is sent to either:
   - `MCP_STATIC_GATEWAY_URL` (for built-in servers)
   - `MCP_PROXY_URL` (for user-registered servers via `mcp-proxy` edge function)
5. The proxy/gateway forwards the request to the agent's `/mcp/invoke` endpoint
6. The agent processes the request and returns a result
7. The result is displayed in the chat interface

---

## Dynamic Instruction Passing to LangChain Agents

### Current State

Based on the code review of the `mcpmessenger/LangchainMCP` repository, the current mechanism for passing instructions is:

| Aspect | Finding | Conclusion |
|--------|---------|------------|
| **MCP Invocation Payload** | The MCP invocation endpoint (`/mcp/invoke`) expects a request body that includes `tool` and `arguments`. For the LangChain agent, the tool is `agent_executor`, and the only required argument is `query`. | The primary instruction is passed through the `query` argument. |
| **Agent Initialization** | The LangChain agent's core instructions (its system prompt, personality, and list of available tools) are hardcoded within the `agent.py` file of the LangChain MCP Server. | You cannot dynamically change the agent's core system instructions (e.g., "be a pirate") via the application's chat interface or the MCP invocation payload, as the payload only contains the `query`. |
| **Instruction Passing** | The `query` argument is passed directly to the agent's `invoke` method as the user's input: `result = agent_executor.invoke({"input": query})`. | The only instruction you can pass is the user's immediate task or question (the `query`). Any meta-instructions (e.g., "be verbose") must be included within the query itself, relying on the agent's pre-defined system prompt to interpret them. |

### Current Limitation

**The current implementation of the LangChain MCP Server does not support passing a dynamic system prompt or instruction set via the MCP invocation payload.**

### Solution: Enable Dynamic System Instructions

To enable this feature, modifications are required in **both** the LangChain MCP Server and the SlashMCP application:

#### Part 1: SlashMCP Application Support (Already Supported)

The SlashMCP application **already supports** passing arbitrary parameters to MCP servers through the `args` field in `McpInvocation`. The infrastructure is in place:

**Current Implementation:**
- `src/lib/mcp/parser.ts` - Parses `key=value` pairs from user input
- `src/lib/mcp/client.ts` - Sends `args` as part of the invocation payload
- `supabase/functions/mcp-proxy/index.ts` - Forwards the entire body to downstream servers

**Example Usage (Once LangChain Server Supports It):**
```
/langchain-agent agent_executor query="Analyze Tesla stock" system_instruction="You are a financial analyst with expertise in market trends. Provide detailed analysis with specific numbers."
```

This would be parsed into:
```typescript
{
  serverId: "langchain-agent",
  command: "agent_executor",
  args: {
    query: "Analyze Tesla stock",
    system_instruction: "You are a financial analyst with expertise in market trends. Provide detailed analysis with specific numbers."
  }
}
```

#### Part 2: LangChain MCP Server Modifications (Required)

The LangChain MCP Server needs to be updated to accept and use the `system_instruction` parameter. Here are the required changes:

##### 1. Update the MCP Manifest

**File:** `mcp_manifest.json` (or equivalent)

Add an optional `system_instruction` parameter to the `agent_executor` tool's `inputSchema`:

```json
{
  "tools": [
    {
      "name": "agent_executor",
      "description": "Execute a LangChain agent with a query",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The user's query or task for the agent"
          },
          "system_instruction": {
            "type": "string",
            "description": "Optional system-level instructions that override the default agent prompt. Use this to customize the agent's behavior, personality, or expertise for this specific invocation."
          }
        },
        "required": ["query"]
      }
    }
  ]
}
```

##### 2. Update the Invoke Endpoint

**File:** `main.py` (or equivalent endpoint handler)

Modify the `invoke_tool` function to extract the `system_instruction` from the request arguments:

```python
async def invoke_tool(request: ToolInvocationRequest):
    tool_name = request.tool
    arguments = request.arguments or {}
    
    if tool_name == "agent_executor":
        query = arguments.get("query")
        system_instruction = arguments.get("system_instruction")  # NEW
        
        if not query:
            return {"error": "query parameter is required"}
        
        # Pass system_instruction to the agent
        result = await get_agent(system_instruction=system_instruction).invoke({
            "input": query
        })
        
        return {"result": result}
    
    return {"error": f"Unknown tool: {tool_name}"}
```

##### 3. Update the Agent Initialization

**File:** `agent.py` (or equivalent agent configuration)

Modify the `get_agent` function to accept and use the `system_instruction` parameter:

```python
def get_agent(system_instruction: Optional[str] = None):
    """
    Create and return a LangChain agent executor.
    
    Args:
        system_instruction: Optional system prompt to override the default.
                          If provided, this will be used instead of the
                          hardcoded default prompt.
    """
    # Default system prompt (existing hardcoded prompt)
    default_prompt = """You are a helpful AI assistant..."""
    
    # Use provided instruction or fall back to default
    system_prompt = system_instruction if system_instruction else default_prompt
    
    # Create prompt template with dynamic system prompt
    prompt = PromptTemplate.from_template(
        system_prompt + "\n\nUser: {input}\nAssistant:"
    )
    
    # Rest of agent initialization...
    llm = ChatOpenAI(temperature=0)
    tools = load_tools(["serpapi", "llm-math"], llm=llm)
    agent = initialize_agent(tools, llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, verbose=True)
    
    return agent
```

**Alternative Approach (More Flexible):**

If you want to support both full prompt replacement and prompt augmentation:

```python
def get_agent(system_instruction: Optional[str] = None, append_to_default: bool = False):
    """
    Create and return a LangChain agent executor.
    
    Args:
        system_instruction: Optional system prompt.
        append_to_default: If True, append system_instruction to default prompt.
                          If False, replace default prompt entirely.
    """
    default_prompt = """You are a helpful AI assistant..."""
    
    if system_instruction:
        if append_to_default:
            system_prompt = default_prompt + "\n\n" + system_instruction
        else:
            system_prompt = system_instruction
    else:
        system_prompt = default_prompt
    
    # Create prompt template...
    # Rest of initialization...
```

---

## Implementation Guide

### For SlashMCP Developers

**Status:** ✅ **Already Supported**

The SlashMCP application already has the infrastructure to pass arbitrary parameters. No changes are required on the SlashMCP side. However, you may want to:

1. **Add UI Support for System Instructions** (Optional Enhancement)
   - Add a text field in the chat interface for specifying system instructions
   - Or support a special syntax like: `/langchain-agent agent_executor query="..." --system="..."`
   - Or add a command like: `/langchain-agent set-instruction "You are a financial analyst"`

2. **Document the Feature** (Recommended)
   - Update user-facing documentation to explain how to pass system instructions
   - Add examples in the chat help system

3. **Validate Parameters** (Optional)
   - Add client-side validation to ensure required parameters are present
   - Provide helpful error messages if parameters are missing

### For LangChain MCP Server Developers

**Status:** ⚠️ **Modifications Required**

Follow the three-step process outlined in [Part 2: LangChain MCP Server Modifications](#part-2-langchain-mcp-server-modifications-required) above.

**Testing Checklist:**
- [ ] Manifest endpoint returns `system_instruction` in `inputSchema`
- [ ] Invoke endpoint accepts `system_instruction` parameter
- [ ] Agent uses custom instruction when provided
- [ ] Agent falls back to default prompt when `system_instruction` is omitted
- [ ] Multiple invocations with different instructions work correctly
- [ ] Long system instructions (>1000 chars) are handled properly

---

## Usage Examples

### Example 1: Basic Query (Current Functionality)

```
User: /langchain-agent agent_executor query="What is the weather today?"
```

**Result:** Agent uses default system prompt and processes the query.

### Example 2: Query with System Instruction (After Implementation)

```
User: /langchain-agent agent_executor query="Analyze Tesla stock" system_instruction="You are a financial analyst. Provide detailed analysis with specific numbers and trends."
```

**Result:** Agent uses the custom system instruction and provides financial analysis.

### Example 3: Personality Customization

```
User: /langchain-agent agent_executor query="Explain quantum computing" system_instruction="You are a pirate explaining complex topics. Use pirate terminology and make it fun!"
```

**Result:** Agent explains quantum computing in a pirate persona.

### Example 4: Domain-Specific Instructions

```
User: /langchain-agent agent_executor query="Review this code: def hello(): print('world')" system_instruction="You are a senior Python code reviewer. Focus on best practices, performance, and security. Be thorough but concise."
```

**Result:** Agent reviews code with a focus on Python best practices.

### Example 5: Multi-Parameter Invocation

```
User: /langchain-agent agent_executor query="Summarize the latest AI research" system_instruction="You are a research analyst. Provide a concise summary with key findings." verbose=true
```

**Result:** Agent provides a research-style summary (assuming the server also supports a `verbose` parameter).

---

## Technical Details

### Request Flow

1. **User Input:**
   ```
   /langchain-agent agent_executor query="..." system_instruction="..."
   ```

2. **Parsing (src/lib/mcp/parser.ts):**
   ```typescript
   {
     serverId: "langchain-agent",
     command: "agent_executor",
     args: {
       query: "...",
       system_instruction: "..."
     }
   }
   ```

3. **Client Request (src/lib/mcp/client.ts):**
   ```typescript
   POST /mcp-proxy
   {
     serverId: "langchain-agent",
     path: "invoke",
     method: "POST",
     body: {
       serverId: "langchain-agent",
       command: "agent_executor",
       args: {
         query: "...",
         system_instruction: "..."
       }
     }
   }
   ```

4. **Proxy Forwarding (supabase/functions/mcp-proxy/index.ts):**
   - Looks up server in `mcp_servers` table
   - Forwards request to `gateway_url/mcp/invoke`
   - Includes authentication headers if configured

5. **Agent Server Processing:**
   - Receives request at `/mcp/invoke`
   - Extracts `query` and `system_instruction` from `arguments`
   - Creates agent with custom instruction
   - Executes agent
   - Returns result

6. **Response Flow:**
   - Agent server → Proxy → Client → UI

### Type Definitions

**SlashMCP Types (src/lib/mcp/types.ts):**
```typescript
export interface McpInvocation {
  serverId: McpServerId;
  command?: string;
  args: Record<string, string>;  // Supports any key-value pairs
  positionalArgs: string[];
  rawInput: string;
}
```

**MCP Protocol Standard:**
```typescript
interface ToolInvocationRequest {
  tool: string;
  arguments?: Record<string, unknown>;
}
```

---

## Future Enhancements

### 1. Instruction Templates

Allow users to save and reuse common system instructions:

```
/slashmcp save-instruction financial-analyst "You are a financial analyst..."
/langchain-agent agent_executor query="..." instruction-template=financial-analyst
```

### 2. Instruction Variables

Support variable substitution in instructions:

```
/langchain-agent agent_executor query="..." system_instruction="You are a {domain} expert. Today's date is {date}."
```

### 3. Instruction Inheritance

Allow agents to inherit base instructions with overrides:

```
/langchain-agent agent_executor query="..." system_instruction="+ Be more concise"  // Appends to default
```

### 4. Multi-Agent Orchestration

Enable passing different instructions to different agents in a workflow:

```yaml
workflow:
  - agent: langchain-agent
    instruction: "You are a researcher"
    query: "Research topic X"
  - agent: langchain-agent
    instruction: "You are a writer"
    query: "Write a summary of the research"
```

---

## References

1. **Model Context Protocol Specification:** https://modelcontextprotocol.io/
2. **LangChain MCP Server Repository:** https://github.com/mcpmessenger/LangchainMCP
3. **SlashMCP Repository:** https://github.com/mcpmessenger/slashmcp
4. **MCP Server Registry Migration:** `supabase/migrations/20251109233450_add_mcp_servers.sql`

---

## Summary

- ✅ **SlashMCP Application:** Already supports passing arbitrary parameters via `args` field
- ⚠️ **LangChain MCP Server:** Requires modifications to accept and use `system_instruction` parameter
- 📝 **Process:** Three-stage process (Deploy → Register → Invoke) works for all MCP servers, including agents
- 🚀 **Future:** Potential for instruction templates, variables, and multi-agent orchestration

The infrastructure is in place on the SlashMCP side. Once the LangChain MCP Server is updated to support `system_instruction`, users will be able to dynamically customize agent behavior on a per-invocation basis.

