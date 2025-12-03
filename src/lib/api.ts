import { supabaseClient } from "./supabaseClient";

export type AnalysisTarget = "document-analysis" | "image-ocr" | "image-generation" | "audio-transcription";

export interface UploadJobResponse {
  jobId: string;
  storagePath: string;
  uploadUrl: string | null;
  message?: string;
}

const textractFunctionPath = "/textract-worker";
const jobStatusPath = "/job-status";
const visionPath = "/vision-worker";
const imageGenerationPath = "/image-generator";

const FUNCTIONS_URL =
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
  (import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
    : undefined);

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Get authentication headers using the signed-in user's session token
 * This allows edge functions to access the user's OAuth provider tokens
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Get the user's session token - this allows edge functions to access OAuth provider tokens
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session?.access_token) {
    // Use the user's session token so edge functions can extract OAuth provider tokens
    headers.Authorization = `Bearer ${session.access_token}`;
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
    }
  } else if (SUPABASE_ANON_KEY) {
    // Fallback to anon key if not signed in
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
}

if (!FUNCTIONS_URL) {
  console.warn("Missing VITE_SUPABASE_FUNCTIONS_URL. Upload API calls will fail until configured.");
}

export async function registerUploadJob(params: {
  file: File;
  analysisTarget: AnalysisTarget;
  metadata?: Record<string, unknown>;
  userId?: string;
}): Promise<UploadJobResponse> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const body = {
    fileName: params.file.name,
    fileType: params.file.type || "application/octet-stream",
    fileSize: params.file.size,
    analysisTarget: params.analysisTarget,
    metadata: params.metadata ?? {},
    userId: params.userId,
  };

  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_URL}/uploads`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to register upload job");
  }

  return response.json();
}

export async function updateJobStage(jobId: string, stage: "registered" | "uploaded" | "processing" | "extracted" | "injected" | "failed"): Promise<void> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_URL}/uploads`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ jobId, stage }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to update job stage");
  }
}

export async function triggerTextractJob(jobId: string): Promise<void> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const TRIGGER_TEXTRACT_TIMEOUT_MS = 30_000; // 30 seconds
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, TRIGGER_TEXTRACT_TIMEOUT_MS);

  try {
    const headers = await getAuthHeaders();
    const url = `${FUNCTIONS_URL}${textractFunctionPath}`;
    console.log(`[triggerTextractJob] Calling: ${url}`, { jobId });
    
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jobId }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[triggerTextractJob] Failed: ${response.status} ${errorText}`);
      const error = await response.json().catch(() => ({ error: errorText }));
      throw new Error(error?.error || `Failed to trigger Textract job: ${response.status} ${errorText}`);
    }
    
    console.log(`[triggerTextractJob] Success for job ${jobId}`);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[triggerTextractJob] Timeout after ${TRIGGER_TEXTRACT_TIMEOUT_MS}ms`);
      throw new Error(`Textract job trigger timed out after ${TRIGGER_TEXTRACT_TIMEOUT_MS}ms`);
    }
    console.error(`[triggerTextractJob] Error:`, error);
    throw error;
  }
}

export interface JobStatusResponse {
  job: {
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    status: string;
    metadata: Record<string, unknown> | null;
    analysis_target: string;
    storage_path: string | null;
    created_at: string;
    updated_at: string;
  };
  result:
    | {
        id: string;
        job_id: string | null;
        ocr_text: string | null;
        textract_response: Record<string, unknown> | null;
        summary: Record<string, unknown> | null;
        vision_summary: string | null;
        vision_metadata: Record<string, unknown> | null;
        vision_provider: string | null;
        vision_cost: Record<string, unknown> | null;
        created_at: string;
      }
    | null;
}

export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const FETCH_STATUS_TIMEOUT_MS = 10_000; // 10 seconds
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, FETCH_STATUS_TIMEOUT_MS);

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${FUNCTIONS_URL}${jobStatusPath}?jobId=${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers,
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.error || "Failed to fetch job status");
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Job status fetch timed out after ${FETCH_STATUS_TIMEOUT_MS}ms`);
    }
    throw error;
  }
}

export async function triggerVisionJob(params: {
  jobId: string;
  provider: "gpt4o" | "gemini";
}): Promise<void> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_URL}${visionPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobId: params.jobId, provider: params.provider }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to trigger vision job");
  }
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  index?: number;
}

export interface ImageGenerationResponse {
  provider: "gemini" | "openai";
  prompt: string;
  imageCountRequested: number;
  aspectRatio?: string;
  images: GeneratedImage[];
  safetyRatings?: unknown[];
  finishReasons?: unknown[];
  promptFeedback?: unknown;
  usageMetadata?: unknown;
}

export async function generateImages(params: {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  imageCount?: number;
}): Promise<ImageGenerationResponse> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_URL}${imageGenerationPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (error?.details as string | undefined) ??
      (error?.error as string | undefined) ??
      `Failed to generate image (status ${response.status})`;
    throw new Error(message);
  }

  const payload = (await response.json()) as ImageGenerationResponse;
  if (!Array.isArray(payload.images)) {
    throw new Error("Gemini image generation response missing images");
  }
  return payload;
}

