# How to Check Chat Function Logs

## Option 1: Supabase Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions/chat/logs
2. You'll need to be logged in to your Supabase account
3. View real-time logs and filter by time range

## Option 2: Supabase Dashboard - Functions Page
1. Navigate to: https://supabase.com/dashboard/project/akxdroedpsvmckvqvggr/functions
2. Click on the "chat" function
3. Go to the "Logs" tab

## Option 3: Check Recent Deployments
The chat function was last updated at: 2025-11-17 04:38:39 UTC (Version 32)

## What to Look For in Logs:
- Event types being received from Agents SDK
- Content extraction issues
- Error messages
- "Processed X events" messages
- "No content generated" warnings
- Fallback to direct API messages

## Common Issues to Check:
1. **No events received**: Agents SDK might not be streaming properly
2. **Events received but no content**: Content extraction logic might be wrong
3. **Authentication errors**: Check if session tokens are valid
4. **API key errors**: Check if OPENAI_API_KEY is set in Supabase secrets

