import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  Agent,
  type AgentInputItem,
  type Handoff,
  type Tool,
  Runner,
} from "https://esm.sh/@openai/agents@0.0.9";

type Provider = "openai" | "anthropic" | "gemini";

const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",").map(origin => origin.trim()) ?? ["*"];
const SYSTEM_PROMPT =
  "You are a helpful AI research assistant speaking aloud through text-to-speech. Respond in natural spoken sentences, avoid stage directions, asterisks, or emojis, and keep punctuation simple so it sounds good when read aloud. Provide clear answers, cite important facts conversationally, and offer actionable insight when useful.";

const encoder = new TextEncoder();

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const MCP_GATEWAY_URL = PROJECT_URL ? `${PROJECT_URL.replace(/\/+$/, "")}/functions/v1/mcp` : "";

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

// --- Multi-agent setup using OpenAI Agents SDK for the OpenAI provider ---

const mcpProxyTool: Tool = {
  name: "mcp_proxy",
  description:
    "Executes a registered MCP command via the slashmcp backend. Input must be a string in the format: /<server-id> <command> [param=value...]",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: 'The full MCP command string, e.g., "/alphavantage-mcp get_stock_chart symbol=NVDA"',
      },
    },
    required: ["command"],
  },
  async run({ command }: { command: string }) {
    if (!MCP_GATEWAY_URL) {
      return "MCP gateway URL is not configured on the server.";
    }

    const trimmed = (command ?? "").trim();
    if (!trimmed.startsWith("/")) {
      return 'Invalid MCP command format. Expected something like "/alphavantage-mcp get_quote symbol=NVDA".';
    }

    const [serverAndSuffix, ...paramTokens] = trimmed.split(/\s+/);
    const serverId = serverAndSuffix.slice(1); // strip leading "/"

    // Assume the first token after the server id is the MCP command name.
    let mcpCommand: string | undefined;
    const args: Record<string, string> = {};

    if (paramTokens.length > 0) {
      mcpCommand = paramTokens.shift()!;
    }

    for (const token of paramTokens) {
      const eqIndex = token.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = token.slice(0, eqIndex);
      const value = token.slice(eqIndex + 1);
      args[key] = value;
    }

    try {
      const response = await fetch(MCP_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverId,
          command: mcpCommand,
          args,
          positionalArgs: [],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `MCP gateway request failed with status ${response.status}${
            errorText ? `: ${errorText.slice(0, 200)}` : ""
          }`,
        );
      }

      const data = await response.json();
      return JSON.stringify(data, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error executing MCP command: ${message}`;
    }
  },
};

const mcpToolAgent = new Agent({
  name: "MCP_Tool_Agent",
  instructions:
    "You are an expert in executing Model Context Protocol (MCP) commands. Your only tool is the `mcp_proxy`. " +
    "When a user request requires external data or a specific tool, you must formulate the correct MCP command and use the `mcp_proxy` tool. " +
    "You can call any registered MCP server, including:\n" +
    "- `alphavantage-mcp` for stock and market data (use ticker symbols like AAPL, NVDA)\n" +
    "- `polymarket-mcp` for prediction market odds (IMPORTANT: Market IDs must be exact slugs from Polymarket. Common formats: 'will-x-win-y-election-2024', 'will-trump-win-2024', etc. If a market is not found, inform the user that the exact market slug is required and suggest they check Polymarket.com for the correct ID)\n" +
    "- `gemini-mcp` for lightweight text generation\n" +
    "- `playwright-mcp` or `playwright-wrapper` for browser automation, web scraping, and recursive testing\n" +
    "- `search-mcp` for web search results\n" +
    "For browser automation, web scraping, or research tasks:\n" +
    "- Use `playwright-wrapper` (or `srv_...` ID) with commands like `browser_navigate`, `browser_snapshot`, `browser_extract_text`\n" +
    "- For recursive testing of the app itself, navigate to the app URL, get snapshots, and interact with elements\n" +
    "- For research, extract text content from pages and analyze it\n" +
    "When researching websites or testing apps, use browser automation to:\n" +
    "1. Navigate to the URL with `browser_navigate url=...`\n" +
    "2. Get page structure with `browser_snapshot url=...`\n" +
    "3. Extract text with `browser_extract_text url=...` (if available)\n" +
    "4. Take screenshots with `browser_take_screenshot url=...` if visual analysis is needed\n" +
    "IMPORTANT: If an MCP command fails, return the error message to the user clearly. For Polymarket, if a market is not found, explain that the market ID must match the exact slug from Polymarket's website.\n" +
    "Do not answer questions directly; instead, call the tool and return its results.",
  tools: [mcpProxyTool],
});

const finalAnswerAgent = new Agent({
  name: "Final_Answer_Agent",
  instructions:
    "You are the final response generator. Your task is to take the results from the MCP_Tool_Agent and the user's original query, " +
    "and synthesize a concise, helpful, and professional final answer. Do not use any tools.",
});

const mcpHandoff: Handoff = {
  name: "handoff_to_mcp_tool",
  description:
    "Use this handoff when the user's request requires external data or tool execution (e.g., stock prices, market odds, document analysis).",
  targetAgent: mcpToolAgent,
  inputFilter: (input: AgentInputItem[]) => input,
};

const finalHandoff: Handoff = {
  name: "handoff_to_final_answer",
  description: "Use this handoff after the MCP_Tool_Agent has executed its command and returned a result.",
  targetAgent: finalAnswerAgent,
  inputFilter: (input: AgentInputItem[]) => input,
};

const orchestratorAgent = new Agent({
  name: "Orchestrator_Agent",
  instructions:
    "Your primary goal is to determine the best course of action to answer the user's question. " +
    "If the request is a simple chat, answer directly. " +
    "If it requires external data or a tool (like stock prices, prediction markets, document analysis, or browser automation with Playwright), " +
    "use the `handoff_to_mcp_tool` handoff so the MCP_Tool_Agent can call MCP servers via the `mcp_proxy` tool. " +
    "For example, when the user asks you to visit a website, scrape information from a page, or generate/repair Playwright tests, " +
    "you should trigger `handoff_to_mcp_tool` so it can use the `playwright-mcp` server. " +
    "If you receive tool results and further synthesis is needed, use the `handoff_to_final_answer` handoff.",
  handoffs: [mcpHandoff, finalHandoff],
});

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { messages, provider } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedProvider = (provider ?? "openai") as string;
    const selectedProvider: Provider =
      normalizedProvider === "anthropic" || normalizedProvider === "gemini" ? normalizedProvider : "openai";

    const conversation = messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: typeof message.content === "string" ? message.content : String(message.content),
    }));

    if (selectedProvider === "openai") {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
      }

      // Try using OpenAI Agents SDK first, fall back to direct API if it fails
      let useAgentsSdk = true;
      let finalOutput = "";
      let errorOccurred = false;
      let errorMessage = "";

      if (useAgentsSdk) {
        try {
          // Create runner with API key for this request
          const runner = new Runner({
            model: "gpt-4o-mini",
            apiKey: apiKey,
          });

          // Pass conversation history - Agents SDK Runner handles full context
          // Convert conversation to AgentInputItem format
          const conversationHistory: AgentInputItem[] = conversation.map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }));

          const lastUserMessage = conversation.length
            ? conversation[conversation.length - 1]?.content ?? ""
            : "";

          const contentParts: string[] = [];
          console.log("Starting Runner with message:", lastUserMessage.slice(0, 100));
          console.log("Conversation history length:", conversationHistory.length);

          try {
            // Try with conversation history first, fallback to just last message if that fails
            let events: AsyncIterable<{ type: string; [key: string]: unknown }>;
            
            try {
              // The Runner.run() signature might accept conversation history differently
              // Try passing it as part of the input
              events = await runner.run(
                orchestratorAgent,
                conversationHistory.length > 1 ? conversationHistory : lastUserMessage,
                {
                  tools: [mcpProxyTool],
                  maxTurns: 15,
                  stream: true,
                },
              );
            } catch (runError) {
              console.log("Failed with conversation history, trying with last message only:", runError);
              // Fallback: try with just the last message
              events = await runner.run(
                orchestratorAgent,
                lastUserMessage,
                {
                  tools: [mcpProxyTool],
                  maxTurns: 15,
                  stream: true,
                },
              );
            }

            // Collect all content from the streaming events.
            let eventCount = 0;
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
            }>) {
              eventCount++;
              const eventStr = JSON.stringify(event).slice(0, 300);
              console.log(`Event #${eventCount} - Type: ${event.type}`, eventStr);
              
              if (event.type === "error") {
                errorOccurred = true;
                errorMessage = event.error instanceof Error ? event.error.message : String(event.error);
                console.error("Agent runner error:", event.error);
                break;
              } else if (event.type === "finalOutput") {
                if (event.output !== undefined) {
                  if (typeof event.output === "string") {
                    finalOutput = event.output;
                    contentParts.push(event.output);
                  } else {
                    try {
                      const outputStr = JSON.stringify(event.output);
                      finalOutput = outputStr;
                      contentParts.push(outputStr);
                    } catch {
                      finalOutput = String(event.output);
                      contentParts.push(finalOutput);
                    }
                  }
                }
              } else if (event.type === "content" || event.type === "text" || event.type === "textDelta" || event.type === "delta") {
                // Collect streaming content from various event types
                const content = (event as any).content || (event as any).text || (event as any).textDelta || (event as any).delta;
                if (content) {
                  const contentStr = typeof content === "string" ? content : String(content);
                  if (contentStr.trim()) {
                    contentParts.push(contentStr);
                    console.log("Collected content chunk:", contentStr.slice(0, 50));
                  }
                }
              } else if (event.type === "newMessage" || event.type === "message" || event.type === "agentMessage") {
                // Some SDK versions use newMessage/message/agentMessage events
                const message = event as any;
                const messageContent = message.content || message.text || message.message || (message.agentMessage?.content);
                if (messageContent && typeof messageContent === "string") {
                  contentParts.push(messageContent);
                  console.log("Collected message content:", messageContent.slice(0, 50));
                }
              } else {
                // Log all other event types for debugging
                console.log(`Unhandled event type: ${event.type}`, eventStr);
              }
            }
            
            console.log(`Processed ${eventCount} events, collected ${contentParts.length} content parts`);
            
            // If we collected content parts but no finalOutput, combine them
            if (!finalOutput && contentParts.length > 0) {
              finalOutput = contentParts.join("");
            }
          } catch (runnerError) {
            errorOccurred = true;
            errorMessage = runnerError instanceof Error ? runnerError.message : String(runnerError);
            console.error("Runner execution error:", runnerError);
            console.error("Error stack:", runnerError instanceof Error ? runnerError.stack : "No stack");
          }

          // If Runner succeeded but produced no output, fall back to direct API
          if (!errorOccurred && (!finalOutput || finalOutput.trim().length === 0)) {
            console.warn("No output from Runner, falling back to direct OpenAI API");
            useAgentsSdk = false;
          }
        } catch (sdkError) {
          console.error("Failed to initialize Runner, falling back to direct API:", sdkError);
          useAgentsSdk = false;
        }
      }

      // Fallback to direct OpenAI API if Agents SDK didn't work
      if (!useAgentsSdk || errorOccurred) {
        console.log("Using direct OpenAI API");
        
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...conversation,
            ],
            stream: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("OpenAI API error:", response.status, errorText);
          throw new Error(`OpenAI API request failed: ${errorText}`);
        }

        if (!response.body) {
          throw new Error("No response body from OpenAI API");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";

        while (true) {
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
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        if (!finalOutput || finalOutput.trim().length === 0) {
          finalOutput = "I was not able to generate a response. Please try rephrasing your question or asking again in a moment.";
        }
      }

      return respondWithStreamedText(finalOutput, corsHeaders);
    }

    if (selectedProvider === "anthropic") {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          system: SYSTEM_PROMPT,
          max_tokens: 1024,
          messages: mapMessagesForAnthropic(conversation),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Anthropic error:", response.status, errorText);
        return new Response(JSON.stringify({ error: "Anthropic request failed" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const text = Array.isArray(data?.content)
        ? data.content
            .map((part: { text?: string }) => part?.text ?? "")
            .join("\n")
            .trim()
        : "";

      return respondWithStreamedText(text, corsHeaders);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: mapMessagesForGemini(conversation),
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Gemini request failed" }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text ?? "")
      .join("\n")
      .trim() ?? "";

    return respondWithStreamedText(text, corsHeaders);
  } catch (error) {
    console.error("chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
