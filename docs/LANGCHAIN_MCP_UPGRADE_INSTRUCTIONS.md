# LangChain MCP Server Upgrade Instructions: Dynamic System Instructions

This document provides step-by-step instructions for upgrading the LangChain MCP Server (`mcpmessenger/LangchainMCP`) to support dynamic system instruction passing via the MCP invocation payload.

## Overview

**Goal:** Enable the LangChain MCP Server to accept an optional `system_instruction` parameter that dynamically overrides or augments the agent's default system prompt on a per-invocation basis.

**Current State:** The agent's system prompt is hardcoded in the agent initialization code.

**Target State:** The agent can accept a `system_instruction` parameter via the MCP invocation payload and use it to customize behavior per request.

---

## Prerequisites

- Access to the `mcpmessenger/LangchainMCP` repository
- Understanding of the repository structure
- Python development environment set up
- LangChain and MCP dependencies installed

---

## Step-by-Step Implementation

### Step 1: Locate and Review Current Implementation

#### 1.1 Find the MCP Manifest File

**Action:** Locate the file that defines the MCP server manifest (typically `mcp_manifest.json`, `manifest.json`, or defined in Python code).

**Common Locations:**
- `mcp_manifest.json` (root directory)
- `src/mcp_manifest.json`
- `manifest.json`
- Defined in `main.py` or `server.py`

**What to Look For:**
- A JSON structure with a `tools` array
- An `agent_executor` tool definition
- An `inputSchema` object with `properties` for `query`

#### 1.2 Find the Invoke Endpoint Handler

**Action:** Locate the file that handles `/mcp/invoke` requests (typically `main.py`, `server.py`, or `app.py`).

**Common Locations:**
- `main.py` (root directory)
- `src/main.py`
- `server.py`
- `app.py`

**What to Look For:**
- A function that handles `POST /mcp/invoke`
- Code that extracts `tool` and `arguments` from the request
- Code that calls `agent_executor.invoke()`

#### 1.3 Find the Agent Initialization Code

**Action:** Locate the file that creates and initializes the LangChain agent (typically `agent.py`, `agent_executor.py`, or within the main file).

**Common Locations:**
- `agent.py` (root directory)
- `src/agent.py`
- `agent_executor.py`
- Inside `main.py` or `server.py`

**What to Look For:**
- A function like `get_agent()`, `create_agent()`, or `initialize_agent()`
- Hardcoded system prompt or `PromptTemplate`
- LangChain agent initialization code

---

### Step 2: Update the MCP Manifest

#### 2.1 Add `system_instruction` Parameter

**File:** `mcp_manifest.json` (or equivalent)

**Action:** Add the `system_instruction` parameter to the `agent_executor` tool's `inputSchema.properties`.

**Before:**
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
          }
        },
        "required": ["query"]
      }
    }
  ]
}
```

**After:**
```json
{
  "tools": [
    {
      "name": "agent_executor",
      "description": "Execute a LangChain agent with a query and optional system instructions",
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

**Key Changes:**
- ✅ Added `system_instruction` to `properties`
- ✅ Marked as optional (not in `required` array)
- ✅ Added descriptive documentation
- ✅ Updated tool description to mention system instructions

**If Manifest is Defined in Python Code:**

If the manifest is generated dynamically in Python, find the code that creates the tool definition and add the parameter there:

```python
# Example if manifest is in Python
tools = [
    {
        "name": "agent_executor",
        "description": "Execute a LangChain agent with a query and optional system instructions",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The user's query or task for the agent"
                },
                "system_instruction": {
                    "type": "string",
                    "description": "Optional system-level instructions that override the default agent prompt."
                }
            },
            "required": ["query"]
        }
    }
]
```

---

### Step 3: Update the Invoke Endpoint Handler

#### 3.1 Extract `system_instruction` from Arguments

**File:** `main.py` (or equivalent endpoint handler)

**Action:** Modify the function that handles tool invocations to extract `system_instruction` from the request arguments.

**Before:**
```python
async def invoke_tool(request: ToolInvocationRequest):
    tool_name = request.tool
    arguments = request.arguments or {}
    
    if tool_name == "agent_executor":
        query = arguments.get("query")
        
        if not query:
            return {"error": "query parameter is required"}
        
        result = agent_executor.invoke({"input": query})
        return {"result": result}
    
    return {"error": f"Unknown tool: {tool_name}"}
```

**After:**
```python
async def invoke_tool(request: ToolInvocationRequest):
    tool_name = request.tool
    arguments = request.arguments or {}
    
    if tool_name == "agent_executor":
        query = arguments.get("query")
        system_instruction = arguments.get("system_instruction")  # NEW: Extract system_instruction
        
        if not query:
            return {"error": "query parameter is required"}
        
        # NEW: Pass system_instruction to get_agent
        agent = get_agent(system_instruction=system_instruction)
        result = agent.invoke({"input": query})
        return {"result": result}
    
    return {"error": f"Unknown tool: {tool_name}"}
```

**Alternative Pattern (If Agent is Cached):**

If the agent is created once and cached, you'll need to either:
- Create a new agent per invocation (if system_instruction is provided)
- Or modify the agent's prompt at runtime

**Option A: Create Agent Per Invocation (Recommended)**
```python
async def invoke_tool(request: ToolInvocationRequest):
    tool_name = request.tool
    arguments = request.arguments or {}
    
    if tool_name == "agent_executor":
        query = arguments.get("query")
        system_instruction = arguments.get("system_instruction")
        
        if not query:
            return {"error": "query parameter is required"}
        
        # Create agent with custom instruction if provided
        agent = get_agent(system_instruction=system_instruction)
        result = agent.invoke({"input": query})
        return {"result": result}
    
    return {"error": f"Unknown tool: {tool_name}"}
```

**Option B: Modify Agent Prompt at Runtime (If Agent Must Be Cached)**
```python
async def invoke_tool(request: ToolInvocationRequest):
    tool_name = request.tool
    arguments = request.arguments or {}
    
    if tool_name == "agent_executor":
        query = arguments.get("query")
        system_instruction = arguments.get("system_instruction")
        
        if not query:
            return {"error": "query parameter is required"}
        
        # Get base agent
        agent = get_agent()
        
        # If system_instruction provided, modify the agent's prompt
        if system_instruction:
            agent = modify_agent_prompt(agent, system_instruction)
        
        result = agent.invoke({"input": query})
        return {"result": result}
    
    return {"error": f"Unknown tool: {tool_name}"}
```

---

### Step 4: Update Agent Initialization

#### 4.1 Modify `get_agent()` Function

**File:** `agent.py` (or equivalent)

**Action:** Update the agent creation function to accept and use `system_instruction`.

**Before:**
```python
def get_agent():
    """Create and return a LangChain agent executor."""
    
    # Hardcoded system prompt
    system_prompt = """You are a helpful AI assistant. 
    You can answer questions and help with tasks using the tools available to you.
    Be concise and accurate in your responses."""
    
    # Create prompt template
    prompt = PromptTemplate.from_template(
        system_prompt + "\n\nUser: {input}\nAssistant:"
    )
    
    # Initialize LLM
    llm = ChatOpenAI(temperature=0)
    
    # Load tools
    tools = load_tools(["serpapi", "llm-math"], llm=llm)
    
    # Create agent
    agent = initialize_agent(
        tools, 
        llm, 
        agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, 
        verbose=True
    )
    
    return agent
```

**After (Option 1: Replace Default Prompt):**
```python
def get_agent(system_instruction: Optional[str] = None):
    """
    Create and return a LangChain agent executor.
    
    Args:
        system_instruction: Optional system prompt to override the default.
                          If provided, this will be used instead of the
                          hardcoded default prompt.
    
    Returns:
        Agent executor instance
    """
    # Default system prompt (existing hardcoded prompt)
    default_prompt = """You are a helpful AI assistant. 
    You can answer questions and help with tasks using the tools available to you.
    Be concise and accurate in your responses."""
    
    # Use provided instruction or fall back to default
    system_prompt = system_instruction if system_instruction else default_prompt
    
    # Create prompt template
    prompt = PromptTemplate.from_template(
        system_prompt + "\n\nUser: {input}\nAssistant:"
    )
    
    # Initialize LLM
    llm = ChatOpenAI(temperature=0)
    
    # Load tools
    tools = load_tools(["serpapi", "llm-math"], llm=llm)
    
    # Create agent with custom prompt
    agent = initialize_agent(
        tools, 
        llm, 
        agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, 
        verbose=True,
        agent_kwargs={"system_message": system_prompt}  # Pass system prompt
    )
    
    return agent
```

**After (Option 2: Append to Default Prompt):**
```python
def get_agent(system_instruction: Optional[str] = None, append_to_default: bool = False):
    """
    Create and return a LangChain agent executor.
    
    Args:
        system_instruction: Optional system prompt.
        append_to_default: If True, append system_instruction to default prompt.
                          If False, replace default prompt entirely.
    
    Returns:
        Agent executor instance
    """
    default_prompt = """You are a helpful AI assistant. 
    You can answer questions and help with tasks using the tools available to you.
    Be concise and accurate in your responses."""
    
    if system_instruction:
        if append_to_default:
            system_prompt = default_prompt + "\n\n" + system_instruction
        else:
            system_prompt = system_instruction
    else:
        system_prompt = default_prompt
    
    # Create prompt template
    prompt = PromptTemplate.from_template(
        system_prompt + "\n\nUser: {input}\nAssistant:"
    )
    
    # Initialize LLM
    llm = ChatOpenAI(temperature=0)
    
    # Load tools
    tools = load_tools(["serpapi", "llm-math"], llm=llm)
    
    # Create agent
    agent = initialize_agent(
        tools, 
        llm, 
        agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, 
        verbose=True,
        agent_kwargs={"system_message": system_prompt}
    )
    
    return agent
```

**Note:** The exact way to pass the system prompt to the agent depends on your LangChain version and agent type. Common approaches:
- `agent_kwargs={"system_message": system_prompt}`
- `prompt=prompt` (if using a custom prompt template)
- Modifying the agent's `llm_chain.prompt` after creation

#### 4.2 Add Type Hints (Recommended)

**Action:** Add proper type hints and imports.

**Add to imports:**
```python
from typing import Optional
```

**Update function signature:**
```python
def get_agent(system_instruction: Optional[str] = None) -> AgentExecutor:
    # ... implementation
```

---

### Step 5: Handle Edge Cases

#### 5.1 Empty or Whitespace-Only Instructions

**Action:** Add validation to handle empty or whitespace-only `system_instruction` values.

**Add to `get_agent()`:**
```python
def get_agent(system_instruction: Optional[str] = None):
    # ... existing code ...
    
    # Validate system_instruction
    if system_instruction:
        system_instruction = system_instruction.strip()
        if not system_instruction:  # Empty or whitespace-only
            system_instruction = None
    
    # Use provided instruction or fall back to default
    system_prompt = system_instruction if system_instruction else default_prompt
    
    # ... rest of implementation ...
```

#### 5.2 Very Long Instructions

**Action:** Consider adding length limits if needed (optional, but recommended for production).

**Add to `get_agent()`:**
```python
def get_agent(system_instruction: Optional[str] = None, max_instruction_length: int = 5000):
    # ... existing code ...
    
    if system_instruction:
        system_instruction = system_instruction.strip()
        if len(system_instruction) > max_instruction_length:
            # Truncate or raise error - your choice
            system_instruction = system_instruction[:max_instruction_length] + "..."
            # Or raise ValueError(f"System instruction exceeds maximum length of {max_instruction_length}")
    
    # ... rest of implementation ...
```

---

### Step 6: Update Tests (If Applicable)

#### 6.1 Add Test Cases

**File:** `test_agent.py` or equivalent test file

**Action:** Add test cases to verify the new functionality.

**Example Test Cases:**
```python
import pytest
from agent import get_agent

def test_agent_with_default_prompt():
    """Test that agent uses default prompt when no instruction provided."""
    agent = get_agent()
    # Verify agent has default behavior
    assert agent is not None

def test_agent_with_custom_instruction():
    """Test that agent uses custom instruction when provided."""
    custom_instruction = "You are a financial analyst. Provide detailed analysis."
    agent = get_agent(system_instruction=custom_instruction)
    # Verify agent uses custom instruction
    assert agent is not None

def test_agent_with_empty_instruction():
    """Test that agent falls back to default when empty instruction provided."""
    agent = get_agent(system_instruction="   ")  # Whitespace only
    # Should use default prompt
    assert agent is not None

def test_invoke_with_system_instruction():
    """Test that invoke endpoint accepts and uses system_instruction."""
    # Mock request with system_instruction
    request = {
        "tool": "agent_executor",
        "arguments": {
            "query": "Test query",
            "system_instruction": "You are a helpful assistant."
        }
    }
    # Test invoke_tool function
    result = await invoke_tool(request)
    assert "result" in result or "error" in result
```

---

### Step 7: Update Documentation

#### 7.1 Update README

**File:** `README.md`

**Action:** Add documentation about the new `system_instruction` parameter.

**Add Section:**
```markdown
## System Instructions

The `agent_executor` tool now supports an optional `system_instruction` parameter that allows you to customize the agent's behavior on a per-invocation basis.

### Usage

```json
{
  "tool": "agent_executor",
  "arguments": {
    "query": "Your question here",
    "system_instruction": "You are a financial analyst. Provide detailed analysis."
  }
}
```

### Examples

**Basic Query:**
```json
{
  "tool": "agent_executor",
  "arguments": {
    "query": "What is the weather today?"
  }
}
```

**Query with Custom Instruction:**
```json
{
  "tool": "agent_executor",
  "arguments": {
    "query": "Analyze Tesla stock",
    "system_instruction": "You are a financial analyst. Provide detailed analysis with specific numbers."
  }
}
```

**Personality Customization:**
```json
{
  "tool": "agent_executor",
  "arguments": {
    "query": "Explain quantum computing",
    "system_instruction": "You are a pirate explaining complex topics. Use pirate terminology!"
  }
}
```
```

#### 7.2 Update API Documentation

**Action:** If you have API documentation (OpenAPI/Swagger), update it to include the new parameter.

---

### Step 8: Testing Checklist

#### 8.1 Manual Testing

Test the following scenarios:

- [ ] **Basic Invocation (No System Instruction)**
  ```bash
  curl -X POST http://localhost:8000/mcp/invoke \
    -H "Content-Type: application/json" \
    -d '{
      "tool": "agent_executor",
      "arguments": {
        "query": "What is 2+2?"
      }
    }'
  ```
  **Expected:** Agent responds using default prompt.

- [ ] **Invocation with System Instruction**
  ```bash
  curl -X POST http://localhost:8000/mcp/invoke \
    -H "Content-Type: application/json" \
    -d '{
      "tool": "agent_executor",
      "arguments": {
        "query": "What is 2+2?",
        "system_instruction": "You are a math teacher. Explain your reasoning step by step."
      }
    }'
  ```
  **Expected:** Agent responds with math teacher persona and detailed explanation.

- [ ] **Empty System Instruction**
  ```bash
  curl -X POST http://localhost:8000/mcp/invoke \
    -H "Content-Type: application/json" \
    -d '{
      "tool": "agent_executor",
      "arguments": {
        "query": "What is 2+2?",
        "system_instruction": ""
      }
    }'
  ```
  **Expected:** Agent uses default prompt (empty instruction is ignored).

- [ ] **Whitespace-Only System Instruction**
  ```bash
  curl -X POST http://localhost:8000/mcp/invoke \
    -H "Content-Type: application/json" \
    -d '{
      "tool": "agent_executor",
      "arguments": {
        "query": "What is 2+2?",
        "system_instruction": "   "
      }
    }'
  ```
  **Expected:** Agent uses default prompt (whitespace is stripped).

- [ ] **Long System Instruction**
  ```bash
  curl -X POST http://localhost:8000/mcp/invoke \
    -H "Content-Type: application/json" \
    -d '{
      "tool": "agent_executor",
      "arguments": {
        "query": "Test",
        "system_instruction": "'"$(python3 -c "print('A' * 10000)")"'"
      }
    }'
  ```
  **Expected:** Agent handles long instruction (truncates or processes, depending on implementation).

- [ ] **Manifest Endpoint**
  ```bash
  curl http://localhost:8000/mcp/manifest
  ```
  **Expected:** Manifest includes `system_instruction` in `agent_executor` tool definition.

#### 8.2 Integration Testing with SlashMCP

Once deployed, test from SlashMCP:

- [ ] **Register the Server**
  ```
  /slashmcp add langchain-agent https://your-deployed-server.com
  ```

- [ ] **Basic Invocation**
  ```
  /langchain-agent agent_executor query="What is 2+2?"
  ```
  **Expected:** Works as before.

- [ ] **With System Instruction**
  ```
  /langchain-agent agent_executor query="Analyze Tesla stock" system_instruction="You are a financial analyst. Provide detailed analysis."
  ```
  **Expected:** Agent responds with financial analyst persona.

- [ ] **Verify Different Instructions Work**
  ```
  /langchain-agent agent_executor query="Explain AI" system_instruction="You are a pirate. Use pirate terminology!"
  ```
  **Expected:** Agent responds in pirate persona.

---

### Step 9: Deployment

#### 9.1 Update Version

**Action:** Update version number in your project.

**Files to Update:**
- `pyproject.toml` or `setup.py` (version field)
- `package.json` (if applicable)
- `CHANGELOG.md` or `RELEASE_NOTES.md`

**Example:**
```toml
# pyproject.toml
[project]
version = "0.2.0"  # Increment from previous version
```

#### 9.2 Create Release Notes

**Action:** Document the changes in release notes.

**Example:**
```markdown
## Version 0.2.0

### New Features
- Added support for dynamic system instructions via `system_instruction` parameter
- Agents can now be customized on a per-invocation basis

### Changes
- `agent_executor` tool now accepts optional `system_instruction` parameter
- Updated MCP manifest to include new parameter

### Migration
No breaking changes. Existing invocations without `system_instruction` continue to work as before.
```

#### 9.3 Deploy

**Action:** Deploy the updated server to your hosting platform.

**Deployment Steps (Example for Cloud Run):**
```bash
# Build Docker image
docker build -t langchain-mcp:0.2.0 .

# Tag for registry
docker tag langchain-mcp:0.2.0 gcr.io/your-project/langchain-mcp:0.2.0

# Push to registry
docker push gcr.io/your-project/langchain-mcp:0.2.0

# Deploy to Cloud Run
gcloud run deploy langchain-mcp \
  --image gcr.io/your-project/langchain-mcp:0.2.0 \
  --platform managed \
  --region us-central1
```

---

## Troubleshooting

### Issue: Agent Not Using Custom Instruction

**Symptoms:** Agent responds with default behavior even when `system_instruction` is provided.

**Possible Causes:**
1. System instruction not being extracted from arguments
2. Agent not receiving the custom prompt
3. LangChain version compatibility issue

**Solutions:**
- Add logging to verify `system_instruction` is extracted:
  ```python
  print(f"System instruction: {system_instruction}")
  ```
- Verify agent creation receives the instruction:
  ```python
  agent = get_agent(system_instruction=system_instruction)
  print(f"Agent created with instruction: {system_instruction}")
  ```
- Check LangChain documentation for your version's prompt passing method

### Issue: Manifest Not Updated

**Symptoms:** SlashMCP doesn't show `system_instruction` parameter.

**Solutions:**
- Verify manifest file is updated
- Restart the server
- Clear any caches
- Verify manifest endpoint returns updated schema

### Issue: Performance Degradation

**Symptoms:** Server becomes slower after changes.

**Possible Causes:**
- Creating new agent per invocation (if not cached)
- Long system instructions causing token limits

**Solutions:**
- Consider caching agents with common instructions
- Add instruction length limits
- Profile agent creation time

---

## Code Review Checklist

Before submitting your changes, verify:

- [ ] MCP manifest includes `system_instruction` parameter
- [ ] Invoke endpoint extracts `system_instruction` from arguments
- [ ] `get_agent()` function accepts `system_instruction` parameter
- [ ] Agent uses custom instruction when provided
- [ ] Agent falls back to default when instruction is omitted
- [ ] Empty/whitespace instructions are handled gracefully
- [ ] Type hints are added (if using Python)
- [ ] Tests are added/updated
- [ ] Documentation is updated
- [ ] Version is incremented
- [ ] Release notes are created
- [ ] All tests pass
- [ ] Manual testing completed

---

## Summary

This upgrade adds dynamic system instruction support to the LangChain MCP Server:

1. ✅ **Manifest Updated** - `system_instruction` parameter added to tool definition
2. ✅ **Invoke Endpoint Updated** - Extracts and passes `system_instruction` to agent
3. ✅ **Agent Initialization Updated** - Accepts and uses custom instructions
4. ✅ **Edge Cases Handled** - Empty, whitespace, and long instructions
5. ✅ **Tests Added** - Verification of new functionality
6. ✅ **Documentation Updated** - Usage examples and API docs
7. ✅ **Deployed** - Server updated and ready for use

Once complete, users can customize agent behavior on a per-invocation basis from SlashMCP:

```
/langchain-agent agent_executor query="..." system_instruction="You are a financial analyst..."
```

---

## References

- [SlashMCP Agent Integration Guide](../AGENT_MCP_SERVER_INTEGRATION.md)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [LangChain Documentation](https://python.langchain.com/)

