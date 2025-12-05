# Fix: Session Lost on Refresh

## Problem
When you refresh the page, you have to log in again. This is because the session isn't being properly persisted.

## Quick Fix

The session should be automatically restored from localStorage, but if it's not working:

1. **Check Browser Console** (F12 → Console)
   - Look for errors about session storage
   - Check if localStorage is being blocked

2. **Clear Browser Data** (if needed)
   - Sometimes corrupted localStorage can cause issues
   - Clear site data and log in again

3. **Check Supabase Auth Settings**
   - Make sure your redirect URL is correct
   - Check that cookies are enabled

## Technical Details

The app uses:
- `localStorage` to persist sessions
- `supabaseClient.auth.getSession()` to restore sessions
- Automatic session restoration on page load

If sessions aren't persisting, it might be:
- Browser blocking localStorage
- Corrupted localStorage data
- Supabase auth configuration issue

## Temporary Workaround

If the issue persists, you can:
1. Use browser bookmarks instead of refreshing
2. Keep the tab open (don't close it)
3. Use incognito/private mode to test if it's a cache issue

