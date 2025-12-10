# Orchestrator Debugging Plan - Reselling Analysis Tool Routing Issue

## Problem Statement
The orchestrator is not using the `analyze_reselling_opportunities` tool directly, instead routing to command discovery which then manually scrapes using playwright-wrapper. This is a persistent issue despite:
- Tool being added to tools array
- Detection logic identifying reselling requests
- Instructions being injected into conversation
- Agent instructions explicitly prioritizing reselling tool

## Systematic Debugging Approach

### Phase 1: Instrumentation & Logging

#### 1.1 Add Comprehensive Logging Points
**Location**: `supabase/functions/agent-orchestrator-v1/index.ts`

**Logging Points to Add**:
1. **Tool Array Verification** (Line ~154)
   - Log the complete tools array with tool names
   - Verify `analyze_reselling_opportunities` is present
   - Log tool descriptions to verify they're correct

2. **Detection Logic Verification** (Line ~195)
   - Log the exact query being checked
   - Log which keywords matched
   - Log the final `isResellingRequest` boolean value
   - Log the detection confidence/pattern matches

3. **Instruction Injection** (Line ~287)
   - Log the exact instructions being injected
   - Log the conversation array before and after injection
   - Verify instructions are in the correct format

4. **Agent Execution** (Line ~315)
   - Log the agent input being passed to runner
   - Log all events from the runner
   - Track which tools the agent attempts to use
   - Track which handoffs the agent chooses

5. **Tool Call Tracking** (Line ~336)
   - Log every tool call event
   - Log tool names being called
   - Log whether `analyze_reselling_opportunities` was attempted

#### 1.2 Add Tool Visibility Logging
**Location**: `supabase/functions/_shared/orchestration/tools.ts`

**Logging Points**:
- Log when `createResellingAnalysisTool` is called
- Log the tool definition (name, description, parameters)
- Verify the tool is properly formatted

### Phase 2: Verification Tests

#### 2.1 Test Detection Logic
**Test Query**: "Scrape headphones from Craigslist Des Moines and OfferUp, compare to eBay Sold and Amazon prices, and email me a detailed report with links"

**Expected Behavior**:
- `isResellingRequest` should be `true`
- Keywords matched: "scrape", "craigslist", "offerup", "ebay", "amazon", "headphones", "report", "email", "links"
- Enhanced instructions should be injected

**Verification Steps**:
1. Add console.log for each keyword check
2. Add console.log for final boolean
3. Verify pattern matching logic

#### 2.2 Test Tool Availability
**Verification Steps**:
1. Log tools array before passing to `createOrchestratorAgent`
2. Log tools array inside `createOrchestratorAgent`
3. Verify tool is in the array at both points
4. Check tool name matches exactly: `analyze_reselling_opportunities`

#### 2.3 Test Instruction Injection
**Verification Steps**:
1. Log conversation array before injection
2. Log conversation array after injection
3. Verify instructions are in correct format (assistant message)
4. Verify instructions appear before user message
5. Check if instructions are being truncated or modified

### Phase 3: Root Cause Analysis

#### 3.1 Possible Root Causes

**Hypothesis 1: Tool Not Visible to Agent**
- **Test**: Log tools array in agent definition
- **Fix**: Ensure tool is in `tools` property of Agent, not just passed to constructor

**Hypothesis 2: Handoff Priority Override**
- **Test**: Check if agent is choosing handoff before checking tools
- **Fix**: Modify handoff conditions to exclude reselling requests

**Hypothesis 3: Instruction Format Issue**
- **Test**: Verify instructions are in correct message format
- **Fix**: Ensure instructions are properly formatted as assistant message

**Hypothesis 4: Detection Logic Too Restrictive**
- **Test**: Test with various query phrasings
- **Fix**: Expand keyword matching or use more flexible pattern matching

**Hypothesis 5: Agent Ignoring Instructions**
- **Test**: Check if agent sees instructions but chooses different path
- **Fix**: Make instructions more explicit or change agent model

#### 3.2 Debugging Checklist

- [ ] Tool is in tools array when orchestrator runs
- [ ] Tool name matches exactly: `analyze_reselling_opportunities`
- [ ] Detection logic correctly identifies reselling requests
- [ ] Instructions are injected before user message
- [ ] Instructions are in correct format (assistant message)
- [ ] Agent receives tools in its definition
- [ ] Agent sees the injected instructions
- [ ] Handoff conditions don't override tool usage
- [ ] Tool description is clear and actionable

### Phase 4: Solutions

#### Solution 1: Force Tool Usage (Bypass Orchestrator)
If detection works but agent still routes incorrectly, bypass orchestrator entirely for reselling requests:

```typescript
if (isResellingRequest) {
  // Call reselling-analysis function directly
  const result = await callResellingAnalysisTool(input.message);
  return { finalResponse: result };
}
```

#### Solution 2: Modify Handoff Conditions
Update handoff logic to check for reselling requests and prevent routing:

```typescript
// In createHandoffs or handoff conditions
if (query.includes("reselling") || query.includes("scrape")) {
  // Don't handoff, use tool directly
}
```

#### Solution 3: Strengthen Agent Instructions
Make instructions even more explicit with examples and negative examples:

```typescript
instructions += `
CRITICAL: For reselling requests, you MUST use analyze_reselling_opportunities tool.
DO NOT use handoff_to_command_discovery.
DO NOT use playwright-wrapper.
Example of CORRECT behavior:
User: "Scrape headphones from Craigslist"
You: [Call analyze_reselling_opportunities tool]
Example of INCORRECT behavior:
User: "Scrape headphones from Craigslist"
You: [Call handoff_to_command_discovery] ❌ WRONG
`;
```

#### Solution 4: Pre-filter Before Orchestrator
Add a pre-filter that intercepts reselling requests before they reach the orchestrator:

```typescript
// Before executeOrchestration
if (isResellingRequest) {
  return await handleResellingRequestDirectly(input);
}
```

### Phase 5: Implementation Priority

1. **First**: Add comprehensive logging (Phase 1)
2. **Second**: Run verification tests (Phase 2)
3. **Third**: Identify root cause (Phase 3)
4. **Fourth**: Implement solution (Phase 4)

## Success Criteria

- [ ] Detection logic correctly identifies reselling requests (100% accuracy)
- [ ] Tool is available to orchestrator agent
- [ ] Agent uses `analyze_reselling_opportunities` tool directly
- [ ] No routing to command discovery for reselling requests
- [ ] No manual scraping with playwright-wrapper
- [ ] Concise summary returned (not verbose JSON)

## Next Steps

1. Implement Phase 1 logging
2. Deploy and test with actual query
3. Analyze logs to identify root cause
4. Implement appropriate solution
5. Verify fix works end-to-end

