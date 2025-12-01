# Testing Workflows - Quick Start Guide

## Prerequisites

1. **Apply Database Migration**
   ```bash
   # Make sure you're in the project root
   npx supabase migration up
   ```
   
   Or if using Supabase CLI with remote:
   ```bash
   npx supabase db push
   ```

2. **Ensure you're signed in** - Workflows require authentication

## Testing Steps

### 1. Access Workflows Page
- Click "Workflows" button in the chat header
- Or navigate to `/workflows`

### 2. Create a New Workflow
- Click "New Workflow" button
- Enter a workflow name (e.g., "Test Workflow")
- Add a description (optional)

### 3. Build a Simple Workflow

#### Add Nodes:
1. Click "Tool Node" in the sidebar
2. A new node appears on the canvas
3. Click the node to select it
4. In the sidebar, select:
   - **MCP Server**: Choose from dropdown (e.g., "Alpha Vantage")
   - **Command**: Select a command (e.g., "Get Quote")

#### Connect Nodes:
1. Hover over the "Start" node
2. Drag from the handle on the right to your tool node
3. Connect tool node to an "End" node (add one if needed)

#### Save:
1. Click "Save" button in the header
2. You should see a success toast
3. The URL will update to `/workflows/{id}`

### 4. Edit Existing Workflow
- Go to `/workflows` page
- Click "Edit" on any workflow
- Make changes
- Click "Save"

### 5. Delete Workflow
- Go to `/workflows` page
- Click trash icon on a workflow
- Confirm deletion

## Expected Behavior

✅ **What Should Work:**
- Creating new workflows
- Adding nodes to canvas
- Connecting nodes with edges
- Configuring tool nodes with MCP servers
- Saving workflows to database
- Loading saved workflows
- Deleting workflows
- Navigation between pages

⚠️ **What Won't Work Yet:**
- Running workflows (execution engine not built)
- Workflow templates (not implemented)
- Advanced node configuration (basic only)

## Troubleshooting

### "Failed to load workflows"
- Check that you're signed in
- Verify database migration was applied
- Check browser console for errors

### "Failed to save workflow"
- Ensure workflow name is provided
- Check that nodes have valid configurations
- Verify database connection

### Nodes not appearing
- Refresh the page
- Check browser console for React Flow errors
- Ensure `@xyflow/react` is installed

## Database Schema

The migration creates these tables:
- `workflows` - Main workflow definitions
- `workflow_nodes` - Individual nodes
- `workflow_edges` - Connections between nodes
- `workflow_executions` - Execution history (for future use)
- `node_executions` - Node execution history (for future use)

## Next Steps

Once testing is complete, we'll build:
1. **Workflow Execution Engine** - To actually run workflows
2. **Workflow Templates** - Pre-built workflows
3. **Execution History** - View past runs

