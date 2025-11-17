import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ui/chat-input";
import { useChat } from "@/hooks/useChat";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { Volume2, VolumeX, LogIn, LogOut, ChevronDown } from "lucide-react";
import { useVoicePlayback } from "@/hooks/useVoicePlayback";
import { useToast } from "@/components/ui/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { McpEventLog } from "@/components/McpEventLog";
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
    signInWithGoogle,
    signOut,
    appendAssistantText,
    setProvider: setChatProvider,
    registry,
    mcpEvents,
  } = useChat();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSpokenRef = useRef<string>("");
  const { enabled: voicePlaybackEnabled, toggle: toggleVoicePlayback, speak, stop, isSpeaking } = useVoicePlayback();

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-4 pt-6">
        <div className="max-w-[1600px] mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 px-1 py-1 sm:px-2">
            <div className="flex items-center gap-3">
              <img src="/Untitled design.svg" alt="SlashMCP logo" className="h-10 w-auto" />
              <div className="leading-tight">
                <p className="font-semibold text-base text-foreground">SlashMCP</p>
                <p className="text-[0.7rem] uppercase tracking-[0.35em] text-muted-foreground">
                  MCP-powered AI workspace
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {authReady && (
                session ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 border border-border/50 shadow-sm" title={displayName ?? undefined}>
                      {avatarUrl ? (
                        <AvatarImage src={avatarUrl} alt={displayName ?? "Signed in user"} />
                      ) : (
                        <AvatarFallback>{avatarInitial}</AvatarFallback>
                      )}
                    </Avatar>
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className="flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground/80 hover:bg-muted transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    disabled={isAuthLoading}
                    className={cn(
                      "flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium transition-colors",
                      isAuthLoading
                        ? "opacity-60 cursor-not-allowed"
                        : "text-primary hover:bg-primary/20 hover:text-primary"
                    )}
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    <span>{isAuthLoading ? "Connecting..." : "Sign in with Google"}</span>
                  </button>
                )
              )}
              <ThemeToggle />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              onClick={handleToggleVoice}
              className="flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground/80 hover:bg-muted transition-colors"
            >
              {voicePlaybackEnabled ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span>Voice replies {voicePlaybackEnabled ? "on" : "off"}</span>
            </button>
            {voicePlaybackEnabled && (
              <div className="flex items-center gap-2 text-xs text-foreground/60">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isSpeaking ? "bg-primary animate-ping" : "bg-muted-foreground/60",
                  )}
                />
                <span>{isSpeaking ? "Speaking..." : "Ready to speak"}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Messages with Dual-Terminal Layout */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left Pane: Chat */}
          <ResizablePanel defaultSize={70} minSize={40} className="min-w-0">
            <div className="h-full overflow-y-auto px-4 py-8">
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.length === 0 ? (
                  <div className="text-center mt-20 space-y-3">
                    <h1 className="text-4xl font-bold text-foreground">SlashMCP</h1>
                    <p className="text-muted-foreground">
                      MCP-powered AI workspace for document intelligence.
                    </p>
                    {renderModelMenu("initial")}
                  </div>
                ) : (
                  <div className="flex justify-center">
                    {renderModelMenu("compact")}
                  </div>
                )}
                {messages.map((message, index) => (
                  <ChatMessage key={index} message={message} />
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start animate-fade-in">
                    <div className="h-8 w-8 rounded-full bg-gradient-glass backdrop-blur-xl border border-glass-border/30 flex items-center justify-center flex-shrink-0">
                      <div className="h-2 w-2 bg-foreground/50 rounded-full animate-pulse" />
                    </div>
                    <div className="bg-gradient-glass backdrop-blur-xl border border-glass-border/30 rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <div className="h-2 w-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-2 w-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-2 w-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </ResizablePanel>

          {/* Resizable Handle */}
          <ResizableHandle withHandle className="hidden lg:flex" />

          {/* Right Pane: MCP Event Log */}
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50} className="hidden lg:block min-w-0">
            <McpEventLog events={mcpEvents} className="h-full border-l" />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Chat Input */}
      <ChatInput
        onSubmit={sendMessage}
        onAssistantMessage={appendAssistantText}
        disabled={isLoading}
        className="px-4 pb-4"
      />
    </div>
  );
};

export default Index;
