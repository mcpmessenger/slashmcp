import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ui/chat-input";
import { useChat } from "@/hooks/useChat";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { Volume2, VolumeX, LogIn, ChevronDown, Server, Workflow, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useVoicePlayback } from "@/hooks/useVoicePlayback";
import { useToast } from "@/components/ui/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
      {/* Sign-in prompt banner */}
      {authReady && !session && (
        <div className="mx-4 mt-4 mb-0 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-foreground mb-1">Sign in required</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Please sign in to use MCP Messenger. Sign in with Google to access all features including chat, workflows, and MCP tools.
            </p>
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={isAuthLoading}
              className={cn(
                "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors",
                isAuthLoading
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-primary/90"
              )}
            >
              <LogIn className="h-4 w-4" />
              <span>{isAuthLoading ? "Connecting..." : "Sign in with Google"}</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Header with logo and navigation */}
      <PageHeader>
        {authReady && (
          session ? (
            <>
              {/* Avatar - Clickable, serves as logout button */}
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                title="Click to sign out"
              >
                <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border border-border/50 shadow-sm">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={displayName ?? "Signed in user"} />
                  ) : (
                    <AvatarFallback className="text-xs sm:text-sm">{avatarInitial}</AvatarFallback>
                  )}
                </Avatar>
              </button>
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

        {/* Chat Messages with Dual-Terminal Layout */}
        <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left Pane: Chat */}
          <ResizablePanel defaultSize={70} minSize={40} className="min-w-0">
            <div className="h-full overflow-y-auto px-4 py-8">
              <div className="max-w-4xl mx-auto space-y-6">
                {!authReady || !session ? (
                  <div className="text-center mt-20 space-y-4">
                    <h1 className="text-4xl font-bold text-foreground">MCP Messenger</h1>
                    <p className="text-muted-foreground text-lg">
                      Scrape anything with MCP Messenger
                    </p>
                    {!authReady ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-muted-foreground">
                          Sign in to start chatting and using workflows.
                        </p>
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
                {session && messages.map((message, index) => (
                  <ChatMessage key={index} message={message} />
                ))}
                {session && isLoading && (
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
                          Thinking hard on your request...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </ResizablePanel>

          {/* Resizable Handle - Only show when panel is expanded */}
          {mcpEvents.length > 0 && (
            <ResizableHandle withHandle className="hidden lg:flex" />
          )}

          {/* Right Pane: MCP Event Log - Collapsible */}
          {mcpEvents.length > 0 && (
            <ResizablePanel defaultSize={25} minSize={15} maxSize={40} className="hidden lg:block min-w-0">
              <McpEventLog events={mcpEvents} className="h-full border-l" />
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
        </div>

        {/* Chat Input */}
        {authReady && session && (
          <ChatInput
            onSubmit={sendMessage}
            onAssistantMessage={appendAssistantText}
            disabled={isLoading}
            className="px-4 pb-4"
            registry={registry}
            voicePlaybackEnabled={voicePlaybackEnabled}
            onToggleVoicePlayback={handleToggleVoice}
            isSpeaking={isSpeaking}
          />
        )}
      </div>
      
      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Index;
