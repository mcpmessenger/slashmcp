import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImageGenerationRequest {
  prompt?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  imageCount?: number;
  provider?: "gemini";
}

type InlineImagePart =
  | {
      inlineData?: {
        data?: string;
        mimeType?: string;
        width?: number;
        height?: number;
      };
    }
  | {
      inline_data?: {
        data?: string;
        mime_type?: string;
        width?: number;
        height?: number;
      };
    };

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_BASE = Deno.env.get("GEMINI_API_BASE") ?? "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") ?? "gemini-2.5-flash-image";

function normalizeCount(value: unknown, fallback = 1, min = 1, max = 4): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function sanitizeAspectRatio(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Gemini currently supports ratios like "1:1", "3:4", "16:9"
  if (!/^\d{1,2}:\d{1,2}$/.test(trimmed)) return undefined;
  return trimmed;
}

function extractInlineData(part: InlineImagePart) {
  const inline = "inlineData" in part ? part.inlineData : (part as { inline_data?: InlineImagePart["inline_data"] }).inline_data;
  if (!inline || typeof inline !== "object") return null;
  const data = inline.data;
  if (typeof data !== "string" || data.length === 0) return null;
  const mimeType = inline.mimeType ?? (inline as { mime_type?: string }).mime_type ?? "image/png";
  const width = inline.width ?? (inline as { width?: number }).width ?? null;
  const height = inline.height ?? (inline as { height?: number }).height ?? null;
  return { data, mimeType, width, height };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: ImageGenerationRequest = await req.json();
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageCount = normalizeCount(body.imageCount);
    const aspectRatio = sanitizeAspectRatio(body.aspectRatio);

    const contents = [
      {
        role: "user",
        parts: [
          { text: prompt },
          ...(body.negativePrompt?.trim()
            ? [{ text: `Avoid the following details: ${body.negativePrompt.trim()}` }]
            : []),
        ],
      },
    ];

    const requestPayload: Record<string, unknown> = {
      contents,
    };
    if (imageCount > 1) {
      requestPayload.generationConfig = { candidateCount: imageCount };
    }
    if (aspectRatio) {
      requestPayload.imageGenerationConfig = { aspectRatio };
    }

    const response = await fetch(
      `${GEMINI_API_BASE}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini image generation error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Gemini request failed", details: errorText }), {
        status: response.status === 200 ? 500 : response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

    const images = candidates
      .flatMap((candidate: Record<string, unknown>) => {
        const parts = candidate?.content?.parts;
        if (!Array.isArray(parts)) return [];
        return parts
          .map((part: unknown) => (part && typeof part === "object" ? extractInlineData(part as InlineImagePart) : null))
          .filter((value): value is { data: string; mimeType: string; width: number | null; height: number | null } => value !== null);
      })
      .map((image, index) => ({
        base64: image.data,
        mimeType: image.mimeType ?? "image/png",
        width: image.width,
        height: image.height,
        index,
      }));

    const safetyRatings = candidates.map((candidate: Record<string, unknown>) => candidate?.safetyRatings ?? null);
    const finishReasons = candidates.map((candidate: Record<string, unknown>) => candidate?.finishReason ?? null);

    return new Response(
      JSON.stringify({
        provider: "gemini",
        prompt,
        imageCountRequested: imageCount,
        aspectRatio,
        images,
        safetyRatings,
        finishReasons,
        promptFeedback: data?.promptFeedback ?? null,
        usageMetadata: data?.usageMetadata ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("image-generator error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error generating image" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});


