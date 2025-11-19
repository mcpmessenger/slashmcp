# Workflow Templates Guide

This document explains the pre-built workflow templates available in SlashMCP and how to use them.

## Available Templates

### 1. Competitive Intelligence Report
**Category:** Analysis  
**Complexity:** Medium  
**Estimated Build Time:** 60 seconds

**Description:**  
Research a competitor by gathering data from multiple sources (web search, stock data, prediction markets, knowledge base), synthesize insights, generate a report, create a visual summary, and send via email with approval gate.

**Workflow Steps:**
1. Input competitor name and stock symbol
2. Parallel data gathering:
   - Web search for latest news
   - Stock quote data
   - Grokipedia knowledge base search
   - Prediction market data
3. Merge and synthesize all data
4. Generate comprehensive report
5. Create visual design
6. Send via email with approval gate

**Use Cases:**
- Competitive analysis
- Market research
- Investment research
- Strategic planning

---

### 2. Market Research & Content Pipeline
**Category:** Content  
**Complexity:** High  
**Estimated Build Time:** 75 seconds

**Description:**  
Research a topic, generate a long-form article, create platform-specific social media posts (Twitter, LinkedIn, Instagram), design visuals for each post, and send the complete content package via email with approval.

**Workflow Steps:**
1. Input topic
2. Parallel research:
   - Web search
   - Grokipedia search
3. Generate long-form article
4. Create 3 platform-specific posts (parallel):
   - Twitter post
   - LinkedIn post
   - Instagram caption
5. Create 3 designs (parallel):
   - Twitter design
   - LinkedIn design
   - Instagram design
6. Merge all content
7. Send content package via email with approval

**Use Cases:**
- Content marketing automation
- Social media content creation
- Multi-platform publishing
- Content repurposing

---

### 3. Due Diligence Automation
**Category:** Analysis  
**Complexity:** High  
**Estimated Build Time:** 90 seconds

**Description:**  
Analyze a company by gathering financial data (stock quotes, charts), web research, prediction market data, and location information. Synthesize all data into a comprehensive due diligence report and send to stakeholders with approval gate.

**Workflow Steps:**
1. Input company name and stock symbol
2. Parallel data gathering:
   - Stock quote
   - Stock chart (1Y history)
   - Web search for analysis
   - Prediction market data
   - Company locations (Google Places)
3. Merge all data
4. Analyze financials, trends, predictions
5. Generate due diligence report
6. Send to stakeholders with approval gate

**Use Cases:**
- Investment due diligence
- M&A analysis
- Company research
- Financial analysis

---

## How to Use Templates

### Accessing Templates

1. **Navigate to Workflow Builder**
   - Click "Workflows" in the navigation
   - Click "New Workflow" or edit an existing workflow

2. **Open Template Library**
   - Click the "Templates" button in the workflow builder header
   - Browse available templates by category

3. **Load a Template**
   - Click on a template to load it into your canvas
   - The template will be copied (not overwritten)
   - You can modify it as needed

4. **Customize the Template**
   - Edit node configurations
   - Add or remove nodes
   - Modify connections
   - Update parameters

5. **Save Your Workflow**
   - Click "Save" to save your customized workflow
   - Give it a unique name
   - Optionally save it as a new template

### Template Structure

Templates use the following node types:

- **Start Node:** Entry point for workflow input
- **Tool Nodes:** Execute MCP commands (web search, stock data, etc.)
- **Agent Nodes:** LLM-powered processing (analysis, writing, etc.)
- **Junction Nodes:** Split (parallel execution) or Merge (combine results)
- **End Node:** Exit point for workflow output

### Customizing Templates

#### Changing Input Parameters

Templates use placeholder variables like `{{competitor}}`, `{{topic}}`, `{{symbol}}`. To customize:

1. Click on a tool node
2. Edit the configuration panel
3. Replace placeholders with actual values or use dynamic references

#### Adding Nodes

1. Drag a new node from the sidebar
2. Connect it to existing nodes
3. Configure the node settings
4. Save the workflow

#### Modifying Connections

1. Click and drag from one node's output handle
2. Connect to another node's input handle
3. Edges define data flow between nodes

---

## Template Requirements

### Required MCP Servers

Templates require the following MCP servers to be configured:

- **search-mcp** - Web search functionality
- **grokipedia-mcp** - Knowledge base search
- **alphavantage-mcp** - Stock data (requires API key)
- **polymarket-mcp** - Prediction market data
- **gemini-mcp** - Text generation (requires API key)
- **canva-mcp** - Design creation (requires API keys)
- **google-places-mcp** - Location data (requires API key)

### API Keys Needed

Some templates require API keys:

- **Alpha Vantage API Key** - For stock data
- **Gemini API Key** - For text generation
- **Canva API Keys** - For design creation
- **Google Places API Key** - For location data

See the [MCP Server Setup Guide](../docs/mcp-registry-e2e.md) for configuration details.

---

## Creating Your Own Templates

### Save Workflow as Template

1. Build your workflow in the Workflow Builder
2. Click "Templates" button
3. Click "Save Current as Template"
4. Your workflow will be marked as a template
5. It will appear in the template library for all users

### Template Best Practices

1. **Clear Naming:** Use descriptive names
2. **Documentation:** Add detailed descriptions
3. **Categories:** Use appropriate template categories
4. **Placeholders:** Use `{{variable}}` syntax for dynamic values
5. **Comments:** Add metadata about complexity and use cases

---

## Troubleshooting

### Templates Not Appearing

- Ensure you've run the database migration: `npx supabase migration up`
- Check that templates exist in the database
- Verify you're logged in

### Template Execution Fails

- Check that required MCP servers are configured
- Verify API keys are set correctly
- Review node configurations for errors
- Check browser console for detailed error messages

### Can't Load Template

- Refresh the page
- Check network connectivity
- Verify database permissions
- Check browser console for errors

---

## Migration and Seeding

Templates are created via database migration:

```bash
# Apply migrations (includes template seeding)
npx supabase migration up

# Or push to remote
npx supabase db push
```

The migration `20250120000000_seed_demo_workflow_templates.sql` creates all three templates automatically.

**Note:** Templates require at least one user to exist in the database. If no users exist, the migration will skip template creation. Run the migration again after creating your first user account.

---

## Next Steps

- [Workflow Execution Guide](./PRD_Workflow_Execution_Engine.md)
- [MCP Server Setup](../docs/mcp-registry-e2e.md)
- [Workflow Examples](./workflow_examples.md)
- [Demo Workflows](./DEMO_WORKFLOWS.md)

---

**Last Updated:** 2025-01-20  
**Version:** 1.0

