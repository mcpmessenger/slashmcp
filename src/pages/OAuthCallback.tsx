import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseClient } from '../lib/supabaseClient';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('Processing OAuth callback...');

  useEffect(() => {
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
      if (isHandled) return;
      
      console.log('[OAuthCallback] Session establishment detected, verifying persistence...');
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
        console.error('[OAuthCallback] Session not persisted after multiple attempts');
        setStatus('Session verification failed. Redirecting...');
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
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
                console.log('[OAuthCallback] Final session check passed (both Supabase and localStorage), redirecting...');
                // Add a small delay before redirect to ensure everything is fully written
                setTimeout(() => {
                  window.location.href = '/';
                }, 300);
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
      console.log('[OAuthCallback] Auth state change:', event, session ? 'has session' : 'no session');
      
      if (isHandled) return;
      
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        setStatus('Session established, verifying...');
        await handleSessionEstablished();
      } else if (event === 'SIGNED_OUT') {
        if (isHandled) return;
        isHandled = true;
        console.log('[OAuthCallback] Signed out event');
        setStatus('Signed out. Redirecting...');
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      }
    });
    
    subscription = authData?.subscription || null;

    // Don't check for existing session immediately - wait for onAuthStateChange to fire
    // This prevents race conditions where we check before Supabase has processed the hash
    console.log('[OAuthCallback] Waiting for Supabase to process OAuth hash...');
    setStatus('Waiting for OAuth response...');

    // Fallback timeout - if nothing happens in 15 seconds, check session and navigate
    const fallbackTimeout = setTimeout(() => {
      if (!isHandled) {
        console.warn('[OAuthCallback] Timeout waiting for auth state change, checking session...');
        const getSessionPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        );
        Promise.race([getSessionPromise, timeoutPromise]).then((result: any) => {
          const session = result.data?.session;
          if (session && session.user) {
            console.log('[OAuthCallback] Session found on timeout, handling...');
            handleSessionEstablished();
          } else {
            console.warn('[OAuthCallback] No session found on timeout, redirecting...');
            isHandled = true;
            setStatus('Timeout. Redirecting...');
            window.location.href = '/';
          }
        }).catch((error) => {
          console.error('[OAuthCallback] Error checking session on timeout:', error);
          isHandled = true;
          if (error?.message?.includes('timeout')) {
            console.warn('[OAuthCallback] getSession timed out, redirecting anyway');
            setStatus('Session check timed out. Redirecting...');
          } else {
            setStatus('Timeout. Redirecting...');
          }
          // Set flag so main page knows OAuth was attempted
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('oauth_just_completed', 'true');
            sessionStorage.setItem('oauth_completed_at', Date.now().toString());
          }
          window.location.href = '/';
        });
      }
    }, 15000); // Increased to 15 seconds to give more time

    return () => {
      clearTimeout(fallbackTimeout);
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

