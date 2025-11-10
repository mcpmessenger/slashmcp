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

  const response = await fetch(`${FUNCTIONS_URL}/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to register upload job");
  }

  return response.json();
}

export async function triggerTextractJob(jobId: string): Promise<void> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const response = await fetch(`${FUNCTIONS_URL}${textractFunctionPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
    body: JSON.stringify({ jobId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to trigger Textract job");
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
        created_at: string;
      }
    | null;
}

export async function fetchJobStatus(jobId: string): Promise<JobStatusResponse> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const response = await fetch(`${FUNCTIONS_URL}${jobStatusPath}?jobId=${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: {
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to fetch job status");
  }

  return response.json();
}

export async function triggerVisionJob(params: {
  jobId: string;
  provider: "gpt4o" | "gemini";
}): Promise<void> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const response = await fetch(`${FUNCTIONS_URL}${visionPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_ANON_KEY
        ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
        : {}),
    },
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
  provider: "gemini";
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

  const response = await fetch(`${FUNCTIONS_URL}${imageGenerationPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
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

