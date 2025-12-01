# LangChain MCP Upgrade Checklist

Quick reference checklist for upgrading the LangChain MCP Server to support dynamic system instructions.

## Pre-Implementation

- [ ] Review current codebase structure
- [ ] Locate MCP manifest file
- [ ] Locate invoke endpoint handler
- [ ] Locate agent initialization code
- [ ] Understand current agent creation flow

## Implementation Steps

### 1. Update MCP Manifest
- [ ] Open manifest file (`mcp_manifest.json` or equivalent)
- [ ] Find `agent_executor` tool definition
- [ ] Add `system_instruction` to `inputSchema.properties`
- [ ] Mark as optional (not in `required` array)
- [ ] Update tool description
- [ ] Verify JSON syntax is valid

### 2. Update Invoke Endpoint
- [ ] Open invoke handler file (`main.py` or equivalent)
- [ ] Find function that handles tool invocations
- [ ] Extract `system_instruction` from `arguments`
- [ ] Pass `system_instruction` to `get_agent()` call
- [ ] Handle case where `system_instruction` is `None` or missing

### 3. Update Agent Initialization
- [ ] Open agent file (`agent.py` or equivalent)
- [ ] Find `get_agent()` function
- [ ] Add `system_instruction: Optional[str] = None` parameter
- [ ] Add default prompt constant/variable
- [ ] Add logic: use `system_instruction` if provided, else use default
- [ ] Pass system prompt to agent creation
- [ ] Add type hints (`from typing import Optional`)

### 4. Handle Edge Cases
- [ ] Strip whitespace from `system_instruction`
- [ ] Handle empty string (treat as None)
- [ ] Handle very long instructions (optional: add length limit)
- [ ] Add error handling for invalid instructions

### 5. Testing
- [ ] Test basic invocation (no system_instruction)
- [ ] Test invocation with system_instruction
- [ ] Test empty system_instruction
- [ ] Test whitespace-only system_instruction
- [ ] Test long system_instruction
- [ ] Test manifest endpoint returns updated schema
- [ ] Test integration with SlashMCP (if possible)

### 6. Documentation
- [ ] Update README.md with usage examples
- [ ] Update API documentation (if applicable)
- [ ] Add code comments explaining the feature
- [ ] Update CHANGELOG.md or RELEASE_NOTES.md

### 7. Deployment
- [ ] Increment version number
- [ ] Create release notes
- [ ] Build and test Docker image (if applicable)
- [ ] Deploy to staging/test environment
- [ ] Verify deployment works
- [ ] Deploy to production
- [ ] Update SlashMCP registry with new server URL (if URL changed)

## Post-Deployment Verification

- [ ] Verify manifest endpoint: `GET /mcp/manifest`
- [ ] Test from SlashMCP: `/langchain-agent agent_executor query="test"`
- [ ] Test with system instruction: `/langchain-agent agent_executor query="test" system_instruction="You are a helpful assistant"`
- [ ] Monitor logs for errors
- [ ] Verify performance is acceptable

## Quick Code Snippets

### Manifest Update
```json
"system_instruction": {
  "type": "string",
  "description": "Optional system-level instructions..."
}
```

### Invoke Handler Update
```python
system_instruction = arguments.get("system_instruction")
agent = get_agent(system_instruction=system_instruction)
```

### Agent Function Update
```python
def get_agent(system_instruction: Optional[str] = None):
    default_prompt = "..."  # Your default
    system_prompt = system_instruction if system_instruction else default_prompt
    # ... create agent with system_prompt
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Agent not using custom instruction | Check agent creation receives the prompt |
| Manifest not updated | Restart server, clear cache |
| Performance issues | Consider caching agents |
| Type errors | Add `from typing import Optional` |

---

**Full Instructions:** See [LANGCHAIN_MCP_UPGRADE_INSTRUCTIONS.md](./LANGCHAIN_MCP_UPGRADE_INSTRUCTIONS.md)

