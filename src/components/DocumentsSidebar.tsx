import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Image, Loader2, CheckCircle2, XCircle, Clock, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { deleteProcessingJob } from "@/lib/api";

/**
 * Get session from localStorage directly (fast, no network call)
 * Similar to getSessionFromStorage in api.ts
 */
function getSessionFromStorage(): { access_token?: string; refresh_token?: string; user?: { id: string } } | null {
  if (typeof window === "undefined") return null;
  
  try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    if (!SUPABASE_URL) {
      console.warn("[DocumentsSidebar] No SUPABASE_URL in env");
      return null;
    }
    
    const projectRef = SUPABASE_URL.replace("https://", "").split(".supabase.co")[0]?.split(".")[0];
    if (!projectRef) {
      console.warn("[DocumentsSidebar] Could not extract project ref from URL:", SUPABASE_URL);
      return null;
    }
    
    // Try multiple possible storage keys (Supabase might use different formats)
    const possibleKeys = [
      `sb-${projectRef}-auth-token`,
      `sb-${projectRef}-auth-token-code-verifier`,
      `supabase.auth.token`,
    ];
    
    let session = null;
    for (const storageKey of possibleKeys) {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Try different possible structures
          session = parsed?.currentSession ?? parsed?.session ?? parsed?.access_token ? parsed : null;
          
          if (session?.access_token && session?.user?.id) {
            const expiresAt = session.expires_at;
            if (expiresAt && typeof expiresAt === 'number') {
              const now = Math.floor(Date.now() / 1000);
              if (expiresAt < now) {
                console.log("[DocumentsSidebar] Session in localStorage is expired");
                continue; // Try next key
              }
            }
            console.log("[DocumentsSidebar] Found session in localStorage key:", storageKey);
            return session;
          }
        } catch (parseError) {
          console.warn("[DocumentsSidebar] Failed to parse localStorage key:", storageKey, parseError);
          continue;
        }
      }
    }
    
    // Also try to find any Supabase-related keys
    console.log("[DocumentsSidebar] Checking all localStorage keys for Supabase session...");
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.includes('supabase') || key.includes('auth') || key.includes(projectRef))) {
        console.log("[DocumentsSidebar] Found potential session key:", key);
        try {
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            const potentialSession = parsed?.currentSession ?? parsed?.session ?? parsed;
            if (potentialSession?.access_token && potentialSession?.user?.id) {
              console.log("[DocumentsSidebar] ✅ Found valid session in key:", key);
              return potentialSession;
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
    
    console.warn("[DocumentsSidebar] No valid session found in localStorage");
    return null;
  } catch (error) {
    console.error("[DocumentsSidebar] Error reading localStorage:", error);
    return null;
  }
}

interface Document {
  jobId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: string;
  stage: string;
  createdAt: string;
  updatedAt: string;
  summary?: string | null; // vision_summary or ocr_text preview
  visionSummary?: string | null;
  ocrText?: string | null;
}

export const DocumentsSidebar: React.FC<{ 
  onDocumentClick?: (jobId: string) => void;
  refreshTrigger?: number; // External trigger to force refresh
  userId?: string; // Optional userId from parent (bypasses session retrieval)
  onDocumentsChange?: (count: number) => void; // Callback to notify parent of document count changes
  fallbackJobs?: Array<{ // Fallback data source when database queries fail
    id: string;
    fileName: string;
    status: string;
    visionSummary?: string | null;
    resultText?: string | null;
    updatedAt?: string;
    stage?: string;
    contentLength?: number | null; // File size in bytes
  }>;
}> = ({ onDocumentClick, refreshTrigger, userId: propUserId, onDocumentsChange, fallbackJobs }) => {
  
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  const [isLoadingRef, setIsLoadingRef] = useState(false); // Prevent concurrent loads
  const [hasError, setHasError] = useState(false); // Track if there's a persistent error
  const [deletingJobIds, setDeletingJobIds] = useState<Set<string>>(new Set()); // Track jobs being deleted
  const [isExpanded, setIsExpanded] = useState(false); // Default to collapsed (closed)

  const loadDocuments = async () => {
    // Prevent concurrent loads
    if (isLoadingRef) {
      return;
    }
    
    // IMMEDIATE FALLBACK: If we have fallbackJobs, use them first (before trying database)
    // This ensures sidebar shows documents even when database queries always timeout
    console.log("[DocumentsSidebar] 🔍 Checking fallbackJobs:", {
      hasFallbackJobs: !!fallbackJobs,
      fallbackJobsLength: fallbackJobs?.length || 0,
      fallbackJobs: fallbackJobs?.map(j => ({ id: j.id, fileName: j.fileName, status: j.status })) || []
    });
    
    if (fallbackJobs && fallbackJobs.length > 0) {
      console.log("[DocumentsSidebar] ⚡ Found fallbackJobs, filtering for completed jobs...");
      const completedFallbackJobs = fallbackJobs.filter(job => job.status === "completed");
      console.log(`[DocumentsSidebar] ⚡ Found ${completedFallbackJobs.length} completed jobs in fallbackJobs`);
      
      if (completedFallbackJobs.length > 0) {
        const fallbackDocs = completedFallbackJobs.map(job => ({
          jobId: job.id,
          fileName: job.fileName,
          fileType: job.fileName.split('.').pop() || 'unknown',
          fileSize: 0,
          status: job.status,
          stage: job.stage || "unknown",
          createdAt: job.updatedAt || new Date().toISOString(),
          updatedAt: job.updatedAt || new Date().toISOString(),
          summary: job.visionSummary || (job.resultText ? job.resultText.substring(0, 200) + "..." : null),
          visionSummary: job.visionSummary || null,
          ocrText: job.resultText || null,
        }));
        
        setDocuments(fallbackDocs);
        setIsLoading(false);
        setIsLoadingRef(false);
        setHasCheckedSession(true);
        setHasError(false);
        setIsExpanded(true); // Auto-expand when documents are loaded
        onDocumentsChange?.(fallbackDocs.length);
        console.log(`[DocumentsSidebar] ✅ Loaded ${fallbackDocs.length} documents from fallbackJobs (skipping database query)`);
        return; // Skip database query entirely if we have fallback data
      } else {
        console.log("[DocumentsSidebar] ⚠️ fallbackJobs provided but none are completed - will try database query");
      }
    } else {
      console.log("[DocumentsSidebar] ⚠️ No fallbackJobs provided - will try database query");
    }
    
    try {
      setIsLoadingRef(true);
      setIsLoading(true);
      setHasError(false); // Clear error state on new attempt
      
      // LOG: Check fallbackJobs before proceeding
      console.log("[DocumentsSidebar] 🔍 Checking fallbackJobs:", {
        hasFallbackJobs: !!fallbackJobs,
        fallbackJobsLength: fallbackJobs?.length || 0,
        completedCount: fallbackJobs?.filter(j => j.status === "completed").length || 0
      });
      
      let userId: string | undefined = propUserId;
      let session: { access_token?: string; refresh_token?: string; user?: { id: string } } | null = null;
      
      // If userId prop provided, use it directly (from useChat hook - bypasses session retrieval)
      if (propUserId) {
        userId = propUserId;
        // Still try to get session token for RLS (non-blocking)
        session = getSessionFromStorage();
      } else {
        // Fallback: Try localStorage session retrieval
        session = getSessionFromStorage();
        
        if (session?.access_token && session?.user?.id) {
          userId = session.user.id;
        } else {
          // No user ID - could be guest mode or not logged in
          console.warn("[DocumentsSidebar] No userId found - user may be in guest mode");
          setIsLoading(false);
          setDocuments([]);
          setHasCheckedSession(true);
          // Still notify parent of 0 documents
          onDocumentsChange?.(0);
          return;
        }
      }
      
      if (!userId) {
        console.warn("[DocumentsSidebar] No userId available for query");
        setIsLoading(false);
        setDocuments([]);
        setHasCheckedSession(true);
        // Still notify parent of 0 documents
        onDocumentsChange?.(0);
        return;
      }
      
      // Client should be ready at this point (checked by onAuthStateChange)
      setHasCheckedSession(true);
      
      // Execute query - first get jobs, then fetch summaries separately
      let data, error;
      try {
        console.log("[DocumentsSidebar] ===== Starting query =====");
        console.log("[DocumentsSidebar] Query parameters:", {
          userId,
          analysisTarget: "document-analysis",
          hasSession: !!session,
          sessionUserId: session?.user?.id,
        });
        // First, get all processing jobs (try with filter first, fallback without if needed)
        let queryData, queryError;
        
        // CRITICAL FIX: Use separate queries instead of join to avoid RLS performance issues
        // The join query was causing 20+ second timeouts due to RLS policy evaluation
        // Query jobs first (simple, fast), then fetch analysis_results separately
        console.log("[DocumentsSidebar] Using separate queries (join was causing timeouts)");
        
        // Step 1: Query processing_jobs (split into two queries for better index usage)
        // CRITICAL: RLS policy must allow: auth.uid() = user_id OR user_id IS NULL
        // Split into two queries instead of .or() for better index performance
        console.log("[DocumentsSidebar] Querying jobs for user_id:", userId);
        
        // OPTIMIZED: Single query with OR condition (simpler, faster)
        // Use .or() with proper RLS policy support
        const jobsQuery = supabaseClient
          .from("processing_jobs")
          .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target")
          .or(`user_id.eq.${userId},user_id.is.null`)
          .in("analysis_target", ["document-analysis", "image-ocr"])
          .order("created_at", { ascending: false })
          .limit(50);
        
        // Reduced timeout to 5 seconds - fail fast and use fallback
        const queryTimeout = new Promise<{ data: null; error: { message: string } }>((resolve) => 
          setTimeout(() => resolve({ data: null, error: { message: "Query timeout after 5 seconds" } }), 5000)
        );
        
        const jobsResult = await Promise.race([
          jobsQuery.then(r => ({ data: r.data, error: r.error })),
          queryTimeout,
        ]);
        
        if (jobsResult.error) {
          // On error, use fallbackJobs if available instead of showing error
          if (fallbackJobs && fallbackJobs.length > 0) {
            console.warn("[DocumentsSidebar] ⚠️ Database query failed, using fallbackJobs:", jobsResult.error.message);
            const completedFallbackJobs = fallbackJobs.filter(job => job.status === "completed");
            if (completedFallbackJobs.length > 0) {
              const fallbackDocs = completedFallbackJobs.map(job => ({
                jobId: job.id,
                fileName: job.fileName,
                fileType: job.fileName.split('.').pop() || 'unknown',
                fileSize: job.contentLength || 0,
                status: job.status,
                stage: job.stage || "unknown",
                createdAt: job.updatedAt || new Date().toISOString(),
                updatedAt: job.updatedAt || new Date().toISOString(),
                summary: job.visionSummary || (job.resultText ? job.resultText.substring(0, 200) + "..." : null),
                visionSummary: job.visionSummary || null,
                ocrText: job.resultText || null,
              }));
              setDocuments(fallbackDocs);
              setIsLoading(false);
              setIsLoadingRef(false);
              setHasError(false);
              onDocumentsChange?.(fallbackDocs.length);
              console.log(`[DocumentsSidebar] ✅ Using ${fallbackDocs.length} documents from fallbackJobs (database query failed)`);
              return;
            }
          }
          // No fallback available - show error
          data = null;
          error = jobsResult.error;
          console.error("[DocumentsSidebar] ❌ Jobs query failed:", jobsResult.error);
          console.error("[DocumentsSidebar] 💡 Tip: Check RLS policies and database indexes");
        } else if (jobsResult.data) {
          data = jobsResult.data;
          error = null;
          if (data.length > 0) {
            console.log(`[DocumentsSidebar] ✅ Loaded ${data.length} jobs`);
        } else {
            console.log("[DocumentsSidebar] No jobs found (empty result)");
          }
          
          // Step 2: Fetch analysis_results separately (only if we have jobs)
          if (data.length > 0) {
            const jobIds = data.map((job: any) => job.id);
            console.log(`[DocumentsSidebar] Fetching analysis_results for ${jobIds.length} jobs...`);
            
            try {
              // Use a shorter timeout for analysis_results (3 seconds)
              const analysisQuery = supabaseClient
              .from("analysis_results")
              .select("job_id, vision_summary, ocr_text")
              .in("job_id", jobIds);
            
              // Reduced timeout for analysis query (3 seconds)
              const analysisTimeout = new Promise<{ data: null; error: { message: string } }>((resolve) => 
                setTimeout(() => resolve({ data: null, error: { message: "Analysis query timeout after 3 seconds" } }), 3000)
              );
              
              const analysisResult = await Promise.race([
                analysisQuery.then(r => ({ data: r.data, error: r.error })),
                analysisTimeout,
              ]);
              
              if (!analysisResult.error && analysisResult.data) {
                const analysisMap = new Map(analysisResult.data.map((ar: any) => [ar.job_id, ar]));
                data = data.map((job: any) => ({
                ...job,
                analysis_results: analysisMap.get(job.id) || null
              }));
                const resultsWithSummaries = data.filter((j: any) => j.analysis_results).length;
                console.log(`[DocumentsSidebar] ✅ Loaded ${analysisResult.data.length} analysis results (${resultsWithSummaries} jobs have summaries)`);
              } else {
                console.warn("[DocumentsSidebar] ⚠️ Could not load analysis_results:", analysisResult.error);
                console.warn("[DocumentsSidebar] 💡 Documents will show without summaries");
                // Continue without summaries - documents will still show
                data = data.map((job: any) => ({
                  ...job,
                  analysis_results: null
                }));
              }
            } catch (analysisErr) {
              console.warn("[DocumentsSidebar] ⚠️ Exception loading analysis_results:", analysisErr);
              // Continue without summaries
              data = data.map((job: any) => ({
                ...job,
                analysis_results: null
              }));
            }
          } else {
            console.log("[DocumentsSidebar] No jobs found, skipping analysis_results query");
            }
        } else {
          // No data and no error - empty result
          data = [];
          error = null;
          console.log("[DocumentsSidebar] No jobs found with analysis_target in ['document-analysis', 'image-ocr']");
          
          // DEBUG: Try a fallback query to see what analysis_target values actually exist
          try {
            const debugQuery = supabaseClient
              .from("processing_jobs")
              .select("id, file_name, analysis_target, status, user_id")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(5);
            
            const debugResult = await Promise.race([
              debugQuery.then(r => ({ data: r.data, error: r.error })),
              new Promise<{ data: null; error: { message: string } }>((resolve) => 
                setTimeout(() => resolve({ data: null, error: { message: "Debug query timeout" } }), 2000)
              ),
            ]);
            
            if (debugResult.data && debugResult.data.length > 0) {
              const analysisTargets = [...new Set(debugResult.data.map((j: any) => j.analysis_target))];
              console.warn("[DocumentsSidebar] 🔍 DEBUG: Found jobs with different analysis_target values:", analysisTargets);
              console.warn("[DocumentsSidebar] 🔍 DEBUG: Sample jobs:", debugResult.data.map((j: any) => ({
                file: j.file_name,
                target: j.analysis_target,
                status: j.status
              })));
              console.warn("[DocumentsSidebar] 💡 TIP: If documents have different analysis_target, they won't show. Current filter: ['document-analysis', 'image-ocr']");
            } else {
              console.log("[DocumentsSidebar] 🔍 DEBUG: No jobs found for this user at all");
            }
          } catch (debugErr) {
            console.warn("[DocumentsSidebar] Debug query failed:", debugErr);
          }
        }
      } catch (queryError) {
        console.error("[DocumentsSidebar] Query exception:", queryError);
        error = { message: queryError instanceof Error ? queryError.message : String(queryError) };
        data = null;
      }

      if (error) {
        console.error("[DocumentsSidebar] ❌ Database query error:", error);
        console.error("[DocumentsSidebar] Error details:", JSON.stringify(error, null, 2));
        console.error("[DocumentsSidebar] Query was:", {
          table: "processing_jobs",
          filters: {
            user_id: userId,
            analysis_target: "document-analysis",
          },
          sessionUserId: session?.user?.id,
        });
        
        // If RLS error, provide helpful message
        if (error?.message?.includes("permission") || error?.message?.includes("policy") || error?.code === "42501") {
          console.error("[DocumentsSidebar] 🔒 RLS Policy Error Detected!");
          console.error("[DocumentsSidebar] This usually means:");
          console.error("  1. RLS policies are not applied - run migration: 20251203012909_fix_processing_jobs_rls.sql");
          console.error("  2. User ID mismatch - check if userId matches auth.uid()");
          console.error("  3. User is not authenticated - check session");
        }
        
        // Try a simpler query without analysis_target filter to debug
        if (error || !data || data.length === 0) {
          console.log("[DocumentsSidebar] ⚠️ Primary query returned no results, attempting fallback query...");
          console.log("[DocumentsSidebar] Fallback query will show ALL jobs for this user (not just document-analysis)");
          try {
            // Fallback query: Also include documents with NULL user_id (for backward compatibility)
            const fallbackQuery = supabaseClient
              .from("processing_jobs")
              .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target")
              .or(`user_id.eq.${userId},user_id.is.null`) // Include documents with matching user_id OR NULL user_id
              .order("created_at", { ascending: false })
              .limit(50);
            
            const fallbackTimeout = new Promise<{ data: null; error: { message: string } }>((resolve) => 
              setTimeout(() => resolve({ data: null, error: { message: "Fallback query timeout after 5 seconds" } }), 5000)
            );
            
            const fallbackResult = await Promise.race([
              fallbackQuery.then(r => ({ data: r.data, error: r.error })),
              fallbackTimeout,
            ]);
            
            if (!fallbackResult.error && fallbackResult.data) {
              // Fetch analysis results for fallback data too
              const jobIds = fallbackResult.data.map((job: any) => job.id);
              if (jobIds.length > 0) {
                try {
                  // Use shorter timeout for analysis_results in fallback too
                  const analysisQuery = supabaseClient
                  .from("analysis_results")
                  .select("job_id, vision_summary, ocr_text")
                  .in("job_id", jobIds);
                
                  const analysisTimeout = new Promise<{ data: null; error: { message: string } }>((resolve) => 
                    setTimeout(() => resolve({ data: null, error: { message: "Analysis query timeout" } }), 3000)
                  );
                  
                  const analysisResult = await Promise.race([
                    analysisQuery.then(r => ({ data: r.data, error: r.error })),
                    analysisTimeout,
                  ]);
                  
                  const analysisData = analysisResult.data;
                  const analysisError = analysisResult.error;
                  
                  const analysisMap = new Map((analysisData || [])?.map((ar: any) => [ar.job_id, ar]) || []);
                  const fallbackWithAnalysis = fallbackResult.data.map((job: any) => ({
                  ...job,
                  analysis_results: analysisMap.get(job.id) || null
                }));
                  
                  // Log which jobs have analysis results (helps diagnose processing issues)
                  const jobsWithResults = fallbackWithAnalysis.filter((j: any) => j.analysis_results).length;
                  const jobsWithoutResults = fallbackWithAnalysis.length - jobsWithResults;
                  console.log(`[DocumentsSidebar] Fallback: ${jobsWithResults} jobs have analysis results, ${jobsWithoutResults} do not`);
                  
                  if (jobsWithoutResults > 0) {
                    const jobsNeedingProcessing = fallbackWithAnalysis
                      .filter((j: any) => !j.analysis_results && j.status !== "failed")
                      .map((j: any) => ({ id: j.id, fileName: j.file_name, status: j.status }));
                    console.warn(`[DocumentsSidebar] ⚠️ ${jobsWithoutResults} jobs are missing analysis results:`, jobsNeedingProcessing);
                    console.warn(`[DocumentsSidebar] 💡 These jobs may still be processing. Check textract-worker logs.`);
                  }
                
                // Use the fallback data if it has document-analysis jobs, or show all if none
                  const docJobs = fallbackWithAnalysis.filter((j: any) => j.analysis_target === "document-analysis");
                if (docJobs.length > 0) {
                  data = docJobs;
                  error = null;
                    console.log(`[DocumentsSidebar] ✅ Fallback query loaded ${docJobs.length} documents`);
                } else if (fallbackWithAnalysis.length > 0) {
                  // Show all jobs if no document-analysis jobs found (they might have different analysis_target)
                  // This helps debug and shows any uploaded files
                  data = fallbackWithAnalysis;
                  error = null;
                  console.log(`[DocumentsSidebar] ⚠️ Fallback query loaded ${fallbackWithAnalysis.length} total jobs (showing all, not just document-analysis)`);
                    console.log(`[DocumentsSidebar] Analysis targets found:`, fallbackWithAnalysis.map((j: any) => j.analysis_target));
                  console.log(`[DocumentsSidebar] 💡 Documents exist but have different analysis_target. Showing all jobs.`);
                  console.log(`[DocumentsSidebar] 💡 To fix: Documents should have analysis_target = 'document-analysis'`);
                } else {
                  // No jobs found at all - this means either no documents or user_id mismatch
                  console.warn(`[DocumentsSidebar] ⚠️ Fallback query also returned 0 documents`);
                  console.warn(`[DocumentsSidebar] This means:`);
                  console.warn(`  1. No documents exist for user_id: ${userId}`);
                  console.warn(`  2. OR user_id mismatch - documents might have different user_id`);
                  console.warn(`[DocumentsSidebar] 💡 Check Supabase: SELECT * FROM processing_jobs WHERE user_id = '${userId}'`);
                  console.warn(`[DocumentsSidebar] 💡 Or check all documents: SELECT * FROM processing_jobs ORDER BY created_at DESC LIMIT 10`);
                  }
                } catch (analysisErr) {
                  console.warn("[DocumentsSidebar] ⚠️ Failed to load analysis_results in fallback:", analysisErr);
                  // Continue without summaries
                  const fallbackWithoutAnalysis = fallbackResult.data.map((job: any) => ({
                    ...job,
                    analysis_results: null
                  }));
                  const docJobs = fallbackWithoutAnalysis.filter((j: any) => j.analysis_target === "document-analysis");
                  if (docJobs.length > 0) {
                    data = docJobs;
                    error = null;
                    console.log(`[DocumentsSidebar] ✅ Fallback query loaded ${docJobs.length} documents (without summaries)`);
                  } else if (fallbackWithoutAnalysis.length > 0) {
                    data = fallbackWithoutAnalysis;
                    error = null;
                    console.log(`[DocumentsSidebar] ⚠️ Fallback query loaded ${fallbackWithoutAnalysis.length} total jobs (without summaries)`);
                  }
                }
              }
            }
          } catch (fallbackError) {
            console.error("[DocumentsSidebar] Fallback query also failed:", fallbackError);
          }
        }
        
        // CRITICAL: Always clear loading state, even if there's an error or no data
        if (error && (!data || data.length === 0)) {
          // FALLBACK: Try using fallbackJobs if database query failed
          if (fallbackJobs && fallbackJobs.length > 0) {
            console.log("[DocumentsSidebar] ⚠️ Database query failed, using fallback jobs:", fallbackJobs.length);
            const fallbackDocs = fallbackJobs
              .filter(job => job.status === "completed")
              .map(job => ({
                jobId: job.id,
                fileName: job.fileName,
                fileType: job.fileName.split('.').pop() || 'unknown',
                fileSize: 0,
                status: job.status,
                stage: job.stage || "unknown",
                createdAt: job.updatedAt || new Date().toISOString(),
                updatedAt: job.updatedAt || new Date().toISOString(),
                summary: job.visionSummary || (job.resultText ? job.resultText.substring(0, 200) + "..." : null),
                visionSummary: job.visionSummary || null,
                ocrText: job.resultText || null,
              }));
            
            setDocuments(fallbackDocs);
            setIsLoading(false);
            setIsLoadingRef(false);
            setHasCheckedSession(true);
            setHasError(false);
            onDocumentsChange?.(fallbackDocs.length);
            console.log(`[DocumentsSidebar] ✅ Loaded ${fallbackDocs.length} documents from fallback`);
            return;
          }
          
          setIsLoading(false);
          setIsLoadingRef(false); // CRITICAL: Clear this too, otherwise loading state gets stuck
          setDocuments([]);
          setHasCheckedSession(true);
          
          // Still notify parent of 0 documents
          onDocumentsChange?.(0);
          
          // Only show error toast if it's not a timeout (to avoid spam, safety timeout will handle it)
          const isTimeout = error.message?.includes("timeout") || error.message?.includes("Timeout");
          if (!isTimeout) {
            toast({
              title: "Error loading documents",
              description: error.message || "Failed to load documents. Check console for details.",
              variant: "destructive",
            });
          } else {
            // For timeouts, just log - safety timeout will clear the UI
            console.warn("[DocumentsSidebar] Query timed out, safety timeout will clear loading state");
          }
          return;
        }
      }

      const docs = (data || []).map((job: any) => {
        const metadata = job.metadata as Record<string, unknown> | null;
        const stage = metadata?.job_stage as string | undefined;
        
        // Extract summary from analysis_results (now a single object or null)
        const analysisResult = job.analysis_results || null;
        
        const visionSummary = analysisResult?.vision_summary || null;
        const ocrText = analysisResult?.ocr_text || null;
        
        // Prefer vision_summary, fallback to first 200 chars of ocr_text
        const summary = visionSummary || (ocrText ? ocrText.substring(0, 200) + (ocrText.length > 200 ? "..." : "") : null);
        
        return {
          jobId: job.id,
          fileName: job.file_name,
          fileType: job.file_type,
          fileSize: job.file_size,
          status: job.status,
          stage: stage || "unknown",
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          summary,
          visionSummary,
          ocrText: ocrText ? (ocrText.length > 200 ? ocrText.substring(0, 200) + "..." : ocrText) : null,
        };
      });
      
      // CRITICAL: Don't overwrite documents if we already have fallback documents
      // Only update if database query returned more documents, or if we have no documents yet
      const hasExistingDocs = documents.length > 0;
      const hasNewDocs = docs.length > 0;
      
      if (hasExistingDocs && !hasNewDocs) {
        console.log("[DocumentsSidebar] ⚠️ Database query returned 0 documents, but we have existing documents from fallback. Keeping existing documents.");
        setIsLoading(false);
        setIsLoadingRef(false);
        setHasCheckedSession(true);
        setHasError(false);
        // Don't update documents or call onDocumentsChange - keep existing state
        return;
      }
      
      // CRITICAL: Always set documents and clear loading, even if empty
      // This must happen regardless of whether we found documents or not
      setDocuments(docs);
      setIsLoading(false);
      setIsLoadingRef(false);
      setHasCheckedSession(true);
      setHasError(false);
      
      // CRITICAL: Always notify parent of document count change (even if 0)
      // This allows the panel to show/hide correctly
      onDocumentsChange?.(docs.length);
      
      // Auto-expand when documents are found
      if (docs.length > 0 && !isExpanded) {
        setIsExpanded(true);
      }
      
      if (docs.length === 0) {
        console.warn("[DocumentsSidebar] ⚠️ No documents found in query results");
        console.warn("[DocumentsSidebar] Query filters used:", {
          userId: userId,
          analysisTarget: "document-analysis",
          sessionUserId: session?.user?.id,
        });
        console.warn("[DocumentsSidebar] Possible causes:");
        console.warn("  1. No documents uploaded yet for this user");
        console.warn("  2. Documents have different user_id (check database)");
        console.warn("  3. Documents have different analysis_target (fallback query should catch this)");
        console.warn("  4. RLS policies blocking the query (check Supabase migrations)");
        console.warn("  5. Query timed out (check for timeout errors above)");
        console.warn("[DocumentsSidebar] 💡 Next steps:");
        console.warn("  - Check Supabase SQL Editor: SELECT * FROM processing_jobs WHERE user_id = '" + userId + "'");
        console.warn("  - Verify RLS policies: SELECT * FROM pg_policies WHERE tablename = 'processing_jobs'");
        console.warn("  - Check analysis_target: SELECT DISTINCT analysis_target FROM processing_jobs WHERE user_id = '" + userId + "'");
      } else {
        console.log(`[DocumentsSidebar] ✅ Successfully loaded ${docs.length} document(s)`);
        console.log(`[DocumentsSidebar] Documents with summaries: ${docs.filter(d => d.summary).length}`);
        console.log(`[DocumentsSidebar] Document file names:`, docs.map(d => d.fileName));
      }
    } catch (error) {
      console.error("[DocumentsSidebar] Error loading documents:", error);
      console.error("[DocumentsSidebar] Error details:", JSON.stringify(error, null, 2));
      // CRITICAL: Always clear loading state even on error
      setIsLoading(false);
      setIsLoadingRef(false);
      setHasCheckedSession(true);
      setDocuments([]); // Clear documents on error
      setHasError(true); // Mark that there's an error
      // Notify parent of 0 documents (only once)
      onDocumentsChange?.(0);
      
      // Only show error toast if it's not a timeout (to avoid spam)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes("timeout");
      
      if (!isTimeout) {
        toast({
          title: "Error loading documents",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  };

  // Initial load with delay to allow Supabase client to initialize
  useEffect(() => {
    if (!propUserId) {
      setIsLoading(false);
      setDocuments([]);
      return;
    }
    
    // CRITICAL FIX: Add 500ms delay before initial load to allow Supabase client to initialize
    // This resolves the race condition where query executes before client is ready
    // Updated: 2025-12-03 - Final fix using setTimeout delay
    console.log("[DocumentsSidebar] About to call loadDocuments() after 500ms delay...");
    
    let safetyTimeout: NodeJS.Timeout | null = null;
    
    // Add a safety timeout to force loading state to clear after 15 seconds (after query timeout of 10s)
    safetyTimeout = setTimeout(() => {
      console.warn("[DocumentsSidebar] Safety timeout: Forcing loading state to clear after 15s");
      setIsLoading(false);
      setIsLoadingRef(false);
      setHasCheckedSession(true);
      // Show helpful message if still loading
      if (documents.length === 0) {
        toast({
          title: "Documents loading slowly",
          description: "Query is taking longer than expected. Try refreshing or check your connection.",
          variant: "default",
        });
      }
    }, 25000);
    
    const initialLoadTimeout = setTimeout(() => {
      loadDocuments()
        .then(() => {
          if (safetyTimeout) clearTimeout(safetyTimeout); // Clear safety timeout if query completes
        })
        .catch((error) => {
          if (safetyTimeout) clearTimeout(safetyTimeout); // Clear safety timeout on error
          console.error("[DocumentsSidebar] Error loading documents:", error);
          setIsLoading(false);
          setIsLoadingRef(false);
          setDocuments([]);
          setHasError(true);
        });
    }, 500);
    
    // Set up polling interval for status updates (only if no persistent error)
    const interval = setInterval(() => {
      if (hasError) {
        return; // Skip refresh if there's a persistent error
      }
      
      loadDocuments().catch((error) => {
        console.error("[DocumentsSidebar] Error refreshing documents:", error);
        setIsLoading(false);
        setIsLoadingRef(false);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("timeout")) {
          setHasError(true); // Stop polling on timeout errors
        }
      });
    }, 10_000);
    
    return () => {
      clearTimeout(initialLoadTimeout);
      if (safetyTimeout) clearTimeout(safetyTimeout);
      clearInterval(interval);
    };
  }, [propUserId, hasError]);

  // Refresh when external trigger changes (e.g., when files are uploaded)
  // Use ref to track last refresh trigger to prevent duplicate refreshes
  const lastRefreshTriggerRef = useRef<number>(0);
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0 && propUserId && refreshTrigger !== lastRefreshTriggerRef.current) {
      lastRefreshTriggerRef.current = refreshTrigger;
      console.log("[DocumentsSidebar] 🔄 External refresh triggered:", refreshTrigger, "for userId:", propUserId);
      setHasError(false); // Reset error state on manual refresh
      setIsLoading(true); // Show loading state
      // Increased delay to ensure database insert and analysis_results are complete
      const refreshTimeout = setTimeout(() => {
        console.log("[DocumentsSidebar] 🔄 Executing refresh after delay...");
        loadDocuments().catch((error) => {
          console.error("[DocumentsSidebar] ❌ Error on external refresh:", error);
          setIsLoading(false);
        });
      }, 2000); // 2 second delay to allow DB insert and analysis_results to complete
      
      return () => clearTimeout(refreshTimeout);
    } else if (refreshTrigger && refreshTrigger > 0 && !propUserId) {
      console.warn("[DocumentsSidebar] ⚠️ Refresh triggered but no userId available yet");
    }
  }, [refreshTrigger, propUserId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "processing":
      case "queued":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getFileIcon = (fileType: string, fileName: string) => {
    if (fileType.startsWith("image/") || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return <Image className="h-5 w-5" />;
    }
    return <FileText className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDelete = async (jobId: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering document click
    
    if (!confirm(`Delete "${fileName}"? This will remove the job and all associated data.`)) {
      return;
    }

    setDeletingJobIds(prev => new Set(prev).add(jobId));
    
    try {
      await deleteProcessingJob(jobId, true); // Delete S3 file too
      toast({
        title: "Document deleted",
        description: `"${fileName}" has been deleted.`,
      });
      // Remove from local state immediately
      setDocuments(prev => {
        const updated = prev.filter(doc => doc.jobId !== jobId);
        onDocumentsChange?.(updated.length);
        return updated;
      });
    } catch (error) {
      console.error("Failed to delete job:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete document.",
        variant: "destructive",
      });
    } finally {
      setDeletingJobIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleBulkDeleteFailed = async () => {
    const failedJobs = documents.filter(doc => doc.status === "failed");
    if (failedJobs.length === 0) {
      toast({
        title: "No failed jobs",
        description: "There are no failed jobs to delete.",
      });
      return;
    }

    if (!confirm(`Delete ${failedJobs.length} failed job(s)? This cannot be undone.`)) {
      return;
    }

    const jobIdsToDelete = new Set(failedJobs.map(doc => doc.jobId));
    setDeletingJobIds(jobIdsToDelete);

    try {
      await Promise.all(
        failedJobs.map(doc => deleteProcessingJob(doc.jobId, true))
      );
      toast({
        title: "Failed jobs deleted",
        description: `Deleted ${failedJobs.length} failed job(s).`,
      });
      // Remove from local state
      setDocuments(prev => {
        const updated = prev.filter(doc => doc.status !== "failed");
        onDocumentsChange?.(updated.length);
        return updated;
      });
    } catch (error) {
      console.error("Failed to delete failed jobs:", error);
      toast({
        title: "Bulk delete failed",
        description: error instanceof Error ? error.message : "Failed to delete some jobs.",
        variant: "destructive",
      });
    } finally {
      setDeletingJobIds(new Set());
    }
  };

  const handleDeleteAll = async () => {
    if (documents.length === 0) {
      toast({
        title: "No documents",
        description: "There are no documents to delete.",
      });
      return;
    }

    if (!confirm(`Delete ALL ${documents.length} document(s)? This cannot be undone and will also delete files from S3.`)) {
      return;
    }

    const jobIdsToDelete = new Set(documents.map(doc => doc.jobId));
    setDeletingJobIds(jobIdsToDelete);

    try {
      await Promise.all(
        documents.map(doc => deleteProcessingJob(doc.jobId, true))
      );
      toast({
        title: "All documents deleted",
        description: `Deleted ${documents.length} document(s).`,
      });
      // Clear all documents from state
      setDocuments([]);
      onDocumentsChange?.(0);
    } catch (error) {
      console.error("Failed to delete all documents:", error);
      toast({
        title: "Delete all failed",
        description: error instanceof Error ? error.message : "Failed to delete some documents.",
        variant: "destructive",
      });
    } finally {
      setDeletingJobIds(new Set());
    }
  };

  // Expose deleteAll to window for console access
  // This version queries the database directly, so it works even when queries timeout
  useEffect(() => {
    if (typeof window !== "undefined" && propUserId) {
      (window as any).deleteAllDocuments = async () => {
        console.log("[DocumentsSidebar] 🗑️ Delete all function called - querying database directly...");
        
        try {
          // Query database directly (bypasses state)
          const { data: jobs, error } = await supabaseClient
            .from('processing_jobs')
            .select('id, file_name')
            .eq('user_id', propUserId)
            .in('analysis_target', ['document-analysis', 'image-ocr']);
          
          if (error) {
            console.error('[DocumentsSidebar] Failed to fetch jobs:', error);
            alert(`Failed to fetch documents: ${error.message}`);
            return;
          }
          
          if (!jobs || jobs.length === 0) {
            console.log('[DocumentsSidebar] No documents found');
            alert('No documents found to delete');
            return;
          }
          
          const confirmed = confirm(`Delete ALL ${jobs.length} document(s)?\n\nThis will:\n- Delete from database\n- Delete files from S3\n- Cannot be undone!`);
          
          if (!confirmed) {
            console.log('[DocumentsSidebar] Deletion cancelled');
            return;
          }
          
          console.log(`[DocumentsSidebar] Deleting ${jobs.length} documents...`);
          
          let deleted = 0;
          let failed = 0;
          
          for (const job of jobs) {
            try {
              await deleteProcessingJob(job.id, true);
              deleted++;
              console.log(`✅ Deleted: ${job.file_name}`);
            } catch (error) {
              failed++;
              console.error(`❌ Failed: ${job.file_name}`, error);
            }
          }
          
          console.log(`[DocumentsSidebar] ✅ Deleted: ${deleted}/${jobs.length}`);
          if (failed > 0) {
            console.error(`[DocumentsSidebar] ❌ Failed: ${failed}/${jobs.length}`);
          }
          
          alert(`Deleted ${deleted} of ${jobs.length} document(s). ${failed > 0 ? `\n${failed} failed.` : ''}\n\nRefresh the page to see changes.`);
          
          // Trigger refresh
          if (deleted > 0) {
            loadDocuments().catch(() => {});
          }
        } catch (error) {
          console.error('[DocumentsSidebar] Delete all error:', error);
          alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      console.log("[DocumentsSidebar] 💡 Delete all function available: window.deleteAllDocuments()");
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).deleteAllDocuments;
      }
    };
  }, [propUserId]);

  const failedCount = documents.filter(doc => doc.status === "failed").length;

  // DIAGNOSTIC: Log render with current state
  console.log("[DocumentsSidebar] RENDER - Current state:", {
    isLoading,
    documentCount: documents.length,
    hasError,
    propUserId,
    hasCheckedSession,
    isExpanded, // Add this to see if sidebar is expanded
  });

  // Ensure onDocumentsChange is always called with current document count
  // This is critical for the hidden instance to notify parent when documents are found
  useLayoutEffect(() => {
    if (hasCheckedSession && !isLoading) {
      onDocumentsChange?.(documents.length);
    }
  }, [documents.length, hasCheckedSession, isLoading, onDocumentsChange]);

  // Auto-expand sidebar when documents are loaded (even if not expanded yet)
  // Also check fallbackJobs directly if we don't have documents yet
  useLayoutEffect(() => {
    // If we have documents, expand
    if (documents.length > 0 && !isExpanded && hasCheckedSession && !isLoading) {
      console.log(`[DocumentsSidebar] 🔓 Auto-expanding sidebar - ${documents.length} documents available`);
      setIsExpanded(true);
    }
    
    // If we don't have documents but have fallbackJobs, use them immediately
    if (documents.length === 0 && fallbackJobs && fallbackJobs.length > 0 && !isLoading) {
      const completedFallbackJobs = fallbackJobs.filter(job => job.status === "completed");
      if (completedFallbackJobs.length > 0) {
        console.log(`[DocumentsSidebar] 🔓 Using fallbackJobs immediately - ${completedFallbackJobs.length} completed jobs`);
        const fallbackDocs = completedFallbackJobs.map(job => ({
          jobId: job.id,
          fileName: job.fileName,
          fileType: job.fileName.split('.').pop() || 'unknown',
          fileSize: job.contentLength ?? 0, // Use contentLength from fallbackJobs
          status: job.status,
          stage: job.stage || "unknown",
          createdAt: job.updatedAt || new Date().toISOString(),
          updatedAt: job.updatedAt || new Date().toISOString(),
          summary: job.visionSummary || (job.resultText ? job.resultText.substring(0, 200) + "..." : null),
          visionSummary: job.visionSummary || null,
          ocrText: job.resultText || null,
        }));
        setDocuments(fallbackDocs);
        setIsExpanded(true);
        setHasCheckedSession(true);
        onDocumentsChange?.(fallbackDocs.length);
      }
    }
  }, [documents.length, isExpanded, hasCheckedSession, isLoading, fallbackJobs, onDocumentsChange]);

  // Check if we have fallbackJobs that could be used
  const hasAvailableFallbackJobs = fallbackJobs && fallbackJobs.length > 0 && fallbackJobs.some(job => job.status === "completed");
  
  // Don't render UI if no documents and not loading (for hidden loader instance)
  // This prevents showing "No documents yet" when panel should be completely hidden
  // The onDocumentsChange callback is ensured above via useLayoutEffect
  // IMPORTANT: This ensures the panel is completely hidden (not just collapsed) when empty
  // This applies to both logged-in users and guest mode
  // EXCEPTION: If we have fallbackJobs, allow rendering so they can be loaded
  if (documents.length === 0 && !isLoading && hasCheckedSession && !hasAvailableFallbackJobs) {
    return null;
  }

  // Also don't render if we're still loading and haven't checked session yet
  // This prevents showing loading state when we don't have a user
  // EXCEPTION: If we have fallbackJobs, allow rendering so they can be loaded
  if (!hasCheckedSession && !isLoading && !hasAvailableFallbackJobs) {
    return null;
  }

  // Don't render if we have no userId (guest mode without proper setup)
  // This ensures guest users don't see an empty panel
  if (!propUserId && documents.length === 0 && !isLoading) {
    return null;
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Documents & Knowledge
              {documents.length > 0 && (
                <span className="text-xs text-muted-foreground ml-2">({documents.length})</span>
              )}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {documents.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteAll}
                disabled={isLoading || deletingJobIds.size > 0}
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                title="Delete all documents"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete All
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log(`[DocumentsSidebar] Toggling expanded: ${isExpanded} -> ${!isExpanded}`);
                setIsExpanded(!isExpanded);
              }}
              className="h-7 w-7 p-0"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <X className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="p-2 flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            {failedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkDeleteFailed}
                disabled={isLoading || deletingJobIds.size > 0}
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                title={`Delete ${failedCount} failed job(s)`}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear Failed
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDocuments}
              disabled={isLoading}
              className="h-6 px-2 text-xs ml-auto"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        {isLoading && documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground mt-2">Loading documents...</span>
            <span className="text-[10px] text-muted-foreground/50 mt-1">Check console (F12) for details</span>
            {/* DIAGNOSTIC: Show diagnostic info */}
            <div className="mt-4 p-2 bg-muted/50 rounded text-[10px] text-left max-w-full overflow-auto">
              <div>propUserId: {propUserId ? `${propUserId.substring(0, 20)}...` : 'undefined'}</div>
              <div>hasError: {String(hasError)}</div>
              <div>hasCheckedSession: {String(hasCheckedSession)}</div>
              <div>isLoadingRef: {String(isLoadingRef)}</div>
            </div>
          </div>
        ) : documents.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No documents yet</p>
            <p className="text-xs mt-1">Upload files via chat</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
            {documents.map((doc) => (
              <div
                key={doc.jobId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("application/json", JSON.stringify({
                    jobId: doc.jobId,
                    fileName: doc.fileName,
                    fileType: doc.fileType,
                  }));
                  // Add visual feedback
                  e.currentTarget.style.opacity = "0.5";
                }}
                onDragEnd={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
                className={cn(
                  "w-full p-2 rounded-md border transition-colors group cursor-move",
                  "hover:bg-muted/50 hover:border-primary/50",
                  "active:cursor-grabbing",
                )}
                title={`Drag to chat to include "${doc.fileName}" in your message`}
              >
                <button
                  onClick={() => onDocumentClick?.(doc.jobId)}
                  className="w-full text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">
                      {getFileIcon(doc.fileType, doc.fileName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" title={doc.fileName}>
                        {doc.fileName}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusIcon(doc.status)}
                        <span className="text-[10px] text-muted-foreground">
                          {doc.status}
                          {doc.stage !== "unknown" && ` • ${doc.stage}`}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatFileSize(doc.fileSize)}
                      </p>
                      {doc.summary && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2" title={doc.summary}>
                          {doc.summary}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex justify-end mt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDelete(doc.jobId, doc.fileName, e)}
                    disabled={deletingJobIds.has(doc.jobId)}
                    className={cn(
                      "h-5 w-5 p-0 text-[10px] opacity-70 hover:opacity-100 transition-opacity",
                      "text-destructive hover:text-destructive hover:bg-destructive/10"
                    )}
                    title="Delete document"
                  >
                    {deletingJobIds.has(doc.jobId) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        </CardContent>
      )}
    </Card>
  );
};

