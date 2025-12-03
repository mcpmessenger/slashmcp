/**
 * Agent Orchestrator v1 - Dedicated API service for agent orchestration
 * 
 * This is a stateless service that executes agentic workflows based on standardized input.
 * It decouples orchestration logic from the chat function, improving maintainability and testability.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Runner } from "https://esm.sh/@openai/agents@0.3.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../_shared/database.types.ts";
import { createMemoryService } from "../_shared/memory.ts";
import {
  createCommandDiscoveryAgent,
  createMcpToolAgent,
  createOrchestratorAgent,
  createHandoffs,
  createMemoryTools,
  createMcpProxyTool,
  createRagTools,
  helpTool,
  listCommandsTool,
  classifyQuery,
  getDocumentContext,
  formatDocumentContext,
} from "../_shared/orchestration/index.ts";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const MCP_GATEWAY_URL = PROJECT_URL ? `${PROJECT_URL.replace(/\/+$/, "")}/functions/v1/mcp` : "";

/**
 * Standardized input for the orchestrator
 */
interface OrchestratorInput {
  sessionId?: string;
  userId: string;
  message: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  context?: {
    memoryEnabled?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Standardized output from the orchestrator
 */
interface OrchestratorOutput {
  finalResponse: string;
  reasoningTraceId?: string;
  toolCalls?: Array<{
    tool: string;
    command?: string;
    result?: unknown;
  }>;
  error?: string;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",").map(origin => origin.trim()) ?? ["*"];
  const isAllowed = !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

/**
 * Execute agent orchestration based on input
 */
async function executeOrchestration(
  input: OrchestratorInput,
  authHeader?: string | null,
): Promise<OrchestratorOutput> {
  if (!OPENAI_API_KEY) {
    return {
      finalResponse: "",
      error: "OPENAI_API_KEY is not configured",
    };
  }

  if (!MCP_GATEWAY_URL) {
    return {
      finalResponse: "",
      error: "MCP gateway URL is not configured",
    };
  }

  try {
    // Create Supabase client if we have auth
    let memoryService: ReturnType<typeof createMemoryService> | null = null;
    if (authHeader && SUPABASE_URL && SUPABASE_ANON_KEY && input.userId) {
      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!userError && user && user.id === input.userId) {
        memoryService = createMemoryService(supabase, user.id);
      }
    }

    // Create runner
    const runner = new Runner({
      model: "gpt-4o-mini",
      apiKey: OPENAI_API_KEY,
    });

    // Build tools array
    const tools = [
      createMcpProxyTool(MCP_GATEWAY_URL, authHeader),
      listCommandsTool,
      helpTool,
    ];
    
    if (memoryService) {
      const memoryTools = createMemoryTools(memoryService);
      tools.push(...memoryTools);
    }
    
    // Add RAG tools if we have Supabase access
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && input.userId) {
      try {
        const ragTools = createRagTools(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, input.userId);
        tools.push(...ragTools);
        console.log(`Added ${ragTools.length} RAG tools to orchestrator`);
      } catch (error) {
        console.error("Failed to create RAG tools:", error);
        // Continue without RAG tools if there's an error
      }
    }

    // Create agents
    const mcpToolAgent = createMcpToolAgent(tools);
    const commandDiscoveryAgent = createCommandDiscoveryAgent(mcpToolAgent);
    const [commandDiscoveryHandoff, mcpHandoff, finalHandoff] = createHandoffs(
      mcpToolAgent,
      commandDiscoveryAgent,
    );
    const orchestratorAgent = createOrchestratorAgent(
      tools,
      commandDiscoveryHandoff,
      mcpHandoff,
      finalHandoff,
    );

    // Get document context for intelligent routing
    let documentContext: Awaited<ReturnType<typeof getDocumentContext>> | null = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && input.userId) {
      try {
        documentContext = await getDocumentContext(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, input.userId);
        console.log(`Document context: ${documentContext.availableDocuments.length} docs, ${documentContext.readyDocuments} ready, ${documentContext.processingDocuments} processing`);
      } catch (error) {
        console.error("Failed to get document context:", error);
        // Continue without context
      }
    }
    
    // Classify query for intelligent routing
    const classification = classifyQuery(
      input.message,
      documentContext?.availableDocuments.map(d => ({
        id: d.id,
        fileName: d.fileName,
        status: d.status,
      }))
    );
    console.log(`Query classification: intent=${classification.intent}, confidence=${classification.confidence}, tool=${classification.suggestedTool}`);
    
    // Enhance orchestrator instructions with document context
    let enhancedInstructions = "";
    if (documentContext && documentContext.availableDocuments.length > 0) {
      enhancedInstructions = `\n\n=== CURRENT USER CONTEXT ===\n${formatDocumentContext(documentContext)}\n\n`;
      
      // Always provide context if user has documents, even if classification is uncertain
      if (classification.intent === "document" || classification.intent === "hybrid" || classification.confidence >= 0.3) {
        enhancedInstructions += `=== QUERY ANALYSIS ===\n`;
        enhancedInstructions += `- User query intent: ${classification.intent} (confidence: ${classification.confidence.toFixed(2)})\n`;
        enhancedInstructions += `- Suggested tool: ${classification.suggestedTool}\n`;
        
        if (classification.context.documentName) {
          enhancedInstructions += `- User mentioned document: ${classification.context.documentName}\n`;
        }
        if (classification.context.mentionsDocument || classification.context.mentionsFile) {
          enhancedInstructions += `- Query mentions documents/files - this is a DOCUMENT QUERY\n`;
        }
        
        if (documentContext.readyDocuments > 0) {
          enhancedInstructions += `\n=== ACTION REQUIRED ===\n`;
          enhancedInstructions += `- ${documentContext.readyDocuments} document(s) are ready for search\n`;
          enhancedInstructions += `- YOU MUST use the search_documents tool immediately\n`;
          enhancedInstructions += `- DO NOT ask for clarification - use search_documents with the user's query\n`;
          enhancedInstructions += `- DO NOT use web search - use search_documents instead\n\n`;
        } else if (documentContext.processingDocuments > 0) {
          enhancedInstructions += `\n=== DOCUMENT STATUS ===\n`;
          enhancedInstructions += `- ${documentContext.processingDocuments} document(s) are still processing\n`;
          enhancedInstructions += `- Inform user that documents are processing and will be available soon\n`;
          enhancedInstructions += `- You can still try search_documents - it will return status information\n\n`;
        } else {
          enhancedInstructions += `\n=== ACTION REQUIRED ===\n`;
          enhancedInstructions += `- User has documents but they may not be ready\n`;
          enhancedInstructions += `- Try search_documents tool first - it will handle the status appropriately\n`;
          enhancedInstructions += `- DO NOT ask for clarification about which document - search all available documents\n\n`;
        }
      }
    }
    
    // Prepare conversation history
    const conversationHistory = input.conversationHistory || [];
    const conversation: Array<{ role: "user" | "assistant"; content: string }> = [
      ...conversationHistory,
    ];
    
    // Inject context into conversation if available
    // IMPORTANT: Add context BEFORE user message so orchestrator sees it first
    if (enhancedInstructions && documentContext) {
      // Add context as assistant message with clear instructions
      conversation.push({
        role: "assistant",
        content: enhancedInstructions + "\n\nBased on this context, route the user's query appropriately.",
      });
    }
    
    // Add user message
    conversation.push({ role: "user", content: input.message });
    
    // Log for debugging
    if (classification.intent === "document") {
      console.log(`Document query detected - injecting context and routing to search_documents`);
    }

    // Convert to AgentInputItem format
    const agentInput = conversation.map((msg) => ({
      role: msg.role,
      content: Array.isArray(msg.content) ? msg.content : [{ type: "text" as const, text: msg.content }],
    }));

    // Execute orchestration
    const events = await runner.run(
      orchestratorAgent,
      agentInput.length > 0 ? agentInput : [{ role: "user", content: input.message }],
      {
        maxTurns: 20,
        stream: false, // For now, we'll collect the full result
      },
    );

    // Collect output from events
    let finalResponse = "";
    const toolCalls: Array<{ tool: string; command?: string; result?: unknown }> = [];

    for await (const event of events) {
      if (event.type === "finalOutput" && event.output) {
        finalResponse = typeof event.output === "string" ? event.output : String(event.output);
      } else if (event.type === "content" || event.type === "text") {
        const content = (event as any).content || (event as any).text;
        if (content) {
          finalResponse += typeof content === "string" ? content : String(content);
        }
      } else if (event.type === "toolCall" || event.type === "toolResult") {
        const toolEvent = event as any;
        if (toolEvent.toolCall) {
          toolCalls.push({
            tool: toolEvent.toolCall.name || toolEvent.toolCall.tool || "",
            command: toolEvent.toolCall.input?.command || toolEvent.toolCall.arguments?.command,
            result: toolEvent.toolCall.result,
          });
        }
      }
    }

    return {
      finalResponse: finalResponse.trim() || "I was unable to generate a response. Please try again.",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Orchestration error:", error);
    return {
      finalResponse: "",
      error: errorMessage,
    };
  }
}

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const input: OrchestratorInput = await req.json();

    // Validate input
    if (!input.userId || !input.message) {
      return new Response(
        JSON.stringify({ error: "userId and message are required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const authHeader = req.headers.get("Authorization");

    // Execute orchestration
    const output = await executeOrchestration(input, authHeader);

    // Return standardized output
    return new Response(
      JSON.stringify(output),
      {
        status: output.error ? 500 : 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Orchestrator function error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        finalResponse: "",
        error: errorMessage,
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});

