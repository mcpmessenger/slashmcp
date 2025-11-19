import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Save, Play, Plus, Trash2, AlertCircle, GitMerge, GitBranch, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { MCP_SERVER_REGISTRY } from "@/lib/mcp/registry";
import { WorkflowExecutionViewer } from "@/components/WorkflowExecutionViewer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabaseClient } from "@/lib/supabaseClient";
import { PageHeader } from "@/components/PageHeader";
import { Footer } from "@/components/Footer";
import type { Workflow } from "@/lib/workflows/types";
import type { NodeType } from "@/lib/workflows/types";
import {
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  saveWorkflowGraph,
  executeWorkflow,
  listWorkflows,
} from "@/lib/workflows/client";

// Enhanced node component with handles and dynamic context
function WorkflowNode({ data, selected }: { data: { 
  label: string; 
  nodeType: NodeType;
  mcp_server_id?: string;
  mcp_command_name?: string;
  config?: Record<string, unknown>;
  hasError?: boolean;
  inputPorts?: string[];
  outputPorts?: string[];
}; selected: boolean }) {
  const nodeColors: Record<NodeType, string> = {
    start: "bg-emerald-500",
    end: "bg-red-500",
    agent: "bg-blue-500",
    tool: "bg-purple-500",
    data: "bg-amber-500",
    condition: "bg-orange-500",
    merge: "bg-cyan-500",
  };

  // Generate dynamic title based on configuration
  const getDynamicTitle = (): string => {
    if (data.mcp_command_name) {
      const server = MCP_SERVER_REGISTRY.find(s => s.id === data.mcp_server_id);
      const command = server?.commands.find(c => c.name === data.mcp_command_name);
      return command?.title || data.mcp_command_name || data.label;
    }
    return data.label;
  };

  // Get quick-view context (tool name, model, etc.)
  const getQuickContext = (): string | null => {
    if (data.nodeType === "tool" && data.mcp_command_name) {
      return data.mcp_command_name;
    }
    if (data.nodeType === "agent" && data.config?.model) {
      return String(data.config.model);
    }
    if (data.nodeType === "condition" && data.config?.condition) {
      const condition = String(data.config.condition);
      return condition.length > 20 ? condition.substring(0, 20) + "..." : condition;
    }
    return null;
  };

  const dynamicTitle = getDynamicTitle();
  const quickContext = getQuickContext();
  const showInput = data.nodeType !== "start";
  const showOutput = data.nodeType !== "end";

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border-2 shadow-sm min-w-[140px] relative",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        data.hasError && "border-red-500 ring-2 ring-red-500/20",
        nodeColors[data.nodeType] || "bg-gray-500",
      )}
    >
      {/* Input Handle */}
      {showInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white"
        />
      )}

      {/* Error Indicator */}
      {data.hasError && (
        <div className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1">
          <AlertCircle className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Node Title */}
      <div className="text-sm font-semibold text-white leading-tight">
        {dynamicTitle}
      </div>

      {/* Quick Context */}
      {quickContext && (
        <div className="text-xs text-white/70 mt-1 truncate" title={quickContext}>
          {quickContext}
        </div>
      )}

      {/* Node Type Badge */}
      <div className="text-xs text-white/60 mt-1 uppercase tracking-wide">
        {data.nodeType}
      </div>

      {/* Output Handle */}
      {showOutput && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-green-500 !w-3 !h-3 !border-2 !border-white"
        />
      )}
    </div>
  );
}

// Junction/Router Node component with merge/split modes
function JunctionNode({ data, selected }: { data: { 
  label: string;
  mode: "merge" | "split";
  hasError?: boolean;
}; selected: boolean }) {
  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border-2 shadow-sm min-w-[120px] relative bg-cyan-500",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        data.hasError && "border-red-500 ring-2 ring-red-500/20",
      )}
    >
      {/* Multiple Input Handles for Merge */}
      {data.mode === "merge" && (
        <>
          <Handle
            type="target"
            position={Position.Top}
            id="input-1"
            className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white !left-[30%]"
          />
          <Handle
            type="target"
            position={Position.Top}
            id="input-2"
            className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white !left-[70%]"
          />
        </>
      )}

      {/* Single Input Handle for Split */}
      {data.mode === "split" && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white"
        />
      )}

      {/* Error Indicator */}
      {data.hasError && (
        <div className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1">
          <AlertCircle className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Icon */}
      <div className="flex items-center justify-center mb-1">
        {data.mode === "merge" ? (
          <GitMerge className="h-5 w-5 text-white" />
        ) : (
          <GitBranch className="h-5 w-5 text-white" />
        )}
      </div>

      {/* Label */}
      <div className="text-sm font-semibold text-white text-center">
        {data.label || (data.mode === "merge" ? "Merge" : "Split")}
      </div>

      {/* Mode Badge */}
      <div className="text-xs text-white/70 mt-1 text-center uppercase tracking-wide">
        {data.mode}
      </div>

      {/* Multiple Output Handles for Split */}
      {data.mode === "split" && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="output-1"
            className="!bg-green-500 !w-3 !h-3 !border-2 !border-white !left-[30%]"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="output-2"
            className="!bg-green-500 !w-3 !h-3 !border-2 !border-white !left-[70%]"
          />
        </>
      )}

      {/* Single Output Handle for Merge */}
      {data.mode === "merge" && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-green-500 !w-3 !h-3 !border-2 !border-white"
        />
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
  junction: JunctionNode,
};

const initialNodes: Node[] = [
  {
    id: "start",
    type: "workflow",
    position: { x: 250, y: 100 },
    data: { label: "Start", nodeType: "start" },
  },
];

const initialEdges: Edge[] = [];

export function WorkflowBuilder() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [nodeErrors, setNodeErrors] = useState<Map<string, string>>(new Map());
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);

  // Load workflow if editing
  useEffect(() => {
    if (id && id !== "new") {
      setIsLoading(true);
      getWorkflow(id)
        .then(({ workflow, nodes: workflowNodes, edges: workflowEdges }) => {
          setWorkflowName(workflow.name);
          setWorkflowDescription(workflow.description || "");

          // Convert workflow nodes to React Flow nodes
          const flowNodes: Node[] = workflowNodes.map(node => {
            // Check if this is a junction node (stored as merge node type with special config)
            const isJunction = node.node_type === "merge" && node.config?.mode;
            if (isJunction) {
              return {
                id: node.id,
                type: "junction",
                position: { x: node.position_x, y: node.position_y },
                data: {
                  label: node.label,
                  mode: (node.config.mode as "merge" | "split") || "merge",
                },
              };
            }
            return {
              id: node.id,
              type: "workflow",
              position: { x: node.position_x, y: node.position_y },
              data: {
                label: node.label,
                nodeType: node.node_type,
                config: node.config,
                mcp_server_id: node.mcp_server_id,
                mcp_command_name: node.mcp_command_name,
              },
            };
          });

          // Add start node if not present
          if (!flowNodes.find(n => n.type === "workflow" && n.data.nodeType === "start")) {
            flowNodes.unshift({
              id: "start",
              type: "workflow",
              position: { x: 250, y: 100 },
              data: { label: "Start", nodeType: "start" },
            });
          }

          setNodes(flowNodes);

          // Convert workflow edges to React Flow edges
          const flowEdges: Edge[] = workflowEdges.map(edge => ({
            id: edge.id,
            source: edge.source_node_id,
            target: edge.target_node_id,
            type: "smoothstep",
          }));

          setEdges(flowEdges);
        })
        .catch(error => {
          console.error("Failed to load workflow:", error);
          toast({
            title: "Error",
            description: "Failed to load workflow",
            variant: "destructive",
          });
        })
        .finally(() => setIsLoading(false));
    }
  }, [id, setNodes, setEdges, toast]);

  const onConnect = useCallback(
    (params: Connection) => {
      // Use orthogonal routing for junction nodes, smoothstep for others
      const sourceNode = nodes.find(n => n.id === params.source);
      const edgeType = sourceNode?.type === "junction" ? "step" : "smoothstep";
      setEdges(eds => addEdge({ ...params, type: edgeType }, eds));
    },
    [setEdges, nodes],
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setConfigPanelOpen(true);
  }, []);

  // Drag and drop handlers
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData("application/reactflow");
      if (!nodeType || !reactFlowInstance) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (nodeType === "junction-merge" || nodeType === "junction-split") {
        const newNode: Node = {
          id: `junction-${Date.now()}`,
          type: "junction",
          position,
          data: {
            label: nodeType === "junction-merge" ? "Merge" : "Split",
            mode: nodeType === "junction-merge" ? "merge" : "split",
          },
        };
        setNodes(nds => [...nds, newNode]);
      } else {
        const newNode: Node = {
          id: `node-${Date.now()}`,
          type: "workflow",
          position,
          data: {
            label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
            nodeType: nodeType as NodeType,
          },
        };
        setNodes(nds => [...nds, newNode]);
      }
    },
    [reactFlowInstance, setNodes],
  );

  const handleSave = async () => {
    if (!workflowName.trim()) {
      toast({
        title: "Error",
        description: "Workflow name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      let workflowId = id;

      // Create or update workflow
      if (workflowId) {
        await updateWorkflow(workflowId, {
          name: workflowName,
          description: workflowDescription,
        });
      } else {
        const workflow = await createWorkflow(workflowName, workflowDescription);
        workflowId = workflow.id;
      }

      // Convert React Flow nodes to workflow nodes
      const workflowNodes = nodes.map((node, index) => {
        // Handle junction nodes
        if (node.type === "junction") {
          return {
            id: node.id,
            node_type: "merge" as NodeType, // Store as merge type
            label: node.data.label || `Junction ${index + 1}`,
            position_x: node.position.x,
            position_y: node.position.y,
            config: { mode: node.data.mode || "merge" }, // Store mode in config
            mcp_server_id: undefined,
            mcp_command_name: undefined,
            execution_order: index,
            temp_id: node.id.startsWith("temp_") ? node.id : undefined,
          };
        }
        return {
          id: node.id,
          node_type: (node.data.nodeType || "tool") as NodeType,
          label: node.data.label || `Node ${index + 1}`,
          position_x: node.position.x,
          position_y: node.position.y,
          config: node.data.config || {},
          mcp_server_id: node.data.mcp_server_id,
          mcp_command_name: node.data.mcp_command_name,
          execution_order: index,
          temp_id: node.id.startsWith("temp_") ? node.id : undefined,
        };
      });

      // Convert React Flow edges to workflow edges
      const workflowEdges = edges.map(edge => ({
        source_node_id: edge.source,
        target_node_id: edge.target,
        condition: undefined,
        data_mapping: {},
        source_temp_id: edge.source,
        target_temp_id: edge.target,
      }));

      await saveWorkflowGraph(workflowId, workflowNodes, workflowEdges);

      toast({
        title: "Success",
        description: "Workflow saved successfully",
      });

      // Update URL if this was a new workflow
      if (!id || id === "new") {
        navigate(`/workflows/${workflowId}`, { replace: true });
      }
    } catch (error) {
      console.error("Failed to save workflow:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save workflow",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRun = async () => {
    if (!id || id === "new") {
      toast({
        title: "Error",
        description: "Please save the workflow before running",
        variant: "destructive",
      });
      return;
    }

    // Clear previous errors
    setNodeErrors(new Map());

    setIsSaving(true);
    try {
      const response = await executeWorkflow({
        workflow_id: id,
        input_data: {},
        parameters: {},
      });

      toast({
        title: "Workflow Started",
        description: `Execution ID: ${response.execution_id}`,
      });

      setExecutionId(response.execution_id);
      
      // Start polling for execution status to update error states
      pollExecutionStatus(response.execution_id);
    } catch (error) {
      console.error("Failed to execute workflow:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to execute workflow",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Poll execution status and update node error states
  const pollExecutionStatus = useCallback(async (execId: string) => {
    const FUNCTIONS_URL =
      import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
      (import.meta.env.VITE_SUPABASE_URL
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
        : undefined);

    if (!FUNCTIONS_URL) return;

    const poll = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        if (!session?.access_token) return;

        const response = await fetch(`${FUNCTIONS_URL}/workflow-execution/${execId}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        const { node_executions, execution } = data;

        // Update node errors based on execution results
        const errors = new Map<string, string>();
        if (node_executions) {
          node_executions.forEach((nodeExec: { node_id: string; status: string; error_message?: string }) => {
            if (nodeExec.status === "failed" && nodeExec.error_message) {
              errors.set(nodeExec.node_id, nodeExec.error_message);
            }
          });
        }

        setNodeErrors(errors);

        // Continue polling if execution is still running
        if (execution.status === "running" || execution.status === "pending") {
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error("Failed to poll execution status:", error);
      }
    };

    poll();
  }, []);

  // Update nodes with error states
  useEffect(() => {
    if (nodeErrors.size > 0) {
      setNodes(nds =>
        nds.map(node => ({
          ...node,
          data: {
            ...node.data,
            hasError: nodeErrors.has(node.id),
            errorMessage: nodeErrors.get(node.id),
          },
        })),
      );
    } else {
      // Clear error states
      setNodes(nds =>
        nds.map(node => {
          const { hasError, errorMessage, ...restData } = node.data as any;
          return { ...node, data: restData };
        }),
      );
    }
  }, [nodeErrors, setNodes]);

  const handleAddNode = (nodeType: NodeType | "junction-merge" | "junction-split") => {
    if (nodeType === "junction-merge" || nodeType === "junction-split") {
      const newNode: Node = {
        id: `junction-${Date.now()}`,
        type: "junction",
        position: {
          x: Math.random() * 400 + 200,
          y: Math.random() * 400 + 200,
        },
        data: {
          label: nodeType === "junction-merge" ? "Merge" : "Split",
          mode: nodeType === "junction-merge" ? "merge" : "split",
        },
      };
      setNodes(nds => [...nds, newNode]);
    } else {
      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: "workflow",
        position: {
          x: Math.random() * 400 + 200,
          y: Math.random() * 400 + 200,
        },
        data: {
          label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
          nodeType,
        },
      };
      setNodes(nds => [...nds, newNode]);
    }
  };

  // Drag start handler for sidebar items
  const onDragStart = (event: React.DragEvent, nodeType: NodeType | "junction-merge" | "junction-split") => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDeleteNode = () => {
    if (selectedNode) {
      setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
      setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
    }
  };

  const availableServers = useMemo(() => MCP_SERVER_REGISTRY, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="mt-4 text-muted-foreground">Loading workflow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <PageHeader>
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="hidden sm:flex">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1 max-w-md mx-2 sm:mx-0">
          <Input
            placeholder="Workflow name..."
            value={workflowName}
            onChange={e => setWorkflowName(e.target.value)}
            className="w-full"
          />
        </div>
        <Button variant="outline" onClick={() => setTemplateLibraryOpen(true)} className="hidden md:flex">
          <BookOpen className="h-4 w-4 mr-2" />
          Templates
        </Button>
        <Button variant="outline" onClick={handleSave} disabled={isSaving} className="hidden sm:flex">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button onClick={handleRun} disabled={isSaving || !id || id === "new"}>
          <Play className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{isSaving ? "Running..." : "Run"}</span>
        </Button>
      </PageHeader>
      
      {/* Mobile Actions Bar */}
      <div className="sm:hidden border-b bg-muted/20 px-4 py-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTemplateLibraryOpen(true)} className="flex-1">
          <BookOpen className="h-4 w-4 mr-2" />
          Templates
        </Button>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r bg-muted/20 p-4 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Textarea
                value={workflowDescription}
                onChange={e => setWorkflowDescription(e.target.value)}
                placeholder="Describe your workflow..."
                className="mt-1"
                rows={3}
              />
            </div>

            <div>
              <Label>Add Nodes (Drag to Canvas)</Label>
              <div className="mt-2 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => onDragStart(e, "tool")}
                  onClick={() => handleAddNode("tool")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Tool Node
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => onDragStart(e, "agent")}
                  onClick={() => handleAddNode("agent")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agent Node
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => onDragStart(e, "data")}
                  onClick={() => handleAddNode("data")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Data Node
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => onDragStart(e, "condition")}
                  onClick={() => handleAddNode("condition")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Condition Node
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => onDragStart(e, "merge")}
                  onClick={() => handleAddNode("merge")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Merge Node
                </Button>
                <div className="border-t my-2 pt-2">
                  <Label className="text-xs text-muted-foreground">Junction Nodes</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start cursor-grab active:cursor-grabbing mt-2"
                    draggable
                    onDragStart={(e) => onDragStart(e, "junction-merge")}
                    onClick={() => handleAddNode("junction-merge")}
                  >
                    <GitMerge className="h-4 w-4 mr-2" />
                    Merge Junction
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start cursor-grab active:cursor-grabbing mt-2"
                    draggable
                    onDragStart={(e) => onDragStart(e, "junction-split")}
                    onClick={() => handleAddNode("junction-split")}
                  >
                    <GitBranch className="h-4 w-4 mr-2" />
                    Split Junction
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            fitView
            connectionLineType="smoothstep"
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>

      {/* Configuration Panel (Side Sheet) */}
      <Sheet open={configPanelOpen} onOpenChange={setConfigPanelOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Node Configuration</SheetTitle>
            <SheetDescription>
              Configure the selected node settings and properties.
            </SheetDescription>
          </SheetHeader>
          {selectedNode && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Label>Node Label</Label>
                <Button variant="ghost" size="sm" onClick={handleDeleteNode}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={selectedNode.data.label || ""}
                onChange={e =>
                  setNodes(nds =>
                    nds.map(n =>
                      n.id === selectedNode.id ? { ...n, data: { ...n.data, label: e.target.value } } : n,
                    ),
                  )
                }
                placeholder="Node label..."
              />

              {/* Junction Node Configuration */}
              {selectedNode.type === "junction" && (
                <div className="mt-4 space-y-2">
                  <Label>Junction Mode</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedNode.data.mode || "merge"}
                    onChange={e => {
                      setNodes(nds =>
                        nds.map(n =>
                          n.id === selectedNode.id
                            ? { ...n, data: { ...n.data, mode: e.target.value } }
                            : n,
                        ),
                      );
                    }}
                  >
                    <option value="merge">Merge (Wait for all inputs)</option>
                    <option value="split">Split (Send to all outputs)</option>
                  </select>
                </div>
              )}

              {/* Tool Node Configuration */}
              {selectedNode.data.nodeType === "tool" && (
                <div className="mt-4 space-y-2">
                  <Label>MCP Server</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedNode.data.mcp_server_id || ""}
                    onChange={e => {
                      setNodes(nds =>
                        nds.map(n =>
                          n.id === selectedNode.id
                            ? { ...n, data: { ...n.data, mcp_server_id: e.target.value } }
                            : n,
                        ),
                      );
                    }}
                  >
                    <option value="">Select server...</option>
                    {availableServers.map(server => (
                      <option key={server.id} value={server.id}>
                        {server.label}
                      </option>
                    ))}
                  </select>

                  {selectedNode.data.mcp_server_id && (
                    <>
                      <Label>Command</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={selectedNode.data.mcp_command_name || ""}
                        onChange={e => {
                          setNodes(nds =>
                            nds.map(n =>
                              n.id === selectedNode.id
                                ? { ...n, data: { ...n.data, mcp_command_name: e.target.value } }
                                : n,
                            ),
                          );
                        }}
                      >
                        <option value="">Select command...</option>
                        {availableServers
                          .find(s => s.id === selectedNode.data.mcp_server_id)
                          ?.commands.map(cmd => (
                            <option key={cmd.name} value={cmd.name}>
                              {cmd.title || cmd.name}
                            </option>
                          ))}
                      </select>
                    </>
                  )}
                </div>
              )}

              {/* Agent Node Configuration */}
              {selectedNode.data.nodeType === "agent" && (
                <div className="mt-4 space-y-2">
                  <Label>Model</Label>
                  <Input
                    value={selectedNode.data.config?.model as string || ""}
                    onChange={e => {
                      setNodes(nds =>
                        nds.map(n =>
                          n.id === selectedNode.id
                            ? { ...n, data: { ...n.data, config: { ...n.data.config, model: e.target.value } } }
                            : n,
                        ),
                      );
                    }}
                    placeholder="e.g., GPT-4o Mini"
                  />
                </div>
              )}

              {/* Condition Node Configuration */}
              {selectedNode.data.nodeType === "condition" && (
                <div className="mt-4 space-y-2">
                  <Label>Condition Expression</Label>
                  <Textarea
                    value={selectedNode.data.config?.condition as string || ""}
                    onChange={e => {
                      setNodes(nds =>
                        nds.map(n =>
                          n.id === selectedNode.id
                            ? { ...n, data: { ...n.data, config: { ...n.data.config, condition: e.target.value } } }
                            : n,
                        ),
                      );
                    }}
                    placeholder="e.g., $result > 0"
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Template Library Sheet */}
      <Sheet open={templateLibraryOpen} onOpenChange={setTemplateLibraryOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Workflow Template Library</SheetTitle>
            <SheetDescription>
              Browse and use workflow templates to get started quickly.
            </SheetDescription>
          </SheetHeader>
          <TemplateLibrary
            onSelectTemplate={async (templateId) => {
              try {
                const { workflow, nodes: templateNodes, edges: templateEdges } = await getWorkflow(templateId);
                
                // Create ID mapping from template node IDs to new flow node IDs
                const nodeIdMap = new Map<string, string>();
                
                // Convert template nodes to React Flow nodes
                const flowNodes: Node[] = templateNodes.map(node => {
                  const isJunction = node.node_type === "merge" && node.config?.mode;
                  const newId = isJunction 
                    ? `junction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                    : `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  
                  nodeIdMap.set(node.id, newId);
                  
                  if (isJunction) {
                    return {
                      id: newId,
                      type: "junction",
                      position: { x: node.position_x, y: node.position_y },
                      data: {
                        label: node.label,
                        mode: (node.config.mode as "merge" | "split") || "merge",
                      },
                    };
                  }
                  return {
                    id: newId,
                    type: "workflow",
                    position: { x: node.position_x, y: node.position_y },
                    data: {
                      label: node.label,
                      nodeType: node.node_type,
                      config: node.config,
                      mcp_server_id: node.mcp_server_id,
                      mcp_command_name: node.mcp_command_name,
                    },
                  };
                });

                // Convert template edges to React Flow edges using the ID map
                const flowEdges: Edge[] = templateEdges
                  .map(edge => {
                    const sourceId = nodeIdMap.get(edge.source_node_id);
                    const targetId = nodeIdMap.get(edge.target_node_id);
                    
                    if (!sourceId || !targetId) return null;
                    
                    return {
                      id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      source: sourceId,
                      target: targetId,
                      type: "smoothstep",
                    };
                  })
                  .filter((e): e is Edge => e !== null);

                setNodes(nds => [...nds, ...flowNodes]);
                setEdges(eds => [...eds, ...flowEdges]);
                setWorkflowName(`${workflow.name} (Copy)`);
                setWorkflowDescription(workflow.description || "");
                
                setTemplateLibraryOpen(false);
                toast({
                  title: "Template Loaded",
                  description: `Loaded template: ${workflow.name}`,
                });
              } catch (error) {
                console.error("Failed to load template:", error);
                toast({
                  title: "Error",
                  description: "Failed to load template",
                  variant: "destructive",
                });
              }
            }}
            onSaveAsTemplate={async () => {
              const currentId = id;
              if (!currentId || currentId === "new") {
                toast({
                  title: "Error",
                  description: "Please save the workflow first",
                  variant: "destructive",
                });
                return;
              }

              try {
                await updateWorkflow(currentId, {
                  name: workflowName,
                  description: workflowDescription,
                });

                // Mark as template
                const { error } = await supabaseClient
                  .from("workflows")
                  .update({ is_template: true })
                  .eq("id", currentId);

                if (error) throw error;

                toast({
                  title: "Success",
                  description: "Workflow saved as template",
                });
                setTemplateLibraryOpen(false);
              } catch (error) {
                console.error("Failed to save as template:", error);
                toast({
                  title: "Error",
                  description: "Failed to save as template",
                  variant: "destructive",
                });
              }
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Execution Viewer Dialog */}
      <Dialog open={!!executionId} onOpenChange={(open) => !open && setExecutionId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Workflow Execution</DialogTitle>
          </DialogHeader>
          {executionId && (
            <WorkflowExecutionViewer
              executionId={executionId}
              onClose={() => setExecutionId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Footer */}
      <Footer />
    </div>
  );
}

// Template Library Component
function TemplateLibrary({
  onSelectTemplate,
  onSaveAsTemplate,
}: {
  onSelectTemplate: (templateId: string) => void;
  onSaveAsTemplate: () => void;
}) {
  const [templates, setTemplates] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const data = await listWorkflows(true);
      const templateData = data.filter(w => w.is_template);
      setTemplates(templateData);
    } catch (error) {
      console.error("Failed to load templates:", error);
      toast({
        title: "Error",
        description: "Failed to load templates",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const categories = Array.from(new Set(templates.map(t => t.template_category).filter(Boolean)));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Templates</h3>
        <Button onClick={onSaveAsTemplate} size="sm">
          <Sparkles className="h-4 w-4 mr-2" />
          Save Current as Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-8">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No templates available</p>
          <p className="text-sm text-muted-foreground mt-2">
            Save a workflow as a template to get started
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.length > 0 ? (
            categories.map(category => (
              <div key={category}>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  {category}
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {templates
                    .filter(t => t.template_category === category)
                    .map(template => (
                      <Button
                        key={template.id}
                        variant="outline"
                        className="w-full justify-start h-auto p-4"
                        onClick={() => onSelectTemplate(template.id)}
                      >
                        <div className="text-left flex-1">
                          <div className="font-semibold">{template.name}</div>
                          {template.description && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {template.description}
                            </div>
                          )}
                        </div>
                      </Button>
                    ))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {templates.map(template => (
                <Button
                  key={template.id}
                  variant="outline"
                  className="w-full justify-start h-auto p-4"
                  onClick={() => onSelectTemplate(template.id)}
                >
                  <div className="text-left flex-1">
                    <div className="font-semibold">{template.name}</div>
                    {template.description && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {template.description}
                      </div>
                    )}
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

