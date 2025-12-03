/**
 * MINIMAL TEST VERSION - DocumentsSidebar
 * 
 * This is a simplified version to isolate the loading issue.
 * If this works, we know the problem is in the complex logic.
 * If this doesn't work, we know it's a fundamental issue (session, RLS, etc.)
 */

import React, { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const DocumentsSidebarTest: React.FC<{ userId?: string }> = ({ userId: propUserId }) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});

  // Get session from localStorage (same comprehensive pattern as DocumentsSidebar)
  const getSessionFromStorage = (): { access_token?: string; refresh_token?: string; user?: { id: string } } | null => {
    if (typeof window === "undefined") {
      console.log("[DocumentsSidebarTest] Window undefined (SSR)");
      return null;
    }
    
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      if (!SUPABASE_URL) {
        console.warn("[DocumentsSidebarTest] No SUPABASE_URL in env");
        return null;
      }
      
      const projectRef = SUPABASE_URL.replace("https://", "").split(".supabase.co")[0]?.split(".")[0];
      if (!projectRef) {
        console.warn("[DocumentsSidebarTest] Could not extract project ref from URL:", SUPABASE_URL);
        return null;
      }
      
      console.log("[DocumentsSidebarTest] Project ref:", projectRef);
      console.log("[DocumentsSidebarTest] Checking localStorage keys...");
      
      // Try multiple possible storage keys (Supabase might use different formats)
      const possibleKeys = [
        `sb-${projectRef}-auth-token`,
        `sb-${projectRef}-auth-token-code-verifier`,
        `supabase.auth.token`,
      ];
      
      for (const storageKey of possibleKeys) {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          console.log("[DocumentsSidebarTest] Found key:", storageKey);
          try {
            const parsed = JSON.parse(raw);
            // Try different possible structures
            const session = parsed?.currentSession ?? parsed?.session ?? (parsed?.access_token ? parsed : null);
            
            if (session?.access_token && session?.user?.id) {
              console.log("[DocumentsSidebarTest] ✅ Valid session found in:", storageKey);
              return session;
            }
          } catch (parseError) {
            console.warn("[DocumentsSidebarTest] Failed to parse key:", storageKey, parseError);
          }
        }
      }
      
      // Also check all localStorage keys for Supabase/auth related
      console.log("[DocumentsSidebarTest] Checking all localStorage keys...");
      const allKeys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) allKeys.push(key);
      }
      console.log("[DocumentsSidebarTest] All localStorage keys:", allKeys.filter(k => 
        k.includes('supabase') || k.includes('auth') || k.includes(projectRef)
      ));
      
      for (const key of allKeys) {
        if (key && (key.includes('supabase') || key.includes('auth') || key.includes(projectRef))) {
          try {
            const raw = window.localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              const potentialSession = parsed?.currentSession ?? parsed?.session ?? parsed;
              if (potentialSession?.access_token && potentialSession?.user?.id) {
                console.log("[DocumentsSidebarTest] ✅ Found valid session in:", key);
                return potentialSession;
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
      
      console.warn("[DocumentsSidebarTest] No valid session found in localStorage");
      return null;
    } catch (error) {
      console.error("[DocumentsSidebarTest] Error reading localStorage:", error);
      return null;
    }
  };

  useEffect(() => {
    console.log("[DocumentsSidebarTest] ===== MOUNTED =====");
    console.log("[DocumentsSidebarTest] Props:", { propUserId });
    console.log("[DocumentsSidebarTest] useEffect running...");
    setDebugInfo({ step: "mounted", timestamp: new Date().toISOString(), propUserId });
    
    const testQuery = async () => {
      try {
        let userId: string | undefined = propUserId;
        let session: { access_token?: string; refresh_token?: string; user?: { id: string } } | null = null;
        
        // If userId prop provided, use it directly (from useChat hook)
        if (propUserId) {
          console.log("[DocumentsSidebarTest] Using userId from props:", propUserId);
          setDebugInfo(prev => ({ ...prev, step: "using_prop_userid", userId: propUserId }));
          
          // Still need to get session token for RLS
          session = getSessionFromStorage();
          if (!session || !session.access_token) {
            console.warn("[DocumentsSidebarTest] Have userId but no session token - query may fail RLS");
          }
        } else {
          // Try localStorage session
          console.log("[DocumentsSidebarTest] Step 1: Getting session from localStorage...");
          setDebugInfo(prev => ({ ...prev, step: "getting_session" }));
          
          session = getSessionFromStorage();
          
          console.log("[DocumentsSidebarTest] Session from localStorage:", {
            hasSession: !!session,
            hasAccessToken: !!session?.access_token,
            hasUser: !!session?.user,
            userId: session?.user?.id,
          });
          
          if (!session || !session.access_token || !session.user?.id) {
            console.warn("[DocumentsSidebarTest] No session found in localStorage");
            setError("No session found - user may not be logged in. Please sign in.");
            setIsLoading(false);
            setDebugInfo({ 
              step: "no_session", 
              message: "User not authenticated",
              suggestion: "Try logging in again or check if you're signed in"
            });
            return;
          }
          
          userId = session.user.id;
          console.log("[DocumentsSidebarTest] ✅ Session found, userId:", userId);
          setDebugInfo(prev => ({ ...prev, step: "session_found_in_storage", userId }));
        }
        
        if (!userId) {
          throw new Error("No userId available");
        }
        
        // Set session on supabaseClient for RLS (if we have session token)
        if (session?.access_token) {
          console.log("[DocumentsSidebarTest] Step 1.5: Setting session on supabaseClient...");
          try {
            const { error: setSessionError } = await supabaseClient.auth.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token || "",
            });
            
            if (setSessionError) {
              console.warn("[DocumentsSidebarTest] Failed to set session (non-fatal):", setSessionError);
              // Don't throw - continue with query anyway
            } else {
              console.log("[DocumentsSidebarTest] ✅ Session set on supabaseClient");
            }
          } catch (setErr) {
            console.warn("[DocumentsSidebarTest] Exception setting session (non-fatal):", setErr);
            // Continue anyway
          }
        }

        console.log("[DocumentsSidebarTest] Step 2: Session found:", {
          userId: session.user.id,
          hasAccessToken: !!session.access_token,
        });
        setDebugInfo(prev => ({ 
          ...prev, 
          step: "session_found", 
          userId: session.user.id,
          hasAccessToken: !!session.access_token,
        }));

        console.log("[DocumentsSidebarTest] Step 3: Querying database for userId:", userId);
        setDebugInfo(prev => ({ ...prev, step: "querying", queryUserId: userId }));
        
        const queryPromise = supabaseClient
          .from("processing_jobs")
          .select("*")
          .eq("user_id", userId)
          .limit(10);
        
        const queryTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Query timeout after 10s")), 10000)
        );
        
        const queryResult = await Promise.race([queryPromise, queryTimeoutPromise]) as any;
        const { data, error: queryError } = queryResult;

        console.log("[DocumentsSidebarTest] Step 4: Query result:", {
          dataLength: data?.length || 0,
          hasError: !!queryError,
          error: queryError,
          firstItem: data?.[0],
        });

        if (queryError) {
          throw new Error(`Query error: ${queryError.message} (code: ${queryError.code})`);
        }

        console.log("[DocumentsSidebarTest] Step 5: Setting documents...");
        setDocuments(data || []);
        setDebugInfo({
          step: "query_complete",
          userId: userId,
          documentCount: data?.length || 0,
          analysisTargets: data ? [...new Set(data.map(d => d.analysis_target))] : [],
          sampleDocument: data?.[0] ? {
            id: data[0].id,
            fileName: data[0].file_name,
            status: data[0].status,
            analysisTarget: data[0].analysis_target,
          } : null,
        });
        setIsLoading(false);
        console.log("[DocumentsSidebarTest] ===== COMPLETE =====");
      } catch (err) {
        console.error("[DocumentsSidebarTest] ERROR:", err);
        console.error("[DocumentsSidebarTest] Error stack:", err instanceof Error ? err.stack : "No stack");
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setIsLoading(false);
        setDebugInfo({ 
          step: "error", 
          error: errorMessage,
          errorType: err instanceof Error ? err.constructor.name : typeof err,
        });
      }
    };

    // Wrap in try-catch to catch any sync errors
    try {
      testQuery();
    } catch (syncErr) {
      console.error("[DocumentsSidebarTest] SYNC ERROR:", syncErr);
      setError(syncErr instanceof Error ? syncErr.message : String(syncErr));
      setIsLoading(false);
      setDebugInfo({ step: "sync_error", error: String(syncErr) });
    }
  }, []);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Documents & Knowledge (TEST)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Loading documents...</p>
          </div>
        )}
        
        {error && (
          <div className="text-red-500 text-sm p-4">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {!isLoading && !error && (
          <div>
            <p className="text-sm mb-2">Found {documents.length} documents</p>
            {documents.map((doc) => (
              <div key={doc.id} className="p-2 border rounded mb-2">
                <p className="font-medium">{doc.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  Status: {doc.status} | Analysis: {doc.analysis_target}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
          <p className="font-semibold">Debug Info:</p>
          <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
        </div>
      </CardContent>
    </Card>
  );
};

