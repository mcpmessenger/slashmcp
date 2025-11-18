# OpenAI Agents SDK - Capabilities and Setup Guide

## What is the OpenAI Agents SDK?

The OpenAI Agents SDK is a framework for building multi-agent AI systems with coordinated workflows, tool integration, and intelligent handoffs between specialized agents.

## Capabilities of the Agents SDK

### 1. **Multi-Agent Orchestration**
- **Orchestrator Agent**: Routes requests to appropriate specialized agents
- **Specialized Agents**: Each agent has a specific role (tool execution, final answer synthesis)
- **Handoffs**: Seamless transfer of control between agents based on task requirements

### 2. **Tool Integration**
- **MCP Proxy Tool**: Executes Model Context Protocol commands
- **Dynamic Tool Discovery**: Agents can discover and use registered MCP servers
- **Tool Chaining**: Agents can use multiple tools in sequence

### 3. **MCP Server Support**
The Agents SDK can automatically call MCP servers through the `mcp_proxy` tool:
- **Financial Data**: `alphavantage-mcp` for stock quotes and charts
- **Prediction Markets**: `polymarket-mcp` for market odds
- **Browser Automation**: `playwright-wrapper` for web scraping and testing
- **Search**: `search-mcp` for web search results
- **Custom Servers**: Any registered MCP server via dynamic registry

### 4. **Intelligent Routing**
The Orchestrator Agent decides:
- Simple questions → Answer directly
- Questions needing external data → Handoff to MCP Tool Agent
- Tool results needing synthesis → Handoff to Final Answer Agent

### 5. **Conversation Management**
- Maintains conversation context across turns
- Handles multi-turn interactions with tool calls
- Streams responses in real-time

## Current Implementation

Your SlashMCP app uses a three-agent system:

### Agent 1: Orchestrator Agent
**Role**: Routes requests intelligently
- Determines if request needs tools or can be answered directly
- Handles simple chat questions
- Triggers handoffs to specialized agents

### Agent 2: MCP Tool Agent
**Role**: Executes MCP commands
- Receives handoff when external data/tools are needed
- Calls `mcp_proxy` tool to execute MCP commands
- Returns raw tool results

### Agent 3: Final Answer Agent
**Role**: Synthesizes final responses
- Receives tool results from MCP Tool Agent
- Synthesizes a concise, helpful answer
- No tools - pure synthesis

## How It Works

```
User: "What's the price of NVDA stock?"

1. Orchestrator Agent receives request
2. Determines it needs external data → handoff_to_mcp_tool
3. MCP Tool Agent calls: mcp_proxy("/alphavantage-mcp get_quote symbol=NVDA")
4. Receives stock data
5. handoff_to_final_answer
6. Final Answer Agent synthesizes: "NVDA is currently trading at $XXX..."
7. Returns to user
```

## Current Issues and Fixes

### Issue: No Output from Runner
**Problem**: The Runner is producing no `finalOutput` events.

**Possible Causes**:
1. Runner not receiving conversation history properly
2. Event types not being collected correctly
3. Agents not completing their workflow

**Current Fix**: Fallback to direct OpenAI API when Runner produces no output

### Next Steps to Debug

1. **Check Supabase Logs**: Look for "Event received:" messages to see what events are being emitted
2. **Verify Event Types**: The SDK might emit different event types than expected
3. **Test Conversation History**: Try passing full conversation instead of just last message
4. **Verify Agent Completion**: Ensure agents are completing their handoffs properly

## How to Enable Full Agents SDK Features

Once working, users can:

1. **Ask stock questions**: "What's AAPL trading at?" → Auto-calls Alpha Vantage
2. **Query prediction markets**: "What are the odds on us_election_2024?" → Auto-calls Polymarket
3. **Browser automation**: "Visit slashmcp.vercel.app and tell me what you see" → Auto-uses Playwright
4. **Multi-step workflows**: "Get NVDA stock price, then check if it's above $100" → Chains tool calls
5. **Natural language MCP**: Just describe what you want, agents figure out which MCP server to use

## Troubleshooting

If Agents SDK isn't working:

1. **Check API Key**: Ensure `OPENAI_API_KEY` is set in Supabase secrets
2. **Check Logs**: Review function logs for error messages
3. **Test Direct API**: The fallback should still work for basic chat
4. **Event Debugging**: Add more logging to see what events are emitted
5. **Version Check**: Verify `@openai/agents` version (currently 0.3.2, upgraded from 0.0.9 to fix handoff bugs)

## Future Enhancements

- Add more specialized agents (research agent, code agent, etc.)
- Implement agent memory/persistence
- Add guardrails and safety checks
- Enable agent-to-agent communication without handoffs
- Support parallel agent execution

