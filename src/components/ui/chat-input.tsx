import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import { Plus, ArrowUp, Mic, Square, Loader2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  registerUploadJob,
  triggerTextractJob,
  triggerVisionJob,
  fetchJobStatus,
  updateJobStage,
  type AnalysisTarget,
} from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { transcribeAudio } from "@/lib/voice";
import type { McpRegistryEntry } from "@/lib/mcp/types";
import { MCP_PROVIDER_PRESETS } from "@/lib/mcp/presets";
import type { UploadJob, JobStatus, StageHistoryEntry } from "@/types/uploads";
import { parseStageMetadata } from "@/types/uploads";

type MenuOption =
  | "Upload Files"
  | "Document Analysis"
  | "Image OCR"
  | "Voice Assistant";

type SlashCommand = {
  value: string;
  label: string;
  description?: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    value: "/imagine",
    label: "/imagine",
    description: "Generate images with Gemini from a text prompt.",
  },
  {
    value: "/model openai",
    label: "/model openai",
    description: "Switch to OpenAI (GPT‑4o Mini).",
  },
  {
    value: "/model anthropic",
    label: "/model anthropic",
    description: "Switch to Anthropic (Claude 3 Haiku).",
  },
  {
    value: "/model gemini",
    label: "/model gemini",
    description: "Switch to Google Gemini 1.5 Flash.",
  },
  {
    value: "/slashmcp help",
    label: "/slashmcp help",
    description: "Show help for managing MCP servers.",
  },
  {
    value: "/slashmcp list",
    label: "/slashmcp list",
    description: "List configured MCP servers.",
  },
  {
    value: "/slashmcp add",
    label: "/slashmcp add",
    description: "Register a new MCP server or preset.",
  },
  {
    value: "/slashmcp login",
    label: "/slashmcp login",
    description: "Sign in to Supabase for MCP registry.",
  },
  {
    value: "/slashmcp remove",
    label: "/slashmcp remove",
    description: "Remove a registered MCP server.",
  },
  {
    value: "/key help",
    label: "/key help",
    description: "Show help for the Key Manager Agent.",
  },
  {
    value: "/key add",
    label: "/key add",
    description: "Securely add an API key to the Key Manager.",
  },
  {
    value: "/key list",
    label: "/key list",
    description: "List stored API keys.",
  },
  {
    value: "/key get",
    label: "/key get",
    description: "View details for a specific API key.",
  },
  {
    value: "/key check",
    label: "/key check",
    description: "Check status and permissions for a key.",
  },
  {
    value: "/key update",
    label: "/key update",
    description: "Update metadata, scope, or value of a key.",
  },
  {
    value: "/key delete",
    label: "/key delete",
    description: "Delete a stored API key.",
  },
  {
    value: "/key audit",
    label: "/key audit",
    description: "View recent audit logs for key usage.",
  },
  {
    value: "/key stale",
    label: "/key stale",
    description: "Find keys that haven't been used recently.",
  },
  // MCP Server Commands
  {
    value: "/alphavantage-mcp get_quote",
    label: "/alphavantage-mcp get_quote",
    description: "Get stock quote (e.g., symbol=NVDA)",
  },
  {
    value: "/alphavantage-mcp get_stock_chart",
    label: "/alphavantage-mcp get_stock_chart",
    description: "Get stock chart (e.g., symbol=TSLA interval=1wk)",
  },
  {
    value: "/polymarket-mcp get_market_price",
    label: "/polymarket-mcp get_market_price",
    description: "Get prediction market odds (e.g., market_id=us_election_2024)",
  },
  {
    value: "/grokipedia-mcp search",
    label: "/grokipedia-mcp search",
    description: "Search Grokipedia knowledge base (e.g., query=\"Model Context Protocol\")",
  },
  {
    value: "/canva-mcp create_design",
    label: "/canva-mcp create_design",
    description: "Create Canva design (e.g., template=presentation text=\"Hello\")",
  },
  {
    value: "/gemini-mcp generate_text",
    label: "/gemini-mcp generate_text",
    description: "Generate text with Gemini (e.g., prompt=\"Write a story\")",
  },
  {
    value: "/playwright-wrapper browser_navigate",
    label: "/playwright-wrapper browser_navigate",
    description: "Navigate to URL (e.g., url=https://example.com)",
  },
  {
    value: "/playwright-wrapper browser_snapshot",
    label: "/playwright-wrapper browser_snapshot",
    description: "Get page accessibility snapshot",
  },
  {
    value: "/playwright-wrapper browser_extract_text",
    label: "/playwright-wrapper browser_extract_text",
    description: "Extract text from page (e.g., url=https://example.com)",
  },
  {
    value: "/search-mcp web_search",
    label: "/search-mcp web_search",
    description: "Search the web (e.g., query=\"Model Context Protocol\")",
  },
  {
    value: "/email-mcp send_test_email",
    label: "/email-mcp send_test_email",
    description: "Send test email to logged-in user",
  },
  {
    value: "/google-places-mcp search_places",
    label: "/google-places-mcp search_places",
    description: "Search for places (e.g., query=\"Starbucks in Des Moines\")",
  },
  {
    value: "/google-places-mcp get_place_details",
    label: "/google-places-mcp get_place_details",
    description: "Get place details (e.g., place_id=ChIJ...)",
  },
  {
    value: "/google-earth-engine-mcp search_datasets",
    label: "/google-earth-engine-mcp search_datasets",
    description: "Search Earth Engine datasets (e.g., query=\"landcover\")",
  },
  {
    value: "/langchain-agent agent_executor",
    label: "/langchain-agent agent_executor",
    description: "Execute LangChain agent (e.g., query=\"What is 2+2?\" [system_instruction=\"...\"])",
  },
];

interface ChatInputProps {
  placeholder?: string;
  onSubmit?: (value: string) => void;
  onAssistantMessage?: (content: string) => void;
  disabled?: boolean;
  className?: string;
  registry?: McpRegistryEntry[];
  voicePlaybackEnabled?: boolean;
  onToggleVoicePlayback?: () => void;
  isSpeaking?: boolean;
  onJobsChange?: (jobs: UploadJob[], isRegistering: boolean) => void;
}

interface OptionTagProps {
  option: MenuOption;
  onRemove: (option: MenuOption) => void;
}

const OptionTag = memo(({ option, onRemove }: OptionTagProps) => (
  <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md text-xs text-foreground/80 backdrop-blur-sm border border-border/50">
    <span>{option}</span>
    <button
      type="button"
      onClick={() => onRemove(option)}
      className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-muted text-foreground/60 hover:text-foreground transition-colors"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  </div>
));

const OptionsMenu = memo(({
  isOpen,
  onSelect,
  options,
  placement = "bottom",
}: {
  isOpen: boolean;
  onSelect: (option: MenuOption) => void;
  options: MenuOption[];
  placement?: "top" | "bottom";
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "absolute left-0 bg-card/95 backdrop-blur-xl rounded-lg shadow-lg border border-border/50 overflow-hidden z-[60] min-w-[140px]",
        placement === "bottom" ? "top-full mt-1" : "bottom-full mb-1"
      )}
    >
      <ul className="py-1">
        {options.map((option) => (
          <li
            key={option}
            className="px-4 py-2 hover:bg-muted cursor-pointer text-sm font-medium text-foreground transition-colors"
            onClick={() => onSelect(option)}
          >
            {option}
          </li>
        ))}
      </ul>
    </div>
  );
});

export function ChatInput({
  placeholder = "Try a slash / command",
  onSubmit = (value: string) => console.log("Submitted:", value),
  onAssistantMessage,
  disabled = false,
  className,
  registry = [],
  voicePlaybackEnabled = false,
  onToggleVoicePlayback,
  isSpeaking = false,
  onJobsChange,
}: ChatInputProps) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<MenuOption[]>([]);
  const [analysisTarget, setAnalysisTarget] = useState<AnalysisTarget>("document-analysis");
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [isRegisteringUpload, setIsRegisteringUpload] = useState(false);
  const [visionProvider, setVisionProvider] = useState<"gpt4o" | "gemini">("gpt4o");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const [filteredSlashCommands, setFilteredSlashCommands] = useState<SlashCommand[]>(SLASH_COMMANDS);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cancelTranscriptionRef = useRef(false);
  const updateJob = useCallback(
    (jobId: string, updates: Partial<UploadJob> | ((job: UploadJob) => Partial<UploadJob>)) => {
      setJobs((prev) => {
        const updated = prev.map((job) => {
          if (job.id !== jobId) return job;
          const patch = typeof updates === "function" ? updates(job) : updates;
          return { ...job, ...patch };
        });
        if (onJobsChange) {
          onJobsChange(updated, isRegisteringUpload);
        }
        return updated;
      });
    },
    [onJobsChange, isRegisteringUpload],
  );

  // Notify parent when jobs or registration state changes
  useEffect(() => {
    if (onJobsChange) {
      onJobsChange(jobs, isRegisteringUpload);
    }
  }, [jobs, isRegisteringUpload, onJobsChange]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const slashMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropdownPlacement: "top" | "bottom" = jobs.length > 0 ? "top" : "bottom";
  const cleanupStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const allSlashCommands = useMemo(() => {
    const map = new Map<string, SlashCommand>();

    // Base commands
    for (const cmd of SLASH_COMMANDS) {
      map.set(cmd.value, cmd);
    }

    // Provider presets (e.g. /gemini, /polygon)
    for (const preset of Object.values(MCP_PROVIDER_PRESETS)) {
      const value = `/${preset.id}`;
      if (!map.has(value)) {
        map.set(value, {
          value,
          label: value,
          description: preset.description ?? preset.label,
        });
      }
    }

    // Dynamic MCP registry entries (e.g. /alphavantage-mcp:)
    if (registry && registry.length > 0) {
      for (const server of registry) {
        const value = `/${server.id}:`;
        if (!map.has(value)) {
          map.set(value, {
            value,
            label: value,
            description: `Invoke ${server.name} tools with ${value}<tool_name>`,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [registry]);

  useEffect(() => {
    setFilteredSlashCommands(allSlashCommands);
  }, [allSlashCommands]);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined";
    setVoiceSupported(Boolean(supported));

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        cancelTranscriptionRef.current = true;
        mediaRecorderRef.current.stop();
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  const handleTranscription = useCallback(
    async (blob: Blob) => {
      setIsTranscribing(true);
      try {
        const result = await transcribeAudio(blob);
        const transcript = result.text?.trim();

        if (transcript) {
          if (disabled) {
            setValue(transcript);
            toast({
              title: "Voice transcription ready",
              description: "Review and send when you're ready.",
            });
          } else {
            onSubmit(transcript);
            setValue("");
            toast({
              title: "Voice message sent",
              description: transcript,
            });
          }
        } else {
          toast({
            title: "No speech detected",
            description: "Try speaking a little longer or closer to the mic.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Voice transcription failed", error);
        toast({
          title: "Transcription failed",
          description: error instanceof Error ? error.message : "Unable to transcribe audio.",
          variant: "destructive",
        });
      } finally {
        setIsTranscribing(false);
        setSelectedOptions(prev => prev.filter(opt => opt !== "Voice Assistant"));
      }
    },
    [disabled, onSubmit, toast],
  );

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;
    if (!voiceSupported) {
      toast({
        title: "Voice not supported",
        description: "Your browser doesn't support in-browser voice capture.",
        variant: "destructive",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      cancelTranscriptionRef.current = false;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        setIsRecording(false);
        cleanupStream();
        const shouldCancel = cancelTranscriptionRef.current;
        cancelTranscriptionRef.current = false;

        const recordedBlob = new Blob(audioChunksRef.current, {
          type: mimeType || "audio/webm",
        });
        audioChunksRef.current = [];

        if (shouldCancel || recordedBlob.size === 0) {
          setSelectedOptions(prev => prev.filter(opt => opt !== "Voice Assistant"));
          return;
        }

        handleTranscription(recordedBlob);
      };

      recorder.start();
      setIsRecording(true);
      setSelectedOptions(prev => (prev.includes("Voice Assistant") ? prev : [...prev, "Voice Assistant"]));
      toast({
        title: "Listening...",
        description: "Speak clearly and tap again when finished.",
      });
    } catch (error) {
      console.error("Unable to start recording", error);
      cleanupStream();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      toast({
        title: "Microphone error",
        description:
          error instanceof Error ? error.message : "We couldn't access your microphone. Check permissions and try again.",
        variant: "destructive",
      });
    }
  }, [cleanupStream, handleTranscription, isRecording, isTranscribing, toast, voiceSupported]);

  const stopRecording = useCallback(
    (cancel = false) => {
      if (!mediaRecorderRef.current) return;
      if (mediaRecorderRef.current.state === "inactive") return;
      cancelTranscriptionRef.current = cancel;
      mediaRecorderRef.current.stop();
    },
    [],
  );

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const menuOptions: MenuOption[] = [
    "Upload Files",
    "Document Analysis",
    "Image OCR",
    "Voice Assistant",
  ];

  const applySlashCommand = useCallback(
    (command: SlashCommand) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const current = textarea.value;
      const cursorPos = textarea.selectionStart ?? current.length;
      const textUpToCursor = current.slice(0, cursorPos);
      const lastSlashIndex = textUpToCursor.lastIndexOf("/");
      if (lastSlashIndex === -1) return;

      const beforeSlash = current.slice(0, lastSlashIndex);
      const afterCursor = current.slice(cursorPos);
      const newValue = `${beforeSlash}${command.value} ${afterCursor}`;
      setValue(newValue);
      setIsSlashMenuOpen(false);
      setSlashQuery("");

      requestAnimationFrame(() => {
        const pos = beforeSlash.length + command.value.length + 1;
        textarea.selectionStart = textarea.selectionEnd = pos;
        textarea.focus();
      });
    },
    [],
  );

  const handleSlashDetection = useCallback(
    (nextValue: string, selectionStart: number | null) => {
      const cursorPos = selectionStart ?? nextValue.length;
      const textUpToCursor = nextValue.slice(0, cursorPos);
      const lastSlashIndex = textUpToCursor.lastIndexOf("/");

      if (lastSlashIndex === -1) {
        setIsSlashMenuOpen(false);
        setFilteredSlashCommands(allSlashCommands);
        setSlashActiveIndex(0);
        return;
      }

      const query = textUpToCursor.slice(lastSlashIndex + 1);
      const normalized = query.toLowerCase();

      const filtered = allSlashCommands.filter((cmd) => {
        if (!normalized) return true;
        const valueLower = cmd.value.toLowerCase();
        const labelLower = cmd.label.toLowerCase();
        return (
          valueLower.startsWith("/" + normalized) ||
          valueLower.includes(normalized) ||
          labelLower.includes(normalized)
        );
      });

      setFilteredSlashCommands(filtered);
      setSlashActiveIndex(0);
      setIsSlashMenuOpen(filtered.length > 0);
    },
    [allSlashCommands],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      setValue(nextValue);
      handleSlashDetection(nextValue, e.target.selectionStart);
    },
    [handleSlashDetection],
  );

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const menuEl = menuRef.current;
      const slashEl = slashMenuRef.current;
      const textareaEl = textareaRef.current;

      if (menuEl && !menuEl.contains(target)) {
        setIsMenuOpen(false);
      }

      if (
        slashEl &&
        !slashEl.contains(target) &&
        textareaEl &&
        !textareaEl.contains(target)
      ) {
        setIsSlashMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 96; // max-h-24 = 96px
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + "px";
    }
  }, [value]);

  const nextHistoryValue = useRef<string>("");

  const navigateHistory = useCallback(
    (direction: "prev" | "next") => {
      if (!inputHistory.length) return;
      const textarea = textareaRef.current;
      if (!textarea) return;

      const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      const atEnd =
        textarea.selectionStart === textarea.value.length &&
        textarea.selectionEnd === textarea.value.length;

      if (direction === "prev" && !atStart) return;
      if (direction === "next" && !atEnd) return;

      if (historyIndex === null) {
        nextHistoryValue.current = value;
      }

      if (direction === "prev") {
        const currentIndex = historyIndex ?? inputHistory.length;
        const newIndex = currentIndex - 1;
        if (newIndex < 0) return;
        setHistoryIndex(newIndex);
        setValue(inputHistory[newIndex]);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = inputHistory[newIndex].length;
        });
      } else {
        const currentIndex = historyIndex ?? inputHistory.length;
        const newIndex = currentIndex + 1;
        if (newIndex >= inputHistory.length) {
          setHistoryIndex(null);
          setValue(nextHistoryValue.current);
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = nextHistoryValue.current.length;
          });
        } else {
          setHistoryIndex(newIndex);
          setValue(inputHistory[newIndex]);
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = inputHistory[newIndex].length;
          });
        }
      }
    },
    [historyIndex, inputHistory, value],
  );

  const submitValue = useCallback(() => {
    console.log("[ChatInput] Will submit?", value.trim() && !disabled);
    
    if (!value.trim()) {
      console.warn("[ChatInput] Cannot submit: value is empty");
      return;
    }
    
    if (disabled) {
      console.warn("[ChatInput] Cannot submit: input is disabled");
      return;
    }
    
    if (value.trim() && !disabled) {
      console.log("[ChatInput] Calling onSubmit with:", value.trim());
      try {
        onSubmit(value.trim());
        console.log("[ChatInput] onSubmit called successfully");
      } catch (error) {
        console.error("[ChatInput] Error in onSubmit:", error);
        throw error;
      }
      setValue("");
      setSelectedOptions([]);
      setInputHistory(prev => {
        const trimmed = value.trim();
        if (!trimmed) return prev;
        if (prev[prev.length - 1] === trimmed) return prev;
        return [...prev, trimmed];
      });
      setHistoryIndex(null);
      nextHistoryValue.current = "";
    }
  }, [value, onSubmit, disabled]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      submitValue();
    },
    [submitValue],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isSlashMenuOpen && filteredSlashCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashActiveIndex((prev) => (prev + 1) % filteredSlashCommands.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashActiveIndex((prev) =>
            prev === 0 ? filteredSlashCommands.length - 1 : prev - 1,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const command =
            filteredSlashCommands[slashActiveIndex] ?? filteredSlashCommands[0];
          if (command) {
            applySlashCommand(command);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setIsSlashMenuOpen(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitValue();
        return;
      }
      if (e.key === "ArrowUp") {
        if (historyIndex !== null || textareaRef.current?.selectionStart === 0) {
          e.preventDefault();
          navigateHistory("prev");
        }
        return;
      }
      if (e.key === "ArrowDown") {
        if (
          historyIndex !== null ||
          textareaRef.current?.selectionEnd ===
            (textareaRef.current?.value.length ?? 0)
        ) {
          e.preventDefault();
          navigateHistory("next");
        }
      }
    },
    [
      submitValue,
      navigateHistory,
      historyIndex,
      isSlashMenuOpen,
      filteredSlashCommands,
      slashActiveIndex,
      applySlashCommand,
    ],
  );

  const selectOption = useCallback(
    (option: MenuOption) => {
      setSelectedOptions(prev => {
        if (!prev.includes(option)) {
          return [...prev, option];
        }
        return prev;
      });

      if (option === "Upload Files") {
        fileInputRef.current?.click();
      } else if (option === "Document Analysis") {
        setAnalysisTarget("document-analysis");
      } else if (option === "Image OCR") {
        setAnalysisTarget("image-ocr");
      } else if (option === "Voice Assistant") {
        setAnalysisTarget("audio-transcription");
        void startRecording();
      }

      setIsMenuOpen(false);
    },
    [startRecording],
  );

  const removeOption = useCallback(
    (option: MenuOption) => {
      if (option === "Voice Assistant") {
        stopRecording(true);
      }
      setSelectedOptions(prev => prev.filter(opt => opt !== option));
    },
    [stopRecording],
  );

  const triggerVision = useCallback(
    async (jobId: string) => {
      await triggerVisionJob({ jobId, provider: visionProvider });
      const statusResponse = await fetchJobStatus(jobId);
      const providerUsed = statusResponse.result?.vision_provider as "gpt4o" | "gemini" | null;
      const stageMetadata = parseStageMetadata(statusResponse.job.metadata);
      updateJob(jobId, {
        visionSummary: statusResponse.result?.vision_summary ?? null,
        visionMetadata: statusResponse.result?.vision_metadata ?? null,
        visionProvider: providerUsed,
        updatedAt: statusResponse.job.updated_at,
        ...stageMetadata,
      });
      return providerUsed;
    },
    [visionProvider, updateJob],
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      try {
        setIsRegisteringUpload(true);
        
        // Auto-detect CSV files and set analysis target
        const isCsv = file.name.toLowerCase().endsWith(".csv") || 
                     file.name.toLowerCase().endsWith(".tsv") ||
                     file.type === "text/csv" ||
                     file.type === "application/vnd.ms-excel";
        const targetAnalysis = isCsv ? "document-analysis" : analysisTarget;
        
        const response = await registerUploadJob({
          file,
          analysisTarget: targetAnalysis,
          metadata: { source: "chat-input" },
        });

        const registeredAt = new Date().toISOString();
        const newJob: UploadJob = {
          id: response.jobId,
          fileName: file.name,
          status: response.uploadUrl ? "uploading" : "queued",
          message: response.message ?? null,
          error: null,
          stage: "registered",
          stageHistory: [{ stage: "registered", at: registeredAt } as StageHistoryEntry],
        };
        setJobs((prev) => {
          const updated = [...prev, newJob];
          if (onJobsChange) {
            onJobsChange(updated, true);
          }
          return updated;
        });

        if (!response.uploadUrl) {
          toast({
            title: "Upload registered",
            description: "Pre-signed upload URL not available. Upload manually when available.",
          });
        }

        if (response.uploadUrl) {
          const uploadResp = await fetch(response.uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          });

          if (!uploadResp.ok) {
            updateJob(response.jobId, { status: "failed", error: "Failed to upload to storage" });
            throw new Error("Upload to storage failed");
          }

          try {
            await updateJobStage(response.jobId, "uploaded");
            updateJob(response.jobId, (job) => ({
              stage: "uploaded",
              stageHistory: [
                ...(job.stageHistory ?? []),
                { stage: "uploaded", at: new Date().toISOString() } as StageHistoryEntry,
              ],
            }));
          } catch (stageError) {
            console.warn("Failed to set job stage to uploaded", stageError);
          }

          updateJob(response.jobId, { status: "processing", error: null });

          let visionSucceeded = false;
          let visionProviderUsed: "gpt4o" | "gemini" | null = null;
          let visionError: string | null = null;

          try {
            visionProviderUsed = await triggerVision(response.jobId);
            visionSucceeded = true;
          } catch (error) {
            visionError = error instanceof Error ? error.message : "Vision analysis failed";
            console.error("Vision analysis failed", error);
            updateJob(response.jobId, {
              status: "processing",
              error: visionError,
            });
            toast({
              title: "Vision analysis failed",
              description: visionError,
              variant: "destructive",
            });
          }

          const shouldRunOCR =
            analysisTarget === "document-analysis" || analysisTarget === "image-ocr";
          let ocrSucceeded = false;

          if (shouldRunOCR) {
            try {
              await triggerTextractJob(response.jobId);
              
              // Poll for job completion with timeout
              const POLL_INTERVAL_MS = 2000; // Check every 2 seconds
              const POLL_TIMEOUT_MS = 300_000; // 5 minutes max
              const pollStartTime = Date.now();
              let pollAttempts = 0;
              let statusResponse = await fetchJobStatus(response.jobId);
              
              // Poll until job is completed, failed, or timeout
              while (
                statusResponse.job.status === "processing" || 
                statusResponse.job.status === "queued"
              ) {
                const elapsed = Date.now() - pollStartTime;
                if (elapsed > POLL_TIMEOUT_MS) {
                  throw new Error(`Job processing timed out after ${POLL_TIMEOUT_MS}ms`);
                }
                
                // Update job status in UI while polling
                const currentStatus = statusResponse.job.status as JobStatus;
                const stageMetadata = parseStageMetadata(statusResponse.job.metadata);
                updateJob(response.jobId, (currentJob) => ({
                  status: currentStatus,
                  updatedAt: statusResponse.job.updated_at,
                  ...stageMetadata,
                }));
                
                // Wait before next poll
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
                
                pollAttempts++;
                if (pollAttempts % 10 === 0) {
                  console.log(`[Upload] Polling job ${response.jobId}, attempt ${pollAttempts}, elapsed: ${elapsed}ms`);
                }
                
                statusResponse = await fetchJobStatus(response.jobId);
              }
              
              // Job completed or failed
              const jobStatus = statusResponse.job.status as JobStatus;
              const normalizedStatus =
                jobStatus === "failed" && visionSucceeded ? "completed" : jobStatus;

              const stageMetadata = parseStageMetadata(statusResponse.job.metadata);
              // Preserve vision data when updating with OCR results
              updateJob(response.jobId, (currentJob) => ({
                status: normalizedStatus,
                resultText: statusResponse.result?.ocr_text ?? null,
                visionSummary: statusResponse.result?.vision_summary ?? currentJob?.visionSummary ?? null,
                visionMetadata: statusResponse.result?.vision_metadata ?? currentJob?.visionMetadata ?? null,
                visionProvider: (statusResponse.result?.vision_provider as "gpt4o" | "gemini" | null) ?? currentJob?.visionProvider ?? null,
                updatedAt: statusResponse.job.updated_at,
                ...stageMetadata,
              }));

              if (!statusResponse.result?.ocr_text) {
                updateJob(response.jobId, {
                  error: "No text detected",
                });
              } else {
                ocrSucceeded = true;
              }
            } catch (texError) {
              const message =
                texError instanceof Error ? texError.message : "Textract processing failed";
              console.error("Textract worker failed", texError);
              updateJob(response.jobId, {
                status: visionSucceeded ? "completed" : "failed",
                error: message,
              });
              if (!visionSucceeded) {
                toast({
                  title: "Processing failed",
                  description: message,
                  variant: "destructive",
                });
                return;
              }
            }
          }

          if (visionSucceeded) {
            toast({
              title: "Vision analysis ready",
              description: `${file.name} analyzed with ${visionProviderUsed ?? "vision model"}.`,
            });
            // Preserve vision data when marking as completed
            updateJob(response.jobId, (currentJob) => ({
              status: "completed",
              error: null,
              visionSummary: currentJob?.visionSummary ?? null,
              visionMetadata: currentJob?.visionMetadata ?? null,
              visionProvider: currentJob?.visionProvider ?? null,
            }));
          } else if (ocrSucceeded) {
            toast({
              title: "Text extracted",
              description: `${file.name} processed with OCR.`,
            });
            updateJob(response.jobId, { status: "completed", error: null });
          } else {
            const failureMessage = visionError ?? "Processing failed";
            toast({
              title: "Processing failed",
              description: failureMessage,
              variant: "destructive",
            });
            updateJob(response.jobId, { status: "failed", error: failureMessage });
          }
        }
      } catch (error) {
        console.error("registerUploadJob failed", error);
        toast({
          title: "Upload registration failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsRegisteringUpload(false);
      }
    },
    [analysisTarget, toast, updateJob, triggerVision],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const fileList = Array.from(files);
      for (const file of fileList) {
        await handleFileUpload(file);
      }

      event.target.value = "";
    },
    [handleFileUpload],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLFormElement>) => {
    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLFormElement>) => {
      if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0) {
        return;
      }
      event.preventDefault();
      const fileList = Array.from(event.dataTransfer.files);
      for (const file of fileList) {
        await handleFileUpload(file);
      }
    },
    [handleFileUpload],
  );

  const isSubmitDisabled = disabled || !value.trim();

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "sticky bottom-4 z-50 mx-auto min-h-12 w-full max-w-2xl transition-all duration-300 ease-out",
        className
      )}
    >
      <div className="relative flex flex-col w-full min-h-full bg-gradient-glass backdrop-blur-xl shadow-glow-ice rounded-2xl border border-glass-border/30 group hover:border-glass-border/50 hover:shadow-xl transition-all duration-300">
        {/* Frost overlay */}
        <div className="absolute inset-0 bg-gradient-frost rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Input row */}
        <div className="flex items-center relative z-10 p-2">
          {/* Plus button */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Menu options"
              className="h-8 w-8 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted text-foreground/70 hover:text-foreground transition-all ml-1 mr-1 backdrop-blur-sm"
            >
              <Plus size={16} />
            </button>
            <OptionsMenu 
              isOpen={isMenuOpen} 
              onSelect={selectOption}
              options={menuOptions}
              placement={dropdownPlacement}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileChange}
          />

          <button
            type="button"
            onClick={toggleRecording}
            disabled={!voiceSupported || isTranscribing}
            aria-label={isRecording ? "Stop voice recording" : "Start voice recording"}
            className={cn(
              "ml-1 mr-1 h-8 w-8 flex items-center justify-center rounded-full transition-all",
              !voiceSupported || isTranscribing
                ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground"
                : isRecording
                  ? "bg-primary text-primary-foreground shadow-glow-ice"
                  : "bg-muted/50 hover:bg-muted text-foreground/70 hover:text-foreground"
            )}
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <Square className="h-4 w-4" strokeWidth={2.5} />
            ) : (
              <Mic className="h-4 w-4" strokeWidth={2.5} />
            )}
          </button>

          {/* Voice playback toggle */}
          {onToggleVoicePlayback && (
            <button
              type="button"
              onClick={onToggleVoicePlayback}
              aria-label={voicePlaybackEnabled ? "Disable voice replies" : "Enable voice replies"}
              className={cn(
                "ml-1 mr-1 h-8 w-8 flex items-center justify-center rounded-full transition-all",
                voicePlaybackEnabled
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : "bg-muted/50 hover:bg-muted text-foreground/70 hover:text-foreground"
              )}
              title={voicePlaybackEnabled ? "Voice replies on" : "Voice replies off"}
            >
              {voicePlaybackEnabled ? (
                <Volume2 className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <VolumeX className="h-4 w-4" strokeWidth={2.5} />
              )}
            </button>
          )}

          {/* Textarea */}
          <div className="flex-1 relative flex items-center">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={(e) => {
                console.log("[ChatInput] textarea onKeyDown:", e.key, "disabled:", disabled);
                handleKeyDown(e);
              }}
              placeholder={placeholder}
              aria-label="Message Input"
              rows={1}
              disabled={disabled}
              className="w-full min-h-8 max-h-24 bg-transparent text-sm font-normal text-foreground placeholder-muted-foreground border-0 outline-none focus:outline-none px-3 pr-10 py-1 resize-none overflow-y-auto"
              onFocus={() => console.log("[ChatInput] textarea focused, disabled:", disabled)}
              onBlur={() => console.log("[ChatInput] textarea blurred")}
            />

            {isSlashMenuOpen && filteredSlashCommands.length > 0 && (
              <div
                ref={slashMenuRef}
                className="absolute bottom-full mb-2 left-2 right-10 bg-card/95 backdrop-blur-xl rounded-lg shadow-lg border border-border/60 z-[70]"
              >
                <ul className="max-h-60 overflow-y-auto py-1">
                  {filteredSlashCommands.map((cmd, index) => (
                    <li
                      key={cmd.value}
                      className={cn(
                        "px-3 py-2 text-sm cursor-pointer flex flex-col gap-0.5",
                        index === slashActiveIndex
                          ? "bg-muted text-foreground"
                          : "text-foreground/80 hover:bg-muted/80",
                      )}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applySlashCommand(cmd);
                      }}
                    >
                      <span className="font-medium">{cmd.label}</span>
                      {cmd.description && (
                        <span className="text-xs text-foreground/60">
                          {cmd.description}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Send button */}
            <button
              type="submit"
              aria-label="Send message"
              disabled={isSubmitDisabled}
              className={cn(
                "ml-auto self-center h-8 w-8 flex items-center justify-center rounded-full border-0 p-0 transition-all",
                isSubmitDisabled
                  ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground"
                  : "opacity-90 bg-primary text-primary-foreground hover:opacity-100 cursor-pointer hover:shadow-md"
              )}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Selected options */}
        {selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 pl-3 pr-3 z-10 relative">
            {selectedOptions.map((option) => (
              <OptionTag key={option} option={option} onRemove={removeOption} />
            ))}
          </div>
        )}

        {(isRecording || isTranscribing) && (
          <div className="flex items-center gap-2 mt-2 pl-3 pr-3 z-10 relative text-xs text-foreground/70">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>{isRecording ? "Listening..." : "Transcribing voice message..."}</span>
          </div>
        )}

      </div>
    </form>
  );
}
