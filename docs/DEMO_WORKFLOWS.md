# Demo Workflows for Product Showcase

This document outlines 3 compelling demo workflows that showcase the power of SlashMCP's visual workflow builder. Each workflow can be built in 60-90 seconds and demonstrates clear value over traditional coding approaches.

---

## Demo Workflow 1: Competitive Intelligence Report

**Headline:** "From Research to Report in 60 Seconds"

**Full-screen embedded 45–60 second demo showing:**

1. **Start** → Input competitor name (e.g., "Tesla")
2. **Web Search Agent** → Search for latest news/articles about competitor
3. **Stock Data Agent** → Get current stock quote and chart data
4. **Prediction Market Agent** → Check market sentiment/predictions
5. **Researcher Agent** → Search Grokipedia for industry context
6. **Writer Agent** → Generate comprehensive competitive analysis report
7. **Design Agent** → Create visual summary slide (Canva)
8. **Email Agent** → Send report with approval gate

**End with:** "This would take 300+ lines of Python + API integrations + error handling. We did it in 60 seconds."

### Workflow Structure:
```
[Start] → Input: {competitor: "Tesla"}
  ↓
[Split Junction] → Parallel execution
  ├─→ [Web Search Tool] → search-mcp/web_search query="{competitor} news"
  ├─→ [Stock Tool] → alphavantage-mcp/get_quote symbol="TSLA"
  ├─→ [Grokipedia Tool] → grokipedia-mcp/search query="{competitor} industry"
  └─→ [Polymarket Tool] → polymarket-mcp/get_market_price market_id="tesla_stock_prediction"
  ↓
[Merge Junction] → Combine all results
  ↓
[Researcher Agent] → Analyze and synthesize data
  ↓
[Writer Agent] → gemini-mcp/generate_text prompt="Create competitive analysis: {merged_data}"
  ↓
[Design Agent] → canva-mcp/create_design template="presentation" text="{report_summary}"
  ↓
[Email Agent] → Send with approval gate
  ↓
[End] → Output: Report + Design + Email sent
```

**Key Value Props:**
- Parallel data gathering (4 sources simultaneously)
- Multi-source synthesis
- Automated report generation
- Visual output creation
- Approval workflow

---

## Demo Workflow 2: Market Research & Content Pipeline

**Headline:** "Research → Content → Visuals → Distribution"

**Full-screen embedded 45–60 second demo showing:**

1. **Start** → Input topic (e.g., "AI Agent Frameworks")
2. **Research Agent** → Web search + Grokipedia search (parallel)
3. **Content Writer Agent** → Generate long-form article
4. **Social Media Agent** → Create 3 platform-specific posts (Twitter, LinkedIn, Instagram)
5. **Design Agent** → Create visuals for each post (3 parallel Canva calls)
6. **Merge Agent** → Combine all outputs
7. **Email Agent** → Send content package with approval gate

**End with:** "This would take 400+ lines of code + content APIs + design tools. We did it in 75 seconds."

### Workflow Structure:
```
[Start] → Input: {topic: "AI Agent Frameworks"}
  ↓
[Split Junction] → Parallel research
  ├─→ [Web Search Tool] → search-mcp/web_search query="{topic}"
  └─→ [Grokipedia Tool] → grokipedia-mcp/search query="{topic}"
  ↓
[Merge Junction] → Combine research
  ↓
[Article Writer Agent] → gemini-mcp/generate_text prompt="Write 1000-word article: {research}"
  ↓
[Split Junction] → Create 3 social posts
  ├─→ [Twitter Agent] → gemini-mcp/generate_text prompt="Twitter post: {article}"
  ├─→ [LinkedIn Agent] → gemini-mcp/generate_text prompt="LinkedIn post: {article}"
  └─→ [Instagram Agent] → gemini-mcp/generate_text prompt="Instagram caption: {article}"
  ↓
[Split Junction] → Create 3 designs
  ├─→ [Twitter Design] → canva-mcp/create_design template="social_post" text="{twitter_post}"
  ├─→ [LinkedIn Design] → canva-mcp/create_design template="social_post" text="{linkedin_post}"
  └─→ [Instagram Design] → canva-mcp/create_design template="social_post" text="{instagram_post}"
  ↓
[Merge Junction] → Combine all content
  ↓
[Email Agent] → Send content package with approval
  ↓
[End] → Output: Article + 3 posts + 3 designs + Email sent
```

**Key Value Props:**
- Multi-platform content generation
- Parallel design creation
- Content repurposing automation
- Complete marketing pipeline

---

## Demo Workflow 3: Due Diligence Automation

**Headline:** "Company Analysis in 90 Seconds"

**Full-screen embedded 45–60 second demo showing:**

1. **Start** → Input company name (e.g., "NVIDIA")
2. **Stock Analysis Agent** → Get quote + historical chart data
3. **Web Research Agent** → Search for recent news and analysis
4. **Prediction Market Agent** → Check market predictions/odds
5. **Geospatial Agent** → Analyze company locations (Google Places)
6. **Analyst Agent** → Synthesize all data into due diligence report
7. **Writer Agent** → Format as executive summary
8. **Email Agent** → Send to stakeholders with approval gate

**End with:** "This would take 500+ lines of code + multiple API integrations + data processing. We did it in 90 seconds."

### Workflow Structure:
```
[Start] → Input: {company: "NVIDIA", symbol: "NVDA"}
  ↓
[Split Junction] → Parallel data gathering
  ├─→ [Stock Quote Tool] → alphavantage-mcp/get_quote symbol="NVDA"
  ├─→ [Stock Chart Tool] → alphavantage-mcp/get_stock_chart symbol="NVDA" range="1Y"
  ├─→ [Web Search Tool] → search-mcp/web_search query="NVIDIA analysis 2024"
  ├─→ [Prediction Tool] → polymarket-mcp/get_market_price market_id="nvda_stock_prediction"
  └─→ [Places Tool] → google-places-mcp/search_places query="NVIDIA headquarters"
  ↓
[Merge Junction] → Combine all data
  ↓
[Analyst Agent] → Analyze financials, trends, predictions
  ↓
[Writer Agent] → gemini-mcp/generate_text prompt="Create due diligence report: {analysis}"
  ↓
[Email Agent] → Send report with approval gate
  ↓
[End] → Output: Due diligence report + Email sent
```

**Key Value Props:**
- Multi-source financial analysis
- Automated report generation
- Geospatial data integration
- Executive-ready output

---

## Implementation Notes

### Common Patterns Across All Workflows:

1. **Parallel Data Gathering**
   - Use Split Junction to gather data from multiple sources simultaneously
   - Dramatically reduces total execution time

2. **Data Synthesis**
   - Merge Junction combines parallel outputs
   - Agent nodes analyze and synthesize

3. **Content Generation**
   - Writer agents use Gemini to create formatted output
   - Can generate different formats (reports, posts, summaries)

4. **Visual Output**
   - Canva integration creates professional designs
   - Can run multiple designs in parallel

5. **Approval Gates**
   - Email agent includes approval workflow
   - Shows enterprise-ready features

### Technical Requirements:

- **Node Types Used:**
  - Start/End nodes
  - Tool nodes (MCP commands)
  - Agent nodes (LLM processing)
  - Junction nodes (Split/Merge)

- **MCP Servers Used:**
  - search-mcp (web search)
  - grokipedia-mcp (knowledge base)
  - alphavantage-mcp (financial data)
  - polymarket-mcp (prediction markets)
  - gemini-mcp (text generation)
  - canva-mcp (design creation)
  - google-places-mcp (location data)

### Demo Script Suggestions:

**For each workflow:**
1. Show empty canvas
2. Drag nodes quickly (show speed)
3. Connect nodes (show visual simplicity)
4. Configure nodes (show ease of setup)
5. Run workflow (show execution)
6. Show results (show value)
7. End with comparison to code complexity

### Visual Design Tips:

- Use consistent color coding for node types
- Show execution progress in real-time
- Highlight parallel execution paths
- Display final outputs prominently
- Include "time saved" metric

---

## Next Steps

1. **Create Template Workflows** - Save these as templates in the workflow builder
2. **Record Demo Videos** - Create 45-60 second Loom recordings for each
3. **Build Landing Page** - Feature these workflows prominently
4. **Add Metrics** - Track which workflows get the most engagement
5. **Iterate** - Update workflows based on user feedback

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-18  
**Status:** Ready for Implementation

