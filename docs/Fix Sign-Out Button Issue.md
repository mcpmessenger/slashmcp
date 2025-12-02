# Developer Instructions: Fix Sign-Out Button Issue

The sign-out button is currently failing to log users out because the `signOut` function in `src/hooks/useChat.ts` is either missing or incomplete. The application uses Supabase for authentication and implements a custom session persistence mechanism in local storage, which must also be cleared upon sign-out.

This document provides the necessary code changes to correctly implement the sign-out logic.

## Affected File

The primary file requiring modification is:

-   `src/hooks/useChat.ts`

## Proposed Fix

The `signOut` function needs to be defined within the `useChat` hook to perform three critical actions:

1.  Call the core Supabase sign-out method (`supabaseClient.auth.signOut()`).
2.  Clear the custom local storage session key (`CUSTOM_SUPABASE_SESSION_KEY`) by calling `persistSessionToStorage(null)`.
3.  Reset the local React state for the session and guest mode (`setSession(null)` and `setGuestMode(false)`).

### Code Changes for `src/hooks/useChat.ts`

Insert the following `signOut` function definition within the `useChat` function, ideally near the other authentication-related functions (e.g., after `enableGuestMode` and before the final `return` statement).

```typescript
// src/hooks/useChat.ts

// ... around line 530 (after enableGuestMode definition)

  const signOut = useCallback(async () => {
    // 1. Call Supabase sign-out
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error("Supabase sign-out failed:", error);
      toast({
        title: "Sign-out Failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // 2. Clear custom local storage session
    persistSessionToStorage(null);

    // 3. Reset local state
    setSession(null);
    setGuestMode(false);

    toast({
      title: "Signed out",
      description: "You have been successfully signed out.",
      variant: "default",
    });
  }, [toast, setSession, setGuestMode]);


  return {
    // ... other exported values
    enableGuestMode,
    signInWithGoogle,
    signInWithMicrosoft,
    signOut, // Ensure this is exported
    // ...
  };
}
```

### Verification

After applying the fix, verify the following:

1.  **Functional Sign-Out:** Clicking the sign-out button should successfully log the user out and redirect them to the sign-in page or show the guest mode interface.
2.  **Local Storage Cleared:** The custom session key in local storage (e.g., `slashmcp-session-***`) should be removed.
3.  **Supabase Session Cleared:** The user's session should be invalidated on the Supabase backend.

---
*Document Author: Manus AI*
*Date: December 2, 2025*
