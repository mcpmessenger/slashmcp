# Developer Instructions: Fixing Critical P0 Bugs in slashmcp

This document provides the necessary instructions and code changes to resolve the critical P0 bugs identified in the `mcpmessenger/slashmcp` repository.

The two main issues are:
1.  **Chat Requests Not Reaching Backend Function (P0):** Caused by an environment variable name mismatch.
2.  **OAuth Login Loop (P0):** Caused by incomplete session persistence logic.

## 1. Environment Variable Mismatch Fix (Chat Functionality)

The core chat functionality is broken because the application is using the wrong environment variable name for the Supabase anonymous key when setting the `Authorization` header for unauthenticated users.

### File: `slashmcp/src/hooks/useChat.ts`

**Change 1: Correct `VITE_SUPABASE_ANON_KEY` to `VITE_SUPABASE_PUBLISHABLE_KEY`**

In the `sendMessage` function, locate the section where the `Authorization` header is set (around lines 2305-2309 in the original file) and apply the following change:

| Line | Original Code | Fixed Code |
| :--- | :--- | :--- |
| 2307 | `} else if (import.meta.env.VITE_SUPABASE_ANON_KEY) {` | `} else if (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {` |
| 2308 | `headers.Authorization = \`Bearer \${import.meta.env.VITE_SUPABASE_ANON_KEY}\`;` | `headers.Authorization = \`Bearer \${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}\`;` |

This ensures that the correct key is used, allowing the chat request to be properly authorized and reach the Supabase Edge Function.

## 2. OAuth Login Loop Fix (Session Persistence)

The login loop is caused by a race condition where the session is not immediately persisted to the custom local storage key after a successful OAuth redirect, causing the app to revert to the login screen. The `updateSession` function already handles persistence, but the logic that checks for a session immediately after OAuth completion needs to explicitly call the persistence function to ensure the session is available for the next render cycle.

### File: `slashmcp/src/hooks/useChat.ts`

**Change 2: Explicitly persist session after successful `getSession` calls.**

You need to add an explicit call to `persistSessionToStorage(data.session)` in three places within the `useEffect` hook that handles authentication (around lines 945-1100 in the original file).

#### **Location A: After successful `getSession` following OAuth completion (around line 1020)**

```typescript
// Original code snippet (inside checkSession function)
} else if (data.session) {
  console.log(`[Auth] Session found via getSession after OAuth completion (attempt ${attempt})`);
  updateSession(data.session);
  // ADD THIS LINE:
  persistSessionToStorage(data.session);
} else {
// ... rest of the code
```

#### **Location B: After successful `getSession` background verification (around line 1066)**

```typescript
// Original code snippet (inside getSession verification promise)
} else if (data.session) {
  // Update with fresh session if available
  updateSession(data.session);
  // ADD THIS LINE:
  persistSessionToStorage(data.session);
}
// ... rest of the code
```

#### **Location C: After successful final `getSession` check (around line 1092)**

```typescript
// Original code snippet (inside final getSession promise)
} else if (data.session) {
  updateSession(data.session);
  // ADD THIS LINE:
  persistSessionToStorage(data.session);
} else {
  updateSession(null);
}
// ... rest of the code
```

## Deployment

After applying these changes, commit them to your repository and trigger a new deployment on Vercel. Both the chat functionality and the OAuth login flow should be fully restored.

## Patch File

For convenience, here is the content of the patch file (`slashmcp.patch`) that applies all the necessary changes:

```patch
--- a/slashmcp/src/hooks/useChat.ts
+++ b/slashmcp/src/hooks/useChat.ts
@@ -1019,6 +1019,8 @@
               } else if (data.session) {
                 console.log(`[Auth] Session found via getSession after OAuth completion (attempt ${attempt})`);
                 updateSession(data.session);
+                // Ensure the session is persisted to custom storage key to prevent login loop
+                persistSessionToStorage(data.session);
               } else {
                 console.log(`[Auth] No session yet after OAuth completion (attempt ${attempt}/${maxAttempts})`);
                 // Retry if we haven't exceeded max attempts
@@ -1064,6 +1066,8 @@
             } else if (data.session) {
               // Update with fresh session if available
               updateSession(data.session);
+              // Ensure the session is persisted to custom storage key to prevent login loop
+              persistSessionToStorage(data.session);
             }
           })
           .catch((error) => {
@@ -1091,6 +1095,8 @@
             updateSession(null);
           } else if (data.session) {
             updateSession(data.session);
+            // Ensure the session is persisted to custom storage key to prevent login loop
+            persistSessionToStorage(data.session);
           } else {
             updateSession(null);
           }
@@ -2304,10 +2310,10 @@
 	      // Use session token if available, otherwise fall back to anon key
 	      if (session?.access_token) {
 	        headers.Authorization = \`Bearer \${session.access_token}\`;
-	      } else if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
-	        headers.Authorization = \`Bearer \${import.meta.env.VITE_SUPABASE_ANON_KEY}\`;
+	      } else if (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
+	        headers.Authorization = \`Bearer \${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}\`;
 	      }
 	      
 	      const payload: Record<string, unknown> = {
```
