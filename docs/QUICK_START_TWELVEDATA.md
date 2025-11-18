# Quick Start: Adding Twelve Data API Key

## Your API Key
```
YOUR_TWELVEDATA_API_KEY
```

## Step 1: Add the Key via Chat

In your chat interface at https://slashmcp.vercel.app, type:

```
/key add twelvedata twelvedata-api-key type=api_key key=YOUR_TWELVEDATA_API_KEY
```

## Step 2: Verify It Was Added

List your keys to confirm:

```
/key list
```

You should see:
- **Name**: `twelvedata-api-key`
- **Provider**: `twelvedata`
- **Type**: `api_key`
- **Status**: Active

## Step 3: Test Stock Lookup

Try getting a stock quote:

```
Get the stock price for AAPL
```

or

```
What's NVDA trading at?
```

The system will now:
1. Try Alpha Vantage first (if configured)
2. Fall back to Twelve Data using your key from the key manager
3. Return the stock price

## How It Works

The MCP function (`supabase/functions/mcp/index.ts`) has been updated to:
- First check `TWELVEDATA_API_KEY` environment variable (Supabase secret)
- If not found, check the key manager database for a key with provider `twelvedata`
- Automatically decrypt and use your key when making API calls

## Security Notes

✅ Your key is encrypted at rest using pgcrypto  
✅ Only you can access your keys (user-scoped)  
✅ All key operations are audited  
✅ Keys are never exposed in logs or responses

## Troubleshooting

If stock lookups still fail:
1. Verify the key was added: `/key list`
2. Check the key is active: `/key check twelvedata-api-key`
3. Try a different stock symbol
4. Check Twelve Data API status at https://twelvedata.com

