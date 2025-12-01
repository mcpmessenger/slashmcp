# Developer Guide: Integrating Model Context Protocol (MCP) Servers

This guide provides technical instructions for integrating the recommended suite of Model Context Protocol (MCP) servers into your research assistant application. The focus is on the installation process, configuration requirements, and the specific slash command syntax for each server.

## 1. Core Integration Steps

The Model Context Protocol standardizes the connection between your Large Language Model (LLM) and external tools. The general workflow for integration is as follows:

### 1.1 Server Installation

Servers are typically installed using a dedicated MCP client, such as the `manus-mcp-cli` or a similar tool provided by your MCP client environment.

```bash
# General command structure for installing a server
manus-mcp-cli install <server-name>
```

### 1.2 Configuration and API Keys

Most servers require an API key for the underlying service (e.g., Alpha Vantage, Canva). These keys must be securely configured in your MCP client environment, often through environment variables or a configuration file.

### 1.3 Invocation Syntax

The LLM invokes the server's functions using a standardized slash command format:

```
/<server-name> <function_name> <parameter1>=<value1> <parameter2>=<value2>
```

## 2. Final Implementation Summary and Example Commands

The following table summarizes the recommended servers and provides concrete examples of the slash commands your research assistant can use.

| Category | Recommended MCP Server | Installation Command Example | Example Invocation Command |
| :--- | :--- | :--- | :--- |
| **Stock Charts** | `alphavantage-mcp` | `manus-mcp-cli install alphavantage-mcp` | `/alphavantage-mcp get_stock_chart symbol=TSLA interval=1wk` |
| **Prediction Markets** | `polymarket-mcp` | `manus-mcp-cli install polymarket-mcp` | `/polymarket-mcp get_market_price market_id=us_election_2024` |
| **Knowledge Base** | `grokipedia-mcp` | `manus-mcp-cli install grokipedia-mcp` | `/grokipedia-mcp search query="Model Context Protocol history"` |
| **Image Generation** | `canva-mcp` | `manus-mcp-cli install canva-mcp` | `/canva-mcp create_design template=social_post text="New Research Findings"` |
| **Browser Automation** | `playwright-mcp` | `manus-mcp-cli install playwright-mcp` | `/playwright-mcp navigate_and_scrape url=example.com selector=article_body` |

## 3. Server-Specific Integration Notes

### 3.1 Financial Data (`alphavantage-mcp`)

*   **Prerequisite:** An Alpha Vantage API key is required.
*   **Configuration:** Set the API key as an environment variable accessible by the MCP server process.
*   **Functionality:** The LLM can request various financial data, including time series data for charting and fundamental company information.

### 3.2 Prediction Markets (`polymarket-mcp`)

*   **Prerequisite:** May require an API key or specific configuration depending on the server's implementation. Consult the server's documentation.
*   **Functionality:** Enables the LLM to query real-time market probabilities, which are useful for generating forecasts and sentiment analysis.

### 3.3 Knowledge Base (`grokipedia-mcp`)

*   **Note:** This is a community-maintained server. Integration may require cloning a GitHub repository and running the server locally or deploying it to a service like AWS Lambda.
*   **Functionality:** Provides access to the Grokipedia knowledge base, allowing the LLM to retrieve articles, citations, and structured information.

### 3.4 Image Generation (`canva-mcp`)

*   **Prerequisite:** Requires OAuth authentication with Canva. The server will likely provide a URL for the initial OAuth flow.
*   **Functionality:** Allows the LLM to generate professional designs by selecting templates and providing text/data inputs, which is ideal for creating visual summaries of research.

### 3.5 Browser Automation (`playwright-mcp`)

*   **Prerequisite:** The server needs a headless browser environment to run Playwright.
*   **Functionality:** The LLM can instruct the server to perform complex web interactions, such as navigating multi-step forms, capturing screenshots, and extracting data from dynamic web pages. This is a powerful tool for advanced research and data collection.

By following these guidelines, you can successfully integrate these powerful MCP servers, transforming your research assistant into a highly capable, context-aware tool.
