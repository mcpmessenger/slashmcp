# Developer Instructions: Integrating LangChain Agent MCP Server into SlashMCP

> **📚 For a comprehensive guide on agent MCP server integration and dynamic instruction passing, see [AGENT_MCP_SERVER_INTEGRATION.md](./AGENT_MCP_SERVER_INTEGRATION.md)**

This document provides the necessary steps for the `mcpmessenger/slashmcp` development team to integrate the newly created **LangChain Agent MCP Server** (`mcpmessenger/LangchainMCP`) [1] into the main MCP Messenger application.

The integration is achieved by treating the LangChain Agent MCP Server as a standard external MCP Server, which is registered and invoked via the existing MCP Gateway infrastructure.

## 1. Prerequisites

Before proceeding with the integration, the following must be completed:

1.  **LangChain Agent MCP Server Deployment:** The `mcpmessenger/LangchainMCP` server must be deployed to a stable, publicly accessible HTTPS endpoint (e.g., Google Cloud Run, AWS Fargate).
    *   **Action:** Deploy the Docker container from the `LangchainMCP` repository.
    *   **Result:** A public base URL, e.g., `https://langchain-agent.cloudrun.app`.

2.  **MCP Server Functionality Verification:** The deployed server must pass basic MCP compliance checks.
    *   **Action:** Verify the manifest endpoint: `GET https://langchain-agent.cloudrun.app/mcp/manifest`
    *   **Expected Result:** A JSON response containing the server's metadata and the `agent_executor` tool definition.

## 2. Integration Steps for SlashMCP

The integration process involves two primary steps: **Registration** and **Testing**. No changes to the `slashmcp` codebase are required, as the system is designed to dynamically integrate new MCP servers.

### 2.1. Step 1: Register the New MCP Server

The server must be registered in the Supabase database that backs the `slashmcp` application. This is typically done using the existing `/slashmcp add` command.

| Command | Description |
| :--- | :--- |
| `/slashmcp add langchain-agent <BASE_URL>` | Registers the new server with a friendly name and its public URL. |

**Example using the deployed service URL:**

```
/slashmcp add langchain-agent https://langchain-agent-mcp-server-554655392699.us-central1.run.app
```

**✅ Deployment Status:**
- **Service URL:** `https://langchain-agent-mcp-server-554655392699.us-central1.run.app`
- **Version:** 1.1.0 (with system_instruction support)
- **Status:** Deployed and verified
- **Quick Start Guide:** [LANGCHAIN_MCP_DEPLOYMENT_COMPLETE.md](./LANGCHAIN_MCP_DEPLOYMENT_COMPLETE.md)

**Note for Supabase Edge Function Developers:**
The `/slashmcp` command handler (likely in a Supabase Edge Function or a core utility file like `src/lib/mcp-utils.ts`) is responsible for parsing this command and inserting a new record into the `mcp_servers` table in Supabase.

| `mcp_servers` Table Field | Value |
| :--- | :--- |
| `server_name` | `langchain-agent` |
| `base_url` | `https://langchain-agent.cloudrun.app` |
| `user_id` | *Current User's ID* |

### 2.2. Step 2: Verify Dynamic Tool Discovery

Once registered, the `slashmcp` client should automatically discover the tools exposed by the new server.

1.  **Action:** In the MCP Messenger chat, type `/` to bring up the slash command menu.
2.  **Expected Result:** A new command or tool prefix, such as `/langchain-agent`, should appear, or the LLM should be aware of the new tool.

### 2.3. Step 3: Test Agent Invocation

The final test is to ensure the MCP Gateway can successfully route a request to the new server and receive a valid response.

1.  **Action:** Invoke the `agent_executor` tool with a complex query. The syntax will depend on how the `slashmcp` client exposes registered tools, but a direct invocation test is recommended.

    **Example Invocation (Conceptual):**
    ```
    /langchain-agent agent_executor query="Find the current stock price of Tesla and explain the last 3 days of trading volume."
    ```

    **Example with System Instruction (After LangChain Server Update):**
    ```
    /langchain-agent agent_executor query="Analyze Tesla stock" system_instruction="You are a financial analyst. Provide detailed analysis with specific numbers."
    ```
    
    > **Note:** The `system_instruction` parameter requires modifications to the LangChain MCP Server. See [AGENT_MCP_SERVER_INTEGRATION.md](./AGENT_MCP_SERVER_INTEGRATION.md) for implementation details.

2.  **Expected Result:** The LangChain Agent MCP Server should receive the request, execute its internal LangChain/LangGraph logic (which may involve calling its own internal tools like a stock price API), and return the final, reasoned answer to the MCP Messenger chat interface.

## 3. Post-Integration Code Review (Optional but Recommended)

While the system is designed for dynamic integration, a brief review of the core invocation logic in `slashmcp` is recommended to ensure the new agent's output is handled correctly.

| File (Likely Location) | Area to Review | Rationale |
| :--- | :--- | :--- |
| `src/lib/mcp-utils.ts` | **MCP Invocation Logic** | Ensure the proxy/gateway correctly handles the payload structure required by the `LangchainMCP` server's `/mcp/invoke` endpoint. |
| `src/components/Chat/MessageRenderer.tsx` | **Message Rendering** | Confirm that the final output from the `agent_executor` tool (which will be a string) is rendered cleanly in the chat UI. |
| `supabase/functions/mcp-proxy/index.ts` | **Edge Function Proxy** | If the invocation is proxied through a Supabase Edge Function, ensure it correctly forwards the request and handles the response headers and body. |

The primary focus for the `slashmcp` team is the successful deployment and registration of the **LangChain Agent MCP Server**. Once registered, the existing MCP infrastructure should handle the rest.

***

## References

[1] mcpmessenger/LangchainMCP. *GitHub*. https://github.com/mcpmessenger/LangchainMCP
[2] mcpmessenger/slashmcp. *GitHub*. https://github.com/mcpmessenger/slashmcp
[3] Model Context Protocol. *modelcontextprotocol.io*. https://modelcontextprotocol.io/
