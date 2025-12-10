import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ui/chat-input";
import { FileUploadStatus } from "@/components/FileUploadStatus";
import { DocumentsSidebar } from "@/components/DocumentsSidebar";
import { DocumentsSidebarTest } from "@/components/DocumentsSidebar.test";
import { DocumentsSidebarMinimalTest } from "@/components/DocumentsSidebarMinimalTest";
import { useChatContext } from "@/context/ChatContext";
import { fetchJobStatus } from "@/lib/api";
import { supabaseClient } from "@/lib/supabaseClient";
import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import {
  Volume2,
  VolumeX,
  LogIn,
  ChevronDown,
  ChevronUp,
  Server,
  Workflow,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useVoicePlayback } from "@/hooks/useVoicePlayback";
import { useToast } from "@/components/ui/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { McpEventLog } from "@/components/McpEventLog";
import { Footer } from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Provider } from "@/hooks/useChat";
import type { McpRegistryEntry } from "@/lib/mcp/types";
import type { UploadJob } from "@/types/uploads";
import { parseStageMetadata } from "@/types/uploads";

const Index = () => {
  const {
    messages,
    sendMessage,
    isLoading,
    provider,
    providerLabel,
    providerOptions,
    session,
    authReady,
    isAuthLoading,
    guestMode,
    enableGuestMode,
    signInWithGoogle,
    signOut,
    appendAssistantText,
    setProvider: setChatProvider,
    registry,
    mcpEvents,
    resetChat,
    addEvent,
  } = useChatContext();
  const { toast } = useToast();
  const hasChatHistory = (!!session || guestMode) && (messages.length > 0 || mcpEvents.length > 0);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set()); // Track documents dropped into chat

  const handleRefreshChat = useCallback(() => {
    if (!session && !guestMode) return;
    resetChat();
    toast({
      title: "Chat refreshed",
      description: "Start a new request whenever you're ready.",
    });
  }, [resetChat, session, toast]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSpokenRef = useRef<string>("");
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [isRegisteringUpload, setIsRegisteringUpload] = useState(false);
  const [documentsSidebarRefreshTrigger, setDocumentsSidebarRefreshTrigger] = useState(0);
  const [documentCount, setDocumentCount] = useState(0); // Track document count for conditional rendering
  const [panelsVisible, setPanelsVisible] = useState(true); // Track visibility of documents/logs panels
  const previousDocumentCountRef = useRef<number>(0); // Track previous count to detect new uploads
  const previousMcpEventsCountRef = useRef<number>(0); // Track previous MCP events count
  const isInitialMountRef = useRef<boolean>(true); // Track if this is the first render
  
  // Initialize refs on mount to prevent false triggers
  useEffect(() => {
    if (isInitialMountRef.current) {
      // Set initial values to current values to prevent false triggers
      previousDocumentCountRef.current = documentCount;
      previousMcpEventsCountRef.current = mcpEvents.length;
      // Mark as initialized after a short delay to allow initial values to settle
      setTimeout(() => {
        isInitialMountRef.current = false;
      }, 1000);
    }
  }, [documentCount, mcpEvents.length]);
  
  // Update documentCount from uploadJobs as fallback (when database queries fail)
  // Always sync documentCount with completed jobs in uploadJobs
  useEffect(() => {
    const completedJobsCount = uploadJobs.filter(job => job.status === "completed").length;
    if (completedJobsCount > 0) {
      // Always update if we have completed jobs (ensures sidebar shows even when DB queries fail)
      if (documentCount !== completedJobsCount) {
        console.log(`[Index] Updating documentCount from uploadJobs: ${documentCount} -> ${completedJobsCount}`);
        setDocumentCount(completedJobsCount);
      }
    } else if (documentCount > 0 && completedJobsCount === 0) {
      // Only set to 0 if we truly have no completed jobs (don't override sidebar's count if it found docs)
      console.log(`[Index] No completed jobs in uploadJobs, but keeping documentCount: ${documentCount}`);
    }
  }, [uploadJobs]);

  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Debounce refresh triggers
  const summarizedJobsRef = useRef<Set<string>>(new Set()); // Track which jobs we've already shown summary for
  
  // Helper function to show document summary in chat
  // MUST be defined before useEffects that use it to avoid "Cannot access before initialization" error
  const showDocumentSummary = useCallback(async (jobId: string, fileName: string) => {
    // Skip if already summarized
    if (summarizedJobsRef.current.has(jobId)) {
      return;
    }
    
    try {
      console.log(`[Index] Fetching summary for completed document: ${fileName} (${jobId})`);
      const result = await fetchJobStatus(jobId);
      
      if (result.job.status !== "completed") {
        return; // Not completed yet
      }
      
      summarizedJobsRef.current.add(jobId);
      
      // Get summary from analysis results
      const analysisResult = result.result;
      const visionSummary = analysisResult?.vision_summary;
      const ocrText = analysisResult?.ocr_text;
      
      // Prefer vision summary, fallback to OCR text preview
      let summary = visionSummary;
      let summaryType = "vision";
      if (!summary && ocrText) {
        summary = ocrText.substring(0, 800);
        if (ocrText.length > 800) {
          summary += "...";
        }
        summaryType = "ocr";
      }
      if (!summary) {
        summary = "Document processed successfully and is ready for queries.";
        summaryType = "generic";
      }
      
      // Get document metadata
      const metadata = result.job.metadata as Record<string, unknown> | null;
      const fileSize = metadata?.file_size as number | undefined;
      const fileSizeKB = fileSize ? Math.round(fileSize / 1024) : null;
      const pageCount = metadata?.page_count as number | undefined;
      const wordCount = ocrText ? ocrText.split(/\s+/).length : null;
      const stage = metadata?.job_stage as string | undefined;
      
      // Check if document is indexed for RAG
      const isIndexed = stage === "indexed" || stage === "extracted" || stage === "injected";
      
      const ragStatus = isIndexed 
        ? "✅ **Indexed for RAG** - Ready for semantic search"
        : "⏳ **Indexing in progress** - Will be available for RAG shortly";
      
      // Build detailed summary message
      let summaryMessage = `📄 **${fileName}** processing complete!\n\n`;
      
      // Add document metadata
      const metadataParts: string[] = [];
      if (fileSizeKB) metadataParts.push(`${fileSizeKB}KB`);
      if (pageCount) metadataParts.push(`${pageCount} page${pageCount > 1 ? 's' : ''}`);
      if (wordCount) metadataParts.push(`${wordCount.toLocaleString()} words`);
      if (metadataParts.length > 0) {
        summaryMessage += `📊 **Document Info:** ${metadataParts.join(' • ')}\n\n`;
      }
      
      // Add summary content
      summaryMessage += `📝 **${summaryType === "vision" ? "AI Summary" : summaryType === "ocr" ? "Content Preview" : "Status"}:**\n${summary}\n\n`;
      
      // Add RAG status
      summaryMessage += `${ragStatus}\n\n`;
      
      // Add usage instructions
      summaryMessage += `💡 **What you can do:**\n`;
      summaryMessage += `• Ask questions about this document\n`;
      summaryMessage += `• Request specific information or summaries\n`;
      summaryMessage += `• Compare with other documents\n`;
      summaryMessage += `• The document is automatically included in your knowledge base for semantic search\n`;
      
      // Show summary in chat
      appendAssistantText(summaryMessage);
      
      // Trigger DocumentsSidebar refresh
      setDocumentsSidebarRefreshTrigger(prev => prev + 1);
      
      // Auto-show panels if hidden
      if (!panelsVisible) {
        setPanelsVisible(true);
      }
      
      // Show toast notification
      toast({
        title: "Document ready",
        description: `${fileName} is ready for queries${isIndexed ? " and RAG search" : ""}. View in Documents panel below.`,
        duration: 4000,
      });
      
      console.log(`[Index] ✅ Summary shown for ${fileName}`);
    } catch (error) {
      console.error(`[Index] Failed to fetch/show summary for ${fileName}:`, error);
      // Still mark as summarized to avoid retry loops
      summarizedJobsRef.current.add(jobId);
    }
  }, [appendAssistantText, panelsVisible, toast]);

  // Check for already-completed documents on mount and show summaries
  useEffect(() => {
    if (!authReady || (!session && !guestMode)) return;
    
    const checkCompletedDocuments = async () => {
      try {
        const userId = session?.user?.id;
        
        // Query for completed documents - support both authenticated and guest mode
        let query = supabaseClient
          .from("processing_jobs")
          .select("id, file_name, status, metadata")
          .in("analysis_target", ["document-analysis", "image-ocr"])
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(10); // Check last 10 documents
        
        // For authenticated users, filter by user_id; for guest mode, get documents with NULL user_id
        if (userId) {
          query = query.eq("user_id", userId);
        } else if (guestMode) {
          query = query.is("user_id", null);
        } else {
          return; // No user and not guest mode
        }
        
        const { data: dbJobs, error } = await query;
        
        if (!error && dbJobs && dbJobs.length > 0) {
          console.log(`[Index] Found ${dbJobs.length} completed documents on page load, checking for summaries...`);
          
          // Show summaries for documents that haven't been summarized yet
          for (const job of dbJobs) {
            if (!summarizedJobsRef.current.has(job.id)) {
              // Small delay to avoid spamming chat
              await new Promise(resolve => setTimeout(resolve, 500));
              await showDocumentSummary(job.id, job.file_name);
            }
          }
        }
      } catch (error) {
        console.warn("[Index] Failed to check for completed documents on load:", error);
      }
    };
    
    // Only check once after auth is ready
    const timeoutId = setTimeout(checkCompletedDocuments, 2000); // Wait 2 seconds after mount
    
    return () => clearTimeout(timeoutId);
  }, [authReady, session, guestMode, showDocumentSummary]);

  // Auto-show panels when new documents are detected
  useEffect(() => {
    // Skip if still initializing
    if (isInitialMountRef.current) return;
    
    const previousCount = previousDocumentCountRef.current;
    const hasNewDocuments = documentCount > previousCount;
    
    if (hasNewDocuments && !panelsVisible) {
      console.log(`[Index] New documents detected (${previousCount} -> ${documentCount}), auto-showing panels`);
      setPanelsVisible(true);
      
      // Show a toast to notify user
      toast({
        title: "New document ready",
        description: `${documentCount - previousCount} new document(s) available. Panels shown below.`,
        duration: 3000,
      });
    }
    
    // Update previous count
    previousDocumentCountRef.current = documentCount;
  }, [documentCount, panelsVisible, toast]);

  // Auto-show panels when new MCP events are detected
  useEffect(() => {
    // Skip if still initializing
    if (isInitialMountRef.current) return;
    
    const previousCount = previousMcpEventsCountRef.current;
    const hasNewEvents = mcpEvents.length > previousCount;
    
    if (hasNewEvents && !panelsVisible && mcpEvents.length > 0) {
      console.log(`[Index] New MCP events detected (${previousCount} -> ${mcpEvents.length}), auto-showing panels`);
      setPanelsVisible(true);
      
      // Show a toast to notify user (only if significant number of events)
      if (mcpEvents.length - previousCount >= 3) {
        toast({
          title: "Activity detected",
          description: `New events in logs. Panels shown below.`,
          duration: 2000,
        });
      }
    }
    
    // Update previous count
    previousMcpEventsCountRef.current = mcpEvents.length;
  }, [mcpEvents.length, panelsVisible, toast]);
  
  // Manual reset function for stuck uploads
  const resetStuckUpload = useCallback(() => {
    console.log("[Index] Manually resetting stuck upload state");
    setIsRegisteringUpload(false);
    toast({
      title: "Upload state reset",
      description: "You can try uploading again.",
    });
  }, [toast]);
  const { enabled: voicePlaybackEnabled, toggle: toggleVoicePlayback, speak, stop, isSpeaking } = useVoicePlayback();
  const hasPendingUploads = useMemo(
    () => isRegisteringUpload || uploadJobs.some(job => ["uploading", "queued", "processing"].includes(job.status)),
    [uploadJobs, isRegisteringUpload],
  );

  // Poll for jobs stuck in "processing" or "queued" status
  useEffect(() => {
    const stuckJobs = uploadJobs.filter(job => 
      job.status === "processing" || 
      job.status === "queued" ||
      (job.status === "uploading" && job.updatedAt && Date.now() - new Date(job.updatedAt).getTime() > 30000)
    );
    if (stuckJobs.length === 0) return;

    const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds (more aggressive)
    const POLL_TIMEOUT_MS = 300_000; // 5 minutes max per job
    const jobStartTimes = new Map<string, number>();

    // Initialize start times for jobs that don't have one
    stuckJobs.forEach(job => {
      if (!jobStartTimes.has(job.id)) {
        jobStartTimes.set(job.id, job.updatedAt ? new Date(job.updatedAt).getTime() : Date.now());
      }
    });

    console.log(`[Index] Starting polling for ${stuckJobs.length} stuck job(s)`, stuckJobs.map(j => ({ id: j.id, status: j.status, fileName: j.fileName })));

    const pollInterval = setInterval(async () => {
      const now = Date.now();
      const jobsToCheck = stuckJobs.filter(job => {
        const startTime = jobStartTimes.get(job.id) ?? now;
        return (now - startTime) < POLL_TIMEOUT_MS;
      });

      if (jobsToCheck.length === 0) {
        console.log("[Index] All jobs completed or timed out, stopping polling");
        clearInterval(pollInterval);
        return;
      }

      console.log(`[Index] Polling ${jobsToCheck.length} job(s)`, jobsToCheck.map(j => ({ id: j.id, status: j.status })));

      const refreshResults = await Promise.all(
        jobsToCheck.map(async (job) => {
          try {
            const result = await fetchJobStatus(job.id);
            console.log(`[Index] Job ${job.id} status:`, result.job.status);
            return result;
          } catch (error) {
            console.warn(`[Index] Failed to poll job ${job.id}:`, error);
            return null;
          }
        }),
      );

      let updated = false;
      const jobMap = new Map(uploadJobs.map(job => [job.id, { ...job }]));

      refreshResults.forEach((result) => {
        if (!result) return;
        const current = jobMap.get(result.job.id);
        if (!current) return;

        const newStatus = result.job.status as UploadJob["status"];
        if (newStatus !== current.status) {
          updated = true;
          const stageMetadata = parseStageMetadata(result.job.metadata);
          jobMap.set(result.job.id, {
            ...current,
            status: newStatus,
            resultText: result.result?.ocr_text ?? current.resultText ?? null,
            visionSummary: result.result?.vision_summary ?? current.visionSummary ?? null,
            visionMetadata: result.result?.vision_metadata ?? current.visionMetadata ?? null,
            updatedAt: result.job.updated_at,
            ...stageMetadata,
          });

          // If job completed, show summary in chat using helper function
          if (newStatus === "completed") {
            showDocumentSummary(result.job.id, result.job.file_name).catch(err => {
              console.error(`[Index] Error showing summary for ${result.job.file_name}:`, err);
            });
          }

          // If job completed or failed, remove from tracking
          if (newStatus === "completed" || newStatus === "failed") {
            jobStartTimes.delete(result.job.id);
          }
        } else if (newStatus === "queued" && result.job.storage_path) {
          // Job is queued but has storage path - try to trigger it
          const jobAge = now - (jobStartTimes.get(result.job.id) ?? now);
          if (jobAge > 10000 && jobAge < 60000) { // Between 10s and 60s old
            console.log(`[Index] Job ${result.job.id} stuck in queued, attempting to trigger`);
            // Import triggerTextractJob dynamically to avoid circular dependency
            import("@/lib/api").then(({ triggerTextractJob }) => {
              triggerTextractJob(result.job.id).catch(err => {
                console.warn(`[Index] Failed to trigger stuck job ${result.job.id}:`, err);
              });
            });
          }
        }
      });

      if (updated) {
        setUploadJobs(Array.from(jobMap.values()));
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollInterval);
  }, [uploadJobs]);

  const sortedRegistry = useMemo(
    () => [...registry].sort((a, b) => a.name.localeCompare(b.name)),
    [registry],
  );

  const handleProviderChange = useCallback(
    (value: string) => {
      const next = value as Provider;
      if (next === provider) return;
      setChatProvider(next);
      const selected = providerOptions.find(option => option.value === next);
      const label = selected?.label ?? providerLabel;
      appendAssistantText(`Switched to ${label}.`);
    },
    [appendAssistantText, provider, providerLabel, providerOptions, setChatProvider],
  );

  const handleSelectMcp = useCallback(
    async (entry: McpRegistryEntry) => {
      const snippet = `/${entry.id}:`;
      let copied = false;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(snippet);
          copied = true;
        } catch {
          copied = false;
        }
      }
      const description = `Invoke ${entry.name} tools with ${snippet}<tool_name>`;
      toast({
        title: copied ? "Command copied" : entry.name,
        description: copied ? `${description}.` : description,
      });
    },
    [toast],
  );

  const renderModelMenu = useCallback(
    (variant: "initial" | "compact") => {
      const variantClasses =
        variant === "initial"
          ? "bg-muted/40 text-foreground/70 text-xs"
          : "bg-muted/30 text-foreground/60 text-2xs";
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-border/40 px-3 py-1 uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                variantClasses,
              )}
            >
              <span>Model: {providerLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[260px]" align="center">
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              LLM Providers
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={provider} onValueChange={handleProviderChange}>
              {providerOptions.map(option => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
              Registered MCPs
            </DropdownMenuLabel>
            {sortedRegistry.length === 0 ? (
              <DropdownMenuItem disabled className="text-muted-foreground">
                No MCP servers registered
              </DropdownMenuItem>
            ) : (
              sortedRegistry.map(server => (
                <DropdownMenuItem key={server.id} onSelect={() => void handleSelectMcp(server)}>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        server.is_active ? "bg-emerald-500" : "bg-amber-500",
                      )}
                      aria-hidden="true"
                    />
                    <span>{server.name}</span>
                  </div>
                  <DropdownMenuShortcut className="font-mono text-[0.65rem] uppercase tracking-normal">
                    {server.id}
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [handleProviderChange, handleSelectMcp, provider, providerLabel, providerOptions, sortedRegistry],
  );

  const userMetadata = (session?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const avatarUrl =
    (userMetadata.avatar_url as string | undefined) ??
    (userMetadata.picture as string | undefined) ??
    null;
  const displayName =
    (userMetadata.full_name as string | undefined) ??
    (userMetadata.name as string | undefined) ??
    session?.user?.email ??
    "You";
  const avatarInitial =
    displayName && displayName.trim().length > 0 ? displayName.trim().charAt(0).toUpperCase() : "U";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isLoading || !voicePlaybackEnabled) return;

    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.type === "text");

    const content = lastAssistantMessage?.content?.trim();
    if (!content || content === lastSpokenRef.current) return;

    speak(content, {
      voice: "en-US-Studio-Q",
      languageCode: "en-US",
    })
      .then(() => {
        lastSpokenRef.current = content;
      })
      .catch((error) => {
        console.error("Speech playback failed", error);
        toast({
          title: "Speech playback failed",
          description: error instanceof Error ? error.message : "Unable to play synthesized audio.",
          variant: "destructive",
        });
      });
  }, [isLoading, messages, speak, toast, voicePlaybackEnabled]);

  const handleToggleVoice = useCallback(() => {
    if (voicePlaybackEnabled) {
      stop();
    } else {
      lastSpokenRef.current = "";
    }
    toggleVoicePlayback();
  }, [stop, toggleVoicePlayback, voicePlaybackEnabled]);

  const handleSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);

  // Check if OAuth just completed to prevent showing login prompt too early
  // Also check timestamp to ensure it's recent (within last 15 seconds)
  const oauthJustCompleted = typeof window !== 'undefined' && (() => {
    const flag = sessionStorage.getItem('oauth_just_completed') === 'true';
    if (!flag) return false;
    const timestamp = sessionStorage.getItem('oauth_completed_at');
    if (!timestamp) return flag; // If no timestamp, assume it's valid (backward compatibility)
    const completedAt = parseInt(timestamp, 10);
    const now = Date.now();
    const isRecent = (now - completedAt) < 35000; // 35 seconds (increased to match callback timeout)
    if (!isRecent) {
      // Clean up stale flag
      sessionStorage.removeItem('oauth_just_completed');
      sessionStorage.removeItem('oauth_completed_at');
      return false;
    }
    return true;
  })();

  return (
    <div className="min-h-screen bg-background flex flex-col page-sunrise">
      {/* Header with logo and navigation */}
      <PageHeader>
        {authReady && (
          (session || guestMode) ? (
            <>
              <button
                type="button"
                onClick={handleRefreshChat}
                disabled={!hasChatHistory || isLoading}
                className={cn(
                  "flex-shrink-0 cursor-pointer rounded-full border border-border/50 bg-muted/40 p-1.5 text-foreground/80 transition-opacity hover:bg-muted/60",
                  (!hasChatHistory || isLoading) && "opacity-60 cursor-not-allowed",
                )}
                title={hasChatHistory ? "Refresh chat" : "Nothing to refresh yet"}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Refresh chat</span>
              </button>
              {/* Avatar with dropdown menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    title="Account menu"
                  >
                    <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border border-border/50 shadow-sm">
                      {guestMode ? (
                        <AvatarFallback className="text-xs sm:text-sm bg-muted/50">
                          <LogIn className="h-4 w-4" />
                        </AvatarFallback>
                      ) : avatarUrl ? (
                        <AvatarImage src={avatarUrl} alt={displayName ?? "Signed in user"} />
                      ) : (
                        <AvatarFallback className="text-xs sm:text-sm">{avatarInitial}</AvatarFallback>
                      )}
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{guestMode ? "Guest User" : displayName}</span>
                      {session?.user?.email ? (
                        <span className="text-xs text-muted-foreground font-normal">{session.user.email}</span>
                      ) : guestMode ? (
                        <span className="text-xs text-muted-foreground font-normal">Limited features available</span>
                      ) : null}
                    </div>
                  </DropdownMenuLabel>
                  {guestMode && (
                    <DropdownMenuItem onClick={() => void signInWithGoogle()} className="cursor-pointer">
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign in with Google
                    </DropdownMenuItem>
                  )}
                  {session && (
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={isAuthLoading}
              className={cn(
                "flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity",
                isAuthLoading && "opacity-60 cursor-not-allowed"
              )}
              title={isAuthLoading ? "Connecting..." : "Click to sign in"}
            >
              <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border border-border/50 shadow-sm border-dashed">
                <AvatarFallback className="text-xs sm:text-sm bg-muted/50">
                  <LogIn className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </button>
          )
        )}
        {/* Registry - Icon only */}
        <Link
          to="/registry"
          className="rounded-full border border-border/40 bg-muted/40 p-1.5 sm:px-3 sm:py-1 text-foreground/80 hover:bg-muted transition-colors flex-shrink-0"
          title="MCP Registry"
        >
          <Server className="h-4 w-4 sm:h-4 sm:w-4" />
        </Link>
        {/* Workflows - Icon only */}
        <Link
          to="/workflows"
          className="rounded-full border border-border/40 bg-muted/40 p-1.5 sm:px-3 sm:py-1 text-foreground/80 hover:bg-muted transition-colors flex-shrink-0"
          title="Workflows"
        >
          <Workflow className="h-4 w-4 sm:h-4 sm:w-4" />
        </Link>
      </PageHeader>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chat Messages - Full width, takes most of the space */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {!authReady || (!session && !guestMode) ? (
              <div className="text-center mt-20 space-y-4">
                <h1 className="text-4xl font-bold text-foreground">MCP Messenger</h1>
                <p className="text-muted-foreground text-lg">
                  Scrape anything with MCP Messenger
                </p>
                {!authReady ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Loading...</p>
                    <p className="text-xs text-muted-foreground/70">
                      If this takes too long, check your browser console for errors.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      Sign in to access all features, or continue as guest.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                      <button
                        type="button"
                        onClick={enableGuestMode}
                        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-6 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <span>Continue as Guest</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void signInWithGoogle()}
                        disabled={isAuthLoading}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors",
                          isAuthLoading
                            ? "opacity-60 cursor-not-allowed"
                            : "hover:bg-primary/90"
                        )}
                      >
                        <LogIn className="h-5 w-5" />
                        <span>{isAuthLoading ? "Connecting..." : "Sign in with Google"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center mt-20 space-y-3">
                <h1 className="text-4xl font-bold text-foreground">MCP Messenger</h1>
                <p className="text-muted-foreground">
                  Scrape anything with MCP Messenger
                </p>
                {renderModelMenu("initial")}
              </div>
            ) : (
              <div className="flex justify-center">
                {renderModelMenu("compact")}
              </div>
            )}
            {(session || guestMode) && messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
            {(session || guestMode) && isLoading && (() => {
              // Get the latest progress message from MCP events
              const latestProgressEvent = mcpEvents
                .filter(e => e.type === "system" && e.metadata?.message && (
                  e.metadata.category === "progress" ||
                  e.metadata.category === "tool_call_progress" ||
                  e.metadata.category === "tool_result_progress" ||
                  e.metadata.category === "agent_progress" ||
                  e.metadata.category === "heartbeat"
                ))
                .sort((a, b) => b.timestamp - a.timestamp)[0];
              
              const progressMessage = latestProgressEvent?.metadata?.message as string | undefined;
              const displayMessage = progressMessage || "Thinking hard on your request...";
              
              return (
                <div className="flex gap-3 justify-start items-center animate-fade-in">
                  <div className="h-9 w-9 rounded-full bg-gradient-glass backdrop-blur-xl border border-glass-border/30 flex items-center justify-center flex-shrink-0">
                    <div className="thinking-runner-icon">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="8" cy="5" r="2" fill="currentColor" />
                        <path
                          d="M7 7.5c1.5.5 2.8 1.4 3.6 2.7l1.1 1.9c.3.5.9.9 1.5 1l2.3.4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M6 11.5l2.2-1.6L9 12l-1.2 2"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M11 14.5l-1.2 2.2L7.5 16 6 17.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="bg-gradient-glass backdrop-blur-xl border border-glass-border/30 rounded-2xl px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <div className="h-2 w-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-2 w-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-2 w-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-xs text-foreground/60">
                        {displayMessage}
                      </span>
                      {/* Add link to view logs when hanging */}
                      <a
                        href="https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/chat/logs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 hover:text-blue-600 underline mt-1 flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        View logs in Supabase
                      </a>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* File Upload Status - Hidden since DocumentsSidebar is the primary display */}
        {/* Files now appear in Documents & Knowledge sidebar instead */}
        {false && authReady && session && (
          <FileUploadStatus
            jobs={uploadJobs}
            isRegisteringUpload={isRegisteringUpload}
            className="px-4 pt-2"
          />
        )}

        {hasPendingUploads && (
          <div className="px-4 pb-2 flex items-center justify-between gap-2 text-xs text-amber-500">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>Uploads are still in progress. Document context will attach once processing completes.</span>
            </div>
            {isRegisteringUpload && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetStuckUpload}
                className="h-6 px-2 text-xs"
              >
                Reset
              </Button>
            )}
          </div>
        )}

        {/* Chat Input */}
        {authReady && (session || guestMode) && (
          <ChatInput
            onSubmit={async (input) => {
              
              const jobsToRefresh = uploadJobs.filter(job =>
                ["processing", "completed"].includes(job.status) &&
                (!job.updatedAt || Date.now() - new Date(job.updatedAt).getTime() < 3600000),
              );
              console.log("[Index] Jobs to refresh:", jobsToRefresh.length);

              const refreshResults = await Promise.all(
                jobsToRefresh.map(async (job) => {
                  try {
                    return await fetchJobStatus(job.id);
                  } catch (error) {
                    console.warn("Failed to refresh job status:", job.id, error);
                    return null;
                  }
                }),
              );

              let nextJobs = uploadJobs;

              if (refreshResults.some(Boolean)) {
                const jobMap = new Map(uploadJobs.map(job => [job.id, { ...job }]));
                refreshResults.forEach((result) => {
                  if (!result) return;
                  const current = jobMap.get(result.job.id) ?? {
                    id: result.job.id,
                    fileName: result.job.file_name,
                    status: "queued",
                  };
                  const stageMetadata = parseStageMetadata(result.job.metadata);
                  jobMap.set(result.job.id, {
                    ...current,
                    status: result.job.status as UploadJob["status"],
                    resultText: result.result?.ocr_text ?? current.resultText ?? null,
                    visionSummary: result.result?.vision_summary ?? current.visionSummary ?? null,
                    visionMetadata: result.result?.vision_metadata ?? current.visionMetadata ?? null,
                    updatedAt: result.job.updated_at,
                    ...stageMetadata,
                  });
                });
                nextJobs = Array.from(jobMap.values());
                setUploadJobs(nextJobs);
              }

              // Build contextDocs from uploadJobs - include ALL completed jobs with content
              // This ensures documents are available for RAG even if database queries fail
              // Include any completed job that has text, summary, or is in a processed stage
              let allCompletedJobs = nextJobs.filter(job => job.status === "completed");
              console.log(`[Index] Total completed jobs in uploadJobs: ${allCompletedJobs.length}`, allCompletedJobs.map(j => ({ 
                id: j.id, 
                fileName: j.fileName, 
                hasText: !!j.resultText, 
                hasSummary: !!j.visionSummary, 
                stage: j.stage 
              })));
              
              // CRITICAL FIX: Always query database for completed documents to ensure RAG context is available
              // This ensures documents from previous sessions or not in uploadJobs state are included
              console.log(`[Index] 🔍 DEBUG: Checking for documents - uploadJobs: ${uploadJobs.length}, documentCount: ${documentCount}, userId: ${session?.user?.id || 'none'}, guestMode: ${guestMode}`);
              
              // Always query database if we have a user (authenticated or guest mode)
              if (session?.user?.id || guestMode) {
                try {
                  const userId = session?.user?.id;
                  
                  console.log(`[Index] 🔍 DEBUG: Querying database for documents (userId: ${userId || 'guest'})...`);
                  
                  let dbQuery = supabaseClient
                    .from("processing_jobs")
                    .select("id, file_name, status, metadata")
                    .in("analysis_target", ["document-analysis", "image-ocr"])
                    .eq("status", "completed")
                    .order("created_at", { ascending: false })
                    .limit(50);
                  
                  // Filter by user_id for authenticated users, or NULL for guest mode
                  if (userId) {
                    dbQuery = dbQuery.eq("user_id", userId);
                  } else if (guestMode) {
                    dbQuery = dbQuery.is("user_id", null);
                  }
                  
                  const { data: dbJobs, error: dbError } = await dbQuery;
                  
                  console.log(`[Index] 🔍 DEBUG: Database query result - found: ${dbJobs?.length || 0}, error: ${dbError ? JSON.stringify(dbError) : 'none'}`);
                  
                  if (!dbError && dbJobs && dbJobs.length > 0) {
                    // Merge with existing allCompletedJobs, avoiding duplicates
                    const existingIds = new Set(allCompletedJobs.map(j => j.id));
                    const newJobs = dbJobs
                      .filter(job => !existingIds.has(job.id))
                      .map(job => ({
                        id: job.id,
                        fileName: job.file_name,
                        status: "completed" as const,
                        stage: (job.metadata as Record<string, unknown> | null)?.job_stage as string | undefined,
                        resultText: null,
                        visionSummary: null,
                        contentLength: null,
                        updatedAt: null,
                      }));
                    
                    if (newJobs.length > 0) {
                      console.log(`[Index] ✅ Found ${newJobs.length} additional completed documents in database:`, newJobs.map(j => j.fileName));
                      allCompletedJobs = [...allCompletedJobs, ...newJobs];
                      console.log(`[Index] ✅ Total completed jobs after database query: ${allCompletedJobs.length}`);
                    }
                  } else if (dbError) {
                    console.error(`[Index] ❌ Database query failed:`, dbError);
                  }
                } catch (dbQueryError) {
                  console.error(`[Index] ❌ Failed to query database for documents:`, dbQueryError);
                }
              } else {
                console.log(`[Index] 🔍 DEBUG: Skipping database query - no user session and not in guest mode`);
              }
              
              // Include ALL completed jobs - the backend will handle retrieving content from database
              // This ensures documents are available for RAG even if in-memory state doesn't have content yet
              // Also include any documents that were explicitly dropped into chat
              const jobsToInclude = new Set<string>();
              allCompletedJobs.forEach(job => jobsToInclude.add(job.id));
              selectedDocumentIds.forEach(jobId => jobsToInclude.add(jobId));
              
              const contextDocs = allCompletedJobs
                .filter(job => jobsToInclude.has(job.id))
                .map(job => {
                  const hasContent = !!(job.resultText || job.visionSummary);
                  const isProcessed = job.stage === "extracted" || job.stage === "injected" || job.stage === "indexed";
                  const isSelected = selectedDocumentIds.has(job.id);
                  
                  if (isSelected) {
                    console.log(`[Index] ✅ Including ${job.fileName} - explicitly selected via drag-and-drop`);
                  } else if (hasContent) {
                    console.log(`[Index] ✅ Including ${job.fileName} - has content (text: ${!!job.resultText}, summary: ${!!job.visionSummary})`);
                  } else if (isProcessed) {
                    console.log(`[Index] ✅ Including ${job.fileName} - processed stage: ${job.stage}`);
                  } else {
                    console.log(`[Index] ✅ Including ${job.fileName} - completed (backend will retrieve content)`);
                  }
                  
                  return {
                    jobId: job.id,
                    fileName: job.fileName,
                    textLength: job.resultText?.length ?? job.contentLength ?? undefined,
                  };
                });
              
              console.log(`[Index] 🔍 DEBUG: Final context docs - count: ${contextDocs.length}, docs:`, contextDocs.map(d => ({ fileName: d.fileName, jobId: d.jobId, textLength: d.textLength })));

              if (contextDocs.length > 0) {
                toast({
                  title: "Including document context",
                  description: `${contextDocs.length} document(s) will be analyzed with your message.`,
                  duration: 2000,
                });
              } else if (uploadJobs.length > 0) {
                // Check if documents are processing or just uploaded
                const processingJobs = uploadJobs.filter(job => 
                  job.status === "queued" || job.status === "processing" || job.status === "uploading"
                );
                const uploadedJobs = uploadJobs.filter(job => 
                  job.status === "completed" && (job.stage === "uploaded" || !job.stage)
                );
                
                if (processingJobs.length > 0) {
                  toast({
                    title: "Documents processing",
                    description: `${processingJobs.length} document(s) are being processed. They'll be searchable once complete.`,
                    duration: 3000,
                  });
                } else if (uploadedJobs.length > 0) {
                  toast({
                    title: "Documents uploaded",
                    description: `${uploadedJobs.length} document(s) uploaded but processing hasn't started. This may take a moment.`,
                    duration: 3000,
                  });
                } else {
                  toast({
                    title: "No document context yet",
                    description: "Your files are still being processed. Try again shortly.",
                    variant: "destructive",
                    duration: 2500,
                  });
                }
              }

              console.log("[Index] About to call sendMessage with input:", input);
              console.log("[Index] Context docs:", contextDocs.length);
              try {
                sendMessage(input, contextDocs.length > 0 ? contextDocs : undefined);
                // Clear selected documents after sending
                if (selectedDocumentIds.size > 0) {
                  setSelectedDocumentIds(new Set());
                }
              } catch (error) {
                console.error("[Index] Error calling sendMessage:", error);
                throw error;
              }
            }}
            onAssistantMessage={appendAssistantText}
            disabled={isLoading || hasPendingUploads}
            className="px-4 pb-4"
            registry={registry}
            voicePlaybackEnabled={voicePlaybackEnabled}
            onToggleVoicePlayback={handleToggleVoice}
            isSpeaking={isSpeaking}
            onDocumentDrop={async (jobId, fileName) => {
              console.log("[Index] Document dropped into chat:", { jobId, fileName });
              setSelectedDocumentIds(prev => new Set([...prev, jobId]));
              
              // Fetch job status to get summary
              try {
                const jobStatus = await fetchJobStatus(jobId);
                const analysisResult = jobStatus.result;
                const visionSummary = analysisResult?.vision_summary;
                const ocrText = analysisResult?.ocr_text;
                
                // Prefer vision summary, fallback to OCR text preview
                let summary = visionSummary;
                if (!summary && ocrText) {
                  summary = ocrText.substring(0, 500);
                  if (ocrText.length > 500) {
                    summary += "...";
                  }
                }
                if (!summary) {
                  summary = "Document is ready for queries.";
                }
                
                // Check if document is indexed for RAG
                const metadata = jobStatus.job.metadata as Record<string, unknown> | null;
                const stage = metadata?.job_stage as string | undefined;
                const isIndexed = stage === "indexed" || stage === "extracted";
                
                // Get document metadata
                const fileSize = metadata?.file_size as number | undefined;
                const fileSizeKB = fileSize ? Math.round(fileSize / 1024) : null;
                const pageCount = metadata?.page_count as number | undefined;
                const wordCount = ocrText ? ocrText.split(/\s+/).length : null;
                
                const ragStatus = isIndexed 
                  ? "✅ **Indexed for RAG** - Ready for semantic search"
                  : "⏳ **Indexing in progress** - Will be available for RAG shortly";
                
                // Build detailed attachment message
                let attachmentMessage = `📄 **${fileName}** attached!\n\n`;
                
                // Add document metadata
                const metadataParts: string[] = [];
                if (fileSizeKB) metadataParts.push(`${fileSizeKB}KB`);
                if (pageCount) metadataParts.push(`${pageCount} page${pageCount > 1 ? 's' : ''}`);
                if (wordCount) metadataParts.push(`${wordCount.toLocaleString()} words`);
                if (metadataParts.length > 0) {
                  attachmentMessage += `📊 **Document Info:** ${metadataParts.join(' • ')}\n\n`;
                }
                
                // Add summary
                attachmentMessage += `📝 **Summary:**\n${summary}\n\n`;
                attachmentMessage += `${ragStatus}\n\n`;
                attachmentMessage += `_This document will be included in your next message for context._`;
                
                // Show enhanced summary in chat
                appendAssistantText(attachmentMessage);
                
                toast({
                  title: "Document attached",
                  description: `${fileName} summary displayed. Document will be included in your message.`,
                  duration: 3000,
                });
              } catch (error) {
                console.error("[Index] Error fetching document summary:", error);
                // Still attach the document even if summary fetch fails
                appendAssistantText(
                  `📄 **${fileName}** attached!\n\n` +
                  `_This document will be included in your next message._`
                );
                toast({
                  title: "Document attached",
                  description: `${fileName} will be included in your next message.`,
                  duration: 2000,
                });
              }
            }}
            onJobsChange={(jobs, isRegistering) => {
              const previousJobs = uploadJobs;
              setUploadJobs(jobs);
              setIsRegisteringUpload(isRegistering);
              
              // Check for newly completed jobs and show summaries
              jobs.forEach(job => {
                if (job.status === "completed") {
                  const wasCompleted = previousJobs.find(pj => pj.id === job.id)?.status === "completed";
                  if (!wasCompleted) {
                    // Job just completed - show summary
                    console.log(`[Index] Job ${job.id} (${job.fileName}) just completed, showing summary`);
                    showDocumentSummary(job.id, job.fileName).catch(err => {
                      console.error(`[Index] Error showing summary for ${job.fileName}:`, err);
                    });
                  }
                }
              });
              
              // Trigger DocumentsSidebar refresh when new jobs are added or status changes
              // Use debouncing to prevent infinite refresh loops
              // Only trigger if jobs actually changed (not just re-render)
              const previousJobIds = previousJobs.map(j => j.id).sort().join(',');
              const currentJobIds = jobs.map(j => j.id).sort().join(',');
              const jobsChanged = previousJobIds !== currentJobIds;
              
              if (jobs.length > 0 && jobsChanged) {
                console.log("[Index] Triggering DocumentsSidebar refresh due to job changes");
                // Debounce: clear any pending refresh and set a new one
                if (refreshTimeoutRef.current) {
                  clearTimeout(refreshTimeoutRef.current);
                }
                refreshTimeoutRef.current = setTimeout(() => {
                  setDocumentsSidebarRefreshTrigger(prev => prev + 1);
                  refreshTimeoutRef.current = null;
                }, 2000); // 2 second delay with debouncing
              }
            }}
            onEvent={(event) => {
              // Add upload events to MCP Event Log
              console.log("[Index] Upload event received:", event);
              addEvent(event);
            }}
          />
        )}

        {/* Documents and Logs Panels - Below Chat Input */}
        {authReady && (session || guestMode) && 
          ((documentCount > 0 || uploadJobs.filter(job => job.status === "completed").length > 0) || mcpEvents.length > 0) ? (
            <div className="border-t">
              {/* Toggle Button */}
              <div className="flex items-center justify-center py-2 border-b bg-muted/30">
                <button
                  type="button"
                  onClick={() => setPanelsVisible(!panelsVisible)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                  aria-label={panelsVisible ? "Hide panels" : "Show panels"}
                >
                  {panelsVisible ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      <span>Hide Documents & Logs</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      <span>Show Documents & Logs</span>
                      {((documentCount > 0 || uploadJobs.filter(job => job.status === "completed").length > 0) && mcpEvents.length > 0) && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                          {documentCount || uploadJobs.filter(job => job.status === "completed").length} docs • {mcpEvents.length} events
                        </span>
                      )}
                    </>
                  )}
                </button>
              </div>
              {panelsVisible && (
                <ResizablePanelGroup direction="horizontal" className="h-[300px] min-h-[200px] max-h-[400px]">
                {/* Documents Panel */}
                {(documentCount > 0 || uploadJobs.filter(job => job.status === "completed").length > 0) && (
                  <>
                    <ResizablePanel defaultSize={50} minSize={30} maxSize={70} className="min-w-0">
                      <div className="h-full p-4 overflow-y-auto">
                        <DocumentsSidebar
                          refreshTrigger={documentsSidebarRefreshTrigger}
                          userId={session?.user?.id}
                          fallbackJobs={(() => {
                            const completed = uploadJobs.filter(job => job.status === "completed");
                            console.log(`[Index] Passing fallbackJobs to DocumentsSidebar: ${completed.length} completed jobs out of ${uploadJobs.length} total`);
                            return completed.map(job => ({
                              id: job.id,
                              fileName: job.fileName,
                              status: job.status,
                              visionSummary: job.visionSummary,
                              resultText: job.resultText,
                              updatedAt: job.updatedAt,
                              stage: job.stage,
                              contentLength: job.contentLength, // Include file size
                            }));
                          })()}
                          onDocumentClick={(jobId) => {
                            // When document is clicked, could trigger a search or show details
                            console.log("Document clicked:", jobId);
                          }}
                          onDocumentsChange={(count) => {
                            console.log("[Index] DocumentsSidebar reported document count:", count);
                            const previousCount = documentCount;
                            setDocumentCount(count);
                            
                            // Auto-show panels if new documents are detected
                            if (count > previousCount && !panelsVisible) {
                              console.log(`[Index] New documents detected via sidebar (${previousCount} -> ${count}), auto-showing panels`);
                              setPanelsVisible(true);
                              toast({
                                title: "Documents available",
                                description: `${count - previousCount} new document(s) detected. Panels shown below.`,
                                duration: 3000,
                              });
                            }
                          }}
                        />
                      </div>
                    </ResizablePanel>
                    {mcpEvents.length > 0 && (
                      <ResizableHandle withHandle />
                    )}
                  </>
                )}
                {/* Hidden DocumentsSidebar to load documents even when panel is hidden */}
                {/* This runs in background to detect when documents are uploaded and trigger panel to appear */}
                {/* Only show hidden sidebar if we have no visible sidebar AND no completed jobs in uploadJobs */}
                {documentCount === 0 && uploadJobs.filter(job => job.status === "completed").length === 0 && (
                  <div className="hidden" aria-hidden="true">
                    <DocumentsSidebar
                      refreshTrigger={documentsSidebarRefreshTrigger}
                      userId={session?.user?.id}
                      fallbackJobs={(() => {
                        const completed = uploadJobs.filter(job => job.status === "completed");
                        console.log(`[Index] Passing fallbackJobs to hidden DocumentsSidebar: ${completed.length} completed jobs`);
                        return completed.map(job => ({
                          id: job.id,
                          fileName: job.fileName,
                          status: job.status,
                          visionSummary: job.visionSummary,
                          resultText: job.resultText,
                          updatedAt: job.updatedAt,
                          stage: job.stage,
                        }));
                      })()}
                      onDocumentClick={(jobId) => {
                        console.log("Document clicked:", jobId);
                      }}
                      onDocumentsChange={(count) => {
                        console.log("[Index] Hidden DocumentsSidebar reported document count:", count);
                        const previousCount = documentCount;
                        setDocumentCount(count);
                        
                        // Auto-show panels if new documents are detected
                        if (count > previousCount && !panelsVisible) {
                          console.log(`[Index] New documents detected via hidden sidebar (${previousCount} -> ${count}), auto-showing panels`);
                          setPanelsVisible(true);
                          toast({
                            title: "Documents available",
                            description: `${count - previousCount} new document(s) detected. Panels shown below.`,
                            duration: 3000,
                          });
                        }
                      }}
                    />
                  </div>
                )}
                {/* MCP Event Log Panel */}
                {mcpEvents.length > 0 && (
                  <ResizablePanel 
                    defaultSize={
                      (documentCount > 0 || uploadJobs.filter(job => job.status === "completed").length > 0) ? 50 : 100
                    } 
                    minSize={30} 
                    maxSize={70} 
                    className="min-w-0"
                  >
                    <McpEventLog events={mcpEvents} className="h-full border-l" />
                  </ResizablePanel>
                )}
                </ResizablePanelGroup>
              )}
            </div>
          ) : null
        }
      </div>
      
      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Index;
