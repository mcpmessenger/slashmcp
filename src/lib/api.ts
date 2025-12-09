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
/**
 * Get session from localStorage directly (fast, no network call)
 * Falls back to getSession() if localStorage doesn't have it
 */
function getSessionFromStorage(): { access_token?: string; user?: { id: string } } | null {
  if (typeof window === "undefined") return null;
  
  try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    if (!SUPABASE_URL) return null;
    
    const projectRef = SUPABASE_URL.replace("https://", "").split(".supabase.co")[0]?.split(".")[0];
    if (!projectRef) return null;
    
    const storageKey = `sb-${projectRef}-auth-token`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed?.session ?? parsed;
    
    // Validate session has access_token and is not expired
    if (session?.access_token) {
      const expiresAt = session.expires_at;
      if (expiresAt && typeof expiresAt === 'number') {
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt < now) {
          console.log("[getAuthHeaders] Session in localStorage is expired");
          return null;
        }
      }
      return session;
    }
  } catch (error) {
    console.warn("[getAuthHeaders] Failed to read session from localStorage", error);
  }
  
  return null;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  console.log("[getAuthHeaders] Starting auth header preparation...");
  const sessionStartTime = Date.now();
  
  // Try localStorage first (fast, no network call)
  let session: { access_token?: string } | null = getSessionFromStorage();
  
  if (session?.access_token) {
    const sessionDuration = Date.now() - sessionStartTime;
    console.log(`[getAuthHeaders] Session retrieved from localStorage in ${sessionDuration}ms`);
  } else {
    // Fallback to getSession() if localStorage doesn't have it
    console.log("[getAuthHeaders] No session in localStorage, trying getSession()...");
    try {
      const sessionPromise = supabaseClient.auth.getSession();
      
      // Add 2-second timeout (shorter since localStorage failed)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("getSession() timed out after 2 seconds - using anon key fallback"));
        }, 2_000);
      });
      
      const sessionResult = await Promise.race([sessionPromise, timeoutPromise]);
      session = sessionResult.data?.session || null;
      const sessionDuration = Date.now() - sessionStartTime;
      console.log(`[getAuthHeaders] Session retrieved from getSession() in ${sessionDuration}ms`, {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
      });
    } catch (sessionError) {
      const sessionDuration = Date.now() - sessionStartTime;
      console.warn(`[getAuthHeaders] getSession() failed after ${sessionDuration}ms`, {
        error: sessionError instanceof Error ? sessionError.message : String(sessionError),
        name: sessionError instanceof Error ? sessionError.name : "Unknown",
      });
      // Continue with anon key fallback instead of throwing
      console.warn("[getAuthHeaders] Falling back to anon key due to session error");
      session = null;
    }
  }

  if (session?.access_token) {
    // Use the user's session token so edge functions can extract OAuth provider tokens
    headers.Authorization = `Bearer ${session.access_token}`;
    // Always include apikey header (required by Supabase API gateway)
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
    } else {
      console.warn("[getAuthHeaders] WARNING: SUPABASE_ANON_KEY is not set - apikey header will be missing");
    }
    console.log("[getAuthHeaders] Using session token for authorization", {
      hasApikey: !!headers.apikey,
      hasAuthorization: !!headers.Authorization,
    });
  } else if (SUPABASE_ANON_KEY) {
    // Fallback to anon key if not signed in or session failed
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    console.log("[getAuthHeaders] Using anon key for authorization (no session or session failed)", {
      hasApikey: !!headers.apikey,
      hasAuthorization: !!headers.Authorization,
    });
  } else {
    console.error("[getAuthHeaders] ERROR: No session and no anon key available - requests will fail!");
    throw new Error("Cannot make request: No session token and VITE_SUPABASE_PUBLISHABLE_KEY is not set in .env.local");
  }

  return headers;
}

if (!FUNCTIONS_URL) {
  console.warn("Missing VITE_SUPABASE_FUNCTIONS_URL. Upload API calls will fail until configured.");
  console.warn("VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL);
  console.warn("VITE_SUPABASE_FUNCTIONS_URL:", import.meta.env.VITE_SUPABASE_FUNCTIONS_URL);
} else {
  console.log("[api.ts] FUNCTIONS_URL configured:", FUNCTIONS_URL);
}

export async function registerUploadJob(params: {
  file: File;
  analysisTarget: AnalysisTarget;
  metadata?: Record<string, unknown>;
  userId?: string;
}): Promise<UploadJobResponse> {
  // Try to get userId from session if not provided
  let userId = params.userId;
  if (!userId) {
    try {
      const session = getSessionFromStorage();
      if (session?.user?.id) {
        userId = session.user.id;
        console.log("[registerUploadJob] Extracted userId from session:", userId);
      } else {
        // Try getSession as fallback
        const { data: { session: sessionData } } = await supabaseClient.auth.getSession();
        if (sessionData?.user?.id) {
          userId = sessionData.user.id;
          console.log("[registerUploadJob] Extracted userId from getSession():", userId);
        }
      }
    } catch (error) {
      console.warn("[registerUploadJob] Failed to extract userId from session:", error);
    }
  }

  console.log("[registerUploadJob] Starting upload registration", {
    fileName: params.file.name,
    fileSize: params.file.size,
    fileType: params.file.type,
    analysisTarget: params.analysisTarget,
    userId: userId || "NOT PROVIDED (will be NULL in database)",
  });

  // Robust error handling: Explicit check with detailed error message
  if (!FUNCTIONS_URL) {
    const errorDetails = {
      VITE_SUPABASE_FUNCTIONS_URL: import.meta.env.VITE_SUPABASE_FUNCTIONS_URL,
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      computed: import.meta.env.VITE_SUPABASE_URL 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` 
        : undefined,
    };
    console.error("[registerUploadJob] CRITICAL: FUNCTIONS_URL not configured", errorDetails);
    const error = new Error(
      "Functions URL is not configured. " +
      "Please check Vercel environment variables: VITE_SUPABASE_FUNCTIONS_URL or VITE_SUPABASE_URL. " +
      `Current values: ${JSON.stringify(errorDetails)}`
    );
    error.name = "ConfigurationError";
    throw error;
  }

  const body = {
    fileName: params.file.name,
    fileType: params.file.type || "application/octet-stream",
    fileSize: params.file.size,
    analysisTarget: params.analysisTarget,
    metadata: params.metadata ?? {},
    userId: userId, // Use extracted userId if available
  };

  console.log("[registerUploadJob] Request body prepared", { body: { ...body, metadata: "..." } });
  
  console.log("[registerUploadJob] About to get auth headers...");
  const authHeadersStartTime = Date.now();
  let headers: Record<string, string>;
  try {
    headers = await getAuthHeaders();
    const authHeadersDuration = Date.now() - authHeadersStartTime;
    console.log(`[registerUploadJob] Auth headers prepared in ${authHeadersDuration}ms`, { 
      hasAuth: !!headers.Authorization,
      hasApikey: !!headers.apikey,
    });
  } catch (authError) {
    const authHeadersDuration = Date.now() - authHeadersStartTime;
    console.error(`[registerUploadJob] CRITICAL: getAuthHeaders() failed after ${authHeadersDuration}ms`, {
      error: authError instanceof Error ? authError.message : String(authError),
      name: authError instanceof Error ? authError.name : "Unknown",
    });
    throw new Error(
      `Failed to get authentication headers: ${authError instanceof Error ? authError.message : String(authError)}. ` +
      "This may indicate an issue with the Supabase auth session."
    );
  }
  
  // Add timeout to fetch request - increased to 30s to allow for slow AWS operations
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn("[registerUploadJob] Timeout reached (30s), aborting request");
    controller.abort();
  }, 30_000); // 30 seconds timeout (allows for slow AWS presigned URL generation)
  
  // Validate URL before attempting fetch
  let fetchUrl: string;
  try {
    fetchUrl = `${FUNCTIONS_URL}/uploads`;
    // Validate URL format (will throw if invalid)
    new URL(fetchUrl);
    console.log("[registerUploadJob] URL validated:", fetchUrl);
  } catch (urlError) {
    console.error("[registerUploadJob] CRITICAL: Invalid FUNCTIONS_URL", {
      FUNCTIONS_URL,
      computedUrl: fetchUrl,
      error: urlError instanceof Error ? urlError.message : String(urlError),
    });
    throw new Error(
      `Invalid Functions URL: ${FUNCTIONS_URL}. ` +
      "Please check Vercel environment variables."
    );
  }

  try {
    console.log("[registerUploadJob] Sending fetch request to:", fetchUrl);
    console.log("[registerUploadJob] Request details:", {
      method: "POST",
      url: fetchUrl,
      hasHeaders: !!headers.Authorization,
      bodySize: JSON.stringify(body).length,
      signal: controller.signal ? "AbortController active" : "No signal",
    });
    const fetchStartTime = Date.now();
    
    console.log("[registerUploadJob] About to call fetch()...");
    // Note: Browser handles CORS preflight (OPTIONS) automatically - no need to test manually
    
    // Wrap fetch in try-catch to catch synchronous errors
    let response: Response;
    try {
      console.log("[registerUploadJob] Sending POST request...");
      response = await fetch(fetchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      console.log("[registerUploadJob] fetch() returned, processing response...");
    } catch (fetchError) {
      // Catch synchronous errors (like network errors, invalid URL, etc.)
      const errorName = fetchError instanceof Error ? fetchError.name : "Unknown";
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      
      console.error("[registerUploadJob] CRITICAL: fetch() threw synchronous error", {
        error: errorMessage,
        name: errorName,
        stack: fetchError instanceof Error ? fetchError.stack : undefined,
        url: fetchUrl,
        FUNCTIONS_URL,
        hasHeaders: !!headers.Authorization,
        hasApikey: !!headers.apikey,
        isNetworkError: errorName === "TypeError" && errorMessage.includes("fetch"),
        possibleCauses: [
          "Network connectivity issue",
          "CORS problem (check browser console for CORS errors)",
          "Browser extension blocking request (try incognito)",
          "Invalid URL or server down",
          "Mixed content (HTTP/HTTPS) issue",
        ],
      });
      
      // Provide more specific error messages based on error type
      let userFriendlyMessage = `Failed to send upload request: ${errorMessage}. `;
      
      if (errorName === "TypeError" && errorMessage.includes("Failed to fetch")) {
        userFriendlyMessage += 
          "This usually means:\n" +
          "1. Network connectivity issue - check your internet connection\n" +
          "2. CORS problem - the server may not allow requests from this origin\n" +
          "3. Invalid URL - check if FUNCTIONS_URL is configured correctly\n" +
          "4. Server is down - check Supabase Edge Functions status\n\n" +
          `Attempted URL: ${fetchUrl}\n` +
          `FUNCTIONS_URL: ${FUNCTIONS_URL || "NOT CONFIGURED"}`;
      } else if (errorName === "AbortError") {
        userFriendlyMessage += "The request was aborted (likely due to timeout).";
      } else {
        userFriendlyMessage += "This may indicate a network issue, CORS problem, or invalid URL.";
      }
      
      throw new Error(userFriendlyMessage);
    }
    
    const fetchDuration = Date.now() - fetchStartTime;
    console.log(`[registerUploadJob] Fetch completed in ${fetchDuration}ms`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unable to read error response");
      console.error("[registerUploadJob] Response not OK", {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.slice(0, 200),
      });
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: errorText };
      }
      throw new Error(error?.error || `Failed to register upload job: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log("[registerUploadJob] Success", {
      jobId: responseData.jobId,
      hasUploadUrl: !!responseData.uploadUrl,
      storagePath: responseData.storagePath,
    });
    
    return responseData;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Enhanced error logging with more context
    const errorInfo = {
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Unknown",
      stack: error instanceof Error ? error.stack : undefined,
      FUNCTIONS_URL,
      fetchUrl: `${FUNCTIONS_URL}/uploads`,
      timestamp: new Date().toISOString(),
    };
    console.error("[registerUploadJob] Error caught", errorInfo);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(
          "Upload registration timed out after 30 seconds. " +
          "The uploads Edge Function may be slow or unavailable. " +
          "Please check your network connection and Supabase logs. " +
          `URL: ${FUNCTIONS_URL}/uploads`
        );
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error(
          `Network error: ${error.message}. ` +
          "This may indicate the request was blocked by browser, extension, or network. " +
          "Try testing in incognito mode or check browser console for CORS errors."
        );
      }
      // Re-throw configuration errors as-is (they already have good messages)
      if (error.name === 'ConfigurationError') {
        throw error;
      }
    }
    
    // Re-throw with enhanced context
    throw error;
  }
}

export async function updateJobStage(jobId: string, stage: "registered" | "uploaded" | "processing" | "extracted" | "injected" | "failed"): Promise<void> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const headers = await getAuthHeaders();
  const url = `${FUNCTIONS_URL}/uploads`;
  
  console.log(`[updateJobStage] Updating job ${jobId} to stage: ${stage}`);
  
  let response: Response;
  try {
    response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ jobId, stage }),
  });
  } catch (fetchError) {
    console.error(`[updateJobStage] Fetch failed:`, fetchError);
    throw new Error(
      `Failed to update job stage: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}. ` +
      "This may indicate a network issue or CORS problem."
    );
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error(`[updateJobStage] Response not OK:`, { status: response.status, error });
    throw new Error(error?.error || `Failed to update job stage: ${response.status} ${response.statusText}`);
  }
  
  console.log(`[updateJobStage] Successfully updated job ${jobId} to stage: ${stage}`);
}

export async function triggerTextractJob(jobId: string): Promise<void> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error("Supabase anon key is not configured. Set VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
  }

  const TRIGGER_TEXTRACT_TIMEOUT_MS = 30_000; // 30 seconds
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, TRIGGER_TEXTRACT_TIMEOUT_MS);

  try {
    const headers = await getAuthHeaders();
    
    // Ensure apikey is always present (required by Supabase API gateway)
    if (!headers.apikey && SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      console.log("[triggerTextractJob] Added missing apikey header");
    }
    
    // Ensure Authorization is present if apikey is set
    if (headers.apikey && !headers.Authorization) {
      headers.Authorization = `Bearer ${headers.apikey}`;
      console.log("[triggerTextractJob] Added Authorization header from apikey");
    }
    
    const url = `${FUNCTIONS_URL}${textractFunctionPath}`;
    console.log(`[triggerTextractJob] Calling: ${url}`, { 
      jobId,
      FUNCTIONS_URL,
      textractFunctionPath,
      fullUrl: url,
      hasHeaders: !!headers,
      hasApikey: !!headers.apikey,
      hasAuthorization: !!headers.Authorization,
      headerKeys: Object.keys(headers),
    });
    
    // Wrap fetch in try-catch to catch network errors
    let response: Response;
    try {
      // First, try OPTIONS preflight to check CORS
      console.log(`[triggerTextractJob] Testing OPTIONS preflight to: ${url}`);
      const preflightResponse = await fetch(url, {
        method: "OPTIONS",
        headers: {
          "Origin": window.location.origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization,apikey,content-type",
        },
      });
      console.log(`[triggerTextractJob] OPTIONS preflight response:`, {
        status: preflightResponse.status,
        headers: Object.fromEntries(preflightResponse.headers.entries()),
      });
      
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ jobId }),
        signal: abortController.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[triggerTextractJob] Fetch error:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(`Textract job trigger timed out after ${TRIGGER_TEXTRACT_TIMEOUT_MS}ms`);
      }
      // Network error, CORS, or other fetch failures
      if (fetchError instanceof TypeError) {
        throw new Error(
          `Failed to trigger Textract job: Network error - ${fetchError.message}. ` +
          "This may indicate a CORS problem, network connectivity issue, or the textract-worker function is unavailable. " +
          "Check Supabase Edge Function logs and browser console for more details."
        );
      }
      throw new Error(
        `Failed to trigger Textract job: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}. ` +
        "This may indicate a network issue, CORS problem, or the textract-worker function is unavailable. " +
        "Check Supabase Edge Function logs for more details."
      );
    }

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
    const url = `${FUNCTIONS_URL}${jobStatusPath}?jobId=${encodeURIComponent(jobId)}`;
    console.log(`[fetchJobStatus] Fetching status for job: ${jobId}`);
    
    let response: Response;
    try {
      response = await fetch(url, {
      method: "GET",
      headers,
      signal: abortController.signal,
    });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[fetchJobStatus] Fetch failed:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(`Job status fetch timed out after ${FETCH_STATUS_TIMEOUT_MS}ms`);
      }
      throw new Error(
        `Failed to fetch job status: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}. ` +
        "This may indicate a network issue or CORS problem."
      );
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`[fetchJobStatus] Response not OK:`, { status: response.status, error });
      throw new Error(error?.error || `Failed to fetch job status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`[fetchJobStatus] Success for job ${jobId}:`, result.job.status);
    return result;
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

/**
 * Delete a processing job and optionally its associated S3 file
 */
export async function deleteProcessingJob(jobId: string, deleteS3File: boolean = false): Promise<void> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_URL}/uploads`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ jobId, deleteS3File }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `Failed to delete job: ${response.statusText}`);
  }
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

