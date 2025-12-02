import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",").map(origin => origin.trim()) ?? ["*"];

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
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const formData = await req.formData();
    const audio = formData.get("audio");
    const language = formData.get("language")?.toString();

    if (!(audio instanceof File)) {
      return new Response(JSON.stringify({ error: "Missing audio file payload." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const whisperPayload = new FormData();
    whisperPayload.append("model", "whisper-1");
    whisperPayload.append("response_format", "json");
    if (language) {
      whisperPayload.append("language", language);
    }
    whisperPayload.append("file", audio, audio.name || "audio.webm");

    // Add timeout to prevent hanging
    const WHISPER_TIMEOUT_MS = 120_000; // 2 minutes for audio transcription
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, WHISPER_TIMEOUT_MS);
    
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
        },
        body: whisperPayload,
        signal: abortController.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error("Whisper API fetch timeout after", WHISPER_TIMEOUT_MS, "ms");
        return new Response(
          JSON.stringify({ error: "Transcription timeout: The request took too long to complete. Please try again with a shorter audio clip." }),
          {
            status: 408,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw fetchError;
    }

    const bodyText = await response.text();

    if (!response.ok) {
      console.error("Whisper transcription failed", response.status, bodyText);
      return new Response(bodyText || "Whisper transcription failed", {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(bodyText);
    } catch (error) {
      console.error("Failed to parse Whisper response", error);
      parsed = { text: bodyText };
    }

    const payload = {
      text: typeof parsed.text === "string" ? parsed.text : "",
      language: typeof parsed.language === "string" ? parsed.language : language,
      duration: typeof parsed.duration === "number" ? parsed.duration : undefined,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("whisper edge function error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred while transcribing audio.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

