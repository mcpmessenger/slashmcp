import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  type AgentInputItem,
  type Tool,
  Runner,
} from "https://esm.sh/@openai/agents@0.3.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMemoryService } from "../_shared/memory.ts";
import type { Database } from "../_shared/database.types.ts";
import {
  createCommandDiscoveryAgent,
  createMcpToolAgent,
  createOrchestratorAgent,
  createHandoffs,
  createMemoryTools,
  createMcpProxyTool,
  createRagTools,
  classifyQuery,
  getDocumentContext,
  formatDocumentContext,
  listCommandsTool,
  executeMcpCommand,
} from "../_shared/orchestration/index.ts";

type Provider = "openai" | "anthropic" | "gemini";

const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",").map(origin => origin.trim()) ?? ["*"];
const BASE_SYSTEM_PROMPT =
  "You are a helpful AI research assistant speaking aloud through text-to-speech. Respond in natural spoken sentences, avoid stage directions, asterisks, or emojis, and keep punctuation simple so it sounds good when read aloud. Provide clear answers, cite important facts conversationally, and offer actionable insight when useful.";

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const encoder = new TextEncoder();

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const NORMALIZED_PROJECT_URL = PROJECT_URL ? PROJECT_URL.replace(/\/+$/, "") : "";
const MCP_GATEWAY_URL = NORMALIZED_PROJECT_URL ? `${NORMALIZED_PROJECT_URL}/functions/v1/mcp` : "";
const DOC_CONTEXT_URL = NORMALIZED_PROJECT_URL ? `${NORMALIZED_PROJECT_URL}/functions/v1/doc-context` : "";

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
 * Handle reselling request directly in chat function (bypass orchestrator)
 */
async function handleResellingRequestInChat(
  query: string,
  eventStream: ReturnType<typeof createEventStream>,
  corsHeaders: Record<string, string>,
  authHeader?: string | null,
): Promise<Response | null> {
  console.log(`🚨 [BYPASS] Reselling request detected in chat - calling tool directly`);
  
  const RESELLING_ANALYSIS_URL = NORMALIZED_PROJECT_URL ? `${NORMALIZED_PROJECT_URL}/functions/v1/reselling-analysis` : "";
  if (!RESELLING_ANALYSIS_URL) {
    eventStream.sendContent("Reselling analysis service is not configured.");
    eventStream.close();
    return new Response(eventStream.stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  }
  
  const { query: productQuery, location } = extractResellingParams(query);
  console.log(`🚨 [BYPASS] Extracted params: query="${productQuery}", location="${location}"`);
  
  try {
    eventStream.sendEvent({
      type: "system",
      timestamp: Date.now(),
      metadata: { message: "Analyzing reselling opportunities..." },
    });
    
    const response = await fetch(RESELLING_ANALYSIS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add authentication - use service role key for function-to-function calls
        ...(SUPABASE_SERVICE_ROLE_KEY ? { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } : {}),
        // Also include anon key as fallback
        ...(SUPABASE_ANON_KEY ? { "apikey": SUPABASE_ANON_KEY } : {}),
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
    
    // Send summary to chat
    eventStream.sendContent(summary);
    
    // If user asked for email report, automatically send it
    const wantsEmail = query.toLowerCase().includes("email") || query.toLowerCase().includes("report");
    if (wantsEmail && data.emailReport) {
      eventStream.sendContent("\n\n📧 Sending detailed email report...");
      
      try {
        // Send email using email-mcp
        const emailCommand = `/email-mcp send_test_email subject="Reselling Opportunities Analysis Report" body="${data.emailReport.replace(/"/g, '\\"')}"`;
        const emailResult = await executeMcpCommand(emailCommand, MCP_GATEWAY_URL, authHeader);
        
        if (emailResult && !emailResult.includes("Error")) {
          eventStream.sendContent("\n\n✅ Email report sent successfully! Check your inbox.");
        } else {
          eventStream.sendContent("\n\n⚠️ Email report generated but could not be sent automatically. The report is available in the analysis results.");
        }
      } catch (emailError) {
        console.error("Failed to send email report:", emailError);
        eventStream.sendContent("\n\n⚠️ Email report generated but could not be sent automatically. The report is available in the analysis results.");
      }
    }
    
    console.log(`✅ [BYPASS] Reselling analysis completed successfully`);
    
    eventStream.close();
    return new Response(eventStream.stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [BYPASS] Reselling analysis error:`, error);
    eventStream.sendContent(`Error performing reselling analysis: ${errorMessage}`);
    eventStream.close();
    return new Response(eventStream.stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  }
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function respondWithStreamedText(text: string, corsHeaders: Record<string, string>) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (text) {
        const payload = JSON.stringify({ choices: [{ delta: { content: text } }] });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

// Enhanced streaming response that supports both content and MCP events
function createEventStream(corsHeaders: Record<string, string>) {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const sendContent = (content: string) => {
    if (controller) {
      const payload = JSON.stringify({ choices: [{ delta: { content } }] });
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
    }
  };

  const sendEvent = (event: {
    type: string;
    timestamp: number;
    agent?: string;
    tool?: string;
    command?: string;
    result?: unknown;
    error?: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (controller) {
      const payload = JSON.stringify({ mcpEvent: event });
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
    }
  };

  const close = () => {
    if (controller) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  };

  return { stream, sendContent, sendEvent, close };
}

function mapMessagesForAnthropic(messages: Array<{ role: string; content: string }>) {
  return messages.map(message => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: [{ type: "text", text: message.content }],
  }));
}

function mapMessagesForGemini(messages: Array<{ role: string; content: string }>) {
  return messages.map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

const JOB_STAGES = ["registered", "uploaded", "processing", "extracted", "indexed", "injected", "failed"] as const;
type JobStage = typeof JOB_STAGES[number];
type StageHistoryEntry = { stage: JobStage; at: string };

function parseStageHistory(metadata?: Record<string, unknown> | null): StageHistoryEntry[] {
  if (!metadata) return [];
  const raw = (metadata as Record<string, unknown>).job_stage_history;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (entry && typeof entry === "object" && "stage" in entry && "at" in entry) {
        const stage = (entry as Record<string, unknown>).stage;
        const at = (entry as Record<string, unknown>).at;
        if (JOB_STAGES.includes(stage as JobStage) && typeof at === "string") {
          return { stage: stage as JobStage, at };
        }
      }
      return null;
    })
    .filter((entry): entry is StageHistoryEntry => Boolean(entry));
}

function withJobStage(
  metadata: Record<string, unknown> | null | undefined,
  stage: JobStage,
  extra: Record<string, unknown> = {},
) {
  const base = { ...(metadata ?? {}) } as Record<string, unknown>;
  const history = parseStageHistory(base);
  const lastEntry = history[history.length - 1];
  const timestamp = new Date().toISOString();
  const nextHistory =
    lastEntry && lastEntry.stage === stage ? history : [...history, { stage, at: timestamp }].slice(-25);

  return {
    ...base,
    ...extra,
    job_stage: stage,
    job_stage_history: nextHistory,
    job_stage_updated_at: timestamp,
  };
}

const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

type DocumentContextPayload = {
  jobId: string;
  fileName: string;
  token: string;
  stage: JobStage | null;
  rawMetadata?: Record<string, unknown> | null;
  chunks: Array<{ id: string; content: string }>;
  summary?: string | null;
  metadata?: {
    textLength?: number;
    visionMetadata?: Record<string, unknown> | null;
  };
};

// --- Multi-agent setup using OpenAI Agents SDK for the OpenAI provider ---
// Note: Agent and tool creation logic is now imported from the shared orchestration module

// All agent and tool creation functions are now imported from the shared orchestration module
// See imports at top of file

serve(async (req) => {
  // CRITICAL: Log immediately when function is invoked (before any async operations)
  console.log("=== FUNCTION INVOKED ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    console.log("OPTIONS request, returning CORS headers");
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Explicitly check for POST method
  if (req.method !== "POST") {
    console.error("Method not allowed:", req.method);
    return new Response(
      JSON.stringify({ error: `Method ${req.method} not allowed. Only POST is supported.` }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Create event stream at the very start to ensure we always have one
  console.log("Creating event stream...");
  const eventStream = createEventStream(corsHeaders);
  console.log("Event stream created");
  
  // Log request start
  console.log("=== Chat Function Request Start ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", Object.fromEntries(req.headers.entries()));
  
  try {
    let requestData;
    try {
      const requestText = await req.text();
      console.log("Request body length:", requestText.length);
      requestData = JSON.parse(requestText);
      console.log("Parsed request data:", JSON.stringify(requestData).slice(0, 500));
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      // If JSON parsing fails, return error stream
      eventStream.sendEvent({
        type: "error",
        timestamp: Date.now(),
        error: "Invalid JSON in request body",
        metadata: { category: "parse_error", error: parseError instanceof Error ? parseError.message : String(parseError) },
      });
      eventStream.sendContent("Invalid request format. Please try again.");
      eventStream.close();
      return new Response(eventStream.stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }
    
    const { messages, provider, documentContext: documentContextRefs } = requestData;
    if (!Array.isArray(messages)) {
      // Return stream even for validation errors
      eventStream.sendEvent({
        type: "error",
        timestamp: Date.now(),
        error: "messages must be an array",
        metadata: { category: "validation_error" },
      });
      eventStream.sendContent("Invalid request: messages must be an array.");
      eventStream.close();
      return new Response(eventStream.stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Try to get authenticated user (optional - memory features work only if authenticated)
    let memoryService: ReturnType<typeof createMemoryService> | null = null;
    let userPreferences: Record<string, unknown> = {};
    let systemPrompt = BASE_SYSTEM_PROMPT;
    let relevantMemories: Array<{ key: string; value: unknown }> = [];
    let user: { id: string } | null = null; // Store user for RAG tools

    const authHeader = req.headers.get("Authorization");
    if (authHeader && SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });

        const {
          data: { user: authUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (!userError && authUser) {
          user = authUser; // Store user for later use
          try {
            // User is authenticated - create memory service
            memoryService = createMemoryService(supabase, authUser.id);

            // Load user preferences and recent memories (truly non-blocking)
            // Start loading but don't wait - we'll use what we have when the stream starts
            // Memory tools will still work even if context injection fails
            Promise.all([
              memoryService.getUserPreferences(),
              memoryService.getAllMemory(),
            ])
              .then(([prefs, allMemories]) => {
                userPreferences = prefs;
                relevantMemories = allMemories
                  .filter((mem) => mem.key !== "preferences")
                  .slice(0, 10);
                
                // Note: We can't update systemPrompt here as it's already been used
                // But we log for debugging
                if (Object.keys(prefs).length > 0 || relevantMemories.length > 0) {
                  console.log(`Loaded ${relevantMemories.length} memories and preferences (for future requests)`);
                }
              })
              .catch((prefError) => {
                console.error("Error loading user preferences/memories (background):", prefError);
                // Continue without preferences - don't block the request
              });
          } catch (memError) {
            console.error("Error creating memory service:", memError);
            // Continue without memory features - don't block the request
          }
        }
      } catch (authError) {
        console.error("Error authenticating user (non-blocking):", authError);
        // Continue without memory features - don't block the request
      }
    } else {
      // Log if keys are missing (for debugging) but don't fail
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.log("Memory service disabled: SUPABASE_URL or SUPABASE_ANON_KEY not configured");
      }
    }

    const normalizedProvider = (provider ?? "openai") as string;
    const selectedProvider: Provider =
      normalizedProvider === "anthropic" || normalizedProvider === "gemini" ? normalizedProvider : "openai";
    let augmentedMessages: Array<{ role: string; content: string }> = [...messages];

    if (Array.isArray(documentContextRefs) && documentContextRefs.length > 0) {
      let jobIds = documentContextRefs
        .map((doc: { jobId?: string }) => (doc && typeof doc.jobId === "string" ? doc.jobId : null))
        .filter((id): id is string => Boolean(id));

      if (!DOC_CONTEXT_URL) {
        console.warn("Document context provided but DOC_CONTEXT_URL is not configured");
      } else if (jobIds.length > 0) {
        // Check job statuses first - inform user if documents are still processing
        let processingJobs: Array<{ jobId: string; fileName: string; stage: string | null }> = [];
        
        if (adminClient) {
          try {
            const { data: jobs, error: jobsError } = await adminClient
              .from("processing_jobs")
              .select("id, file_name, metadata")
              .in("id", jobIds);

            if (!jobsError && jobs) {
              processingJobs = jobs.map((job: any) => ({
                jobId: job.id,
                fileName: job.file_name,
                stage: (job.metadata as Record<string, unknown> | null)?.job_stage ?? null,
              }));

              // Check if any jobs are still being processed
              const stillProcessing = processingJobs.filter(
                (job) => 
                  !job.stage || 
                  job.stage === "registered" || 
                  job.stage === "uploaded" || 
                  job.stage === "processing"
              );

              const readyJobs = processingJobs.filter(
                (job) => 
                  job.stage === "extracted" || 
                  job.stage === "indexed" || 
                  job.stage === "injected"
              );

              // If ALL jobs are still processing, inform user and wait
              // If SOME jobs are ready, use those and continue
              if (stillProcessing.length > 0 && readyJobs.length === 0) {
                // All documents are still processing - inform user
                const fileNames = stillProcessing.map(j => j.fileName).join(", ");
                const processingMessage = stillProcessing.length === 1
                  ? `The file "${fileNames}" is currently being processed. Please wait a moment, and I will be able to analyze it for you.`
                  : `The following files are currently being processed: ${fileNames}. Please wait a moment, and I will be able to analyze them for you.`;

                // Send helpful message to user instead of saying we don't have access
                eventStream.sendContent(processingMessage);
                eventStream.sendEvent({
                  type: "system",
                  timestamp: Date.now(),
                  metadata: {
                    category: "document_processing",
                    message: "Documents still processing",
                    processingJobs: stillProcessing.map(j => ({ fileName: j.fileName, stage: j.stage })),
                  },
                });
                eventStream.close();
                return new Response(eventStream.stream, {
                  headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
                });
              } else if (stillProcessing.length > 0 && readyJobs.length > 0) {
                // Some jobs ready, some still processing - use ready ones and mention others
                // Filter jobIds to only include ready jobs
                jobIds = readyJobs.map(j => j.jobId);
                
                // Note: We'll mention processing files in the response, but continue with ready ones
                console.log(`Using ${jobIds.length} ready job(s), ${stillProcessing.length} still processing`);
              }
            }
          } catch (statusCheckError) {
            console.error("Error checking job status:", statusCheckError);
            // Continue with normal flow if status check fails
          }
        }

        // Extract user query from the last message for vector search
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const userQuery = lastMessage && lastMessage.role === "user" 
          ? (typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content ?? ""))
          : "";

        // Determine if we should use vector search
        // Use vector search if query is substantial (not just greetings/short messages)
        const shouldUseVectorSearch = userQuery.trim().length >= 10 && 
          !/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)$/i.test(userQuery.trim());

        let docContexts: DocumentContextPayload[] = [];
        let searchMode: "vector" | "legacy" = "legacy";
        
        try {
          const requestBody: {
            jobIds: string[];
            query?: string;
            limit?: number;
            similarity_threshold?: number;
          } = { jobIds };

          // Add query for vector search if appropriate
          if (shouldUseVectorSearch) {
            requestBody.query = userQuery;
            requestBody.limit = 10; // Get top 10 most relevant chunks
            requestBody.similarity_threshold = 0.7; // Minimum similarity threshold
          }

          // Add timeout to prevent hanging
          const DOC_CONTEXT_TIMEOUT_MS = 30_000; // 30 seconds for document context
          const docContextAbortController = new AbortController();
          const docContextTimeoutId = setTimeout(() => {
            docContextAbortController.abort();
          }, DOC_CONTEXT_TIMEOUT_MS);
          
          let response: Response;
          try {
            response = await fetch(DOC_CONTEXT_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(SUPABASE_SERVICE_ROLE_KEY ? { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } : {}),
              },
              body: JSON.stringify(requestBody),
              signal: docContextAbortController.signal,
            });
            clearTimeout(docContextTimeoutId);
          } catch (fetchError) {
            clearTimeout(docContextTimeoutId);
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              console.error("Document context fetch timeout after", DOC_CONTEXT_TIMEOUT_MS, "ms");
              // Continue without document context rather than failing the entire request
              throw new Error("Document context request timed out");
            }
            throw fetchError;
          }
          
          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(`doc-context responded with ${response.status} ${errorText}`);
          }
          const parsed = await response.json().catch(() => null);
          docContexts = Array.isArray(parsed?.contexts) ? (parsed.contexts as DocumentContextPayload[]) : [];
          searchMode = parsed?.searchMode === "vector" ? "vector" : "legacy";
        } catch (contextError) {
          console.error("Failed to retrieve document contexts:", contextError);
        }

        if (docContexts.length > 0) {
          const contextSections = docContexts.map((ctx) => {
            const combinedText =
              ctx.chunks && ctx.chunks.length > 0
                ? ctx.chunks.map(chunk => {
                    // Include similarity score if available (vector search mode)
                    const similarity = (chunk as any).similarity;
                    const content = chunk.content;
                    return similarity !== undefined 
                      ? `[Similarity: ${(similarity * 100).toFixed(1)}%] ${content}`
                      : content;
                  }).join("\n\n")
                : ctx.summary ?? "";
            const preview =
              combinedText.length > 10000
                ? `${combinedText.slice(0, 10000)}\n\n[... ${combinedText.length - 10000} more characters ...]`
                : combinedText;
            const parts: string[] = [`📄 Document: "${ctx.fileName}"`];
            if (searchMode === "vector") {
              parts.push(`\n🔍 Retrieved via semantic search (${ctx.chunks?.length || 0} relevant chunks)`);
            }
            if (preview) {
              parts.push(`\n📝 ${searchMode === "vector" ? "Relevant Content" : "Extracted Text Preview"}:\n${preview}`);
            } else if (ctx.summary) {
              parts.push(`\n👁️ Visual Summary:\n${ctx.summary}`);
            }
            if (ctx.metadata?.visionMetadata) {
              const bulletPoints = Array.isArray(ctx.metadata.visionMetadata?.bullet_points)
                ? (ctx.metadata.visionMetadata?.bullet_points as string[])
                : [];
              if (bulletPoints.length > 0) {
                parts.push(`\n🔑 Key Points:\n${bulletPoints.map(point => `- ${point}`).join("\n")}`);
              }
              if (ctx.metadata.visionMetadata?.chart_analysis) {
                parts.push(`\n📊 Chart Analysis: ${ctx.metadata.visionMetadata.chart_analysis as string}`);
              }
            }
            parts.push(`\n🔗 Context Token: ${ctx.token}`);
            return parts.join("");
          });

          const contextBlock = `[AVAILABLE DOCUMENT CONTEXT]\n${contextSections.join("\n\n---\n\n")}`;
          const lastMessageIndex = augmentedMessages.length - 1;
          if (lastMessageIndex >= 0) {
            const lastMessage = augmentedMessages[lastMessageIndex];
            const lastContent =
              typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content ?? "");
            augmentedMessages[lastMessageIndex] = {
              ...lastMessage,
              content: `${contextBlock}\n\n[USER QUERY]\n${lastContent}`,
            };
          } else {
            augmentedMessages.push({
              role: "user",
              content: `${contextBlock}\n\n[USER QUERY]\n`,
            });
          }

          eventStream.sendEvent({
            type: "system",
            timestamp: Date.now(),
            metadata: {
              category: "document_context",
              searchMode: searchMode,
              attached: docContexts.map(ctx => ({
                jobId: ctx.jobId,
                fileName: ctx.fileName,
                token: ctx.token,
                chunkCount: ctx.chunks?.length ?? 0,
                textLength: ctx.metadata?.textLength ?? ctx.chunks?.[0]?.content?.length ?? 0,
                avgSimilarity: searchMode === "vector" && ctx.chunks && ctx.chunks.length > 0
                  ? ctx.chunks.reduce((sum: number, chunk: any) => sum + (chunk.similarity || 0), 0) / ctx.chunks.length
                  : undefined,
              })),
            },
          });

          if (adminClient) {
            const timestamp = new Date().toISOString();
            await Promise.all(
              docContexts.map((ctx) => {
                const updatedMetadata = withJobStage(
                  (ctx.rawMetadata as Record<string, unknown> | null) ?? null,
                  "injected",
                  {
                    injected_at: timestamp,
                    last_injected_text_length: ctx.metadata?.textLength ?? ctx.chunks?.[0]?.content?.length ?? 0,
                  },
                );
                return adminClient
                  .from("processing_jobs")
                  .update({ metadata: updatedMetadata })
                  .eq("id", ctx.jobId);
              }),
            );
          } else {
            console.warn("Admin client not configured; unable to update document stage to injected");
          }
        }
      }
    }

    const conversation = augmentedMessages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: typeof message.content === "string" ? message.content : String(message.content),
    }));

    if (selectedProvider === "openai") {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        eventStream.sendEvent({
          type: "error",
          timestamp: Date.now(),
          error: "OPENAI_API_KEY is not configured",
        });
        eventStream.sendContent("I apologize, but the OpenAI API key is not configured. Please contact support.");
        eventStream.close();
        
        return new Response(eventStream.stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // BYPASS: Check for reselling requests FIRST and handle directly
      const lastUserMessage = messages.length > 0 && messages[messages.length - 1]?.role === "user"
        ? (typeof messages[messages.length - 1].content === "string" 
            ? messages[messages.length - 1].content 
            : String(messages[messages.length - 1].content ?? ""))
        : "";
      
      if (lastUserMessage && isResellingRequest(lastUserMessage)) {
        console.log(`🚨 [BYPASS] Reselling request detected in chat - calling tool directly`);
        const result = await handleResellingRequestInChat(lastUserMessage, eventStream, corsHeaders, authHeader);
        if (result) {
          return result;
        }
        // If handleResellingRequestInChat returns null, continue with normal flow
      }

      // NOTE: Agents SDK v0.3.2 doesn't support hosted_tool (async run functions)
      // Since our tools use async run(), the SDK will always fail with "Unsupported tool type: hosted_tool"
      // Skip the SDK attempt and go straight to direct API mode to avoid the error and potential hangs
      // TODO: Re-enable Agents SDK when a version that supports hosted_tool is available
      let useAgentsSdk = false; // Disabled until SDK supports hosted_tool
      // Declare these outside the if block so they're accessible in the fallback section
      let finalOutput = "";
      let errorOccurred = false;
      let errorMessage = "";

      // Use the event stream created at the top of the function
      
      // Send initial message that we're starting
      eventStream.sendEvent({
        type: "system",
        timestamp: Date.now(),
        metadata: { message: "Initializing AI processing..." },
      });

      if (useAgentsSdk) {
        try {
          // Create runner with API key for this request
          const runner = new Runner({
            model: "gpt-4o-mini",
            apiKey: apiKey,
          });

          // Build tools array - include memory tools if available
          // Use shared orchestration module to create MCP proxy tool
          const tools: Tool[] = [createMcpProxyTool(MCP_GATEWAY_URL, authHeader)];
          if (memoryService) {
            const memoryTools = createMemoryTools(memoryService);
            tools.push(...memoryTools);
            console.log(`Added ${memoryTools.length} memory tools to agent`);
          }

          // Create agents dynamically with tools to avoid SDK serialization issues
          // Use shared orchestration module functions
          let currentMcpToolAgent: Agent;
          
          try {
            currentMcpToolAgent = createMcpToolAgent(tools);
          } catch (agentError) {
            console.error("Error creating agents:", agentError);
            // If agent creation fails, fall back to direct API
            useAgentsSdk = false;
            errorOccurred = true;
            errorMessage = agentError instanceof Error ? agentError.message : String(agentError);
            
            const isHostedToolError = errorMessage.includes("hosted_tool") || errorMessage.includes("Unsupported tool type");
            
            if (isHostedToolError) {
              // This is a known SDK compatibility issue - don't log as error, just inform user
              // Send informational message to MCP Event Log (system log)
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: {
                  category: "sdk_compatibility",
                  sdkVersion: "0.3.2",
                  issue: "hosted_tool_not_supported",
                  action: "fallback_to_direct_api",
                  message: "Agents SDK compatibility: Using direct API mode. All features remain available.",
                },
              });
              // Don't send error event for this known issue - it's handled gracefully
            } else {
              // For other errors, send error event
              eventStream.sendEvent({
                type: "error",
                timestamp: Date.now(),
                error: errorMessage,
                metadata: { isHostedToolError: false },
              });
              // Send technical error to MCP Event Log
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                error: errorMessage,
                metadata: {
                  category: "agent_creation_error",
                  action: "fallback_to_direct_api",
                },
              });
              // User-friendly message in chat
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: "Switching to direct API mode (fallback mode)" },
              });
            }
            
            throw agentError; // Re-throw to be caught by outer catch
          }

          // Create agents using shared orchestration module
          // Create Command Discovery Agent (needs mcpToolAgent for handoff)
          const commandDiscoveryAgent = createCommandDiscoveryAgent(currentMcpToolAgent);
          
          // Create handoffs including command discovery (returns 3 handoffs)
          const [commandDiscoveryHandoff, mcpHandoff, finalHandoff] = createHandoffs(currentMcpToolAgent, commandDiscoveryAgent);
          
          // Get document context and classify query for intelligent routing
          let documentContext: Awaited<ReturnType<typeof getDocumentContext>> | null = null;
          let classification: Awaited<ReturnType<typeof classifyQuery>> | null = null;
          let enhancedInstructions = "";
          
          // Get user ID from the user object retrieved earlier
          const currentUserId = user?.id;
          
          if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && currentUserId) {
            try {
              documentContext = await getDocumentContext(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, currentUserId);
              console.log(`Document context: ${documentContext.availableDocuments.length} docs, ${documentContext.readyDocuments} ready, ${documentContext.processingDocuments} processing`);
              
              // Get the last user message for classification
              const lastUserMessage = messages.length > 0 && messages[messages.length - 1]?.role === "user"
                ? (typeof messages[messages.length - 1].content === "string" 
                    ? messages[messages.length - 1].content 
                    : String(messages[messages.length - 1].content ?? ""))
                : "";
              
              if (lastUserMessage) {
                classification = classifyQuery(
                  lastUserMessage,
                  documentContext.availableDocuments.map(d => ({
                    id: d.id,
                    fileName: d.fileName,
                    status: d.status,
                  }))
                );
                console.log(`Query classification: intent=${classification.intent}, confidence=${classification.confidence}, tool=${classification.suggestedTool}`);
                
                // Build enhanced instructions
                if (documentContext.availableDocuments.length > 0) {
                  enhancedInstructions = `\n\n=== CURRENT USER CONTEXT ===\n${formatDocumentContext(documentContext)}\n\n`;
                  
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
              }
            } catch (error) {
              console.error("Failed to get document context or classify query:", error);
              // Continue without context
            }
          }
          
          // Create orchestrator agent using shared module function
          const currentOrchestratorAgent = createOrchestratorAgent(
            tools,
            commandDiscoveryHandoff,
            mcpHandoff,
            finalHandoff,
          );

          // Pass conversation history - Agents SDK Runner handles full context
          // Convert conversation to AgentInputItem format
          // CRITICAL: The SDK REQUIRES content to ALWAYS be an array of content blocks
          // Each content block must be { type: "text", text: "..." } for text content
          // IMPORTANT: Ensure strict typing - text must be a string, not optional
          const conversationHistory: AgentInputItem[] = conversation.map((msg, index) => {
            let contentArray: Array<{ type: "text"; text: string }>;
            
            if (Array.isArray(msg.content)) {
              // Already an array - ensure each item has the EXACT right format
              contentArray = msg.content.map((item) => {
                if (typeof item === "string") {
                  return { type: "text" as const, text: item };
                } else if (typeof item === "object" && item !== null) {
                  // If it's an object, extract text and ensure proper format
                  const textValue = (item as any).text || String(item);
                  if (typeof textValue === "string") {
                    return { type: "text" as const, text: textValue };
                  }
                  return { type: "text" as const, text: String(textValue) };
                }
                return { type: "text" as const, text: String(item) };
              });
            } else if (typeof msg.content === "string") {
              // String content - MUST wrap in array with proper format
              contentArray = [{ type: "text" as const, text: msg.content }];
            } else {
              // Fallback for other types
              contentArray = [{ type: "text" as const, text: String(msg.content) }];
            }
            
            // Ensure the array is not empty
            if (contentArray.length === 0) {
              contentArray = [{ type: "text" as const, text: "" }];
            }
            
            // Log the format for debugging
            if (index === 0 || index === conversation.length - 1) {
              console.log(`Message ${index} (${msg.role}): content format:`, JSON.stringify(contentArray).slice(0, 200));
            }
            
            return {
              role: msg.role as "user" | "assistant",
              content: contentArray,
            };
          });

          const lastUserMessage = conversation.length
            ? conversation[conversation.length - 1]?.content ?? ""
            : "";

          // Reset state for this request - important for handling multiple sequential requests
          const contentParts: string[] = [];
          const seenContent = new Set<string>(); // Track seen content to prevent duplicates
          finalOutput = ""; // Reset finalOutput for this request
          errorOccurred = false; // Reset error flag
          errorMessage = ""; // Reset error message
          
          console.log("=== Starting Agents SDK Runner ===");
          console.log("Message:", lastUserMessage.slice(0, 100));
          console.log("Conversation history length:", conversationHistory.length);
          console.log("OPENAI_API_KEY exists:", !!apiKey);
          console.log("Tools available:", tools.map(t => ({ name: t.name, description: t.description?.slice(0, 100) })));
          console.log("MCP Tool Agent instructions length:", currentMcpToolAgent.instructions?.length || 0);
          console.log("MCP_GATEWAY_URL:", MCP_GATEWAY_URL);
          
          // Declare timeout and heartbeat variables in outer scope for cleanup
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
          let startTime = Date.now();
          
          try {
            // Try with conversation history first, fallback to just last message if that fails
            let events: AsyncIterable<{ type: string; [key: string]: unknown }>;
            
            try {
              // The Runner.run() signature accepts conversation history as AgentInputItem[]
              // For version 0.3.2, try passing content as string for simple text messages
              const inputToPass = conversationHistory.map((item) => {
                // If content is an array with a single text block, simplify to just the text string
                if (Array.isArray(item.content) && item.content.length === 1 && item.content[0]?.type === "text") {
                  return {
                    role: item.role,
                    content: item.content[0].text,
                  };
                }
                // Otherwise keep the original format
                return item;
              });
              
              events = await runner.run(
                currentOrchestratorAgent,
                inputToPass.length > 0 ? inputToPass : [{ role: "user", content: lastUserMessage }],
                {
                  // Don't pass tools here - they're already on the agents
                  // Passing tools here AND on agents causes SDK to have undefined tools array during handoffs
                  maxTurns: 20, // Increased to allow for retry workflows (initial attempt + browser search + retry)
                  stream: true,
                },
              );
            } catch (runError) {
              console.log("Failed with conversation history, trying with last message only:", runError);
              // Fallback: try with just the last message as a simple string
              try {
                events = await runner.run(
                  currentOrchestratorAgent,
                  [{ role: "user", content: lastUserMessage }],
                  {
                    // Don't pass tools here - they're already on the agents
                    // Passing tools here AND on agents causes SDK to have undefined tools array during handoffs
                    maxTurns: 20, // Increased to allow for retry workflows (initial attempt + browser search + retry)
                    stream: true,
                  },
                );
              } catch (fallbackError) {
                // Both attempts failed - throw to outer catch
                throw fallbackError;
              }
            }
            
            // Send initial event to confirm connection
            eventStream.sendEvent({
              type: "system",
              timestamp: Date.now(),
              metadata: { message: "Agents SDK Runner started" },
            });
            
            // Set up timeout and heartbeat for long-running operations
            const PROCESSING_TIMEOUT_MS = 300_000; // 5 minutes max
            const HEARTBEAT_INTERVAL_MS = 10_000; // Send heartbeat every 10 seconds
            startTime = Date.now();
            let lastEventTime = Date.now();
            let lastHeartbeatTime = Date.now();
            
            // Create abort controller for timeout
            const abortController = new AbortController();
            timeoutId = setTimeout(() => {
              console.warn("Processing timeout reached, aborting...");
              abortController.abort();
            }, PROCESSING_TIMEOUT_MS);
            
            // Heartbeat interval
            heartbeatInterval = setInterval(() => {
              const elapsed = Math.floor((Date.now() - startTime) / 1000);
              const timeSinceLastEvent = Date.now() - lastEventTime;
              
              // Only send heartbeat if no events in last 10 seconds
              if (timeSinceLastEvent >= HEARTBEAT_INTERVAL_MS) {
                console.warn(`⚠️ No events received in ${Math.floor(timeSinceLastEvent / 1000)}s. Last event was ${Math.floor((Date.now() - lastEventTime) / 1000)}s ago. Total elapsed: ${elapsed}s`);
                eventStream.sendEvent({
                  type: "system",
                  timestamp: Date.now(),
                  metadata: { 
                    message: `Still processing... (${elapsed}s elapsed)`,
                    elapsedSeconds: elapsed,
                    category: "heartbeat",
                    warning: `No events in ${Math.floor(timeSinceLastEvent / 1000)}s`
                  },
                });
              }
            }, HEARTBEAT_INTERVAL_MS);
            
            // Collect all content from the streaming events.
            let eventCount = 0;
            let lastProgressUpdate = Date.now();
            const PROGRESS_UPDATE_INTERVAL = 5_000; // Update progress every 5 seconds
            
            try {
              for await (const event of events as AsyncIterable<{ 
                type: string; 
                output?: unknown; 
                error?: unknown;
                content?: string | unknown;
                text?: string;
                delta?: unknown;
                textDelta?: unknown;
                message?: unknown;
                agentMessage?: unknown;
                agent?: unknown;
                tool?: unknown;
                toolCall?: unknown;
                toolResult?: unknown;
              }>) {
                // Check for abort signal
                if (abortController.signal.aborted) {
                  throw new Error("Processing timeout: operation took too long");
                }
                
                eventCount++;
                lastEventTime = Date.now();
                const eventStr = JSON.stringify(event).slice(0, 300);
                console.log(`Event #${eventCount} - Type: ${event.type}`, eventStr);
                
                // Send progress update periodically
                const timeSinceLastProgress = Date.now() - lastProgressUpdate;
                if (timeSinceLastProgress >= PROGRESS_UPDATE_INTERVAL) {
                  eventStream.sendEvent({
                    type: "system",
                    timestamp: Date.now(),
                    metadata: { 
                      message: `Processing... (${eventCount} events processed)`,
                      eventCount: eventCount,
                      category: "progress"
                    },
                  });
                  lastProgressUpdate = Date.now();
                }
                
                // Log tool calls specifically and send progress event
                if (event.type === "toolCall" || (event as any).toolCall) {
                  const toolCall = (event as any).toolCall || event;
                  const toolName = toolCall.name || toolCall.tool || "unknown";
                  const toolInput = toolCall.input || toolCall.arguments || {};
                  console.log(`🔧 TOOL CALL: ${toolName}`, JSON.stringify(toolInput).slice(0, 200));
                  
                  // Send progress event for tool call
                  eventStream.sendEvent({
                    type: "system",
                    timestamp: Date.now(),
                    metadata: { 
                      message: `Calling tool: ${toolName}...`,
                      tool: toolName,
                      category: "tool_call_progress"
                    },
                  });
                }
                
                // Log tool results and send progress event
                if (event.type === "toolResult" || (event as any).toolResult) {
                  const toolResult = (event as any).toolResult || event;
                  const toolName = toolResult.name || toolResult.tool || "unknown";
                  console.log(`✅ TOOL RESULT: ${toolName}`, JSON.stringify(toolResult.result || toolResult.output || {}).slice(0, 200));
                  
                  // Send progress event for tool result
                  eventStream.sendEvent({
                    type: "system",
                    timestamp: Date.now(),
                    metadata: { 
                      message: `Tool ${toolName} completed`,
                      tool: toolName,
                      category: "tool_result_progress"
                    },
                  });
                }
              
              // Send MCP event to frontend for logging
              const timestamp = Date.now();
              const eventData: {
                type: string;
                timestamp: number;
                agent?: string;
                tool?: string;
                command?: string;
                result?: unknown;
                error?: string;
                metadata?: Record<string, unknown>;
              } = {
                type: event.type,
                timestamp,
              };

              // Extract agent information
              if ((event as any).agent) {
                eventData.agent = String((event as any).agent);
                // Send progress update for agent activity
                eventStream.sendEvent({
                  type: "system",
                  timestamp: Date.now(),
                  metadata: { 
                    message: `Agent ${eventData.agent} is working...`,
                    agent: eventData.agent,
                    category: "agent_progress"
                  },
                });
              } else if ((event as any).agentMessage?.agent) {
                eventData.agent = String((event as any).agentMessage.agent);
                // Send progress update for agent activity
                eventStream.sendEvent({
                  type: "system",
                  timestamp: Date.now(),
                  metadata: { 
                    message: `Agent ${eventData.agent} is working...`,
                    agent: eventData.agent,
                    category: "agent_progress"
                  },
                });
              }

              // Extract tool call information
              if ((event as any).toolCall) {
                const toolCall = (event as any).toolCall;
                eventData.tool = toolCall.name || toolCall.tool;
                eventData.command = toolCall.input?.command || toolCall.arguments?.command || JSON.stringify(toolCall.input || toolCall.arguments);
                eventData.metadata = { toolCall };
              } else if ((event as any).tool) {
                eventData.tool = String((event as any).tool);
              }

              // Extract tool result
              if ((event as any).toolResult) {
                const toolResult = (event as any).toolResult;
                eventData.result = toolResult.result || toolResult.output || toolResult;
                if (toolResult.error) {
                  eventData.error = String(toolResult.error);
                }
              }

              // Extract MCP command from tool calls
              if (eventData.tool === "mcp_proxy" && eventData.command) {
                eventData.metadata = { ...eventData.metadata, mcpCommand: eventData.command };
              }

              if (event.type === "error") {
                errorOccurred = true;
                errorMessage = event.error instanceof Error ? event.error.message : String(event.error);
                eventData.error = errorMessage;
                eventStream.sendEvent(eventData);
                console.error("Agent runner error:", event.error);
                break;
              } else if (event.type === "finalOutput") {
                // finalOutput events contain the complete response - use this as the primary source
                // IMPORTANT: Don't stream here if we've already streamed the content from other events
                // The finalOutput is just for setting the final value, not for streaming
                if (event.output !== undefined) {
                  if (typeof event.output === "string") {
                    const outputStr = event.output.trim();
                    // Use Set to track exact content strings
                    if (!seenContent.has(outputStr)) {
                      seenContent.add(outputStr);
                      finalOutput = outputStr;
                      // Only stream if we haven't already streamed this content
                      // Check if any of the content parts match this output
                      const alreadyStreamed = contentParts.some(part => {
                        const partTrimmed = part.trim();
                        return partTrimmed === outputStr || 
                               (partTrimmed.length > 0 && outputStr.includes(partTrimmed)) ||
                               (outputStr.length > 0 && partTrimmed.includes(outputStr));
                      });
                      if (!alreadyStreamed && outputStr.length > 0) {
                        eventStream.sendContent(outputStr);
                        contentParts.push(outputStr);
                      }
                    }
                  } else {
                    try {
                      const outputStr = JSON.stringify(event.output);
                      const outputHash = outputStr.trim();
                      if (!seenContent.has(outputHash)) {
                        seenContent.add(outputHash);
                        finalOutput = outputStr;
                        eventStream.sendContent(outputStr);
                        contentParts.push(outputStr);
                      }
                    } catch {
                      const outputStr = String(event.output);
                      const outputHash = outputStr.trim();
                      if (!seenContent.has(outputHash)) {
                        seenContent.add(outputHash);
                        finalOutput = outputStr;
                        eventStream.sendContent(outputStr);
                        contentParts.push(outputStr);
                      }
                    }
                  }
                }
                eventData.result = event.output;
                eventStream.sendEvent(eventData);
              } else if (event.type === "content" || event.type === "text" || event.type === "textDelta" || event.type === "delta") {
                // Collect streaming content from various event types
                const content = (event as any).content || (event as any).text || (event as any).textDelta || (event as any).delta;
                if (content) {
                  let contentStr: string;
                  // Handle array content (some SDK versions return content as array)
                  if (Array.isArray(content)) {
                    contentStr = content
                      .map((item: any) => {
                        if (typeof item === "string") return item;
                        if (typeof item === "object" && item !== null) {
                          return item.text || item.content || String(item);
                        }
                        return String(item);
                      })
                      .filter((text: any) => text && typeof text === "string")
                      .join("");
                  } else {
                    contentStr = typeof content === "string" ? content : String(content);
                  }
                  
                  if (contentStr.trim()) {
                    // Use Set to track exact content strings (more reliable than string includes)
                    const contentHash = contentStr.trim();
                    if (!seenContent.has(contentHash)) {
                      seenContent.add(contentHash);
                      contentParts.push(contentStr);
                      finalOutput = (finalOutput || "") + contentStr;
                      console.log("Collected content chunk:", contentStr.slice(0, 50));
                      // Stream content immediately
                      eventStream.sendContent(contentStr);
                    } else {
                      console.log("Skipping duplicate content chunk:", contentStr.slice(0, 50));
                    }
                  }
                }
                eventData.result = content;
                eventStream.sendEvent(eventData);
              } else if (event.type === "newMessage" || event.type === "message" || event.type === "agentMessage") {
                // Some SDK versions use newMessage/message/agentMessage events
                const message = event as any;
                let messageContent = message.content || message.text || message.message || (message.agentMessage?.content);
                
                // Handle array content (some SDK versions return content as array)
                if (Array.isArray(messageContent)) {
                  messageContent = messageContent
                    .map((item: any) => {
                      if (typeof item === "string") return item;
                      if (typeof item === "object" && item !== null) {
                        return item.text || item.content || String(item);
                      }
                      return String(item);
                    })
                    .filter((text: any) => text && typeof text === "string")
                    .join("");
                }
                
                if (messageContent && typeof messageContent === "string") {
                  const contentStr = messageContent.trim();
                  if (contentStr) {
                    // Use Set to track exact content strings
                    const contentHash = contentStr.trim();
                    if (!seenContent.has(contentHash)) {
                      seenContent.add(contentHash);
                      contentParts.push(contentStr);
                      finalOutput = (finalOutput || "") + contentStr;
                      console.log("Collected message content:", contentStr.slice(0, 50));
                      // Stream content immediately
                      eventStream.sendContent(contentStr);
                    } else {
                      console.log("Skipping duplicate message content:", contentStr.slice(0, 50));
                    }
                  }
                }
                eventData.result = messageContent;
                eventStream.sendEvent(eventData);
              } else if (event.type === "toolCall" || event.type === "toolResult") {
                // Explicitly handle tool call events
                eventStream.sendEvent(eventData);
              } else if (event.type === "raw_model_stream_event") {
                // Handle raw model stream events - these contain the actual response text
                const rawEvent = event as any;
                console.log(`Raw model stream event:`, JSON.stringify(rawEvent).slice(0, 200));
                
                // Extract content from various nested structures
                let extractedText = null;
                
                // Check data.event structure
                if (rawEvent.data?.event) {
                  const modelEvent = rawEvent.data.event;
                  // Look for text in various fields
                  if (modelEvent.text) {
                    extractedText = modelEvent.text;
                  } else if (modelEvent.content) {
                    // Handle array content
                    if (Array.isArray(modelEvent.content)) {
                      extractedText = modelEvent.content
                        .map((item: any) => {
                          if (typeof item === "string") return item;
                          if (typeof item === "object" && item !== null) {
                            return item.text || item.content || String(item);
                          }
                          return String(item);
                        })
                        .filter((text: any) => text && typeof text === "string")
                        .join("");
                    } else {
                      extractedText = modelEvent.content;
                    }
                  } else if (modelEvent.delta?.text) {
                    extractedText = modelEvent.delta.text;
                  } else if (modelEvent.delta?.content) {
                    // Handle array content in delta
                    if (Array.isArray(modelEvent.delta.content)) {
                      extractedText = modelEvent.delta.content
                        .map((item: any) => {
                          if (typeof item === "string") return item;
                          if (typeof item === "object" && item !== null) {
                            return item.text || item.content || String(item);
                          }
                          return String(item);
                        })
                        .filter((text: any) => text && typeof text === "string")
                        .join("");
                    } else {
                      extractedText = modelEvent.delta.content;
                    }
                  }
                }
                
                // Check data.response structure
                if (!extractedText && rawEvent.data?.response) {
                  const response = rawEvent.data.response;
                  if (response.output) {
                    // Output might be an array of items
                    if (Array.isArray(response.output)) {
                      const textItems = response.output
                        .map((item: any) => item.text || item.content || item.message?.text || item.message?.content)
                        .filter((text: any) => text && typeof text === "string")
                        .join("");
                      if (textItems) extractedText = textItems;
                    } else if (typeof response.output === "string") {
                      extractedText = response.output;
                    }
                  }
                  if (!extractedText && response.text) {
                    extractedText = response.text;
                  }
                  if (!extractedText && response.content) {
                    // Handle array content
                    if (Array.isArray(response.content)) {
                      extractedText = response.content
                        .map((item: any) => {
                          if (typeof item === "string") return item;
                          if (typeof item === "object" && item !== null) {
                            return item.text || item.content || String(item);
                          }
                          return String(item);
                        })
                        .filter((text: any) => text && typeof text === "string")
                        .join("");
                    } else {
                      extractedText = response.content;
                    }
                  }
                }
                
                // Check for text in the event itself
                if (!extractedText) {
                  if (rawEvent.text) extractedText = rawEvent.text;
                  else if (rawEvent.content) {
                    // Handle array content
                    if (Array.isArray(rawEvent.content)) {
                      extractedText = rawEvent.content
                        .map((item: any) => {
                          if (typeof item === "string") return item;
                          if (typeof item === "object" && item !== null) {
                            return item.text || item.content || String(item);
                          }
                          return String(item);
                        })
                        .filter((text: any) => text && typeof text === "string")
                        .join("");
                    } else {
                      extractedText = rawEvent.content;
                    }
                  } else if (rawEvent.data?.text) extractedText = rawEvent.data.text;
                  else if (rawEvent.data?.content) {
                    // Handle array content
                    if (Array.isArray(rawEvent.data.content)) {
                      extractedText = rawEvent.data.content
                        .map((item: any) => {
                          if (typeof item === "string") return item;
                          if (typeof item === "object" && item !== null) {
                            return item.text || item.content || String(item);
                          }
                          return String(item);
                        })
                        .filter((text: any) => text && typeof text === "string")
                        .join("");
                    } else {
                      extractedText = rawEvent.data.content;
                    }
                  }
                }
                
                if (extractedText && typeof extractedText === "string" && extractedText.trim()) {
                  const textStr = extractedText.trim();
                  // Use Set to track exact content strings
                  const contentHash = textStr;
                  if (!seenContent.has(contentHash)) {
                    seenContent.add(contentHash);
                    console.log(`Extracted text from raw_model_stream_event:`, textStr.slice(0, 100));
                    contentParts.push(textStr);
                    finalOutput = (finalOutput || "") + textStr;
                    eventStream.sendContent(textStr);
                  } else {
                    console.log(`Skipping duplicate text from raw_model_stream_event:`, textStr.slice(0, 100));
                  }
                }
                
                eventData.result = extractedText || rawEvent.data;
                eventStream.sendEvent(eventData);
              } else if (event.type === "run_item_stream_event") {
                // Handle run item stream events
                const runItemEvent = event as any;
                console.log(`Run item stream event:`, JSON.stringify(runItemEvent).slice(0, 200));
                
                // Extract text from run item events
                let extractedText = null;
                if (runItemEvent.item?.text) {
                  extractedText = runItemEvent.item.text;
                } else if (runItemEvent.item?.content) {
                  // Handle array content
                  if (Array.isArray(runItemEvent.item.content)) {
                    extractedText = runItemEvent.item.content
                      .map((item: any) => {
                        if (typeof item === "string") return item;
                        if (typeof item === "object" && item !== null) {
                          return item.text || item.content || String(item);
                        }
                        return String(item);
                      })
                      .filter((text: any) => text && typeof text === "string")
                      .join("");
                  } else {
                    extractedText = runItemEvent.item.content;
                  }
                } else if (runItemEvent.text) {
                  extractedText = runItemEvent.text;
                } else if (runItemEvent.content) {
                  // Handle array content
                  if (Array.isArray(runItemEvent.content)) {
                    extractedText = runItemEvent.content
                      .map((item: any) => {
                        if (typeof item === "string") return item;
                        if (typeof item === "object" && item !== null) {
                          return item.text || item.content || String(item);
                        }
                        return String(item);
                      })
                      .filter((text: any) => text && typeof text === "string")
                      .join("");
                  } else {
                    extractedText = runItemEvent.content;
                  }
                }
                
                if (extractedText && typeof extractedText === "string" && extractedText.trim()) {
                  const textStr = extractedText.trim();
                  // Use Set to track exact content strings
                  const contentHash = textStr;
                  if (!seenContent.has(contentHash)) {
                    seenContent.add(contentHash);
                    console.log(`Extracted text from run_item_stream_event:`, textStr.slice(0, 100));
                    contentParts.push(textStr);
                    finalOutput = (finalOutput || "") + textStr;
                    eventStream.sendContent(textStr);
                  } else {
                    console.log(`Skipping duplicate text from run_item_stream_event:`, textStr.slice(0, 100));
                  }
                }
                
                eventData.result = extractedText || runItemEvent.item || runItemEvent;
                eventStream.sendEvent(eventData);
              } else if (event.type === "run" || event.type === "runStart" || event.type === "runEnd") {
                // Handle run lifecycle events
                console.log(`Run event: ${event.type}`, eventStr);
                eventStream.sendEvent(eventData);
              } else if ((event as any).output !== undefined) {
                // Some events might have output directly
                const output = (event as any).output;
                const outputStr = typeof output === "string" ? output : JSON.stringify(output);
                if (outputStr && outputStr.trim()) {
                  // Use Set to track exact content strings
                  const contentHash = outputStr.trim();
                  if (!seenContent.has(contentHash)) {
                    seenContent.add(contentHash);
                    console.log(`Found output in event type ${event.type}:`, outputStr.slice(0, 100));
                    contentParts.push(outputStr);
                    finalOutput = (finalOutput || "") + outputStr;
                    eventStream.sendContent(outputStr);
                  } else {
                    console.log(`Skipping duplicate output from ${event.type}:`, outputStr.slice(0, 100));
                  }
                }
                eventData.result = output;
                eventStream.sendEvent(eventData);
              } else {
                // Log all other event types for debugging and send to frontend
                console.log(`Unhandled event type: ${event.type}`, eventStr);
                // Try to extract any text content from the event
                const eventAny = event as any;
                if (eventAny.text || eventAny.message || eventAny.response) {
                  const extractedText = eventAny.text || eventAny.message || eventAny.response;
                  const textStr = typeof extractedText === "string" ? extractedText : String(extractedText);
                  if (textStr && textStr.trim()) {
                    // Use Set to track exact content strings
                    const contentHash = textStr.trim();
                    if (!seenContent.has(contentHash)) {
                      seenContent.add(contentHash);
                      console.log(`Extracted text from ${event.type}:`, textStr.slice(0, 100));
                      contentParts.push(textStr);
                      finalOutput = (finalOutput || "") + textStr;
                      eventStream.sendContent(textStr);
                    } else {
                      console.log(`Skipping duplicate text from ${event.type}:`, textStr.slice(0, 100));
                    }
                  }
                }
                eventStream.sendEvent(eventData);
              }
            }
            
            // Cleanup timeout and heartbeat
            if (timeoutId) clearTimeout(timeoutId);
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            
            const totalTime = Math.floor((Date.now() - startTime) / 1000);
            console.log(`✅ Processed ${eventCount} events in ${totalTime}s, collected ${contentParts.length} content parts`);
            
            // If we collected content parts but no finalOutput, combine them (deduplicating)
            if (!finalOutput && contentParts.length > 0) {
              // Use Set to deduplicate - more reliable than string includes
              const uniqueParts: string[] = [];
              const seenParts = new Set<string>();
              for (const part of contentParts) {
                const partTrimmed = part.trim();
                if (partTrimmed && !seenParts.has(partTrimmed)) {
                  seenParts.add(partTrimmed);
                  uniqueParts.push(part);
                }
              }
              finalOutput = uniqueParts.join("");
              console.log(`Combined ${contentParts.length} content parts into ${uniqueParts.length} unique parts, finalOutput length: ${finalOutput.length}`);
            }
            
            // IMPORTANT: Don't stream finalOutput again if we've already streamed content incrementally
            // Content was streamed during the event loop, so we just need to close the stream
            if (finalOutput && finalOutput.trim().length > 0) {
              console.log("Content was streamed incrementally, closing stream");
              
              // Summarize long conversations if user is authenticated (async, don't block response)
              if (memoryService && conversation.length > 20) {
                memoryService.summarizeConversation(conversation).catch((summaryError) => {
                  console.error("Error summarizing conversation:", summaryError);
                });
              }
              
              eventStream.close();
              return new Response(eventStream.stream, {
                headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
              });
            } else if (contentParts.length > 0) {
              // If we have content parts but no finalOutput, send them (deduplicated)
              const uniqueParts: string[] = [];
              const seenParts = new Set<string>();
              for (const part of contentParts) {
                const partTrimmed = part.trim();
                if (partTrimmed && !seenParts.has(partTrimmed)) {
                  seenParts.add(partTrimmed);
                  uniqueParts.push(part);
                }
              }
              const combinedContent = uniqueParts.join("").trim();
              if (combinedContent) {
                console.log("Streaming combined content parts to client");
                eventStream.sendContent(combinedContent);
                
                // Summarize long conversations if user is authenticated (async, don't block response)
                if (memoryService && conversation.length > 20) {
                  memoryService.summarizeConversation(conversation).catch((summaryError) => {
                    console.error("Error summarizing conversation:", summaryError);
                  });
                }
                
                eventStream.close();
                return new Response(eventStream.stream, {
                  headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
                });
              }
            }
            
            // No content at all - fall back to direct API
            console.warn("No content generated from Agents SDK, will fall back to direct API");
            // Don't close the stream here - let it fall through to the direct API fallback
            // The direct API will use the same event stream
            useAgentsSdk = false;
            // Don't reset errorOccurred here - keep it as is
          } catch (runnerError) {
            // Cleanup timeout and heartbeat on error
            if (timeoutId) clearTimeout(timeoutId);
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            
            errorOccurred = true;
            errorMessage = runnerError instanceof Error ? runnerError.message : String(runnerError);
            console.error("=== Runner Error ===");
            console.error("Error message:", errorMessage);
            console.error("Error stack:", runnerError instanceof Error ? runnerError.stack : 'No stack trace');
            
            // Check if it's a timeout error
            if (errorMessage.includes("timeout") || errorMessage.includes("took too long")) {
              eventStream.sendEvent({
                type: "error",
                timestamp: Date.now(),
                error: "Processing timeout: The operation took longer than 5 minutes",
                metadata: { 
                  category: "timeout",
                  elapsedSeconds: Math.floor((Date.now() - startTime) / 1000)
                },
              });
              eventStream.sendContent("I apologize, but the operation took too long to complete. Please try breaking your request into smaller parts.");
              eventStream.close();
              return new Response(eventStream.stream, {
                headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
              });
            }
            
            // Check if this is the hosted_tool error
            const isHostedToolError = errorMessage.includes("hosted_tool") || errorMessage.includes("Unsupported tool type");
            
            if (isHostedToolError) {
              // This is a known SDK compatibility issue - don't log as error, just inform user
              // Send informational message to MCP Event Log (system log)
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: {
                  category: "sdk_compatibility",
                  sdkVersion: "0.3.2",
                  issue: "hosted_tool_not_supported",
                  action: "fallback_to_direct_api",
                  message: "Agents SDK compatibility: Using direct API mode. All features remain available.",
                },
              });
              // Don't send error event for this known issue - it's handled gracefully
            } else {
              // For other errors, send error event
              eventStream.sendEvent({
                type: "error",
                timestamp: Date.now(),
                error: errorMessage,
                metadata: { isHostedToolError: false },
              });
              // Send technical error to MCP Event Log
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                error: errorMessage,
                metadata: {
                  category: "runner_error",
                  action: "fallback_to_direct_api",
                },
              });
              // User-friendly message in chat
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: "Switching to direct API mode (fallback mode)" },
              });
            }
          }

          // If Runner succeeded but produced no output, fall back to direct API
          if (!errorOccurred && (!finalOutput || finalOutput.trim().length === 0)) {
            console.warn("No output from Runner, falling back to direct OpenAI API");
            useAgentsSdk = false;
          }
        } catch (sdkError) {
          console.error("Failed to initialize Runner, falling back to direct API:", sdkError);
          useAgentsSdk = false;
          errorOccurred = true;
          errorMessage = sdkError instanceof Error ? sdkError.message : String(sdkError);
          
          const isHostedToolError = errorMessage.includes("hosted_tool") || errorMessage.includes("Unsupported tool type");
          
          if (isHostedToolError) {
            // This is a known SDK compatibility issue - don't log as error, just inform user
            // Send informational message to MCP Event Log (system log)
            eventStream.sendEvent({
              type: "system",
              timestamp: Date.now(),
              metadata: {
                category: "sdk_compatibility",
                sdkVersion: "0.3.2",
                issue: "hosted_tool_not_supported",
                action: "fallback_to_direct_api",
                message: "Agents SDK compatibility: Using direct API mode. All features remain available.",
              },
            });
            // Don't send error event for this known issue - it's handled gracefully
          } else {
            // For other errors, send error event
            eventStream.sendEvent({
              type: "error",
              timestamp: Date.now(),
              error: errorMessage,
              metadata: { isHostedToolError: false },
            });
            // Send technical error to MCP Event Log
            eventStream.sendEvent({
              type: "system",
              timestamp: Date.now(),
              error: errorMessage,
              metadata: {
                category: "sdk_initialization_error",
                action: "fallback_to_direct_api",
                message: "Switching to direct API mode (fallback mode)",
              },
            });
          }
        }
        } catch (outerTryError) {
          // Catch any unhandled errors from the outer try block (line 592)
          console.error("Outer try block error:", outerTryError);
          errorOccurred = true;
          errorMessage = outerTryError instanceof Error ? outerTryError.message : String(outerTryError);
        }
      }

      // Use direct OpenAI API (Agents SDK disabled due to hosted_tool incompatibility)
      if (!useAgentsSdk || errorOccurred) {
        console.log("=== Using Direct OpenAI API ===");
        console.log("Reason:", errorOccurred ? "error" : "Agents SDK disabled (hosted_tool not supported)");
        if (errorOccurred) {
          console.log("Error message:", errorMessage);
        }
        
        // Send an immediate event to ensure stream starts (critical for frontend timeout detection)
        eventStream.sendEvent({
          type: "system",
          timestamp: Date.now(),
          metadata: { 
            message: "Processing with OpenAI API...",
            mode: "direct_api",
            reason: errorOccurred ? "error" : "sdk_incompatibility"
          },
        });
        // Also send initial content to ensure stream is active
        eventStream.sendContent(""); // Empty content just to establish stream
        
        // Enhanced system prompt for fallback mode with MCP command support
        const fallbackSystemPrompt = systemPrompt + "\n\n" +
          "🚨 CRITICAL RULES - READ CAREFULLY:\n" +
          "1. You CAN browse websites, send emails, search the web - DO NOT say 'I can't'\n" +
          "2. When user asks for actions, you MUST output MCP commands in your response\n" +
          "3. MCP commands MUST be in this exact format: `/mcp-server-name command_name param1=value1`\n" +
          "4. The system will automatically execute any MCP commands you output\n" +
          "5. DO NOT just give instructions - OUTPUT THE ACTUAL COMMANDS\n\n" +
          "EXAMPLE: User says 'send me a test email'\n" +
          "→ You MUST respond with: `/email-mcp send_test_email`\n" +
          "→ DO NOT say 'I can't send emails' - just output the command!\n\n" +
          "EXAMPLE: User says 'Find shuttle bus on Craigslist and email results'\n" +
          "→ You MUST respond with the commands:\n" +
          "   `/playwright-wrapper browser_navigate url=https://craigslist.org`\n" +
          "   `/playwright-wrapper browser_extract_text url=https://craigslist.org`\n" +
          "   `/email-mcp send_test_email body=[results]`\n\n" +
          "Available MCP commands:\n" +
          "- 🚨 SEND EMAIL: `/email-mcp send_test_email` - Send test email to logged-in user (email auto-detected)\n" +
          "  When user says 'send me a test email', 'send email', or 'email me' → Use: `/email-mcp send_test_email`\n" +
          "- 🌐 BROWSE WEBSITES: `/playwright-wrapper browser_navigate url=URL` - Navigate to any website\n" +
          "  `/playwright-wrapper browser_snapshot` - Get page structure\n" +
          "  `/playwright-wrapper browser_extract_text url=URL` - Extract all text from page\n" +
          "  When user asks to 'find X on website Y' or 'search website Z' → Use browser automation commands\n" +
          "- Search Grokipedia: `/grokipedia-mcp search query=\"TOPIC\"` (also works for 'Brockopedia', 'Broccopedia' variations)\n" +
          "- Get stock quote: `/alphavantage-mcp get_quote symbol=SYMBOL`\n" +
          "- Get stock chart: `/alphavantage-mcp get_stock_chart symbol=SYMBOL interval=1day range=3M`\n" +
          "- Search web: `/search-mcp web_search query=\"QUERY\"`\n" +
          "- Find businesses/locations: `/google-places-mcp search_places query=\"Starbucks in Des Moines\"` (returns formatted results with addresses, ratings, hours, and map links)\n" +
          "  When you receive Google Places results, format them nicely:\n" +
          "  - List each location with name, address, phone, rating\n" +
          "  - Show if open now (✅/❌)\n" +
          "  - Include map links for each location\n" +
          "\n" +
          "MULTI-STEP TASKS: You MUST output ALL commands in sequence. Example: 'Find shuttle bus on Craigslist and email results'\n" +
          "→ Step 1: `/playwright-wrapper browser_navigate url=https://craigslist.org`\n" +
          "→ Step 2: `/playwright-wrapper browser_extract_text url=https://craigslist.org` (to get results)\n" +
          "→ Step 3: `/email-mcp send_test_email subject=\"Shuttle Bus Listings from Craigslist\" body=[paste the extracted results here]`\n" +
          "\n" +
          "🚨 CRITICAL: When user asks to 'email results' or 'email the results', you MUST:\n" +
          "1. First get the data (browser_extract_text, search results, etc.)\n" +
          "2. IMMEDIATELY output the email command with the results in the body parameter\n" +
          "3. DO NOT wait or ask - just output both commands one after another\n" +
          "4. Format: `/email-mcp send_test_email subject=\"[descriptive subject]\" body=\"[the actual results/data]\"`\n" +
          "\n" +
          "DO NOT say 'I can't browse websites' or 'I can't send emails' - YOU CAN via MCP commands above.\n" +
          "  - Use clear formatting with emojis\n\n" +
          "IMPORTANT: Technical messages and system status go to the MCP Event Log (right panel), NOT the chat.\n" +
          "The chat is read aloud, so keep responses conversational. Technical details are logged separately.\n" +
          "- Create Canva design: `/canva-mcp create_design template=presentation text=\"TEXT\"`\n\n" +
          "IMPORTANT: For location/business queries (e.g., 'nearest Starbucks', 'find restaurants in X'), use Google Places API, NOT web search.\n" +
          "Examples: 'Find Starbucks in Des Moines' → `/google-places-mcp search_places query=\"Starbucks in Des Moines\"`\n\n" +
          "When you need to execute a command, format it exactly as shown above. The system will execute it and return results.";
        
        // Add timeout to prevent hanging
        const FETCH_TIMEOUT_MS = 60_000; // 60 seconds for initial connection
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          abortController.abort();
        }, FETCH_TIMEOUT_MS);
        
        let response: Response;
        try {
          response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: fallbackSystemPrompt },
                ...conversation,
              ],
              stream: true,
            }),
            signal: abortController.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.error("OpenAI API fetch timeout after", FETCH_TIMEOUT_MS, "ms");
            eventStream.sendEvent({
              type: "error",
              timestamp: Date.now(),
              error: "Request timeout: OpenAI API took too long to respond",
            });
            eventStream.sendContent("I apologize, but the request timed out. The API took too long to respond. Please try again.");
            eventStream.close();
            return new Response(eventStream.stream, {
              headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
            });
          }
          throw fetchError;
        }

        if (!response || !response.ok) {
          const errorText = response ? await response.text().catch(() => `Status: ${response.status}`) : "No response received";
          console.error("OpenAI API error:", response?.status || "no status", errorText);
          const errorMsg = `OpenAI API request failed: ${errorText}`;
          eventStream.sendEvent({
            type: "error",
            timestamp: Date.now(),
            error: errorMsg,
          });
          eventStream.sendContent(`I apologize, but I encountered an error: ${errorMsg}. Please try again.`);
          eventStream.close();
          
          return new Response(eventStream.stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
          });
        }

        if (!response.body) {
          eventStream.sendEvent({
            type: "error",
            timestamp: Date.now(),
            error: "No response body from OpenAI API",
          });
          eventStream.sendContent("I apologize, but I couldn't connect to the AI service. Please try again.");
          eventStream.close();
          
          return new Response(eventStream.stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
          });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";
        let hasContent = false;
        
        // Add timeout for reading stream
        const STREAM_READ_TIMEOUT_MS = 180_000; // 3 minutes max for streaming
        const streamStartTime = Date.now();

        while (true) {
          // Check overall timeout
          if (Date.now() - streamStartTime > STREAM_READ_TIMEOUT_MS) {
            console.error("Stream read timeout exceeded");
            reader.cancel();
            eventStream.sendEvent({
              type: "error",
              timestamp: Date.now(),
              error: "Stream read timeout: response took too long",
            });
            eventStream.sendContent("I apologize, but the response took too long to complete. Please try again.");
            eventStream.close();
            return new Response(eventStream.stream, {
              headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
            });
          }
          
          const { done, value } = await reader.read();
          if (done) break;
          
          textBuffer += decoder.decode(value, { stream: true });
          
          const lines = textBuffer.split("\n");
          textBuffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  finalOutput += content;
                  eventStream.sendContent(content);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        if (!finalOutput || finalOutput.trim().length === 0) {
          finalOutput = "I was not able to generate a response. Please try rephrasing your question or asking again in a moment.";
          eventStream.sendContent(finalOutput);
        } else {
          // Check if the response contains MCP commands and execute them
          // Match commands like: /grokipedia-mcp search query="nachos" or /playwright-wrapper browser_navigate url=...
          // Updated to match both -mcp servers and playwright-wrapper
          // More flexible regex to catch commands in various formats (with/without backticks, on new lines, etc.)
          const mcpCommandRegex = /`?(\/(?:[a-z-]+-mcp|playwright-wrapper|email-mcp)\s+[^\n`]+?)(?:`|$|\n)/gi;
          const matches = Array.from(finalOutput.matchAll(mcpCommandRegex)).map(m => m[1].trim());
          
          console.log("Checking for MCP commands in response. Final output length:", finalOutput.length);
          console.log("Found matches:", matches);
          
          if (matches && matches.length > 0) {
            console.log(`Found ${matches.length} MCP command(s) to execute`);
            // Found MCP commands - execute them
            const commandResults: Array<{ command: string; result: string }> = [];
            
            for (const match of matches) {
              const command = match.replace(/`/g, "").trim();
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: `Executing MCP command: ${command}` },
              });
              
              try {
            // Check if authentication is needed for this command
            // Some MCP commands require user-specific API keys from the key manager
            const requiresAuth = command.includes("google-places-mcp") || 
                                 command.includes("alphavantage-mcp") ||
                                 command.includes("twelvedata") ||
                                 command.includes("canva-mcp");
            
            if (requiresAuth && !authHeader) {
              eventStream.sendEvent({
                type: "error",
                timestamp: Date.now(),
                error: "Authentication Required",
                metadata: {
                  category: "authentication_required",
                  command: command,
                },
              });
              
              eventStream.sendContent(
                "🔐 **Authentication Required**\n\n" +
                "This command requires you to be logged in to access your personal API keys and settings.\n\n" +
                "**Why login?**\n" +
                "• Your API keys are encrypted and stored securely\n" +
                "• Your preferences and conversation history are saved\n" +
                "• The AI can remember context across sessions\n" +
                "• Your MCP server configurations are personalized\n\n" +
                "**How to login:**\n" +
                "1. Click the 'Sign in' button in the top right corner\n" +
                "2. Sign in with Google\n" +
                "3. Once logged in, you can use all features including API key management\n\n" +
                "All your data is encrypted and only accessible by you."
              );
              eventStream.close();
              return new Response(eventStream.stream, {
                headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
              });
            }
            
            // Execute MCP command with auth header from the original request
            const result = await executeMcpCommand(command, MCP_GATEWAY_URL, authHeader);
                commandResults.push({ command, result });
                
                eventStream.sendEvent({
                  type: "tool",
                  timestamp: Date.now(),
                  command: command,
                  result: result,
                });
                
                // Append result to final output
                finalOutput += `\n\n**Command Result:**\n${result}`;
                eventStream.sendContent(`\n\n**Command Result:**\n${result}`);
              } catch (cmdError) {
                const errorMsg = cmdError instanceof Error ? cmdError.message : String(cmdError);
                eventStream.sendEvent({
                  type: "error",
                  timestamp: Date.now(),
                  error: `Failed to execute MCP command: ${errorMsg}`,
                  metadata: { command },
                });
                finalOutput += `\n\n**Error executing command:** ${errorMsg}`;
                eventStream.sendContent(`\n\n**Error executing command:** ${errorMsg}`);
              }
            }
            
            // Check if this was a multi-step task that needs continuation
            // If user asked to "email results" and we just executed a data-gathering command,
            // automatically continue with the email step
            const lastUserMessage = conversation.length > 0 
              ? (typeof conversation[conversation.length - 1]?.content === 'string' 
                  ? conversation[conversation.length - 1].content 
                  : JSON.stringify(conversation[conversation.length - 1]?.content || ''))
              : '';
            
            const userWantsEmail = lastUserMessage.toLowerCase().includes('email') && 
                                   (lastUserMessage.toLowerCase().includes('result') || 
                                    lastUserMessage.toLowerCase().includes('send'));
            
            const justExecutedDataCommand = commandResults.some(cr => 
              cr.command.includes('browser_extract_text') || 
              cr.command.includes('browser_snapshot') || 
              cr.command.includes('web_search') ||
              cr.command.includes('search')
            );
            
            const hasEmailCommand = commandResults.some(cr => cr.command.includes('email-mcp'));
            
            // If user wants email, we got data, but didn't send email yet - continue automatically
            if (userWantsEmail && justExecutedDataCommand && !hasEmailCommand && commandResults.length > 0) {
              console.log("Detected incomplete multi-step task - continuing with email step");
              
              // Extract the results from the last data-gathering command
              let extractedResults = "";
              const lastDataResult = commandResults.find(cr => 
                cr.command.includes('browser_extract_text') || 
                cr.command.includes('browser_snapshot') || 
                cr.command.includes('web_search') ||
                cr.command.includes('search')
              );
              
              if (lastDataResult) {
                try {
                  // Try to parse and extract meaningful content
                  const parsed = JSON.parse(lastDataResult.result);
                  if (parsed.result?.content) {
                    extractedResults = parsed.result.content;
                  } else if (parsed.result?.data) {
                    extractedResults = JSON.stringify(parsed.result.data, null, 2);
                  } else if (parsed.invocation?.result?.content) {
                    extractedResults = parsed.invocation.result.content;
                  } else {
                    extractedResults = lastDataResult.result;
                  }
                } catch {
                  // If parsing fails, use the raw result
                  extractedResults = lastDataResult.result;
                }
              } else {
                extractedResults = commandResults[commandResults.length - 1]?.result || "Results from previous command";
              }
              
              // Create email command with results (truncate to avoid email size limits)
              const emailBody = extractedResults.replace(/"/g, '\\"').replace(/\n/g, '\\n').substring(0, 5000);
              const emailCommand = `/email-mcp send_test_email subject="Results from your search" body="${emailBody}"`;
              
              eventStream.sendEvent({
                type: "system",
                timestamp: Date.now(),
                metadata: { message: `Continuing multi-step task: sending email with results` },
              });
              
              try {
                const emailResult = await executeMcpCommand(emailCommand, MCP_GATEWAY_URL, authHeader);
                
                // Parse the result to check if it's an error
                let parsedResult;
                try {
                  parsedResult = JSON.parse(emailResult);
                } catch {
                  parsedResult = { result: { type: "text", content: emailResult } };
                }
                
                eventStream.sendEvent({
                  type: "tool",
                  timestamp: Date.now(),
                  command: emailCommand,
                  result: emailResult,
                });
                
                // Check if the result indicates an error
                if (parsedResult.result?.type === "error") {
                  const errorMsg = parsedResult.result.message || parsedResult.result.content || "Unknown error";
                  const errorDetails = parsedResult.result.details;
                  
                  eventStream.sendEvent({
                    type: "error",
                    timestamp: Date.now(),
                    error: `Email sending failed: ${errorMsg}`,
                    metadata: { command: emailCommand, details: errorDetails },
                  });
                  
                  let errorMessage = `\n\n**❌ Email sending failed:** ${errorMsg}\n\n`;
                  if (errorDetails?.explanation) {
                    errorMessage += `**Why:** ${errorDetails.explanation}\n\n`;
                  }
                  if (errorDetails?.steps) {
                    errorMessage += `**How to fix:**\n${errorDetails.steps.map((s: string) => `- ${s}`).join('\n')}\n\n`;
                  }
                  if (errorDetails?.note) {
                    errorMessage += `**Note:** ${errorDetails.note}\n`;
                  }
                  
                  eventStream.sendContent(errorMessage);
                } else {
                  // Success
                  eventStream.sendContent(`\n\n**✅ Email sent successfully!** Check your inbox for the results.`);
                }
              } catch (emailError) {
                const errorMsg = emailError instanceof Error ? emailError.message : String(emailError);
                console.error("Email command execution error:", emailError);
                eventStream.sendEvent({
                  type: "error",
                  timestamp: Date.now(),
                  error: `Failed to execute email command: ${errorMsg}`,
                  metadata: { command: emailCommand },
                });
                eventStream.sendContent(`\n\n**❌ Error sending email:** ${errorMsg}\n\n**Troubleshooting:**\n1. Make sure you're signed in with Google OAuth\n2. Grant Gmail permissions when prompted\n3. Check the MCP Event Log for detailed error messages`);
              }
            }
          }
        }
        
        // Summarize long conversations if user is authenticated (async, don't block response)
        if (memoryService && conversation.length > 20) {
          memoryService.summarizeConversation(conversation).catch((summaryError) => {
            console.error("Error summarizing conversation:", summaryError);
          });
        }
        
        eventStream.close();
        return new Response(eventStream.stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }
    }

    if (selectedProvider === "anthropic") {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      // Add timeout to prevent hanging
      const FETCH_TIMEOUT_MS = 60_000; // 60 seconds for initial connection
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, FETCH_TIMEOUT_MS);
      
      let response: Response;
      try {
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            system: systemPrompt,
            max_tokens: 1024,
            messages: mapMessagesForAnthropic(conversation),
          }),
          signal: abortController.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error("Anthropic API fetch timeout after", FETCH_TIMEOUT_MS, "ms");
          const errorStream = createEventStream(corsHeaders);
          errorStream.sendEvent({
            type: "error",
            timestamp: Date.now(),
            error: "Request timeout: Anthropic API took too long to respond",
          });
          errorStream.sendContent("I apologize, but the request timed out. The API took too long to respond. Please try again.");
          errorStream.close();
          return new Response(errorStream.stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
          });
        }
        throw fetchError;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Anthropic error:", response.status, errorText);
        // Return stream even for provider errors
        const errorStream = createEventStream(corsHeaders);
        errorStream.sendEvent({
          type: "error",
          timestamp: Date.now(),
          error: `Anthropic request failed: ${errorText}`,
          metadata: { category: "provider_error", status: response.status },
        });
        errorStream.sendContent("I apologize, but there was an error with the Anthropic API. Please try again.");
        errorStream.close();
        return new Response(errorStream.stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const data = await response.json();
      const text = Array.isArray(data?.content)
        ? data.content
            .map((part: { text?: string }) => part?.text ?? "")
            .join("\n")
            .trim()
        : "";

      // Summarize long conversations if user is authenticated (async, don't block response)
      if (memoryService && conversation.length > 20) {
        memoryService.summarizeConversation(conversation).catch((summaryError) => {
          console.error("Error summarizing conversation:", summaryError);
        });
      }

      return respondWithStreamedText(text, corsHeaders);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // Add timeout to prevent hanging
    const FETCH_TIMEOUT_MS = 60_000; // 60 seconds for initial connection
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, FETCH_TIMEOUT_MS);
    
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemPrompt }],
            },
            contents: mapMessagesForGemini(conversation),
          }),
          signal: abortController.signal,
        },
      );
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error("Gemini API fetch timeout after", FETCH_TIMEOUT_MS, "ms");
        const errorStream = createEventStream(corsHeaders);
        errorStream.sendEvent({
          type: "error",
          timestamp: Date.now(),
          error: "Request timeout: Gemini API took too long to respond",
        });
        errorStream.sendContent("I apologize, but the request timed out. The API took too long to respond. Please try again.");
        errorStream.close();
        return new Response(errorStream.stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini error:", response.status, errorText);
      // Return stream even for provider errors
      const errorStream = createEventStream(corsHeaders);
      errorStream.sendEvent({
        type: "error",
        timestamp: Date.now(),
        error: `Gemini request failed: ${errorText}`,
        metadata: { category: "provider_error", status: response.status },
      });
      errorStream.sendContent("I apologize, but there was an error with the Gemini API. Please try again.");
      errorStream.close();
      return new Response(errorStream.stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text ?? "")
      .join("\n")
      .trim() ?? "";

    // Summarize long conversations if user is authenticated
    if (memoryService && conversation.length > 20) {
      try {
        await memoryService.summarizeConversation(conversation);
      } catch (summaryError) {
        console.error("Error summarizing conversation:", summaryError);
        // Don't fail the request if summarization fails
      }
    }

    return respondWithStreamedText(text, corsHeaders);
  } catch (error) {
    console.error("=== Chat Function Error ===");
    console.error("Timestamp:", new Date().toISOString());
    console.error("Error type:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 1000));
    
    // Ensure error is logged even if eventStream fails
    try {
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Always return a stream, even for errors
    eventStream.sendEvent({
      type: "system",
      timestamp: Date.now(),
      error: errorMessage,
      metadata: {
        category: "function_error",
        stack: errorStack,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
    });
    eventStream.sendContent(`I apologize, but I encountered an error processing your request. Please try again.`);
    eventStream.close();
    
    return new Response(eventStream.stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
    } catch (streamError) {
      console.error("Failed to send error via stream:", streamError);
      // Fallback: return a simple error response
      return new Response(
        JSON.stringify({ error: "Internal server error", message: error instanceof Error ? error.message : String(error) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  }
});
