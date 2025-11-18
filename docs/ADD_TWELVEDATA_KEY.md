# Adding Twelve Data API Key via Key Manager

## Step 1: Add the Key via Chat

In your chat interface, use the key manager command:

```
/key add twelvedata twelvedata-api-key type=api_key key=YOUR_API_KEY_HERE
```

**Example:**
```
/key add twelvedata twelvedata-api-key type=api_key key=abc123xyz789
```

**Note**: The key value will be encrypted and stored securely in the database.

## Step 2: Verify the Key Was Added

List your keys to confirm:

```
/key list
```

You should see your `twelvedata-api-key` in the list.

## Step 3: The MCP Function Will Use It

After we update the MCP function (see below), it will automatically:
1. First check for `TWELVEDATA_API_KEY` environment variable (Supabase secret)
2. If not found, check the key manager database for a key with provider `twelvedata`
3. Use the key from the database if available

## Getting Your Twelve Data API Key

1. Sign up at https://twelvedata.com
2. Go to your dashboard
3. Copy your API key
4. Use it in the `/key add` command above

## Alternative: Set as Supabase Secret

If you prefer to use Supabase secrets directly:

```bash
npx supabase secrets set TWELVEDATA_API_KEY=your_key_here --project-ref akxdroedpsvmckvqvggr
```

But using the key manager is better because:
- ✅ Keys are encrypted at rest
- ✅ Audit logging of all key operations
- ✅ Per-user key management
- ✅ Can track usage and expiration

