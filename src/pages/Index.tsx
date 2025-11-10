import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ui/chat-input";
import { useChat } from "@/hooks/useChat";
import { useEffect, useRef, useCallback } from "react";
import { Volume2, VolumeX, LogIn, LogOut } from "lucide-react";
import { useVoicePlayback } from "@/hooks/useVoicePlayback";
import { useToast } from "@/components/ui/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const Index = () => {
  const {
    messages,
    sendMessage,
    isLoading,
    providerLabel,
    session,
    authReady,
    isAuthLoading,
    signInWithGoogle,
    signOut,
  } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSpokenRef = useRef<string>("");
  const { toast } = useToast();
  const { enabled: voicePlaybackEnabled, toggle: toggleVoicePlayback, speak, stop, isSpeaking } = useVoicePlayback();

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
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 px-1 py-1 sm:px-2">
            <div className="flex items-center gap-3">
              <img src="/Untitled design.svg" alt="SlashMCP logo" className="h-10 w-auto" />
              <div className="leading-tight">
                <p className="font-semibold text-base text-foreground">SlashMCP Assistant</p>
                <p className="text-[0.7rem] uppercase tracking-[0.35em] text-muted-foreground">
                  MCP-powered AI workspace for document intelligence
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {authReady && (
                session ? (
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline text-xs text-foreground/60 truncate max-w-[140px]" title={session.user?.email ?? undefined}>
                      {session.user?.email ?? "Signed in"}
                    </span>
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

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="text-center mt-20 space-y-3">
              <h1 className="text-4xl font-bold text-foreground">SlashMCP Assistant</h1>
              <p className="text-muted-foreground">
                MCP-powered AI workspace for document intelligence.
              </p>
              <span className="inline-flex items-center justify-center rounded-full border border-border/40 bg-muted/40 px-3 py-1 text-xs uppercase tracking-wide text-foreground/70">
                Model: {providerLabel}
              </span>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="inline-flex items-center justify-center rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-2xs uppercase tracking-wide text-foreground/60">
                Model: {providerLabel}
              </span>
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

      {/* Chat Input */}
      <ChatInput onSubmit={sendMessage} disabled={isLoading} className="px-4 pb-4" />
    </div>
  );
};

export default Index;
