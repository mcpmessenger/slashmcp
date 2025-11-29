# Technical Plan: Decoupling Agent Orchestration into a Dedicated API Service

This document outlines the plan to refactor the complex agent orchestration logic from the main `chat` Supabase Edge Function into a new, dedicated, and versioned API service. This change will significantly improve the maintainability, testability, and scalability of the agent system in `slashmcp`.

## 1. Current State Analysis (Coupling Points)

The current agent orchestration logic is tightly coupled within the `supabase/functions/chat/index.ts` file and its immediate dependencies.

| Component | Location | Role | Coupling Issue |
| :--- | :--- | :--- | :--- |
| **Chat Handler** | `supabase/functions/chat/index.ts` | Handles HTTP request, authentication, and invokes orchestration. | High-level chat logic is mixed with low-level orchestration and state management. |
| **Workflow Executor** | `../_shared/workflow-executor.ts` | Defines and executes multi-step agentic workflows. | Core orchestration logic is directly imported and executed within the chat function. |
| **Reasoning Trace** | `../_shared/reasoning-trace.ts` | Manages and persists the agent's decision-making trace. | State management for complex agent runs is handled synchronously within the chat request lifecycle. |
| **MCP Command Parsing** | `mcp-command-parser.ts` | Detects and parses slash commands and natural language tool calls. | Logic for determining *if* orchestration is needed is mixed with the orchestration execution. |

## 2. Proposed Architecture: Agent Orchestration API (v1)

The new architecture introduces a dedicated Supabase Edge Function, tentatively named `agent-orchestrator-v1`, which will be responsible solely for executing agentic workflows.

### 2.1. New Service: `agent-orchestrator-v1`

*   **Location:** `supabase/functions/agent-orchestrator-v1/index.ts`
*   **Purpose:** A stateless, dedicated API endpoint for executing a single agentic workflow based on a provided input (user message, context, session ID).
*   **Input:** A standardized JSON payload containing:
    *   `sessionId`: The current chat session ID.
    *   `userId`: The authenticated user ID.
    *   `message`: The user's input message.
    *   `context`: Any necessary context (e.g., conversation history, tool registry).
*   **Output:** A standardized JSON payload containing:
    *   `finalResponse`: The final text response from the agent.
    *   `reasoningTraceId`: ID for the persisted reasoning trace.
    *   `toolCalls`: A list of any final tool calls made.

### 2.2. Decoupling and Shared Logic

The core logic will be moved to a new shared library, ensuring the orchestrator remains lean and reusable.

*   **Move:** `executeWorkflowDefinition`, `WORKFLOW_DEFINITIONS`, `createReasoningTrace`, and related utilities will be moved from `supabase/functions/chat` and `../_shared` into a new, dedicated shared module: `supabase/functions/_shared/orchestration/`.
*   **Refactor:** The `agent-orchestrator-v1` function will import and use this new shared orchestration module.

## 3. Implementation Plan (3 Phases)

### Phase 3.1: Create the Dedicated Orchestrator Service

1.  **New Function:** Create the `supabase/functions/agent-orchestrator-v1` directory and its `index.ts` entry point.
2.  **Refactor Shared Logic:** Move all core agent execution logic (`workflow-executor.ts`, `reasoning-trace.ts`, etc.) into `supabase/functions/_shared/orchestration/`. Update all import paths.
3.  **Implement Orchestrator:** Implement the `agent-orchestrator-v1` function to:
    *   Receive the standardized JSON input.
    *   Invoke the orchestration logic from the new shared module.
    *   Return the standardized JSON output.

### Phase 3.2: Update the `chat` Function (Decoupling)

1.  **Remove Logic:** Remove the direct imports and execution of the orchestration logic from `supabase/functions/chat/index.ts`.
2.  **API Call:** Replace the internal orchestration call with an external HTTP request to the new `agent-orchestrator-v1` endpoint.
    *   *Note:* Since this is an internal call within the Supabase environment, a secure, non-public URL should be used, potentially leveraging internal network routing or a service role key if necessary, to ensure security and performance.
3.  **Handle Response:** Update the `chat` function to process the standardized JSON response from the orchestrator and stream the `finalResponse` back to the frontend.

### Phase 3.3: Testing and Versioning

1.  **Unit/Integration Tests:** Write dedicated tests for the `agent-orchestrator-v1` function to ensure its core logic is sound, independent of the chat function.
2.  **End-to-End (E2E) Tests:** Update existing E2E tests to verify that the full chat flow, now routed through the new API, functions correctly.
3.  **Versioning Strategy:** The `v1` suffix in the function name establishes a clear versioning strategy. Future major changes to the orchestration logic (e.g., a new multi-agent framework) can be deployed as `agent-orchestrator-v2` without breaking the existing chat client, allowing for seamless A/B testing and phased rollout.

## 4. Benefits of Decoupling

| Benefit | Description | Impact on SlashMCP |
| :--- | :--- | :--- |
| **Improved Testability** | The orchestration logic can be unit-tested in isolation, without mocking the entire chat environment. | Faster development cycles and higher code quality. |
| **Scalability** | The orchestration function can be scaled independently of the chat function, allowing resources to be allocated precisely where the heavy computation occurs. | Better performance under high load and reduced operational costs. |
| **A/B Testing** | New orchestration strategies (`v2`, `v3`) can be deployed alongside the current version, allowing a subset of users to test new features. | Enables rapid iteration and data-driven decisions on agent performance. |
| **Code Clarity** | The `chat` function becomes a simple router/streamer, and the orchestrator becomes a dedicated business logic service. | Easier onboarding for new developers and reduced cognitive load for maintenance. |

This refactoring aligns with best practices for microservice architecture and will future-proof the agentic capabilities of `slashmcp`.
