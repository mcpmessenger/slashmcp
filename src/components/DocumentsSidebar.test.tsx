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

export const DocumentsSidebarTest: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    console.log("[DocumentsSidebarTest] ===== MOUNTED =====");
    console.log("[DocumentsSidebarTest] useEffect running...");
    setDebugInfo({ step: "mounted", timestamp: new Date().toISOString() });
    
    const testQuery = async () => {
      try {
        console.log("[DocumentsSidebarTest] Step 1: Getting session...");
        setDebugInfo(prev => ({ ...prev, step: "getting_session" }));
        
        const sessionPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("getSession timeout after 5s")), 5000)
        );
        
        const sessionResult = await Promise.race([sessionPromise, timeoutPromise]) as any;
        const { data: { session }, error: sessionError } = sessionResult;
        
        console.log("[DocumentsSidebarTest] Session result:", {
          hasSession: !!session,
          hasError: !!sessionError,
          error: sessionError,
        });
        
        if (sessionError) {
          throw new Error(`Session error: ${sessionError.message}`);
        }
        
        if (!session) {
          console.warn("[DocumentsSidebarTest] No session found");
          setError("No session found - user may not be logged in");
          setIsLoading(false);
          setDebugInfo({ step: "no_session", message: "User not authenticated" });
          return;
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

        console.log("[DocumentsSidebarTest] Step 3: Querying database...");
        setDebugInfo(prev => ({ ...prev, step: "querying" }));
        
        const queryPromise = supabaseClient
          .from("processing_jobs")
          .select("*")
          .eq("user_id", session.user.id)
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
          userId: session.user.id,
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

