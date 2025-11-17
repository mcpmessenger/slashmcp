import { useEffect, useRef, useState, useMemo } from "react";
import { Search, Filter, X, AlertCircle, CheckCircle2, Loader2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface McpEvent {
  type: string;
  timestamp: number;
  agent?: string;
  tool?: string;
  command?: string;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface McpEventLogProps {
  events: McpEvent[];
  className?: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  error: "destructive",
  toolCall: "default",
  toolResult: "secondary",
  finalOutput: "default",
  content: "outline",
  text: "outline",
  fallback: "secondary",
  default: "outline",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  error: "Error",
  toolCall: "Tool Call",
  toolResult: "Tool Result",
  finalOutput: "Final Output",
  content: "Content",
  text: "Text",
  textDelta: "Text Delta",
  delta: "Delta",
  newMessage: "Message",
  message: "Message",
  agentMessage: "Agent Message",
  fallback: "Fallback",
  default: "Event",
};

export function McpEventLog({ events, className }: McpEventLogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Filter and search events
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter(event => event.type === filterType);
    }

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(event => {
        const searchableText = [
          event.type,
          event.agent,
          event.tool,
          event.command,
          event.error,
          typeof event.result === "string" ? event.result : JSON.stringify(event.result),
          JSON.stringify(event.metadata),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchableText.includes(query);
      });
    }

    return filtered;
  }, [events, filterType, searchQuery]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded && filteredEvents.length > 0) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [filteredEvents, isExpanded]);

  // Get unique event types for filter dropdown
  const eventTypes = useMemo(() => {
    const types = new Set(events.map(e => e.type));
    return Array.from(types).sort();
  }, [events]);

  // Count errors
  const errorCount = useMemo(() => events.filter(e => e.type === "error" || e.error).length, [events]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { 
      hour12: false, 
      hour: "2-digit", 
      minute: "2-digit", 
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  const formatEventContent = (event: McpEvent) => {
    if (event.error) {
      return event.error;
    }
    if (event.command) {
      return event.command;
    }
    if (event.result !== undefined) {
      if (typeof event.result === "string") {
        return event.result.length > 200 ? `${event.result.slice(0, 200)}...` : event.result;
      }
      return JSON.stringify(event.result, null, 2).slice(0, 200);
    }
    return null;
  };

  return (
    <div className={cn("flex flex-col h-full bg-muted/20", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-background/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">MCP Event Log</h3>
          {errorCount > 0 && (
            <Badge variant="destructive" className="h-5 px-1.5 text-xs">
              {errorCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-7 w-7 p-0"
        >
          {isExpanded ? <X className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
        </Button>
      </div>

      {isExpanded && (
        <>
          {/* Filters */}
          <div className="p-3 border-b border-border bg-background/30 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {eventTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {EVENT_TYPE_LABELS[type] || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{filteredEvents.length} of {events.length} events</span>
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="h-6 px-2 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Event List */}
          <ScrollArea className="flex-1 h-0">
            <div className="p-2 space-y-1" ref={scrollRef}>
              {filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {events.length === 0 ? "No events yet" : "No events match your filters"}
                </div>
              ) : (
                filteredEvents.map((event, index) => {
                  const isError = event.type === "error" || !!event.error;
                  const hasTool = !!event.tool;
                  const hasCommand = !!event.command;

                  return (
                    <div
                      key={index}
                      className={cn(
                        "rounded-lg border p-2 text-xs transition-colors",
                        isError
                          ? "border-destructive/50 bg-destructive/10"
                          : "border-border/50 bg-background/50 hover:bg-background/70"
                      )}
                    >
                      {/* Event Header */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={EVENT_TYPE_COLORS[event.type] as any || "outline"}
                            className="h-5 px-1.5 text-[10px] font-mono"
                          >
                            {EVENT_TYPE_LABELS[event.type] || event.type}
                          </Badge>
                          {event.agent && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              {event.agent}
                            </Badge>
                          )}
                          {hasTool && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-mono">
                              {event.tool}
                            </Badge>
                          )}
                          {isError && (
                            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                          {!isError && event.type === "toolResult" && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>

                      {/* Event Content */}
                      {hasCommand && (
                        <div className="mt-1.5 p-1.5 rounded bg-muted/50 font-mono text-[10px] break-all">
                          <span className="text-muted-foreground">Command: </span>
                          <span className="text-foreground">{event.command}</span>
                        </div>
                      )}

                      {event.error && (
                        <div className="mt-1.5 p-1.5 rounded bg-destructive/20 font-mono text-[10px] text-destructive break-all">
                          {event.error}
                        </div>
                      )}

                      {formatEventContent(event) && !event.error && (
                        <div className="mt-1.5 p-1.5 rounded bg-muted/30 font-mono text-[10px] break-all max-h-32 overflow-y-auto">
                          {formatEventContent(event)}
                        </div>
                      )}

                      {/* Metadata (collapsed by default) */}
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <details className="mt-1.5">
                          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                            Metadata
                          </summary>
                          <pre className="mt-1 p-1.5 rounded bg-muted/50 font-mono text-[10px] overflow-x-auto">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

