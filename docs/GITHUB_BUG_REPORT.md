# Bug Report: OpenAI Agents SDK v0.0.9 - Handoff Tools Array Undefined Error

## Summary

The OpenAI Agents SDK version 0.0.9 throws a `TypeError: Cannot read properties of undefined (reading 'map')` error when processing handoffs between agents. The error occurs in the SDK's internal code when it attempts to access a tools array that is undefined during the handoff process.

## Environment

- **SDK Version**: `@openai/agents@0.0.9`
- **Core Package**: `@openai/agents-core@0.0.9`
- **OpenAI Package**: `@openai/agents-openai@0.0.9`
- **Runtime**: Deno (Supabase Edge Functions)
- **Model**: `gpt-4o-mini`

## Error Details

### Error Message
```
TypeError: Cannot read properties of undefined (reading 'map')
```

### Stack Trace
```
at N.#r (https://esm.sh/@openai/agents-core@0.0.9/es2022/agents-core.mjs:2:36194)
at eventLoopTick (ext:core/01_core.js:175:7)
```

### Error Location
The error occurs in `agents-core.mjs` at line 36194, specifically in a function that attempts to call `.map()` on an undefined value. Based on the context (handoff processing), this appears to be related to tools array processing.

## Reproduction Steps

1. Create multiple agents with handoffs configured
2. Set tools on agents (not just pass to `runner.run()`)
3. Trigger a handoff from one agent to another
4. The SDK attempts to process the handoff and access tools
5. Error occurs when SDK tries to map over an undefined tools array

### Minimal Reproduction Code

```typescript
import { Agent, Runner, type Handoff, type Tool } from "https://esm.sh/@openai/agents@0.0.9";

// Create a tool
const mcpProxyTool: Tool = {
  name: "mcp_proxy",
  description: "Executes MCP commands",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
    },
    required: ["command"],
  },
  async run({ command }: { command: string }) {
    return `Executed: ${command}`;
  },
};

// Create target agent with tool
const mcpToolAgent = new Agent({
  name: "MCP_Tool_Agent",
  instructions: "Execute MCP commands",
  tools: [mcpProxyTool], // Tool set on agent
});

// Create orchestrator agent with handoff
const orchestratorAgent = new Agent({
  name: "Orchestrator_Agent",
  instructions: "Route requests to appropriate agents",
  tools: [mcpProxyTool], // Tool also set on orchestrator
  handoffs: [{
    name: "handoff_to_mcp_tool",
    description: "Handoff to MCP tool agent",
    targetAgent: mcpToolAgent,
    inputFilter: (input) => input,
  }],
});

// Create runner
const runner = new Runner({
  model: "gpt-4o-mini",
  apiKey: process.env.OPENAI_API_KEY,
});

// Run with conversation that triggers handoff
const events = await runner.run(
  orchestratorAgent,
  [{ role: "user", content: "Get stock price for AAPL" }],
  {
    // NOTE: Not passing tools here - they're on agents
    maxTurns: 20,
    stream: true,
  }
);

// Error occurs when handoff is triggered
for await (const event of events) {
  // Error happens during handoff processing
  console.log(event);
}
```

## Expected Behavior

When a handoff is triggered:
1. The SDK should transfer control to the target agent
2. The target agent's tools should be available
3. The handoff should complete successfully
4. The target agent should be able to use its tools

## Actual Behavior

1. Handoff is triggered successfully (we see `handoff_requested` events)
2. SDK attempts to process the handoff
3. SDK tries to access tools array (likely from target agent or runner context)
4. Tools array is undefined
5. SDK calls `.map()` on undefined → TypeError
6. Error propagates and breaks the stream

## Investigation Findings

### Finding 1: Tools Must Be on Agents for Handoffs
- **Observation**: When tools are only passed to `runner.run()` options (not on agents), handoffs fail with undefined tools
- **Workaround**: Set tools on both source and target agents
- **Status**: Partial fix - still fails in some cases

### Finding 2: Passing Tools to Both `runner.run()` and Agents Causes Conflict
- **Observation**: When tools are passed to both `runner.run()` options AND set on agents, the SDK gets confused
- **Error**: `Unsupported tool type: {"type":"hosted_tool","name":"mcp_proxy"}`
- **Workaround**: Only set tools on agents, don't pass to `runner.run()`
- **Status**: Resolved (but handoff error persists)

### Finding 3: SDK Accesses Tools from Unexpected Context
- **Observation**: Even when tools are properly set on agents, the SDK still accesses undefined tools during handoff
- **Hypothesis**: SDK may be looking for tools in:
  - Runner context (not available if not passed to `runner.run()`)
  - Agent serialization/deserialization issue
  - Internal SDK state that gets lost during handoff

### Finding 4: Error Occurs in SDK Internal Code
- **Location**: `agents-core.mjs:2:36194` in function `N.#r`
- **Context**: During handoff processing, specifically when mapping over tools
- **Code**: Likely something like `tools.map(...)` where `tools` is undefined

## Error Logs

### Full Error Output
```
event loop error: TypeError: Cannot read properties of undefined (reading 'map')
at N.#r (https://esm.sh/@openai/agents-core@0.0.9/es2022/agents-core.mjs:2:36194)
at eventLoopTick (ext:core/01_core.js:175:7)

=== Runner Error ===
Error message: Cannot read properties of undefined (reading 'map')

Run item stream event: {"name":"handoff_requested","item":{"type":"handoff_call_item",...}}
Event #11 - Type: run_item_stream_event {"name":"handoff_requested",...}
Event #10 - Type: raw_model_stream_event {"data":{"type":"model","event":{"type":"response...
```

### Event Sequence
1. `raw_model_stream_event` - Model generates response
2. `run_item_stream_event` with `handoff_requested` - Handoff is triggered
3. SDK processes handoff internally
4. Error occurs when accessing tools array
5. Error propagates and breaks stream

## Workarounds Attempted

### Workaround 1: Set Tools Only on Agents
```typescript
const agent = new Agent({
  name: "Agent",
  tools: [tool1, tool2], // Tools on agent
});

await runner.run(agent, input, {
  // No tools here
  stream: true,
});
```
**Result**: Still fails with undefined tools during handoff

### Workaround 2: Pass Tools to Both Agent and Runner
```typescript
const agent = new Agent({
  name: "Agent",
  tools: [tool1, tool2],
});

await runner.run(agent, input, {
  tools: [tool1, tool2], // Also pass to runner
  stream: true,
});
```
**Result**: Causes "Unsupported tool type: hosted_tool" error

### Workaround 3: Ensure Tools Array is Never Undefined
```typescript
const tools: Tool[] = Array.isArray(tools) ? tools : [];
const agent = new Agent({
  name: "Agent",
  tools: tools, // Always an array
});
```
**Result**: Still fails - SDK accesses tools from different context

## Root Cause Hypothesis

Based on the investigation, we believe the issue is:

1. **SDK Internal State Management**: During handoff, the SDK may be accessing tools from:
   - A runner-level context that doesn't exist if tools aren't passed to `runner.run()`
   - A serialized/deserialized agent state where tools get lost
   - An internal cache or registry that doesn't properly track agent tools

2. **Tool Serialization Issue**: The SDK may be trying to serialize tools for the API call, and during handoff processing, it loses track of which tools belong to which agent.

3. **Version-Specific Bug**: This appears to be a bug in SDK version 0.0.9, as the error occurs in internal SDK code that should handle this case.

## Impact

- **Severity**: High - Breaks multi-agent workflows with handoffs
- **Frequency**: 100% - Occurs on every handoff attempt
- **Workaround**: None found - Must fall back to direct API or single-agent mode

## Suggested Fix

The SDK should:
1. Always check if tools array exists before calling `.map()` on it
2. Properly propagate tools from agents to handoff processing context
3. Ensure tools are available in all contexts (runner, agent, handoff)

### Code Fix Suggestion
```javascript
// In agents-core.mjs, around line 36194
// Instead of:
tools.map(...)

// Should be:
(tools || []).map(...)
```

Or better yet, ensure tools are always available from the agent context during handoff processing.

## Additional Context

- **First Occurrence**: When implementing multi-agent system with handoffs
- **Reproducible**: Yes, 100% of the time when handoff is triggered
- **SDK Documentation**: No clear guidance on whether tools should be on agents, runner, or both
- **Related Issues**: May be related to "Unsupported tool type: hosted_tool" error when tools are passed to runner

## Test Cases

### Test Case 1: Simple Handoff Without Tools
- **Setup**: Two agents, no tools, handoff configured
- **Result**: Handoff may work (not tested - our use case requires tools)

### Test Case 2: Handoff With Tools on Target Agent Only
- **Setup**: Tools only on target agent
- **Result**: Fails with undefined tools error

### Test Case 3: Handoff With Tools on Both Agents
- **Setup**: Tools on both orchestrator and target agent
- **Result**: Fails with undefined tools error

### Test Case 4: Handoff With Tools Passed to Runner
- **Setup**: Tools passed to `runner.run()` options
- **Result**: Causes "Unsupported tool type" error before handoff

## Environment Details

```json
{
  "runtime": "Deno",
  "deno_version": "1.x",
  "platform": "Supabase Edge Functions",
  "sdk_packages": {
    "@openai/agents": "0.0.9",
    "@openai/agents-core": "0.0.9",
    "@openai/agents-openai": "0.0.9"
  },
  "model": "gpt-4o-mini",
  "streaming": true
}
```

## Contact Information

- **Reporter**: SlashMCP Development Team
- **Project**: SlashMCP (MCP-Powered AI Workspace)
- **Repository**: Private (but can provide access if needed)
- **Date**: January 2025

## Additional Notes

- This bug prevents us from using the multi-agent handoff feature
- We've implemented a fallback to direct OpenAI API when SDK fails
- The bug appears to be in SDK internal code, not our implementation
- We've verified tools are properly set on agents before handoff
- The error occurs consistently, making it easy to reproduce
- **Note**: We have since upgraded to SDK version 0.3.2, but are reporting this bug to help others who may be stuck on version 0.0.9

