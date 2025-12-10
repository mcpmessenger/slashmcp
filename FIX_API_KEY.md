# Fix: Invalid API Key Error

## Problem Found
Your `.env.local` file has:
```
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key-here
```

This is a **placeholder**, not your actual API key! That's why you're getting "Invalid API key" errors.

## Solution: Add Your Real API Key

### Step 1: Get Your Supabase Anon Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `akxdroedpsvmckvqvggr`
3. Go to **Settings** → **API**
4. Under **Project API keys**, find **`anon` `public`** key
5. Click the **eye icon** to reveal it
6. Copy the key (it's a long string starting with `eyJ...`)

### Step 2: Update `.env.local`

Edit your `.env.local` file and replace:
```
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key-here
```

With:
```
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (your actual key)
```

### Step 3: Restart Dev Server

**Important:** After updating `.env.local`, you MUST restart your dev server:

1. Stop the server (`Ctrl+C` in terminal)
2. Start it again: `npm run dev`
3. Hard refresh the browser: `Ctrl+Shift+R`

### Step 4: Verify It's Working

**In browser console, check:**
```javascript
// Check if API key is loaded
console.log('API Key loaded:', window.env?.VITE_SUPABASE_PUBLISHABLE_KEY ? 'Yes' : 'No');
console.log('Supabase URL:', window.env?.VITE_SUPABASE_URL);
```

**Should see:**
- ✅ API Key loaded: Yes
- ✅ Supabase URL: https://akxdroedpsvmckvqvggr.supabase.co

### Step 5: Try Sign In Again

After restarting with the correct API key:
1. Clear browser storage (localStorage, sessionStorage)
2. Try signing in with Google
3. Should work now! ✅

## Your Complete `.env.local` Should Look Like:

```bash
VITE_SUPABASE_URL=https://akxdroedpsvmckvqvggr.supabase.co
VITE_SUPABASE_FUNCTIONS_URL=https://akxdroedpsvmckvqvggr.supabase.co/functions/v1
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkeGRyb2VkcHN2bWNrdnZnZ3IiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY5... (your full key)
VITE_SUPABASE_REDIRECT_URL=http://localhost:8080
```

## Why This Happened

The `.env.local.example` file has placeholder values. When you copied it, you need to fill in the actual values from your Supabase project.

## Security Note

✅ `.env.local` is gitignored - your API key won't be committed to git
✅ The `anon` key is safe to use in the browser (it's public)
✅ Never commit `.env.local` to version control

