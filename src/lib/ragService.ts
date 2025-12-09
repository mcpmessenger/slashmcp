import { supabaseClient } from "./supabaseClient";
import { registerUploadJob, fetchJobStatus, triggerTextractJob, updateJobStage, type JobStatusResponse } from "./api";
import type { AnalysisTarget } from "./api";

const FUNCTIONS_URL =
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
  (import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
    : undefined);

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Get authentication headers for Edge Function calls
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
    }
  } else if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  return headers;
}

export interface DocumentChunk {
  id: string;
  job_id: string;
  chunk_text: string;
  similarity?: number;
  file_name: string;
  chunk_index?: number;
  metadata?: Record<string, unknown>;
}

export interface DocumentContext {
  jobId: string;
  fileName: string;
  stage: string | null;
  token: string;
  rawMetadata: Record<string, unknown> | null;
  chunks: Array<{ id: string; content: string; similarity?: number }>;
  summary: string | null;
  metadata: {
    textLength?: number;
    searchMode: "vector" | "legacy";
    visionMetadata?: Record<string, unknown> | null;
  };
}

export interface SearchDocumentsResponse {
  contexts: DocumentContext[];
  searchMode: "vector" | "legacy";
}

/**
 * Uploads a file and initiates document processing using the existing upload flow.
 * @param file The file to upload.
 * @param userId Optional user ID (will be extracted from session if not provided).
 * @returns The ID of the newly created processing job.
 */
export async function uploadAndProcessDocument(
  file: File,
  userId?: string,
): Promise<string> {
  // Get user ID from session if not provided
  if (!userId) {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    userId = session?.user?.id;
  }

  if (!userId) {
    throw new Error("User must be authenticated to upload documents.");
  }

  // Register the upload job using existing API
  const response = await registerUploadJob({
    file,
    analysisTarget: "document-analysis" as AnalysisTarget,
    userId,
  });

  // Upload the file to S3 using the presigned URL
  if (response.uploadUrl) {
    const uploadResponse = await fetch(response.uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
    }

    // Update job stage to "uploaded" before triggering processing
    try {
      await updateJobStage(response.jobId, "uploaded");
    } catch (error) {
      console.warn("Failed to update job stage to uploaded:", error);
      // Continue anyway - textract worker will handle it
    }

    // Trigger the textract worker to process the document
    await triggerTextractJob(response.jobId);
  } else {
    // If no uploadUrl, the file might already be uploaded or needs manual upload
    // Still trigger processing if the job exists
    console.warn("No uploadUrl provided - job may need manual upload or file is already uploaded");
    // Don't throw error - job is registered and can be processed later
  }

  return response.jobId;
}

/**
 * Searches document embeddings for a given query using the doc-context Edge Function.
 * @param query The search query string.
 * @param jobIds Optional array of job IDs to limit the search to specific documents.
 * @param limit Maximum number of chunks to return (default: 10).
 * @param similarityThreshold Minimum similarity threshold for vector search (default: 0.7).
 * @returns A list of relevant document contexts with chunks.
 */
export async function searchDocuments(
  query: string,
  jobIds?: string[],
  limit: number = 10,
  similarityThreshold: number = 0.7,
): Promise<SearchDocumentsResponse> {
  if (!FUNCTIONS_URL) {
    throw new Error("Functions URL is not configured");
  }

  if (!query || query.trim().length < 10) {
    throw new Error("Query must be at least 10 characters long for semantic search");
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTIONS_URL}/doc-context`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: query.trim(),
      jobIds: jobIds || [],
      limit,
      similarity_threshold: similarityThreshold,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `Failed to search documents: ${response.status}`);
  }

  const data = await response.json();
  return data as SearchDocumentsResponse;
}

/**
 * Fetches the status of a document processing job.
 * @param jobId The ID of the processing job.
 * @returns The job status response.
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return fetchJobStatus(jobId);
}

/**
 * Gets all completed document jobs for the current user.
 * @param userId Optional user ID (will be extracted from session if not provided).
 * @returns Array of job IDs that are ready for querying.
 */
export async function getQueryableDocumentJobs(userId?: string, fallbackJobs?: Array<{id: string, status: string, stage?: string}>): Promise<string[]> {
  if (!userId) {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    userId = session?.user?.id;
  }

  if (!userId) {
    return [];
  }

  // FALLBACK: Use fallbackJobs if provided (when database queries are timing out)
  if (fallbackJobs && fallbackJobs.length > 0) {
    console.log("[ragService] Using fallback jobs for getQueryableDocumentJobs:", fallbackJobs.length);
    return fallbackJobs
      .filter((job) => {
        return job.status === "completed" && 
               (job.stage === "extracted" || job.stage === "injected" || job.stage === "indexed");
      })
      .map((job) => job.id);
  }

  // Try database query with timeout
  try {
    const queryPromise = supabaseClient
      .from("processing_jobs")
      .select("id, status, metadata")
      .eq("user_id", userId)
      .eq("status", "completed")
      .in("analysis_target", ["document-analysis", "image-ocr"]); // Include image-ocr too

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => 
      setTimeout(() => resolve({ data: null, error: { message: "Query timeout" } }), 5000)
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);

    if (result.error || !result.data) {
      console.warn("[ragService] Database query failed or timed out, returning empty array");
      return [];
    }

    // Filter for jobs that have been extracted or indexed
    return (result.data || [])
      .filter((job: any) => {
        const metadata = job.metadata as Record<string, unknown> | null;
        const stage = metadata?.job_stage as string | undefined;
        return stage === "extracted" || stage === "injected" || stage === "indexed";
      })
      .map((job: any) => job.id);
  } catch (error) {
    console.error("[ragService] Error fetching queryable jobs:", error);
    return [];
  }
}

