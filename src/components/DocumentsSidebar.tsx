import React, { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Image, Loader2, CheckCircle2, XCircle, Clock, Trash2 } from "lucide-react";
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
}

export const DocumentsSidebar: React.FC<{ 
  onDocumentClick?: (jobId: string) => void;
  refreshTrigger?: number; // External trigger to force refresh
  userId?: string; // Optional userId from parent (bypasses session retrieval)
}> = ({ onDocumentClick, refreshTrigger, userId: propUserId }) => {
  
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  const [isLoadingRef, setIsLoadingRef] = useState(false); // Prevent concurrent loads
  const [hasError, setHasError] = useState(false); // Track if there's a persistent error
  const [deletingJobIds, setDeletingJobIds] = useState<Set<string>>(new Set()); // Track jobs being deleted

  const loadDocuments = async () => {
    // Prevent concurrent loads
    if (isLoadingRef) {
      return;
    }
    
    try {
      setIsLoadingRef(true);
      setIsLoading(true);
      setHasError(false); // Clear error state on new attempt
      
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
          setIsLoading(false);
          setDocuments([]);
          setHasCheckedSession(true);
          return;
        }
      }
      
      if (!userId) {
        setIsLoading(false);
        setDocuments([]);
        setHasCheckedSession(true);
        return;
      }
      
      // CRITICAL FIX: Call getSession() to ensure the client is fully initialized and has the session.
      // This is the key difference from the working ragService.ts.
      // Without this, the Supabase client doesn't "wake up" and the query promise never executes.
      // Add timeout to prevent hanging
      try {
        const getSessionPromise = supabaseClient.auth.getSession();
        const getSessionTimeout = new Promise<{ data: { session: null } }>((resolve) => {
          setTimeout(() => {
            console.warn("[DocumentsSidebar] getSession() timed out after 2 seconds - continuing anyway");
            resolve({ data: { session: null } });
          }, 2_000);
        });
        
        const sessionResult = await Promise.race([getSessionPromise, getSessionTimeout]);
        const clientSession = 'data' in sessionResult ? sessionResult.data?.session : null;
        
        if (clientSession) {
          console.log("[DocumentsSidebar] getSession() completed successfully");
        } else {
          console.warn("[DocumentsSidebar] getSession() timed out or returned no session - continuing anyway");
        }
      } catch (getSessionErr) {
        console.warn("[DocumentsSidebar] getSession() error (non-fatal):", getSessionErr);
      }
      
      setHasCheckedSession(true);
      
      // Execute query directly - matching ragService.ts pattern exactly
      let data, error;
      try {
        const { data: queryData, error: queryError } = await supabaseClient
          .from("processing_jobs")
          .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        
        data = queryData;
        error = queryError;
        
        if (error) {
          console.error("[DocumentsSidebar] Query error:", error);
        } else {
          console.log(`[DocumentsSidebar] Loaded ${data?.length || 0} documents`);
        }
      } catch (queryError) {
        console.error("[DocumentsSidebar] Query exception:", queryError);
        error = { message: queryError instanceof Error ? queryError.message : String(queryError) };
        data = null;
      }

      if (error) {
        console.error("[DocumentsSidebar] Database query error:", error);
        console.error("[DocumentsSidebar] Error details:", JSON.stringify(error, null, 2));
        console.error("[DocumentsSidebar] Query was:", {
          table: "processing_jobs",
          filters: {
            user_id: session.user.id,
            analysis_target: "document-analysis",
          },
        });
        
        // Try a simpler query without analysis_target filter to debug
        console.log("[DocumentsSidebar] Attempting fallback query without analysis_target filter...");
        try {
          const fallbackQuery = supabaseClient
            .from("processing_jobs")
            .select("id, file_name, file_type, file_size, status, metadata, created_at, updated_at, analysis_target")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(50);
          
          const fallbackResult = await Promise.race([
            fallbackQuery.then(r => ({ data: r.data, error: r.error })),
            new Promise<{ data: null; error: { message: string } }>((resolve) => 
              setTimeout(() => resolve({ data: null, error: { message: "Fallback query timeout" } }), 5000)
            ),
          ]);
          
          if (fallbackResult.data) {
            // Fallback query succeeded - use the data
            
            // Use the fallback data if it has document-analysis jobs
            const docJobs = fallbackResult.data.filter(j => j.analysis_target === "document-analysis");
            if (docJobs.length > 0) {
              data = docJobs;
              error = null;
            }
          }
        } catch (fallbackError) {
          console.error("[DocumentsSidebar] Fallback query also failed:", fallbackError);
        }
        
        if (error) {
          // CRITICAL: Always clear loading state on error
          setIsLoading(false);
          setDocuments([]);
          
          toast({
            title: "Error loading documents",
            description: error.message || "Failed to load documents. Check console for details.",
            variant: "destructive",
          });
          return;
        }
      }

      const docs = (data || []).map((job: any) => {
        const metadata = job.metadata as Record<string, unknown> | null;
        const stage = metadata?.job_stage as string | undefined;
        return {
          jobId: job.id,
          fileName: job.file_name,
          fileType: job.file_type,
          fileSize: job.file_size,
          status: job.status,
          stage: stage || "unknown",
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        };
      });
      
      // CRITICAL: Always set documents and clear loading, even if empty
      setDocuments(docs);
      setIsLoading(false);
      setHasCheckedSession(true);
      setIsLoadingRef(false);
      setHasError(false);
      
      if (docs.length === 0) {
        console.warn("[DocumentsSidebar] No documents found. Query filters:", {
          userId: userId,
          analysisTarget: "document-analysis",
        });
        console.warn("[DocumentsSidebar] This might indicate:");
        console.warn("  1. No documents uploaded yet");
        console.warn("  2. Documents have different user_id");
        console.warn("  3. Documents have different analysis_target");
        console.warn("  4. RLS policies blocking the query");
      } else {
        console.log(`[DocumentsSidebar] ✅ Successfully loaded ${docs.length} document(s)`);
      }
    } catch (error) {
      console.error("[DocumentsSidebar] Error loading documents:", error);
      console.error("[DocumentsSidebar] Error details:", JSON.stringify(error, null, 2));
      // CRITICAL: Always clear loading state even on error
      setIsLoading(false);
      setIsLoadingRef(false);
      setDocuments([]); // Clear documents on error
      setHasError(true); // Mark that there's an error
      
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

  useEffect(() => {
    console.log("[DocumentsSidebar] ===== useEffect MOUNTED =====");
    console.log("[DocumentsSidebar] Component mounted, starting initial load");
    console.log("[DocumentsSidebar] propUserId value:", propUserId);
    console.log("[DocumentsSidebar] propUserId type:", typeof propUserId);
    console.log("[DocumentsSidebar] propUserId truthy?", !!propUserId);
    console.log("[DocumentsSidebar] Environment check:", {
      hasSupabaseUrl: !!import.meta.env.VITE_SUPABASE_URL,
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      hasSupabaseKey: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
    
    // Immediate load
    console.log("[DocumentsSidebar] About to call loadDocuments()...");
    const loadPromise = loadDocuments();
    console.log("[DocumentsSidebar] loadDocuments() called, promise:", loadPromise);
    
    loadPromise.catch((error) => {
      console.error("[DocumentsSidebar] CRITICAL: Initial load failed:", error);
      console.error("[DocumentsSidebar] Error stack:", error instanceof Error ? error.stack : "No stack");
      console.error("[DocumentsSidebar] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "Unknown",
      });
      // Ensure loading state is cleared even if loadDocuments throws
      setIsLoading(false);
      setIsLoadingRef(false);
      setDocuments([]);
      setHasError(true);
    });
    
    // Refresh every 10 seconds to show status updates (only if no persistent error)
    const interval = setInterval(() => {
      // Skip refresh if there's a persistent error (like timeout) to avoid spam
      if (hasError) {
        console.log("[DocumentsSidebar] Skipping refresh due to persistent error");
        return;
      }
      
      console.log("[DocumentsSidebar] Interval refresh triggered");
      loadDocuments().catch((error) => {
        console.error("[DocumentsSidebar] Error refreshing documents:", error);
        // Don't show toast on every refresh error to avoid spam
        setIsLoading(false);
        setIsLoadingRef(false);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("timeout")) {
          setHasError(true); // Stop polling on timeout errors
        }
      });
    }, 10_000); // Increased to 10 seconds to reduce load
    
    return () => {
      console.log("[DocumentsSidebar] Cleanup - clearing interval and resetting state");
      clearInterval(interval);
      setIsLoading(false);
      setIsLoadingRef(false);
    };
  }, []); // DIAGNOSTIC: Changed back to [] to match working version

  // Refresh when external trigger changes (e.g., when files are uploaded)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      console.log("[DocumentsSidebar] External refresh triggered:", refreshTrigger);
      setHasError(false); // Reset error state on manual refresh
      setIsLoading(true); // Show loading state
      // Small delay to ensure database transaction is committed
      setTimeout(() => {
        loadDocuments().catch((error) => {
          console.error("[DocumentsSidebar] Error on external refresh:", error);
          setIsLoading(false);
        });
      }, 500); // 500ms delay to allow DB insert to complete
    }
  }, [refreshTrigger]);

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
      setDocuments(prev => prev.filter(doc => doc.jobId !== jobId));
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
      setDocuments(prev => prev.filter(doc => doc.status !== "failed"));
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

  const failedCount = documents.filter(doc => doc.status === "failed").length;

  // DIAGNOSTIC: Log render with current state
  console.log("[DocumentsSidebar] RENDER - Current state:", {
    isLoading,
    documentCount: documents.length,
    hasError,
    propUserId,
    hasCheckedSession,
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Documents & Knowledge
            {/* DIAGNOSTIC: Show propUserId in title if available */}
            {propUserId && <span className="text-xs text-muted-foreground ml-2">(User: {propUserId.substring(0, 8)}...)</span>}
          </CardTitle>
          <div className="flex items-center gap-1">
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
              className="h-6 px-2 text-xs"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
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
                className={cn(
                  "w-full p-2 rounded-md border transition-colors group",
                  "hover:bg-muted/50 hover:border-primary/50",
                )}
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
    </Card>
  );
};

