import { supabase } from "./supabaseClient"; // Assuming a supabaseClient is already defined
import { User } from "@supabase/supabase-js";

/**
 * Uploads a file to Supabase Storage and initiates the document processing job.
 * @param file The file to upload.
 * @param user The current authenticated user.
 * @returns The ID of the newly created processing job.
 */
export async function uploadAndProcessDocument(file: File, user: User): Promise<string> {
  if (!user) {
    throw new Error("User must be authenticated to upload documents.");
  }

  const filePath = \`documents/\${user.id}/\${Date.now()}-\${file.name}\`;

  // 1. Upload file to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("documents") // Assuming a bucket named 'documents' is created
    .upload(filePath, file);

  if (uploadError) {
    console.error("File upload error:", uploadError);
    throw new Error(\`Failed to upload file: \${uploadError.message}\`);
  }

  // 2. Call the RPC function to start document processing
  const { data: jobId, error: rpcError } = await supabase.rpc("start_document_processing", {
    file_path: filePath,
    user_id: user.id,
  });

  if (rpcError) {
    console.error("RPC call error:", rpcError);
    // Optional: Delete the uploaded file if job initiation fails
    await supabase.storage.from("documents").remove([filePath]);
    throw new Error(\`Failed to start document processing: \${rpcError.message}\`);
  }

  return jobId as string;
}

/**
 * Searches document embeddings for a given query.
 * @param query The search query string.
 * @returns A list of relevant document chunks.
 */
export async function searchDocuments(query: string, jobIds?: string[]): Promise<any[]> {
  // 1. Generate embedding for the query (This should ideally be done on the server/Edge Function for security)
  // For simplicity and to match the existing architecture, we'll assume a server-side component handles the embedding generation
  // and calls the search_document_embeddings function.
  // Since we are restructuring, we will assume a new Edge Function 'search-documents' is created.
  
  // 1. Call the 'search-documents' Edge Function
  const { data, error } = await supabase.functions.invoke("search-documents", {
    body: { query, job_ids: jobIds },
  });

  if (error) {
    console.error("Search documents function error:", error);
    throw new Error(\`Failed to search documents: \${error.message}\`);
  }

  return data.chunks || [];
}

/**
 * Fetches the status of a document processing job.
 * @param jobId The ID of the processing job.
 * @returns The job status.
 */
export async function getJobStatus(jobId: string): Promise<string> {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  if (error) {
    console.error("Error fetching job status:", error);
    return "error";
  }

  return data?.status || "unknown";
}
