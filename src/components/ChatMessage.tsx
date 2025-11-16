import { memo } from "react";
import { User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockQuoteCard } from "@/components/StockQuoteCard";
import type { Message } from "@/hooks/useChat";

interface ChatMessageProps {
  message: Message;
}

// Convert URLs in text to clickable links
function linkifyText(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the URL as a clickable link
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline break-all"
      >
        {url}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export const ChatMessage = memo(({ message }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const isStock = message.type === "stock" && message.role === "assistant";
  const isImage = message.type === "image" && message.role === "assistant";

  return (
    <div className={cn("flex gap-3 animate-fade-in", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-gradient-glass backdrop-blur-xl border border-glass-border/30 flex items-center justify-center flex-shrink-0">
          <Bot size={16} className="text-foreground/70" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl",
            isStock || isImage ? "p-0 overflow-hidden" : "px-4 py-3",
          isUser
            ? "bg-primary/10 backdrop-blur-xl border border-primary/20 text-foreground"
            : "bg-gradient-glass backdrop-blur-xl border border-glass-border/30 text-foreground/90",
        )}
      >
        {isStock && message.type === "stock" ? (
          <StockQuoteCard title={message.content} insights={message.stock} />
          ) : isImage && message.type === "image" ? (
            <div className="flex flex-col gap-3 p-3">
              <div
                className={cn(
                  "grid gap-3",
                  message.images.length === 1 ? "grid-cols-1" : "sm:grid-cols-2",
                )}
              >
                {message.images.map((image, index) => (
                  <figure
                    key={index}
                    className="overflow-hidden rounded-xl border border-glass-border/40 bg-muted/20"
                  >
                    <img
                      src={`data:${image.mimeType};base64,${image.base64}`}
                      alt={message.content ? `${message.content} (variation ${index + 1})` : `Generated image ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </figure>
                ))}
              </div>
              {message.content && (
                <p className="text-xs leading-relaxed text-foreground/70">
                  Prompt: <span className="font-medium text-foreground/80">{message.content}</span>
                </p>
              )}
            </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{linkifyText(message.content)}</p>
        )}
      </div>
      {isUser && (
        <div className="h-8 w-8 rounded-full bg-primary/20 backdrop-blur-xl border border-primary/30 flex items-center justify-center flex-shrink-0">
          <User size={16} className="text-primary" />
        </div>
      )}
    </div>
  );
});
