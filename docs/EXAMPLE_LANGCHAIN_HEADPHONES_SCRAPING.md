# Example: Using LangChain for Headphones Scraping

## Task
Scrape headphones from Craigslist Des Moines Iowa and OfferUp, compare to eBay Sold and Amazon prices.

## Current Approach (Manual Playwright Commands)

You're currently using manual commands:
```
/playwright-wrapper browser_navigate url=https://desmoines.craigslist.org/search/ela?query=headphones
/playwright-wrapper browser_extract_text url=https://desmoines.craigslist.org/search/ela?query=headphones
```

This requires you to:
1. Manually break down the task
2. Execute each step separately
3. Manually compare results

## LangChain Approach (Agentic)

### Step 1: Register LangChain Server (if not already registered)
```
/slashmcp add langchain-agent https://langchain-agent-mcp-server-554655392699.us-central1.run.app
```

### Step 2: Invoke LangChain Agent with Full Task

```
/langchain-agent agent_executor query="Scrape headphones from Craigslist Des Moines Iowa (https://desmoines.craigslist.org/search/ela?query=headphones) and OfferUp, then compare prices to eBay Sold listings and Amazon. Break this into steps: 1) Navigate to Craigslist Des Moines and extract all headphone listings with prices and locations, 2) Navigate to OfferUp and extract headphone listings with prices, 3) Search eBay sold listings for similar headphones and get average sold prices, 4) Search Amazon for similar headphones and get current prices, 5) Create a comparison table showing: Product Name, Craigslist Price, OfferUp Price, eBay Average Sold Price, Amazon Price, and Best Deal. Use the playwright-wrapper MCP server for web scraping." system_instruction="You are an expert web scraper and price comparison analyst. You have access to MCP tools including playwright-wrapper for browser automation. When scraping, extract: product name, price, location (for local listings), and condition. Format your final results as a clear comparison table. Be systematic and thorough. If a step fails, try alternative approaches and report what you found."
```

## What LangChain Will Do

The LangChain agent will:
1. **Plan the task**: Break it into logical steps
2. **Execute sequentially**:
   - Use playwright-wrapper to navigate to Craigslist
   - Extract headphone listings (name, price, location)
   - Navigate to OfferUp
   - Extract headphone listings
   - Search eBay (may need to use search-mcp or manual navigation)
   - Search Amazon (may need to use search-mcp or manual navigation)
3. **Compare and synthesize**: Create a comparison table
4. **Report results**: Present findings in a structured format

## Advantages of LangChain Approach

✅ **Automatic task breakdown**: No need to manually plan steps
✅ **Tool chaining**: Automatically uses multiple tools in sequence
✅ **Error handling**: Can retry failed steps with alternative approaches
✅ **Reasoning**: Understands context and can adapt
✅ **Synthesis**: Combines results from multiple sources

## Comparison: Manual vs LangChain

| Aspect | Manual Playwright | LangChain Agentic |
|--------|------------------|-------------------|
| **Planning** | You plan each step | Agent plans automatically |
| **Execution** | You run each command | Agent executes sequentially |
| **Error handling** | You handle errors | Agent retries/adapts |
| **Synthesis** | You compare manually | Agent creates comparison |
| **Time** | 10-15 minutes | 2-5 minutes |
| **Flexibility** | Full control | Automated but adaptable |

## Testing the LangChain Approach

### Quick Test (Simple Version)
```
/langchain-agent agent_executor query="Navigate to https://desmoines.craigslist.org/search/ela?query=headphones and extract the first 5 headphone listings with their prices. Use playwright-wrapper." system_instruction="You are a web scraper. Extract product names and prices clearly."
```

### Full Test (Complete Task)
Use the full command from Step 2 above.

## Expected Output Format

The LangChain agent should return something like:

```
## Headphone Price Comparison

### Craigslist Des Moines
1. Jabra Elite 85h - $150 (Des Moines)
2. Schiit stack Asgard 3 - $300 (West Des Moines)
3. Schiit headphone amplifier stack - $350 (Urbandale)
4. 3 ear phones headphones buds - $10 (Des Moines)
5. HEADSET/EARBUDS / HEADPHONES - $0 (Des Moines)

### OfferUp
[Results from OfferUp scraping]

### eBay Sold Listings (Average)
- Jabra Elite 85h: $120-140
- Schiit Asgard 3: $250-280
...

### Amazon Current Prices
- Jabra Elite 85h: $179.99
- Schiit Asgard 3: $349.99
...

### Comparison Table
| Product | Craigslist | OfferUp | eBay Avg | Amazon | Best Deal |
|---------|-----------|---------|----------|--------|-----------|
| Jabra Elite 85h | $150 | - | $130 | $179.99 | eBay |
| Schiit Asgard 3 | $300 | - | $265 | $349.99 | eBay |
...
```

## Troubleshooting

### If LangChain can't access playwright-wrapper:
1. Ensure playwright-wrapper is registered: `/slashmcp list`
2. Check that LangChain server has access to MCP tools
3. Try explicit tool invocation in the query

### If results are incomplete:
- Add more specific instructions in system_instruction
- Break task into smaller chunks
- Check if websites block automated access

### If LangChain times out:
- The task might be too complex
- Try breaking into smaller queries
- Check LangChain server logs

## Next Steps

1. **Test the simple version first** to verify LangChain can access playwright-wrapper
2. **Run the full task** and compare results to manual approach
3. **Refine system_instruction** based on results
4. **Consider auto-routing** for future complex tasks



