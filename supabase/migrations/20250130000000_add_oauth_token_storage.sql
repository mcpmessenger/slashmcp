-- Migration to store OAuth tokens in user metadata
-- This allows us to access Google OAuth tokens for Gmail API, Calendar, Drive, etc.

-- Create a function to store OAuth tokens in user metadata
-- Note: We use SECURITY DEFINER to allow updating auth.users table
CREATE OR REPLACE FUNCTION store_oauth_token(
  p_user_id UUID,
  p_provider TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT DEFAULT NULL,
  p_expires_at BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_metadata JSONB;
  v_oauth_tokens JSONB;
BEGIN
  -- Get current app_metadata (fully qualified table name with schema)
  SELECT COALESCE((raw_user_data).app_metadata, '{}'::jsonb)
  INTO v_current_metadata
  FROM (
    SELECT auth.users AS raw_user_data
    FROM auth.users
    WHERE id = p_user_id
  ) AS user_query;
  
  -- Alternative approach: Direct query with schema qualification
  IF v_current_metadata IS NULL THEN
    SELECT COALESCE(app_metadata, '{}'::jsonb)
    INTO v_current_metadata
    FROM auth.users
    WHERE id = p_user_id;
    
    -- If user still doesn't exist, return early
    IF v_current_metadata IS NULL THEN
      RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;
  END IF;
  
  -- Get existing oauth_tokens or create empty object
  v_oauth_tokens := COALESCE(v_current_metadata->'oauth_tokens', '{}'::jsonb);
  
  -- Build the new token object
  v_oauth_tokens := v_oauth_tokens || jsonb_build_object(
    p_provider, jsonb_build_object(
      'access_token', p_access_token,
      'refresh_token', COALESCE(p_refresh_token, v_oauth_tokens->p_provider->>'refresh_token'),
      'expires_at', COALESCE(p_expires_at::text, v_oauth_tokens->p_provider->>'expires_at')
    )
  );
  
  -- Update user's app_metadata with OAuth tokens (fully qualified table name)
  UPDATE auth.users
  SET app_metadata = v_current_metadata || jsonb_build_object('oauth_tokens', v_oauth_tokens)
  WHERE id = p_user_id;
END;
$$;

-- Create a function to retrieve OAuth tokens
CREATE OR REPLACE FUNCTION get_oauth_token(
  p_user_id UUID,
  p_provider TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tokens JSONB;
BEGIN
  -- Fully qualified table name with schema
  SELECT app_metadata->'oauth_tokens'->p_provider
  INTO v_tokens
  FROM auth.users
  WHERE id = p_user_id;
  
  RETURN v_tokens;
END;
$$;

-- Create a trigger function to capture OAuth tokens during sign-in
-- This will be called via a webhook or edge function after OAuth callback
CREATE OR REPLACE FUNCTION capture_oauth_tokens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_identity_data JSONB;
  v_access_token TEXT;
  v_refresh_token TEXT;
  v_expires_at BIGINT;
  v_provider TEXT;
BEGIN
  -- Check if this is a new identity or updated identity with tokens
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_identity_data := NEW.identity_data;
    v_provider := NEW.provider;
    
    -- Extract tokens from identity_data
    v_access_token := v_identity_data->>'access_token';
    v_refresh_token := v_identity_data->>'refresh_token';
    v_expires_at := (v_identity_data->>'expires_at')::BIGINT;
    
    -- If we have an access token, store it in user metadata
    IF v_access_token IS NOT NULL THEN
      PERFORM store_oauth_token(
        NEW.user_id,
        v_provider,
        v_access_token,
        v_refresh_token,
        v_expires_at
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Note: We can't create triggers on auth.identities directly in Supabase
-- Instead, we'll use an Edge Function webhook or call store_oauth_token manually
-- after OAuth sign-in completes

COMMENT ON FUNCTION store_oauth_token IS 'Stores OAuth provider tokens in user app_metadata for later retrieval';
COMMENT ON FUNCTION get_oauth_token IS 'Retrieves OAuth provider tokens from user app_metadata';

