-- Migration: Seed demo workflow templates
-- Creates 3 pre-built workflow templates for product demos

-- First, create a system user for templates (or use existing admin user)
-- We'll use a special approach: create templates with a placeholder user_id
-- that will be replaced when users copy the template

-- Helper function to create template workflows
-- Note: Templates are created with a system user_id that allows all users to view them

-- Template 1: Competitive Intelligence Report
DO $$
DECLARE
  template1_id uuid;
  template2_id uuid;
  template3_id uuid;
  -- Template 1 nodes
  t1_start_id uuid;
  t1_end_id uuid;
  t1_split_id uuid;
  t1_web_search_id uuid;
  t1_stock_quote_id uuid;
  t1_grokipedia_id uuid;
  t1_polymarket_id uuid;
  t1_merge_id uuid;
  t1_researcher_id uuid;
  t1_writer_id uuid;
  t1_design_id uuid;
  t1_email_id uuid;
  -- Template 2 nodes
  t2_start_id uuid;
  t2_end_id uuid;
  t2_split1_id uuid;
  t2_web_search_id uuid;
  t2_grokipedia_id uuid;
  t2_merge1_id uuid;
  t2_article_writer_id uuid;
  t2_split2_id uuid;
  t2_twitter_id uuid;
  t2_linkedin_id uuid;
  t2_instagram_id uuid;
  t2_split3_id uuid;
  t2_twitter_design_id uuid;
  t2_linkedin_design_id uuid;
  t2_instagram_design_id uuid;
  t2_merge2_id uuid;
  t2_email_id uuid;
  -- Template 3 nodes
  t3_start_id uuid;
  t3_end_id uuid;
  t3_split_id uuid;
  t3_stock_quote_id uuid;
  t3_stock_chart_id uuid;
  t3_web_search_id uuid;
  t3_polymarket_id uuid;
  t3_places_id uuid;
  t3_merge_id uuid;
  t3_analyst_id uuid;
  t3_writer_id uuid;
  t3_email_id uuid;
  system_user_id uuid;
BEGIN
  -- Get or create a system user for templates
  -- For now, we'll use the first user or create a placeholder
  -- In production, you might want to use a dedicated system user
  SELECT id INTO system_user_id FROM auth.users LIMIT 1;
  
  -- If no users exist, we'll need to handle this differently
  -- For templates, we can create them with a NULL user_id if RLS allows
  -- But RLS requires user_id, so we'll use the first user or skip if none exists
  IF system_user_id IS NULL THEN
    RAISE NOTICE 'No users found. Templates will be created when first user signs up.';
    RETURN;
  END IF;

  -- ============================================
  -- TEMPLATE 1: Competitive Intelligence Report
  -- ============================================
  INSERT INTO public.workflows (user_id, name, description, is_template, template_category, metadata)
  VALUES (
    system_user_id,
    'Competitive Intelligence Report',
    'Research a competitor by gathering data from multiple sources (web search, stock data, prediction markets, knowledge base), synthesize insights, generate a report, create a visual summary, and send via email with approval gate.',
    true,
    'analysis',
    '{"demo": true, "complexity": "medium", "estimated_time": "60s"}'::jsonb
  )
  RETURNING id INTO template1_id;

  -- Template 1: Start node
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template1_id, 'start', 'Start', 100, 200, '{}', 0)
  RETURNING id INTO t1_start_id;

  -- Template 1: Split junction
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template1_id, 'merge', 'Split - Parallel Data Gathering', 300, 200, '{"mode": "split"}'::jsonb, 1)
  RETURNING id INTO t1_split_id;

  -- Template 1: Web Search tool
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template1_id, 'tool', 'Web Search', 500, 100, '{"query": "{{competitor}} news", "max_results": 5}'::jsonb, 'search-mcp', 'web_search', 2)
  RETURNING id INTO t1_web_search_id;

  -- Template 1: Stock Quote tool
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template1_id, 'tool', 'Stock Quote', 500, 200, '{"symbol": "{{symbol}}"}'::jsonb, 'alphavantage-mcp', 'get_quote', 2)
  RETURNING id INTO t1_stock_quote_id;

  -- Template 1: Grokipedia tool
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template1_id, 'tool', 'Grokipedia Search', 500, 300, '{"query": "{{competitor}} industry", "limit": 3}'::jsonb, 'grokipedia-mcp', 'search', 2)
  RETURNING id INTO t1_grokipedia_id;

  -- Template 1: Polymarket tool
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template1_id, 'tool', 'Prediction Market', 500, 400, '{"market_id": "{{market_id}}"}'::jsonb, 'polymarket-mcp', 'get_market_price', 2)
  RETURNING id INTO t1_polymarket_id;

  -- Template 1: Merge junction
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template1_id, 'merge', 'Merge - Combine Results', 700, 200, '{"mode": "merge"}'::jsonb, 3)
  RETURNING id INTO t1_merge_id;

  -- Template 1: Researcher agent
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template1_id, 'agent', 'Researcher Agent', 900, 200, '{"model": "gpt-4o-mini", "instructions": "Analyze and synthesize the gathered data into key insights"}'::jsonb, 4)
  RETURNING id INTO t1_researcher_id;

  -- Template 1: Writer agent
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template1_id, 'agent', 'Writer Agent', 1100, 200, '{"prompt": "Create competitive analysis report: {{research_results}}", "model": "gemini-1.5-pro"}'::jsonb, 'gemini-mcp', 'generate_text', 5)
  RETURNING id INTO t1_writer_id;

  -- Template 1: Design tool
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template1_id, 'tool', 'Create Design', 1300, 200, '{"template": "presentation", "text": "{{report_summary}}"}'::jsonb, 'canva-mcp', 'create_design', 6)
  RETURNING id INTO t1_design_id;

  -- Template 1: Email agent (placeholder - would need email MCP server)
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template1_id, 'agent', 'Email Agent', 1500, 200, '{"requires_approval": true, "subject": "Competitive Intelligence Report: {{competitor}}"}'::jsonb, 7)
  RETURNING id INTO t1_email_id;

  -- Template 1: End node
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template1_id, 'end', 'End', 1700, 200, '{}', 8)
  RETURNING id INTO t1_end_id;

  -- Template 1: Edges
  INSERT INTO public.workflow_edges (workflow_id, source_node_id, target_node_id, data_mapping)
  VALUES
    (template1_id, t1_start_id, t1_split_id, '{}'::jsonb),
    (template1_id, t1_split_id, t1_web_search_id, '{}'::jsonb),
    (template1_id, t1_split_id, t1_stock_quote_id, '{}'::jsonb),
    (template1_id, t1_split_id, t1_grokipedia_id, '{}'::jsonb),
    (template1_id, t1_split_id, t1_polymarket_id, '{}'::jsonb),
    (template1_id, t1_web_search_id, t1_merge_id, '{}'::jsonb),
    (template1_id, t1_stock_quote_id, t1_merge_id, '{}'::jsonb),
    (template1_id, t1_grokipedia_id, t1_merge_id, '{}'::jsonb),
    (template1_id, t1_polymarket_id, t1_merge_id, '{}'::jsonb),
    (template1_id, t1_merge_id, t1_researcher_id, '{}'::jsonb),
    (template1_id, t1_researcher_id, t1_writer_id, '{}'::jsonb),
    (template1_id, t1_writer_id, t1_design_id, '{}'::jsonb),
    (template1_id, t1_design_id, t1_email_id, '{}'::jsonb),
    (template1_id, t1_email_id, t1_end_id, '{}'::jsonb);

  -- ============================================
  -- TEMPLATE 2: Market Research & Content Pipeline
  -- ============================================
  INSERT INTO public.workflows (user_id, name, description, is_template, template_category, metadata)
  VALUES (
    system_user_id,
    'Market Research & Content Pipeline',
    'Research a topic, generate a long-form article, create platform-specific social media posts (Twitter, LinkedIn, Instagram), design visuals for each post, and send the complete content package via email with approval.',
    true,
    'content',
    '{"demo": true, "complexity": "high", "estimated_time": "75s"}'::jsonb
  )
  RETURNING id INTO template2_id;

  -- Template 2: Start node
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template2_id, 'start', 'Start', 100, 300, '{}', 0)
  RETURNING id INTO t2_start_id;

  -- Template 2: Split 1 - Research
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template2_id, 'merge', 'Split - Research', 300, 300, '{"mode": "split"}'::jsonb, 1)
  RETURNING id INTO t2_split1_id;

  -- Template 2: Web Search
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'tool', 'Web Search', 500, 200, '{"query": "{{topic}}", "max_results": 5}'::jsonb, 'search-mcp', 'web_search', 2)
  RETURNING id INTO t2_web_search_id;

  -- Template 2: Grokipedia
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'tool', 'Grokipedia Search', 500, 400, '{"query": "{{topic}}", "limit": 3}'::jsonb, 'grokipedia-mcp', 'search', 2)
  RETURNING id INTO t2_grokipedia_id;

  -- Template 2: Merge 1
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template2_id, 'merge', 'Merge - Research Results', 700, 300, '{"mode": "merge"}'::jsonb, 3)
  RETURNING id INTO t2_merge1_id;

  -- Template 2: Article Writer
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'agent', 'Article Writer', 900, 300, '{"prompt": "Write 1000-word article: {{research_results}}", "model": "gemini-1.5-pro"}'::jsonb, 'gemini-mcp', 'generate_text', 4)
  RETURNING id INTO t2_article_writer_id;

  -- Template 2: Split 2 - Social Posts
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template2_id, 'merge', 'Split - Social Posts', 1100, 300, '{"mode": "split"}'::jsonb, 5)
  RETURNING id INTO t2_split2_id;

  -- Template 2: Twitter Post
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'agent', 'Twitter Post', 1300, 100, '{"prompt": "Create Twitter post: {{article}}", "model": "gemini-1.5-flash"}'::jsonb, 'gemini-mcp', 'generate_text', 6)
  RETURNING id INTO t2_twitter_id;

  -- Template 2: LinkedIn Post
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'agent', 'LinkedIn Post', 1300, 300, '{"prompt": "Create LinkedIn post: {{article}}", "model": "gemini-1.5-flash"}'::jsonb, 'gemini-mcp', 'generate_text', 6)
  RETURNING id INTO t2_linkedin_id;

  -- Template 2: Instagram Post
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'agent', 'Instagram Post', 1300, 500, '{"prompt": "Create Instagram caption: {{article}}", "model": "gemini-1.5-flash"}'::jsonb, 'gemini-mcp', 'generate_text', 6)
  RETURNING id INTO t2_instagram_id;

  -- Template 2: Split 3 - Designs
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template2_id, 'merge', 'Split - Create Designs', 1500, 300, '{"mode": "split"}'::jsonb, 7)
  RETURNING id INTO t2_split3_id;

  -- Template 2: Twitter Design
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'tool', 'Twitter Design', 1700, 100, '{"template": "social_post", "text": "{{twitter_post}}"}'::jsonb, 'canva-mcp', 'create_design', 8)
  RETURNING id INTO t2_twitter_design_id;

  -- Template 2: LinkedIn Design
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'tool', 'LinkedIn Design', 1700, 300, '{"template": "social_post", "text": "{{linkedin_post}}"}'::jsonb, 'canva-mcp', 'create_design', 8)
  RETURNING id INTO t2_linkedin_design_id;

  -- Template 2: Instagram Design
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template2_id, 'tool', 'Instagram Design', 1700, 500, '{"template": "social_post", "text": "{{instagram_post}}"}'::jsonb, 'canva-mcp', 'create_design', 8)
  RETURNING id INTO t2_instagram_design_id;

  -- Template 2: Merge 2
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template2_id, 'merge', 'Merge - All Content', 1900, 300, '{"mode": "merge"}'::jsonb, 9)
  RETURNING id INTO t2_merge2_id;

  -- Template 2: Email agent
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template2_id, 'agent', 'Email Agent', 2100, 300, '{"requires_approval": true, "subject": "Content Package: {{topic}}"}'::jsonb, 10)
  RETURNING id INTO t2_email_id;

  -- Template 2: End node
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template2_id, 'end', 'End', 2300, 300, '{}', 11)
  RETURNING id INTO t2_end_id;

  -- Template 2: Edges
  INSERT INTO public.workflow_edges (workflow_id, source_node_id, target_node_id, data_mapping)
  VALUES
    (template2_id, t2_start_id, t2_split1_id, '{}'::jsonb),
    (template2_id, t2_split1_id, t2_web_search_id, '{}'::jsonb),
    (template2_id, t2_split1_id, t2_grokipedia_id, '{}'::jsonb),
    (template2_id, t2_web_search_id, t2_merge1_id, '{}'::jsonb),
    (template2_id, t2_grokipedia_id, t2_merge1_id, '{}'::jsonb),
    (template2_id, t2_merge1_id, t2_article_writer_id, '{}'::jsonb),
    (template2_id, t2_article_writer_id, t2_split2_id, '{}'::jsonb),
    (template2_id, t2_split2_id, t2_twitter_id, '{}'::jsonb),
    (template2_id, t2_split2_id, t2_linkedin_id, '{}'::jsonb),
    (template2_id, t2_split2_id, t2_instagram_id, '{}'::jsonb),
    (template2_id, t2_twitter_id, t2_split3_id, '{}'::jsonb),
    (template2_id, t2_linkedin_id, t2_split3_id, '{}'::jsonb),
    (template2_id, t2_instagram_id, t2_split3_id, '{}'::jsonb),
    (template2_id, t2_split3_id, t2_twitter_design_id, '{}'::jsonb),
    (template2_id, t2_split3_id, t2_linkedin_design_id, '{}'::jsonb),
    (template2_id, t2_split3_id, t2_instagram_design_id, '{}'::jsonb),
    (template2_id, t2_twitter_design_id, t2_merge2_id, '{}'::jsonb),
    (template2_id, t2_linkedin_design_id, t2_merge2_id, '{}'::jsonb),
    (template2_id, t2_instagram_design_id, t2_merge2_id, '{}'::jsonb),
    (template2_id, t2_merge2_id, t2_email_id, '{}'::jsonb),
    (template2_id, t2_email_id, t2_end_id, '{}'::jsonb);

  -- ============================================
  -- TEMPLATE 3: Due Diligence Automation
  -- ============================================
  INSERT INTO public.workflows (user_id, name, description, is_template, template_category, metadata)
  VALUES (
    system_user_id,
    'Due Diligence Automation',
    'Analyze a company by gathering financial data (stock quotes, charts), web research, prediction market data, and location information. Synthesize all data into a comprehensive due diligence report and send to stakeholders with approval gate.',
    true,
    'analysis',
    '{"demo": true, "complexity": "high", "estimated_time": "90s"}'::jsonb
  )
  RETURNING id INTO template3_id;

  -- Template 3: Start node
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template3_id, 'start', 'Start', 100, 400, '{}', 0)
  RETURNING id INTO t3_start_id;

  -- Template 3: Split - Data gathering
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template3_id, 'merge', 'Split - Data Gathering', 300, 400, '{"mode": "split"}'::jsonb, 1)
  RETURNING id INTO t3_split_id;

  -- Template 3: Stock Quote
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template3_id, 'tool', 'Stock Quote', 500, 200, '{"symbol": "{{symbol}}"}'::jsonb, 'alphavantage-mcp', 'get_quote', 2)
  RETURNING id INTO t3_stock_quote_id;

  -- Template 3: Stock Chart
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template3_id, 'tool', 'Stock Chart', 500, 300, '{"symbol": "{{symbol}}", "range": "1Y"}'::jsonb, 'alphavantage-mcp', 'get_stock_chart', 2)
  RETURNING id INTO t3_stock_chart_id;

  -- Template 3: Web Search
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template3_id, 'tool', 'Web Search', 500, 400, '{"query": "{{company}} analysis 2024", "max_results": 5}'::jsonb, 'search-mcp', 'web_search', 2)
  RETURNING id INTO t3_web_search_id;

  -- Template 3: Polymarket
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template3_id, 'tool', 'Prediction Market', 500, 500, '{"market_id": "{{market_id}}"}'::jsonb, 'polymarket-mcp', 'get_market_price', 2)
  RETURNING id INTO t3_polymarket_id;

  -- Template 3: Google Places
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template3_id, 'tool', 'Company Locations', 500, 600, '{"query": "{{company}} headquarters"}'::jsonb, 'google-places-mcp', 'search_places', 2)
  RETURNING id INTO t3_places_id;

  -- Template 3: Merge
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template3_id, 'merge', 'Merge - All Data', 700, 400, '{"mode": "merge"}'::jsonb, 3)
  RETURNING id INTO t3_merge_id;

  -- Template 3: Analyst agent
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template3_id, 'agent', 'Analyst Agent', 900, 400, '{"model": "gpt-4o-mini", "instructions": "Analyze financials, trends, predictions, and locations"}'::jsonb, 4)
  RETURNING id INTO t3_analyst_id;

  -- Template 3: Writer agent
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, mcp_server_id, mcp_command_name, execution_order)
  VALUES (template3_id, 'agent', 'Writer Agent', 1100, 400, '{"prompt": "Create due diligence report: {{analysis}}", "model": "gemini-1.5-pro"}'::jsonb, 'gemini-mcp', 'generate_text', 5)
  RETURNING id INTO t3_writer_id;

  -- Template 3: Email agent
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template3_id, 'agent', 'Email Agent', 1300, 400, '{"requires_approval": true, "subject": "Due Diligence Report: {{company}}"}'::jsonb, 6)
  RETURNING id INTO t3_email_id;

  -- Template 3: End node
  INSERT INTO public.workflow_nodes (workflow_id, node_type, label, position_x, position_y, config, execution_order)
  VALUES (template3_id, 'end', 'End', 1500, 400, '{}', 7)
  RETURNING id INTO t3_end_id;

  -- Template 3: Edges
  INSERT INTO public.workflow_edges (workflow_id, source_node_id, target_node_id, data_mapping)
  VALUES
    (template3_id, t3_start_id, t3_split_id, '{}'::jsonb),
    (template3_id, t3_split_id, t3_stock_quote_id, '{}'::jsonb),
    (template3_id, t3_split_id, t3_stock_chart_id, '{}'::jsonb),
    (template3_id, t3_split_id, t3_web_search_id, '{}'::jsonb),
    (template3_id, t3_split_id, t3_polymarket_id, '{}'::jsonb),
    (template3_id, t3_split_id, t3_places_id, '{}'::jsonb),
    (template3_id, t3_stock_quote_id, t3_merge_id, '{}'::jsonb),
    (template3_id, t3_stock_chart_id, t3_merge_id, '{}'::jsonb),
    (template3_id, t3_web_search_id, t3_merge_id, '{}'::jsonb),
    (template3_id, t3_polymarket_id, t3_merge_id, '{}'::jsonb),
    (template3_id, t3_places_id, t3_merge_id, '{}'::jsonb),
    (template3_id, t3_merge_id, t3_analyst_id, '{}'::jsonb),
    (template3_id, t3_analyst_id, t3_writer_id, '{}'::jsonb),
    (template3_id, t3_writer_id, t3_email_id, '{}'::jsonb),
    (template3_id, t3_email_id, t3_end_id, '{}'::jsonb);

  RAISE NOTICE 'Successfully created 3 demo workflow templates';
END $$;

