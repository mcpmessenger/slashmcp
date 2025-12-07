# LangChain Agentic Routing Guide

## Current Architecture

### 1. **OpenAI Agents SDK** (Current Primary Orchestration)
- **Location**: `supabase/functions/chat/index.ts` and `supabase/functions/agent-orchestrator-v1/index.ts`
- **Technology**: `@openai/agents@0.3.2`
- **How it works**: Multi-agent system with:
  - Orchestrator Agent (routes requests)
  - MCP Tool Agent (executes MCP commands)
  - Command Discovery Agent (helps users discover commands)
- **Status**: Currently disabled in chat function (line 618) due to `hosted_tool` limitation

### 2. **LangChain MCP Server** (Separate Service)
- **URL**: `https://langchain-agent-mcp-server-554655392699.us-central1.run.app`
- **Technology**: LangChain agents with tool access
- **How to use**: Direct invocation via `/langchain-agent agent_executor query="..."`
- **Status**: ✅ Deployed and available

### 3. **Playwright** (Tool/MCP Server)
- **Location**: `supabase/functions/playwright-wrapper/index.ts`
- **Technology**: Browser automation tool
- **Status**: Tool only, not orchestration layer

## Routing Strategy

### When to Use LangChain vs OpenAI Agents SDK

**Use LangChain when:**
- Complex multi-step tasks (scraping, data collection, research)
- Tasks requiring sequential tool usage
- You want LangChain's agentic reasoning capabilities
- Tasks that benefit from LangChain's tool chaining

**Use OpenAI Agents SDK when:**
- Simple single-step queries
- Direct MCP command execution
- Memory-enabled conversations
- Command discovery and help

## Example: Headphones Scraping Task

### Current Approach (Manual Playwright Commands)
```
/playwright-wrapper browser_navigate url=https://desmoines.craigslist.org/search/ela?query=headphones
/playwright-wrapper browser_extract_text url=https://desmoines.craigslist.org/search/ela?query=headphones
```

### LangChain Approach (Agentic)
```
/langchain-agent agent_executor query="Scrape headphones from Craigslist Des Moines Iowa and OfferUp, compare to eBay Sold and Amazon prices. Break this down into steps: 1) Search Craigslist Des Moines for headphones, 2) Search OfferUp for headphones, 3) Compare prices to eBay sold listings, 4) Compare to Amazon prices. Use the playwright-wrapper MCP server for web scraping." system_instruction="You are a web scraping expert. You can use MCP tools to navigate websites, extract data, and compare prices. Break down complex tasks into steps and execute them systematically. When scraping, extract product names, prices, and locations. Format your results in a clear comparison table."
```

## Implementation: Auto-Route to LangChain

### Option 1: Direct LangChain Invocation (Recommended for Complex Tasks)

For your headphones scraping task, use:

```bash
/langchain-agent agent_executor query="Scrape headphones from Craigslist Des Moines Iowa (https://desmoines.craigslist.org/search/ela?query=headphones) and OfferUp, then compare prices to eBay Sold listings and Amazon. Use playwright-wrapper for web scraping. Format results as a comparison table." system_instruction="You are a data scraping and price comparison expert. Use MCP tools like playwright-wrapper to navigate websites, extract product information (name, price, location), and compare across platforms. Be thorough and systematic."
```

### Option 2: Enhanced Chat Function with LangChain Routing

We can modify the chat function to automatically route complex queries to LangChain:

**Detection Criteria:**
- Keywords: "scrape", "compare", "research", "collect data", "multi-step"
- Query length > 100 characters
- Contains multiple action verbs
- Mentions multiple websites/platforms

**Implementation Location**: `supabase/functions/chat/index.ts`

## LangChain MCP Server Capabilities

The LangChain MCP server can:
- ✅ Access MCP tools (playwright-wrapper, alphavantage-mcp, etc.)
- ✅ Chain multiple tool calls
- ✅ Reason about complex tasks
- ✅ Accept dynamic system instructions
- ✅ Handle multi-step workflows

## Testing LangChain Routing

### Test 1: Simple Query (Should use OpenAI Agents SDK)
```
What is the weather today?
```

### Test 2: Complex Scraping (Should use LangChain)
```
Scrape headphones from Craigslist Des Moines and OfferUp, compare to eBay and Amazon prices
```

### Test 3: Research Task (Should use LangChain)
```
Research the top 5 AI companies, get their stock prices, and create a comparison table
```

## Next Steps

1. **Test LangChain for your scraping task**:
   ```
   /langchain-agent agent_executor query="[your full task description]" system_instruction="[expert instructions]"
   ```

2. **Implement auto-routing** (optional):
   - Add detection logic in chat function
   - Route complex queries to LangChain
   - Route simple queries to OpenAI Agents SDK

3. **Compare results**:
   - Test same task with both approaches
   - Measure accuracy, speed, and tool usage
   - Choose best approach per task type




