import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Server, CheckCircle2, XCircle, Clock, ExternalLink, Plus, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MCP_SERVER_REGISTRY, findServerDefinition } from "@/lib/mcp/registry";
import { listMcpServers, type McpRegistryEntry } from "@/lib/mcp/registryClient";
import { supabaseClient } from "@/lib/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { PageHeader } from "@/components/PageHeader";
import { Footer } from "@/components/Footer";

type ServerWithStatus = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isPreset: boolean;
  isActive?: boolean;
  lastHealthCheck?: string | null;
  gatewayUrl?: string;
  authType?: string;
  commands?: Array<{
    name: string;
    title: string;
    description: string;
    parameters?: Array<{
      name: string;
      description: string;
      required: boolean;
      example?: string;
    }>;
    example?: string;
  }>;
  healthStatus: "healthy" | "unhealthy" | "unknown";
};

export function Registry() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [userServers, setUserServers] = useState<McpRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Check auth status
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      setAuthReady(!!session);
      if (session) {
        loadUserServers();
      } else {
        setIsLoading(false);
      }
    });

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      setAuthReady(!!session);
      if (session) {
        loadUserServers();
      } else {
        setUserServers([]);
        setIsLoading(false);
      }
    });
  }, []);

  const loadUserServers = async () => {
    try {
      setIsLoading(true);
      const servers = await listMcpServers();
      setUserServers(servers);
    } catch (error) {
      console.error("Failed to load user servers:", error);
      toast({
        title: "Error",
        description: "Failed to load registered MCP servers",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Combine preset and user servers
  const allServers = useMemo<ServerWithStatus[]>(() => {
    const presetServers: ServerWithStatus[] = MCP_SERVER_REGISTRY.map(preset => ({
      id: preset.id,
      name: preset.label,
      description: preset.description,
      category: preset.category,
      isPreset: true,
      isActive: true,
      commands: preset.commands,
      healthStatus: "unknown" as const, // Presets don't have health checks yet
    }));

    const userServerEntries: ServerWithStatus[] = userServers.map(server => {
      const preset = findServerDefinition(server.id);
      return {
        id: server.id,
        name: server.name,
        description: preset?.description,
        category: preset?.category || "custom",
        isPreset: false,
        isActive: server.is_active,
        lastHealthCheck: server.last_health_check || null,
        gatewayUrl: server.gateway_url,
        authType: server.auth_type,
        commands: preset?.commands,
        healthStatus: server.is_active
          ? server.last_health_check
            ? new Date(server.last_health_check).getTime() > Date.now() - 5 * 60 * 1000
              ? "healthy"
              : "unhealthy"
            : "unknown"
          : "unhealthy",
      };
    });

    return [...presetServers, ...userServerEntries];
  }, [userServers]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(allServers.map(s => s.category || "uncategorized"));
    return Array.from(cats).sort();
  }, [allServers]);

  // Filter servers
  const filteredServers = useMemo(() => {
    let filtered = allServers;

    // Category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter(s => s.category === selectedCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        s =>
          s.name.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query) ||
          s.commands?.some(cmd => cmd.name.toLowerCase().includes(query) || cmd.title.toLowerCase().includes(query)),
      );
    }

    return filtered;
  }, [allServers, selectedCategory, searchQuery]);

  const getHealthStatusIcon = (status: ServerWithStatus["healthStatus"]) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "unhealthy":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  const getHealthStatusText = (status: ServerWithStatus["healthStatus"]) => {
    switch (status) {
      case "healthy":
        return "Healthy";
      case "unhealthy":
        return "Unhealthy";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <PageHeader
        title="MCP Server Registry"
        description="Discover and manage Model Context Protocol servers and their tools"
      >
        <Button variant="outline" onClick={() => navigate("/")} className="hidden sm:flex">
          Back to Chat
        </Button>
        {authReady && (
          <>
            <Button variant="outline" onClick={() => navigate("/workflows/new")} className="hidden md:flex">
              <Plus className="h-4 w-4 mr-2" />
              New Workflow
            </Button>
            <Button onClick={() => navigate("/")} className="hidden sm:flex">
              <Plus className="h-4 w-4 mr-2" />
              Add Server
            </Button>
          </>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="border-b bg-muted/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search servers, tools, or commands..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
            <p className="mt-4 text-muted-foreground">Loading servers...</p>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="text-center py-12">
            <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No servers found</h3>
            <p className="text-muted-foreground">
              {searchQuery || selectedCategory !== "all"
                ? "Try adjusting your search or filters"
                : "No MCP servers available"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServers.map(server => (
              <Card key={server.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{server.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {server.description || "No description available"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {getHealthStatusIcon(server.healthStatus)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {server.category && (
                      <Badge variant="secondary" className="text-xs">
                        {server.category}
                      </Badge>
                    )}
                    {server.isPreset ? (
                      <Badge variant="outline" className="text-xs">
                        Preset
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Custom
                      </Badge>
                    )}
                    <Badge
                      variant={server.healthStatus === "healthy" ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {getHealthStatusText(server.healthStatus)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  {server.commands && server.commands.length > 0 ? (
                    <Tabs defaultValue="tools" className="w-full">
                      <TabsList className="grid w-full grid-cols-1">
                        <TabsTrigger value="tools">
                          Tools ({server.commands.length})
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="tools" className="mt-2">
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {server.commands.map((cmd, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-md bg-muted/50 border border-border/50"
                            >
                              <div className="font-medium text-sm">{cmd.title || cmd.name}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {cmd.description}
                              </div>
                              {cmd.example && (
                                <code className="text-xs mt-1 block text-muted-foreground font-mono">
                                  {cmd.example}
                                </code>
                              )}
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <div className="text-sm text-muted-foreground py-4">
                      No tools available
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {server.lastHealthCheck && (
                        <span>
                          Last check: {new Date(server.lastHealthCheck).toLocaleString()}
                        </span>
                      )}
                      {!server.lastHealthCheck && server.isPreset && (
                        <span>Preset server</span>
                      )}
                    </div>
                    {server.gatewayUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={server.gatewayUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Gateway
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <Footer />
    </div>
  );
}

