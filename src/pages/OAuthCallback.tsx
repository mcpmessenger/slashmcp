import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseClient } from '../lib/supabaseClient';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('Processing OAuth callback...');
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple checks
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    // DON'T clear the hash yet - Supabase needs it with detectSessionInUrl: true
    // We'll clear it after the session is established
    const hasHash = typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('access_token');
    
    // If there's no hash, we shouldn't be here - redirect to home immediately
    if (!hasHash) {
      console.log('[OAuthCallback] No OAuth hash in URL - redirecting to home');
      window.location.href = '/';
      return;
    }
    
    console.log('[OAuthCallback] OAuth hash detected in URL, waiting for Supabase to process...');

    let isHandled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const handleSessionEstablished = async () => {
      if (isHandled) {
        console.log('[OAuthCallback] handleSessionEstablished called but already handled, skipping');
        return;
      }
      
      console.log('[OAuthCallback] ✅ Session establishment detected, verifying persistence...');
      setStatus('Verifying session...');

      // Wait longer to ensure session is fully persisted to localStorage
      // Supabase needs time to process the hash and persist the session
      let attempts = 0;
      const maxAttempts = 10;
      let sessionPersisted = false;

      while (attempts < maxAttempts && !sessionPersisted) {
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if session exists in Supabase (with timeout to prevent hanging)
        let checkSession: any = null;
        let error: any = null;
        try {
          const getSessionPromise = supabaseClient.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getSession timeout')), 5000)
          );
          const result = await Promise.race([getSessionPromise, timeoutPromise]) as any;
          checkSession = result.data?.session;
          error = result.error;
        } catch (timeoutError) {
          console.warn('[OAuthCallback] getSession timeout (attempt', attempts + 1, ')');
          error = timeoutError;
        }
        
        if (checkSession && checkSession.user) {
          // Also verify it's in localStorage (Supabase persists there)
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          if (supabaseUrl && typeof window !== 'undefined') {
            const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];
            const storageKey = `sb-${projectRef}-auth-token`;
            const storedSession = localStorage.getItem(storageKey);
            
            if (storedSession) {
              console.log('[OAuthCallback] Session verified in both Supabase and localStorage');
              sessionPersisted = true;
              break;
            } else {
              console.log(`[OAuthCallback] Session exists but not in localStorage yet (attempt ${attempts + 1}/${maxAttempts})`);
            }
          } else {
            // If we can't check localStorage, just trust Supabase
            sessionPersisted = true;
            break;
          }
        } else if (error) {
          console.error('[OAuthCallback] Error checking session:', error);
        }
        
        attempts++;
      }

      if (!sessionPersisted) {
        console.error('[OAuthCallback] ❌ Session not persisted after multiple attempts');
        console.error('[OAuthCallback] This might indicate:');
        console.error('  1. Supabase failed to process the OAuth hash');
        console.error('  2. localStorage is blocked or full');
        console.error('  3. Session expired before it could be saved');
        setStatus('Session verification failed. Redirecting...');
        // Still set the flag so main page can try to restore
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('oauth_just_completed', 'true');
          sessionStorage.setItem('oauth_completed_at', Date.now().toString());
        }
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
        return;
      }

      isHandled = true;
      console.log('[OAuthCallback] Session fully established and persisted');
      
      // Try to capture OAuth tokens now (before navigating away)
      // This ensures tokens are captured even if the useChat hook isn't mounted yet
      try {
        // Add timeout to prevent hanging
        const getSessionPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        );
        const result = await Promise.race([getSessionPromise, timeoutPromise]) as any;
        const finalSession = result.data?.session;
        if (finalSession?.access_token && typeof window !== 'undefined') {
          // Get provider tokens from localStorage
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          if (supabaseUrl) {
            const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];
            const sessionKey = `sb-${projectRef}-auth-token`;
            const sessionData = localStorage.getItem(sessionKey);
            const parsedSession = sessionData ? JSON.parse(sessionData) : null;
            
            if (parsedSession?.provider_token) {
              console.log('[OAuthCallback] Capturing OAuth tokens...');
              const response = await fetch(`${supabaseUrl}/functions/v1/capture-oauth-tokens`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${finalSession.access_token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  provider_token: parsedSession.provider_token,
                  provider_refresh_token: parsedSession.provider_refresh_token,
                  expires_at: parsedSession.expires_at,
                  provider: parsedSession.provider || "google",
                }),
              });
              
              if (response.ok) {
                const result = await response.json();
                console.log('[OAuthCallback] OAuth tokens captured:', result);
              } else {
                console.warn('[OAuthCallback] Token capture failed (will retry on main page)');
              }
            }
          }
        }
      } catch (error) {
        console.warn('[OAuthCallback] Error capturing tokens (will retry on main page):', error);
        // Don't block navigation - token capture will retry in useChat hook
      }
      
      // NOW clear the hash from URL since session is established
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        console.log('[OAuthCallback] URL hash cleared');
      }
      
      setStatus('Login successful! Redirecting...');
      
      // Set a flag to indicate OAuth just completed (prevents premature login prompt)
      // Use a longer timeout to ensure session is fully established before flag clears
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('oauth_just_completed', 'true');
        // Also set a timestamp to track when OAuth completed
        sessionStorage.setItem('oauth_completed_at', Date.now().toString());
        // Clear flag after 30 seconds (increased significantly to prevent race conditions)
        // This gives plenty of time for the main app to load and restore the session
        setTimeout(() => {
          sessionStorage.removeItem('oauth_just_completed');
          sessionStorage.removeItem('oauth_completed_at');
        }, 30000); // 30 seconds - plenty of time for session restoration
      }
      
      // Wait longer before redirecting to ensure session is fully persisted
      // This prevents race conditions where the main page loads before session is ready
      // We wait 2 seconds total to give Supabase plenty of time to persist to localStorage
      setTimeout(() => {
        // Double-check session is still valid before redirecting (with timeout)
        const getSessionPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        );
        Promise.race([getSessionPromise, timeoutPromise]).then((result: any) => {
          const finalCheck = result.data?.session;
          if (finalCheck && finalCheck.user) {
            // Also verify it's actually in localStorage
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            if (supabaseUrl && typeof window !== 'undefined') {
              const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];
              const storageKey = `sb-${projectRef}-auth-token`;
              const storedSession = localStorage.getItem(storageKey);
              
              if (storedSession) {
                console.log('[OAuthCallback] ✅ Final session check passed (both Supabase and localStorage), redirecting...');
                // Clear any stale flags that might cause issues
                if (typeof window !== 'undefined') {
                  // Ensure oauth_just_completed flag is set
                  sessionStorage.setItem('oauth_just_completed', 'true');
                  sessionStorage.setItem('oauth_completed_at', Date.now().toString());
                }
                // Add a small delay before redirect to ensure everything is fully written
                setTimeout(() => {
                  console.log('[OAuthCallback] 🔄 Redirecting to home page...');
                  window.location.href = '/';
                }, 500);
              } else {
                console.warn('[OAuthCallback] Session exists in Supabase but not in localStorage yet, waiting...');
                // Wait a bit more and check again
                setTimeout(() => {
                  const retryStored = localStorage.getItem(storageKey);
                  if (retryStored) {
                    console.log('[OAuthCallback] Session now in localStorage, redirecting...');
                    window.location.href = '/';
                  } else {
                    console.error('[OAuthCallback] Session still not in localStorage after retry');
                    setStatus('Session verification failed. Please try signing in again.');
                  }
                }, 1000);
              }
            } else {
              // Can't check localStorage, just trust Supabase
              console.log('[OAuthCallback] Final session check passed (Supabase only), redirecting...');
              setTimeout(() => {
                window.location.href = '/';
              }, 300);
            }
          } else {
            console.error('[OAuthCallback] Session lost before redirect, staying on callback page');
            setStatus('Session verification failed. Please try signing in again.');
          }
        }).catch((error) => {
          console.error('[OAuthCallback] Error in final session check:', error);
          setStatus('Error verifying session. Please try signing in again.');
        });
      }, 2000); // Increased to 2 seconds to give more time for session persistence
    };

    // Listen for auth state changes
    const { data: authData } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[OAuthCallback] 🔔 Auth state change:', event, session ? 'has session' : 'no session');
      
      if (isHandled) {
        console.log('[OAuthCallback] Already handled, ignoring auth state change');
        return;
      }
      
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        console.log('[OAuthCallback] ✅ SIGNED_IN or TOKEN_REFRESHED event detected');
        setStatus('Session established, verifying...');
        await handleSessionEstablished();
      } else if (event === 'SIGNED_OUT') {
        if (isHandled) return;
        isHandled = true;
        console.log('[OAuthCallback] ❌ Signed out event - this shouldn\'t happen during OAuth');
        setStatus('Signed out. Redirecting...');
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      } else {
        console.log('[OAuthCallback] ⚠️ Other auth event:', event, session ? 'has session' : 'no session');
      }
    });
    
    subscription = authData?.subscription || null;

    // Also manually check for session after a short delay (in case onAuthStateChange doesn't fire)
    // This helps with cases where Supabase processes the hash but the event doesn't trigger
    const manualCheckTimeout = setTimeout(async () => {
      if (!isHandled) {
        console.log('[OAuthCallback] 🔍 Manual session check (5s delay)...');
        setStatus('Checking session...');
        try {
          const getSessionPromise = supabaseClient.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getSession timeout')), 5000)
          );
          const result = await Promise.race([getSessionPromise, timeoutPromise]) as any;
          const manualSession = result.data?.session;
          if (manualSession && manualSession.user && !isHandled) {
            console.log('[OAuthCallback] ✅ Manual check found session, handling...');
            setStatus('Session found, verifying...');
            await handleSessionEstablished();
          } else if (result.error) {
            console.warn('[OAuthCallback] ⚠️ Manual check error:', result.error);
          } else {
            console.log('[OAuthCallback] ⚠️ Manual check: No session found yet');
          }
        } catch (error) {
          console.warn('[OAuthCallback] ⚠️ Manual check exception:', error);
        }
      }
    }, 5000); // Check after 5 seconds

    // Try immediate session check AND manual hash processing
    // Supabase might not be processing the hash automatically, so we'll do it manually
    const immediateCheck = async () => {
      try {
        console.log('[OAuthCallback] 🔍 Immediate session check...');
        const { data: { session: immediateSession }, error } = await supabaseClient.auth.getSession();
        if (immediateSession && immediateSession.user && !isHandled) {
          console.log('[OAuthCallback] ✅ Session found immediately, handling...');
          setStatus('Session found, verifying...');
          await handleSessionEstablished();
          return true;
        } else if (error) {
          console.log('[OAuthCallback] Immediate check: No session yet, trying manual hash processing...');
          
          // Try to manually process the hash if Supabase didn't
          const hash = window.location.hash;
          if (hash && hash.includes('access_token')) {
            console.log('[OAuthCallback] 🔧 Hash present but no session - attempting manual processing...');
            const hashParams = new URLSearchParams(hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            
            if (accessToken) {
              try {
                console.log('[OAuthCallback] Manually setting session from hash...');
                const { data: setSessionData, error: setError } = await supabaseClient.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken || '',
                });
                
                if (setSessionData.session && !setError) {
                  console.log('[OAuthCallback] ✅ Manual session set successful!');
                  // Wait for session to persist
                  await new Promise(resolve => setTimeout(resolve, 500));
                  await handleSessionEstablished();
                  return true;
                } else {
                  console.warn('[OAuthCallback] Manual setSession failed:', setError);
                }
              } catch (setError) {
                console.warn('[OAuthCallback] Manual setSession exception:', setError);
              }
            }
          }
        }
      } catch (error) {
        console.log('[OAuthCallback] Immediate check exception:', error);
      }
      return false;
    };
    
    // Run immediate check
    immediateCheck().then((found) => {
      if (!found) {
        console.log('[OAuthCallback] Waiting for Supabase to process OAuth hash or auth state change...');
        setStatus('Waiting for OAuth response...');
      }
    });

    // Fallback timeout - if nothing happens in 20 seconds, check session and navigate
    const fallbackTimeout = setTimeout(async () => {
      if (!isHandled) {
        console.warn('[OAuthCallback] ⚠️ Timeout waiting for auth state change (20s), checking session...');
        setStatus('Checking session...');
        const getSessionPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        );
        try {
          const result: any = await Promise.race([getSessionPromise, timeoutPromise]);
          const session = result.data?.session;
          if (session && session.user) {
            console.log('[OAuthCallback] ✅ Session found on timeout, handling...');
            await handleSessionEstablished();
          } else {
            console.warn('[OAuthCallback] ❌ No session found on timeout');
            console.warn('[OAuthCallback] Attempting to manually process hash...');
            
            // Try to manually extract and set session from hash as last resort
            // This is a fallback if Supabase's detectSessionInUrl didn't work
            try {
              const hash = window.location.hash;
              if (hash && hash.includes('access_token')) {
                console.log('[OAuthCallback] 🔧 Hash still present, trying manual session extraction...');
                // Parse hash parameters
                const hashParams = new URLSearchParams(hash.substring(1));
                const accessToken = hashParams.get('access_token');
                const refreshToken = hashParams.get('refresh_token');
                const expiresIn = hashParams.get('expires_in');
                const tokenType = hashParams.get('token_type') || 'bearer';
                const providerToken = hashParams.get('provider_token');
                const providerRefreshToken = hashParams.get('provider_refresh_token');
                
                if (accessToken) {
                  console.log('[OAuthCallback] Found access_token in hash, attempting manual session set...');
                  try {
                    // Use setSession to manually establish the session
                    const { data: setSessionData, error: setError } = await supabaseClient.auth.setSession({
                      access_token: accessToken,
                      refresh_token: refreshToken || '',
                    });
                    
                    if (setSessionData.session && !setError) {
                      console.log('[OAuthCallback] ✅ Manually set session successful!');
                      // Wait a moment for session to persist to localStorage
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      // Verify it's persisted
                      const { data: { session: verifySession } } = await supabaseClient.auth.getSession();
                      if (verifySession && verifySession.user) {
                        console.log('[OAuthCallback] ✅ Verified session after manual set');
                        await handleSessionEstablished();
                        return;
                      } else {
                        console.warn('[OAuthCallback] Session not found after manual set');
                      }
                    } else {
                      console.warn('[OAuthCallback] ❌ Manual setSession failed:', setError);
                      console.warn('[OAuthCallback] Error details:', JSON.stringify(setError, null, 2));
                    }
                  } catch (setSessionError) {
                    console.warn('[OAuthCallback] ❌ Manual setSession exception:', setSessionError);
                  }
                } else {
                  console.warn('[OAuthCallback] No access_token found in hash');
                }
              } else {
                console.warn('[OAuthCallback] Hash no longer contains access_token (might have been cleared)');
              }
            } catch (manualError) {
              console.warn('[OAuthCallback] ❌ Manual session processing failed:', manualError);
            }
            
            console.warn('[OAuthCallback] This might indicate:');
            console.warn('  1. OAuth hash was invalid or expired');
            console.warn('  2. Supabase failed to process the session');
            console.warn('  3. Network/CORS issue preventing session establishment');
            isHandled = true;
            setStatus('No session found. Redirecting...');
            // Don't set oauth_just_completed flag if session wasn't found
            // This prevents the main page from thinking OAuth succeeded
            setTimeout(() => {
              window.location.href = '/';
            }, 1000);
          }
        } catch (error: any) {
          console.error('[OAuthCallback] ❌ Error checking session on timeout:', error);
          isHandled = true;
          if (error?.message?.includes('timeout')) {
            console.warn('[OAuthCallback] getSession timed out - session might still be processing');
            setStatus('Session check timed out. Redirecting anyway...');
            // Set flag so main page can try to restore session
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('oauth_just_completed', 'true');
              sessionStorage.setItem('oauth_completed_at', Date.now().toString());
            }
          } else {
            setStatus('Error verifying session. Redirecting...');
          }
          setTimeout(() => {
            window.location.href = '/';
          }, 1000);
        }
      }
    }, 20000); // Increased to 20 seconds to give more time for slow networks

    return () => {
      clearTimeout(fallbackTimeout);
      clearTimeout(manualCheckTimeout);
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [navigate]);

  // Show a loading screen while the session is being processed
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <div className="text-center space-y-4 max-w-md mx-auto px-4">
        <h2 className="text-2xl font-semibold text-foreground">Processing Login...</h2>
        <p className="text-muted-foreground">{status}</p>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          If this takes too long, you may need to sign in again.
        </p>
      </div>
    </div>
  );
}

