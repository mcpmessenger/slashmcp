# Operation Turtle Bits: The Persistent OAuth Loop from Hell

## Executive Summary

**Status:** 🔴 CRITICAL - Production Breaking Bug  
**Affected:** All OAuth login attempts  
**Impact:** 100% authentication failure rate via OAuth  
**Root Cause:** Race condition between Supabase GoTrue's automatic session detection and our manual session handling, compounded by session application failures that trigger infinite redirect loops

---

## The Problem

Users attempting to authenticate via Google OAuth experience an infinite redirect loop:

1. User clicks "Sign in with Google"
2. Redirects to Google authentication
3. Google redirects back to app with `#access_token=...` in URL
4. App attempts to process the token
5. **Something fails silently or throws an error**
6. App redirects user back to login screen
7. User is still not authenticated
8. **Loop repeats infinitely**

### User Experience

- Users cannot log in at all via OAuth
- Every OAuth attempt results in a redirect loop
- Console shows errors but user sees nothing but loading screens
- Session appears in localStorage but app doesn't recognize it
- **OAuth authentication is completely broken in production**

---

## Current State of "Fixes" (All Failed)

### Attempt 1: Disable Auto-Detection
- **What we did:** Set `detectSessionInUrl: false` on both Supabase clients
- **Result:** ❌ Failed - GoTrue still processes the hash somehow

### Attempt 2: Early Hash Stripping
- **What we did:** Strip hash in `index.html` inline script before any JS loads
- **Result:** ❌ Failed - Still looping

### Attempt 3: Manual Session Application
- **What we did:** Manually parse hash and call `setSession()` ourselves
- **Result:** ❌ Failed - Session application fails or gets rejected

### Attempt 4: SessionStorage Flags
- **What we did:** Track OAuth callbacks with sessionStorage to prevent reprocessing
- **Result:** ❌ Failed - Complexity added, problem persists

### Attempt 5: V2 Doc Implementation
- **What we did:** Followed v2 documentation exactly for hash stripping
- **Result:** ❌ Failed - Still looping after multiple iterations

**Total Fix Attempts:** 5+  
**Success Rate:** 0%  
**Time Wasted:** Multiple hours across multiple sessions

---

## Root Cause Analysis

### The Core Issue: Multiple Failure Points

After extensive debugging, the OAuth loop is caused by **multiple cascading failures**:

#### 1. **Timing Race Condition**
- Supabase GoTrue client initializes in module scope (when files are imported)
- Our hash stripping code runs in `main.tsx`, but by then Supabase clients may already be initialized
- Even with `detectSessionInUrl: false`, GoTrue might have already seen the hash
- **The inline script in `index.html` should work, but something is still failing**

#### 2. **Session Application Failure**
When we manually apply the session via `supabaseClient.auth.setSession()`:
- Session might be rejected due to clock skew (despite clock sync)
- Session might be rejected due to token expiration
- Session might be rejected due to invalid token format
- **When `setSession()` fails, we clear the hash and return false, which triggers the login screen again**

#### 3. **State Machine Corruption**
- When GoTrue sees the hash and rejects it (even with our stripping), it enters an error state
- Our manual `setSession()` call might work, but GoTrue's internal state is corrupted
- `auth.getSession()` hangs or never resolves
- We timeout after 5 seconds, assume failure, show login screen
- **User sees login screen, clicks sign in again, loop continues**

#### 4. **Redirect Loop Mechanism**
- When session application fails, `updateSession(null)` is called
- This triggers UI to show login screen
- But localStorage still has session data (from previous attempts)
- Something might be clearing localStorage and triggering another redirect
- **Or the redirect URL configuration is wrong, causing infinite redirects between app and Google**

#### 5. **The Nuclear Option: Multiple Supabase Clients**
- We have TWO Supabase clients (`supabaseClient` and `supabase`)
- Both have `detectSessionInUrl: false`
- But if ONE of them processes the hash before we strip it, we're screwed
- **Module initialization order is non-deterministic**

---

## Why This Is So Hard

### OAuth Shouldn't Be This Hard

**Expected Behavior:**
1. User clicks "Sign in"
2. Redirects to provider
3. Provider redirects back with token
4. App stores token
5. User is logged in

**Actual Behavior:**
1. User clicks "Sign in"
2. Redirects to provider
3. Provider redirects back with token
4. **Fifteen different race conditions compete to process/fail the token**
5. **GoTrue, our code, localStorage, sessionStorage, and React state all fight each other**
6. **Everything fails in a different way each time**
7. User is not logged in

### The Real Problem: Too Many Moving Parts

- **Supabase GoTrue:** Tries to auto-detect sessions from URL
- **Our Manual Code:** Tries to manually process sessions
- **localStorage:** Stores session data
- **sessionStorage:** Tracks OAuth callbacks
- **React State:** Manages session state
- **Auth State Change Listeners:** React to auth events
- **Multiple Supabase Clients:** Two clients with potentially different states

**All of these must work in perfect harmony, but they don't.**

---

## Evidence of the Problem

### Console Errors (When They Appear)

```
@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew
Auth check timeout - attempting local session restore
Failed to set session from URL params: [various errors]
```

### What We've Observed

1. **Hash is stripped** - `window.oauthHash` contains the token
2. **Session application fails** - `setSession()` returns error or hangs
3. **Timeout occurs** - After 5 seconds, we give up
4. **Session is null** - `updateSession(null)` is called
5. **UI shows login** - User sees "Sign in with Google" again
6. **localStorage has data** - But app doesn't use it
7. **Loop repeats** - User clicks sign in, cycle continues

### LocalStorage Contents (During Loop)

```json
{
  "sb-akxdroedpsvmckvqvggr-auth-token": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": 1234567890
  }
}
```

**Session data exists, but app acts like user is logged out.**

---

## The Real Question

### Why Does `setSession()` Fail?

We don't know. Possible reasons:

1. **Clock Skew:** Token appears "issued in the future" (even after clock sync)
2. **Token Format:** Token format is invalid or malformed
3. **Expiration:** Token expired during the redirect (unlikely but possible)
4. **GoTrue State:** GoTrue is in error state and rejects all session attempts
5. **Network:** Request to Supabase fails silently
6. **Configuration:** Supabase project configuration is wrong
7. **Race Condition:** Multiple `setSession()` calls conflict with each other

### Why Does the Loop Happen?

When session application fails:
1. We clear the hash: `delete window.oauthHash`
2. We set session to null: `updateSession(null)`
3. UI shows login screen
4. **But something triggers another OAuth redirect**
   - Is it our code? (Unlikely - we don't auto-trigger)
   - Is it Supabase? (Possible - if it thinks auth failed)
   - Is it the redirect URL? (Possible - if URL is wrong)
   - Is it browser behavior? (Unlikely)

---

## Proposed Solutions (Ranked by Simplicity)

### Option 1: Nuclear Option - Remove OAuth Entirely ⭐ RECOMMENDED

**Action:** Replace OAuth with email/password or magic link authentication

**Pros:**
- No redirect loops (no redirects at all)
- Simpler code path
- More reliable
- Easier to debug
- Better user experience (no popups/redirects)

**Cons:**
- Users have to create accounts
- Lose "Sign in with Google" convenience

**Implementation:** Already have email/password in codebase, just make it primary

**Time to Fix:** 1 hour

---

### Option 2: Bypass Supabase Auth Entirely

**Action:** Use a different auth provider (Auth0, Clerk, etc.) or build custom JWT handling

**Pros:**
- Supabase GoTrue is clearly the problem
- Fresh start with simpler provider
- More control over auth flow

**Cons:**
- Migration effort
- Need to rebuild auth logic
- Lose Supabase auth features

**Time to Fix:** 4-8 hours

---

### Option 3: Fix the Root Cause (Last Resort)

**Action:** Systematically debug and fix each failure point

**Steps:**
1. Add extensive logging to track exactly where/when failures occur
2. Test with minimal reproduction (isolate GoTrue behavior)
3. Fix clock skew issue (if that's the problem)
4. Fix session application logic (if that's the problem)
5. Fix redirect loop mechanism (if that's the problem)
6. Test each fix independently

**Pros:**
- Keeps current architecture
- Fixes root cause

**Cons:**
- Time consuming (8+ hours)
- Might not work (we've tried 5 times already)
- Complex debugging

**Time to Fix:** 8-16 hours (maybe never)

---

### Option 4: Guest Mode Forever

**Action:** Remove authentication requirement entirely, make everything work in guest mode

**Pros:**
- No auth = no auth bugs
- Faster user onboarding
- Simpler codebase

**Cons:**
- No user accounts
- No persistent data
- Limited features

**Time to Fix:** 2 hours (already partially implemented)

---

## Recommendation: Option 1 - Remove OAuth

**Why:** We've spent too much time on this. OAuth is clearly broken and overcomplicated. Email/password auth is simpler, more reliable, and easier to debug. We can add OAuth back later when we have more time to do it right.

**Action Items:**
1. Make email/password the primary auth method
2. Remove or hide OAuth buttons
3. Test email/password flow thoroughly
4. Document the decision
5. Revisit OAuth later when we have bandwidth

**Estimated Time:** 1 hour  
**Risk:** Low  
**Success Probability:** High

---

## Conclusion

OAuth authentication via Supabase is fundamentally broken in this codebase. After 5+ fix attempts, multiple hours of debugging, and following documentation exactly, the problem persists. The architecture is too complex with too many moving parts that fight each other.

**The simplest solution is to stop using OAuth and use a simpler auth method.**

OAuth shouldn't be this hard. If it is, we're doing it wrong or the library is broken. Either way, we should use something simpler.

---

## Next Steps

1. **Decide:** Which solution do we want? (Recommend Option 1)
2. **Implement:** Make the change
3. **Test:** Verify it works
4. **Deploy:** Ship it
5. **Move On:** Stop wasting time on OAuth

**Status:** Ready for decision  
**Priority:** CRITICAL - Blocks all user authentication  
**Owner:** Needs assignment

---

*Operation Turtle Bits: Because OAuth authentication moves at the speed of a confused turtle trying to log in.*
