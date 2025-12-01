# Development Guide: Building a Multi-Agent MCP Assistant Framework

This guide outlines the development process for creating a robust, multi-agent assistant framework by integrating the **OpenAI Agents SDK for JavaScript** [1] with the **Model Context Protocol (MCP)** [3]. The existing `slashmcp` project [4] serves as a foundation, providing a proven structure for handling MCP endpoints and LLM switching.

## 1. Core Architectural Integration

The proposed architecture leverages the strengths of both frameworks: the OpenAI Agents SDK for **agent orchestration** and the Model Context Protocol for **standardized tool and data access**.

| Component | Role in the Framework | Key Features from Analysis |
| :--- | :--- | :--- |
| **OpenAI Agents SDK** | The **Orchestration Layer**. Manages the agent loop, conversation history, tool execution, and agent handoffs. | `Agent` class (instructions, tools, handoffs), `Runner` class (execution loop, streaming, context management), `Handoffs` (control transfer between agents) [2]. |
| **Model Context Protocol (MCP)** | The **Standardized Interface**. Provides a uniform way for agents to connect to external systems (data, tools, workflows). | Acts as a "USB-C port for AI applications" [3]. The `slashmcp` project already implements MCP endpoint support (e.g., `/alphavantage-mcp`, `/polymarket-mcp`) [4]. |
| **`slashmcp` Project** | The **Implementation Foundation**. Provides the existing server and client structure, including LLM switching and Supabase integration. | TypeScript/Supabase stack, LLM switching (`/model openai`), dynamic MCP server registry, and a vision/OCR pipeline [4]. |

## 2. Setting up the Multi-Agent System with OpenAI Agents JS

The first step is to define the agents and the runner that will manage their interactions.

### 2.1. Define Agents and Handoffs

A multi-agent system requires specialized agents and a mechanism for them to pass control.

**Example Agent Definitions (TypeScript):**

\`\`\`typescript
import { Agent, Handoff, AgentInputItem } from '@openai/agents';

// 1. The MCP Tool Agent: Responsible for executing MCP commands.
const mcpToolAgent = new Agent({
  name: 'MCP_Tool_Agent',
  instructions: 'You are an expert in executing Model Context Protocol (MCP) commands. Your only tool is the `mcp_proxy`. When a user request requires external data or a specific tool, you must formulate the correct MCP command and use the `mcp_proxy` tool. Do not answer questions directly; only use the tool.',
  tools: [{
    name: 'mcp_proxy',
    description: 'A tool to execute a registered MCP command and retrieve the result. Input must be a string in the format: /<server-name> <command> [param=value...]',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The full MCP command string, e.g., "/alphavantage-mcp get_stock_chart symbol=NVDA"'
        }
      },
      required: ['command']
    }
  }],
});

// 2. The Final Answer Agent: Responsible for synthesizing information and providing the final response.
const finalAnswerAgent = new Agent({
  name: 'Final_Answer_Agent',
  instructions: 'You are the final response generator. Your task is to take the results from the MCP_Tool_Agent and the user\'s original query, and synthesize a concise, helpful, and professional final answer. Do not use any tools.',
});

// 3. Define the Handoff
const mcpHandoff: Handoff = {
  name: 'handoff_to_mcp_tool',
  description: 'Use this handoff when the user\'s request requires external data or tool execution (e.g., stock prices, market odds, document analysis).',
  targetAgent: mcpToolAgent,
  // Optional: Filter the input before passing it to the target agent
  inputFilter: (input: AgentInputItem[]) => input,
};

const finalHandoff: Handoff = {
  name: 'handoff_to_final_answer',
  description: 'Use this handoff after the MCP_Tool_Agent has executed its command and returned a result. This is for final synthesis.',
  targetAgent: finalAnswerAgent,
  inputFilter: (input: AgentInputItem[]) => input,
};

// The primary agent that decides whether to use a tool or handoff.
const orchestratorAgent = new Agent({
  name: 'Orchestrator_Agent',
  instructions: 'Your primary goal is to determine the best course of action. If the request is a simple chat, answer directly. If it requires external data or a tool, use the `handoff_to_mcp_tool` handoff. If you receive a tool result, use the `handoff_to_final_answer` handoff.',
  handoffs: [mcpHandoff, finalHandoff],
  // Note: The orchestrator can also have its own tools if needed.
});
\`\`\`

### 2.2. Implement the MCP Tool

The `mcp_proxy` tool is the critical link between the OpenAI Agents SDK and the `slashmcp`'s existing MCP endpoint logic. This tool will need to call the existing Supabase Edge Function (`mcp-proxy` or similar) that handles the actual MCP server communication [4].

**Conceptual `mcp_proxy` Tool Implementation:**

\`\`\`typescript
// In a separate file, e.g., mcpTool.ts

import { Tool } from '@openai/agents';

const mcpProxyTool: Tool = {
  name: 'mcp_proxy',
  description: 'Executes a registered MCP command via the slashmcp backend.',
  parameters: { /* ... as defined in the agent ... */ },
  async run({ command }: { command: string }) {
    console.log(`Executing MCP command: ${command}`);
    
    // 1. Extract the server name and command details from the input string
    const [serverCommand, ...params] = command.trim().split(/\s+/);
    const [serverName, mcpCommand] = serverCommand.slice(1).split('-'); // e.g., /alphavantage-mcp -> ['alphavantage', 'mcp']

    // 2. Call the existing slashmcp backend API (e.g., a Supabase Edge Function)
    // This URL should point to the endpoint that handles the MCP proxying.
    const proxyUrl = 'YOUR_SLASHMCP_BACKEND_URL/mcp-proxy'; 
    
    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          server: serverName, 
          command: mcpCommand, 
          params: params.reduce((acc, p) => {
            const [key, value] = p.split('=');
            acc[key] = value;
            return acc;
          }, {} as Record<string, string>)
        }),
      });

      if (!response.ok) {
        throw new Error(`MCP Proxy failed with status: ${response.status}`);
      }

      const data = await response.json();
      
      // 3. Return the result as a string for the next agent to process
      return JSON.stringify(data, null, 2);

    } catch (error) {
      return `Error executing MCP command: ${error.message}`;
    }
  }
};
\`\`\`

## 3. Integrating with the `slashmcp` Backend

The `slashmcp` project already provides the necessary infrastructure for MCP server management and LLM switching. The integration involves two main tasks:

### 3.1. Updating the MCP Proxy Endpoint

Ensure the existing MCP proxy endpoint (likely a Supabase Edge Function) is robust enough to handle the structured JSON input from the `mcp_proxy` tool.

*   **Input:** The endpoint should accept a structured request containing the `server` name, the `command`, and the `params` object.
*   **Logic:** It should look up the registered gateway URL for the given `server` (from the `mcp_servers` table) and forward the MCP request.
*   **Output:** It must return the raw JSON response from the MCP server back to the `mcp_proxy` tool.

### 3.2. Configuring LLM Switching

The `slashmcp` project supports runtime LLM switching via commands like `/model openai` [4]. This capability can be integrated into the `Runner` configuration of the OpenAI Agents SDK.

*   The `Runner` can be initialized with a custom `modelProvider` or a specific `model` in its `RunConfig` [2].
*   The `slashmcp`'s existing LLM selection logic should be adapted to provide the correct `ModelProvider` instance to the `Runner` based on the user's current session or preference.

## 4. Running the Multi-Agent Workflow

The entire workflow is executed by the `Runner` instance, starting with the `Orchestrator_Agent`.

**Example Execution Flow:**

\`\`\`typescript
import { Runner } from '@openai/agents';
// ... import agents and tools ...

async function runMcpAssistant(userInput: string) {
  // 1. Initialize the Runner (reuse this instance for efficiency)
  const runner = new Runner({
    // Use the model configured by slashmcp's LLM switching logic
    model: 'gpt-4.1-mini', // or the model selected by the user
    // Optionally configure tracing and guardrails here
  });

  // 2. Start the run with the Orchestrator Agent
  const result = await runner.run(
    orchestratorAgent,
    userInput,
    {
      // Pass the mcpProxyTool implementation to the runner
      tools: [mcpProxyTool], 
      // Set a higher maxTurns for complex multi-agent/tool interactions
      maxTurns: 15, 
      stream: true, // Enable streaming for better user experience
    }
  );

  // 3. Process the result (e.g., stream to the client)
  for await (const event of result) {
    // Handle streaming events: new tokens, tool calls, handoffs, etc.
    // This is where the frontend displays the response in real-time.
    if (event.type === 'finalOutput') {
      console.log('Final Answer:', event.output);
    }
  }
}

// Example use case:
// runMcpAssistant('What is the current market price for the us_election_2024 market on Polymarket?');
\`\`\`

## References

[1] [GitHub - openai/openai-agents-js: A lightweight, powerful framework for multi-agent workflows and voice agents](https://github.com/openai/openai-agents-js)
[2] [Running agents | OpenAI Agents SDK](https://openai.github.io/openai-agents-js/guides/running-agents/)
[3] [What is the Model Context Protocol (MCP)? - Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro)
[4] [GitHub - mcpmessenger/slashmcp](https://github.com/mcpmessenger/slashmcp)
