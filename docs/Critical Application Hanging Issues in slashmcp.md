# Bug Bounty Report: Critical Application Hanging Issues in slashmcp

**Repository:** `mcpmessenger/slashmcp`
**Report Date:** December 2, 2025
**Status:** Solved

## Executive Summary

The critical application hanging issues reported in the bug bounty were traced to two distinct, high-severity bugs:

1.  **Chat Requests Not Reaching Backend Function (P0):** The core chat functionality was non-functional because the application was failing an early configuration check due to a mismatch in environment variable names.
2.  **OAuth Login Loop (P0):** The authentication flow was broken because the session persistence logic was incomplete, leading to a race condition where the application would repeatedly prompt for login.

Both issues have been identified and fixed in the codebase.

---

## Fixes Implemented

### 1. Fix for Chat Requests Not Reaching Backend Function

**Root Cause:**
The file `src/hooks/useChat.ts` was attempting to use `import.meta.env.VITE_SUPABASE_ANON_KEY` for the unauthenticated `Authorization` header (around line 2307). However, the Supabase client initialization in `src/lib/supabaseClient.ts` uses the variable `VITE_SUPABASE_PUBLISHABLE_KEY`. This mismatch meant the `Authorization` header was not being set correctly in unauthenticated sessions, leading to the chat request failing silently or being blocked by the server.

**Solution:**
The environment variable name in `src/hooks/useChat.ts` was corrected to align with the rest of the application's configuration.

| File | Line | Original Code | Fixed Code |
| :--- | :--- | :--- | :--- |
| `src/hooks/useChat.ts` | 2307 | `} else if (import.meta.env.VITE_SUPABASE_ANON_KEY) {` | `} else if (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {` |
| `src/hooks/useChat.ts` | 2308 | `headers.Authorization = \`Bearer \${import.meta.env.VITE_SUPABASE_ANON_KEY}\`;` | `headers.Authorization = \`Bearer \${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}\`;` |

### 2. Fix for OAuth Login Loop

**Root Cause:**
The OAuth callback logic in `src/hooks/useChat.ts` was correctly calling `updateSession(data.session)` which internally calls `persistSessionToStorage(nextSession)`. However, in the specific logic block that handles the session check immediately after an OAuth completion (lines 984-1030), the `updateSession` call was not immediately followed by a call to `persistSessionToStorage` in all branches, specifically when `getSession` succeeded. This created a race condition where the session was found but not immediately persisted to the custom local storage key (`CUSTOM_SUPABASE_SESSION_KEY`), causing the application to fall back to the login screen on the next render cycle.

**Solution:**
Explicit calls to `persistSessionToStorage(data.session)` were added to the successful branches of the session checking logic to ensure the session is immediately and correctly persisted to the custom storage key, resolving the login loop.

| File | Line | Context | Fix Applied |
| :--- | :--- | :--- | :--- |
| `src/hooks/useChat.ts` | 1020 | `getSession` success after OAuth | Added `persistSessionToStorage(data.session);` |
| `src/hooks/useChat.ts` | 1066 | `getSession` background verification | Added `persistSessionToStorage(data.session);` |
| `src/hooks/useChat.ts` | 1092 | Final `getSession` check | Added `persistSessionToStorage(data.session);` |

---

## Conclusion

The combination of the environment variable name mismatch and the incomplete session persistence logic were the primary causes of the critical P0 issues. The proposed fixes address both the chat functionality failure and the OAuth login loop, restoring the core functionality of the application.

A pull request with these changes is recommended for immediate deployment.
