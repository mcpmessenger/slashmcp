/**
 * Context Manager - Maintains user context and document state
 * 
 * Provides context-aware information to the orchestrator:
 * - Available documents and their status
 * - Recent uploads
 * - Processing state
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../database.types.ts";

export interface DocumentContext {
  availableDocuments: Array<{
    id: string;
    fileName: string;
    status: string;
    stage: string;
    uploadedAt: string;
    fileType: string;
  }>;
  processingDocuments: number;
  readyDocuments: number;
  failedDocuments: number;
  recentUploads: Array<string>; // Document IDs uploaded in last 5 minutes
}

/**
 * Get document context for a user
 */
export async function getDocumentContext(
  supabaseUrl: string,
  supabaseServiceKey: string,
  userId: string
): Promise<DocumentContext> {
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
  
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("id, file_name, file_type, status, metadata, created_at")
    .eq("user_id", userId)
    .eq("analysis_target", "document-analysis")
    .order("created_at", { ascending: false })
    .limit(50);
  
  if (error) {
    console.error("Error fetching document context:", error);
    return {
      availableDocuments: [],
      processingDocuments: 0,
      readyDocuments: 0,
      failedDocuments: 0,
      recentUploads: [],
    };
  }
  
  const documents = (data || []).map((job: any) => {
    const metadata = job.metadata as Record<string, unknown> | null;
    const stage = metadata?.job_stage as string | undefined;
    return {
      id: job.id,
      fileName: job.file_name,
      status: job.status,
      stage: stage || "unknown",
      uploadedAt: job.created_at,
      fileType: job.file_type,
    };
  });
  
  const processingDocuments = documents.filter(d => 
    d.status === "queued" || d.status === "processing"
  ).length;
  
  const readyDocuments = documents.filter(d => 
    d.status === "completed" && (d.stage === "indexed" || d.stage === "injected")
  ).length;
  
  const failedDocuments = documents.filter(d => d.status === "failed").length;
  
  const recentUploads = documents
    .filter(d => new Date(d.uploadedAt) >= new Date(fiveMinutesAgo))
    .map(d => d.id);
  
  return {
    availableDocuments: documents,
    processingDocuments,
    readyDocuments,
    failedDocuments,
    recentUploads,
  };
}

/**
 * Format document context for orchestrator instructions
 */
export function formatDocumentContext(context: DocumentContext): string {
  if (context.availableDocuments.length === 0) {
    return "User has no uploaded documents.";
  }
  
  const readyDocs = context.availableDocuments.filter(d => 
    d.status === "completed" && (d.stage === "indexed" || d.stage === "injected")
  );
  
  const processingDocs = context.availableDocuments.filter(d =>
    d.status === "queued" || d.status === "processing"
  );
  
  let message = `User has ${context.availableDocuments.length} document(s):\n`;
  
  if (readyDocs.length > 0) {
    message += `- ${readyDocs.length} ready for search: ${readyDocs.map(d => d.fileName).join(", ")}\n`;
  }
  
  if (processingDocs.length > 0) {
    message += `- ${processingDocs.length} still processing: ${processingDocs.map(d => d.fileName).join(", ")}\n`;
  }
  
  if (context.recentUploads.length > 0) {
    const recentDocNames = context.availableDocuments
      .filter(d => context.recentUploads.includes(d.id))
      .map(d => d.fileName);
    message += `- Recent uploads (last 5 min): ${recentDocNames.join(", ")}\n`;
  }
  
  return message;
}

