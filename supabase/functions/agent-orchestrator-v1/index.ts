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
  createResellingAnalysisTool,
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
 * Check if query is a reselling analysis request
 */
function isResellingRequest(query: string): boolean {
  const queryLower = query.toLowerCase();
  const category1Matches = [
    queryLower.includes("scrape"),
    queryLower.includes("craigslist"),
    queryLower.includes("offerup"),
    queryLower.includes("ebay"),
    queryLower.includes("amazon"),
    queryLower.includes("price comparison"),
    queryLower.includes("reselling"),
    queryLower.includes("resell"),
    queryLower.includes("price discrepancies"),
    queryLower.includes("compare prices"),
    queryLower.includes("find deals"),
    queryLower.includes("compare to"),
  ];
  const category2Matches = [
    queryLower.includes("headphones"),
    queryLower.includes("laptop"),
    queryLower.includes("product"),
    queryLower.includes("item"),
    queryLower.includes("listing"),
    queryLower.includes("deal"),
    queryLower.includes("report"),
    queryLower.includes("email"),
    queryLower.includes("links"),
  ];
  return category1Matches.some(m => m) && category2Matches.some(m => m);
}

/**
 * Extract product and location from query for reselling analysis
 */
function extractResellingParams(query: string): { query: string; location: string } {
  const queryLower = query.toLowerCase();
  
  // Extract location (common patterns)
  let location = "des moines"; // default
  const locationPatterns = [
    /(?:in|from|at)\s+([a-z\s]+(?:moines|chicago|new york|los angeles|san francisco|seattle|boston|philadelphia|phoenix|houston|dallas|austin|denver|portland|minneapolis|detroit|miami|atlanta|baltimore|kansas city|columbus|indianapolis|nashville|raleigh|memphis|oklahoma city|milwaukee|louisville|las vegas|albuquerque|tucson|fresno|sacramento|long beach|kansas city|mesa|virginia beach|atlanta|oakland|minneapolis|tulsa|cleveland|wichita|arlington))/i,
    /(des\s+moines|chicago|new\s+york|los\s+angeles)/i,
  ];
  for (const pattern of locationPatterns) {
    const match = query.match(pattern);
    if (match) {
      location = match[1].toLowerCase();
      break;
    }
  }
  
  // Extract product query
  let productQuery = "headphones"; // default
  const productKeywords = ["headphones", "laptop", "bicycle", "phone", "tablet", "camera", "tv", "monitor"];
  for (const keyword of productKeywords) {
    if (queryLower.includes(keyword)) {
      productQuery = keyword;
      break;
    }
  }
  
  return { query: productQuery, location };
}

/**
 * Call reselling analysis tool directly (bypass orchestrator)
 */
async function handleResellingRequestDirectly(
  input: OrchestratorInput,
): Promise<OrchestratorOutput> {
  console.log(`🚨 [BYPASS] Reselling request detected - calling tool directly`);
  
  const RESELLING_ANALYSIS_URL = PROJECT_URL ? `${PROJECT_URL.replace(/\/+$/, "")}/functions/v1/reselling-analysis` : "";
  if (!RESELLING_ANALYSIS_URL) {
    return {
      finalResponse: "Reselling analysis service is not configured.",
      error: "RESELLING_ANALYSIS_URL not configured",
    };
  }
  
  const { query: productQuery, location } = extractResellingParams(input.message);
  console.log(`🚨 [BYPASS] Extracted params: query="${productQuery}", location="${location}"`);
  
  try {
    const response = await fetch(RESELLING_ANALYSIS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command: "analyze_headphones",
        args: {
          location,
          query: productQuery,
          sources: "craigslist,offerup",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Reselling analysis failed: ${response.statusText}`);
    }

    const result = await response.json();
    const data = result.data || result;
    
    // Get concise summary
    let summary = data.summary || "Reselling analysis completed.";
    
    // If user asked for email report, prepare it
    const wantsEmail = input.message.toLowerCase().includes("email") || input.message.toLowerCase().includes("report");
    if (wantsEmail && data.emailReport) {
      summary += `\n\n📧 Detailed email report is available. Use the email-mcp tool to send it.`;
    }
    
    console.log(`✅ [BYPASS] Reselling analysis completed successfully`);
    
    return {
      finalResponse: summary,
      toolCalls: [{
        tool: "analyze_reselling_opportunities",
        result: data,
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [BYPASS] Reselling analysis error:`, error);
    return {
      finalResponse: `Error performing reselling analysis: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Execute agent orchestration based on input
 */
async function executeOrchestration(
  input: OrchestratorInput,
  authHeader?: string | null,
): Promise<OrchestratorOutput> {
  // BYPASS: Check for reselling requests FIRST and handle directly
  if (isResellingRequest(input.message)) {
    console.log(`🚨 [BYPASS] Reselling request detected - bypassing orchestrator`);
    return await handleResellingRequestDirectly(input);
  }
  
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

    // Add reselling analysis tool
    const RESELLING_ANALYSIS_URL = PROJECT_URL ? `${PROJECT_URL.replace(/\/+$/, "")}/functions/v1/reselling-analysis` : "";
    if (RESELLING_ANALYSIS_URL) {
      try {
        const resellingTool = createResellingAnalysisTool(RESELLING_ANALYSIS_URL);
        tools.push(resellingTool);
        console.log("✅ [DEBUG] Added reselling analysis tool to orchestrator");
        console.log(`✅ [DEBUG] Tool name: ${resellingTool.name}`);
        console.log(`✅ [DEBUG] Tool description: ${resellingTool.description?.substring(0, 100)}...`);
      } catch (error) {
        console.error("❌ [DEBUG] Failed to create reselling analysis tool:", error);
        // Continue without reselling tool if there's an error
      }
    }
    
    // DEBUG: Log all tools available to orchestrator
    console.log(`🔍 [DEBUG] Total tools available: ${tools.length}`);
    console.log(`🔍 [DEBUG] Tool names: ${tools.map(t => t.name).join(", ")}`);
    const hasResellingTool = tools.some(t => t.name === "analyze_reselling_opportunities");
    console.log(`🔍 [DEBUG] analyze_reselling_opportunities tool present: ${hasResellingTool}`);

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
    
    // Note: Reselling requests are now handled by bypass above, so this code path won't execute for them
    // But we keep the detection logic for logging/documentation
    const isResellingRequestFlag = isResellingRequest(input.message);
    console.log(`🔍 [DEBUG] Reselling request check (should be false after bypass): ${isResellingRequestFlag}`);
    
    // Enhance orchestrator instructions with document context
    // CRITICAL: Always prioritize RAG when documents exist, regardless of query classification
    let enhancedInstructions = "";
    
    // CRITICAL: Add reselling analysis detection FIRST
    if (isResellingRequest) {
      console.log(`🚨 [DEBUG] RESELLING REQUEST DETECTED - Injecting critical instructions`);
      enhancedInstructions += `\n\n🚨🚨🚨 CRITICAL: RESELLING ANALYSIS REQUEST DETECTED 🚨🚨🚨\n`;
      enhancedInstructions += `- User query: "${input.message}"\n`;
      enhancedInstructions += `- This is a RESELLING ANALYSIS request - you MUST use analyze_reselling_opportunities tool DIRECTLY\n`;
      enhancedInstructions += `- DO NOT route to command discovery\n`;
      enhancedInstructions += `- DO NOT use playwright-wrapper manually\n`;
      enhancedInstructions += `- DO NOT use search-mcp for price comparisons\n`;
      enhancedInstructions += `- USE analyze_reselling_opportunities tool IMMEDIATELY with:\n`;
      enhancedInstructions += `  * query: Extract product name from query (e.g., "headphones", "laptops")\n`;
      enhancedInstructions += `  * location: Extract location if mentioned (e.g., "des moines", "chicago"), default: "des moines"\n`;
      enhancedInstructions += `  * sources: "craigslist,offerup" (default)\n`;
      enhancedInstructions += `- The tool will automatically scrape, compare prices, and generate a concise summary\n`;
      enhancedInstructions += `- After getting results, if user asked for email, use email-mcp to send the detailed report\n\n`;
      console.log(`🚨 [DEBUG] Enhanced instructions length: ${enhancedInstructions.length} chars`);
    } else {
      console.log(`ℹ️ [DEBUG] Not a reselling request - continuing with normal flow`);
    }
    if (documentContext && documentContext.availableDocuments.length > 0) {
      enhancedInstructions = `\n\n=== CURRENT USER CONTEXT ===\n${formatDocumentContext(documentContext)}\n\n`;
      
      // CRITICAL RULE: If user has documents, ALWAYS try RAG first before web search
      // This applies to ALL queries, not just those classified as document queries
      enhancedInstructions += `=== CRITICAL ROUTING RULE ===\n`;
      enhancedInstructions += `- User has ${documentContext.availableDocuments.length} document(s) available\n`;
      enhancedInstructions += `- BEFORE using ANY other tool (web_search, etc.), you MUST check if the query can be answered from uploaded documents\n`;
      enhancedInstructions += `- Use search_documents tool FIRST for ANY query that might relate to uploaded content\n`;
      enhancedInstructions += `- Only use web_search if search_documents returns no relevant results\n\n`;
      
      enhancedInstructions += `=== QUERY ANALYSIS ===\n`;
      enhancedInstructions += `- User query intent: ${classification.intent} (confidence: ${classification.confidence.toFixed(2)})\n`;
      enhancedInstructions += `- Suggested tool: ${classification.suggestedTool}\n`;
      
      if (classification.context.documentName) {
        enhancedInstructions += `- User mentioned document: ${classification.context.documentName}\n`;
      }
      if (classification.context.mentionsDocument || classification.context.mentionsFile) {
        enhancedInstructions += `- Query mentions documents/files - this is DEFINITELY a DOCUMENT QUERY\n`;
      }
      
      // Check if query mentions any document filename (even partially)
      const queryLower = input.message.toLowerCase();
      const matchingDocs = documentContext.availableDocuments.filter(doc => {
        const fileNameLower = doc.fileName.toLowerCase();
        const fileNameWords = fileNameLower.replace(/\.(pdf|docx?|txt|csv)/, "").split(/[\s_-]+/);
        return fileNameWords.some(word => word.length > 3 && queryLower.includes(word.toLowerCase()));
      });
      
      if (matchingDocs.length > 0) {
        enhancedInstructions += `- Query likely refers to: ${matchingDocs.map(d => d.fileName).join(", ")}\n`;
        enhancedInstructions += `- YOU MUST use search_documents with these document(s)\n`;
      }
      
      if (documentContext.readyDocuments > 0) {
        enhancedInstructions += `\n=== ACTION REQUIRED - HIGHEST PRIORITY ===\n`;
        enhancedInstructions += `- ${documentContext.readyDocuments} document(s) are ready for search\n`;
        enhancedInstructions += `- YOU MUST use the search_documents tool IMMEDIATELY\n`;
        enhancedInstructions += `- DO NOT ask for clarification - use search_documents with the user's query\n`;
        enhancedInstructions += `- DO NOT use web search - use search_documents instead\n`;
        enhancedInstructions += `- If search_documents returns results, use those results - do NOT fall back to web search\n\n`;
      } else if (documentContext.processingDocuments > 0) {
        enhancedInstructions += `\n=== DOCUMENT STATUS ===\n`;
        enhancedInstructions += `- ${documentContext.processingDocuments} document(s) are still processing\n`;
        enhancedInstructions += `- Try search_documents first - it will check status and may still find results\n`;
        enhancedInstructions += `- Inform user if documents are still processing\n\n`;
      } else {
        enhancedInstructions += `\n=== ACTION REQUIRED ===\n`;
        enhancedInstructions += `- User has documents but they may not be ready\n`;
        enhancedInstructions += `- Try search_documents tool FIRST - it will handle the status appropriately\n`;
        enhancedInstructions += `- DO NOT ask for clarification about which document - search all available documents\n`;
        enhancedInstructions += `- Only use web_search if search_documents confirms no documents are ready\n\n`;
      }
    }
    
    // Prepare conversation history
    const conversationHistory = input.conversationHistory || [];
    const conversation: Array<{ role: "user" | "assistant"; content: string }> = [
      ...conversationHistory,
    ];
    
    // Inject context into conversation if available
    // IMPORTANT: Add context BEFORE user message so orchestrator sees it first
    if (enhancedInstructions) {
      // Add context as assistant message with clear instructions
      const contextMessage = isResellingRequest
        ? enhancedInstructions + "\n\n🚨 USE analyze_reselling_opportunities tool NOW - do not route elsewhere."
        : enhancedInstructions + "\n\nBased on this context, route the user's query appropriately.";
      conversation.push({
        role: "assistant",
        content: contextMessage,
      });
      console.log(`📝 [DEBUG] Injected instructions into conversation (${contextMessage.length} chars)`);
      console.log(`📝 [DEBUG] Instructions preview: ${contextMessage.substring(0, 200)}...`);
    }
    
    // Add user message
    conversation.push({ role: "user", content: input.message });
    
    // Log for debugging
    console.log(`📝 [DEBUG] Final conversation length: ${conversation.length} messages`);
    console.log(`📝 [DEBUG] Conversation structure: ${conversation.map(m => `${m.role}: ${m.content.substring(0, 50)}...`).join(" | ")}`);
    
    if (isResellingRequest) {
      console.log(`🚨 [DEBUG] Reselling analysis request detected - injecting critical instructions`);
    } else if (classification.intent === "document") {
      console.log(`📄 [DEBUG] Document query detected - injecting context and routing to search_documents`);
    }

    // Convert to AgentInputItem format
    const agentInput = conversation.map((msg) => ({
      role: msg.role,
      content: Array.isArray(msg.content) ? msg.content : [{ type: "text" as const, text: msg.content }],
    }));

    // Execute orchestration
    console.log(`🚀 [DEBUG] Starting orchestrator execution with ${agentInput.length} input messages`);
    if (isResellingRequest) {
      console.log(`🚨 [DEBUG] EXPECTED: Agent should use analyze_reselling_opportunities tool`);
    }
    
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
    let eventCount = 0;

    for await (const event of events) {
      eventCount++;
      console.log(`📊 [DEBUG] Event #${eventCount}: type=${event.type}`);
      
      if (event.type === "finalOutput" && event.output) {
        finalResponse = typeof event.output === "string" ? event.output : String(event.output);
        console.log(`📊 [DEBUG] Final output received: ${finalResponse.substring(0, 100)}...`);
      } else if (event.type === "content" || event.type === "text") {
        const content = (event as any).content || (event as any).text;
        if (content) {
          finalResponse += typeof content === "string" ? content : String(content);
        }
      } else if (event.type === "toolCall" || event.type === "toolResult") {
        const toolEvent = event as any;
        if (toolEvent.toolCall) {
          const toolName = toolEvent.toolCall.name || toolEvent.toolCall.tool || "";
          console.log(`🔧 [DEBUG] Tool called: ${toolName}`);
          if (isResellingRequest && toolName !== "analyze_reselling_opportunities") {
            console.log(`⚠️ [DEBUG] WARNING: Reselling request but tool called is ${toolName}, not analyze_reselling_opportunities!`);
          }
          if (toolName === "analyze_reselling_opportunities") {
            console.log(`✅ [DEBUG] SUCCESS: analyze_reselling_opportunities tool was called!`);
          }
          toolCalls.push({
            tool: toolName,
            command: toolEvent.toolCall.input?.command || toolEvent.toolCall.arguments?.command,
            result: toolEvent.toolCall.result,
          });
        }
      } else if (event.type === "handoff") {
        const handoffEvent = event as any;
        console.log(`🔄 [DEBUG] Handoff detected: ${handoffEvent.target || "unknown"}`);
        if (isResellingRequest) {
          console.log(`⚠️ [DEBUG] WARNING: Reselling request but handoff occurred! This should not happen.`);
        }
      }
    }
    
    console.log(`📊 [DEBUG] Total events processed: ${eventCount}`);
    console.log(`📊 [DEBUG] Tool calls made: ${toolCalls.length}`);
    console.log(`📊 [DEBUG] Tools used: ${toolCalls.map(t => t.tool).join(", ") || "none"}`);

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

