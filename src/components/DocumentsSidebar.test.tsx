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
    
    const testQuery = async () => {
      try {
        console.log("[DocumentsSidebarTest] Step 1: Getting session...");
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        
        if (sessionError) {
          throw new Error(`Session error: ${sessionError.message}`);
        }
        
        if (!session) {
          setError("No session found");
          setIsLoading(false);
          setDebugInfo({ step: "no_session" });
          return;
        }

        console.log("[DocumentsSidebarTest] Step 2: Session found:", {
          userId: session.user.id,
          hasAccessToken: !!session.access_token,
        });
        setDebugInfo({ step: "session_found", userId: session.user.id });

        console.log("[DocumentsSidebarTest] Step 3: Querying database...");
        const { data, error: queryError } = await supabaseClient
          .from("processing_jobs")
          .select("*")
          .eq("user_id", session.user.id)
          .limit(10);

        console.log("[DocumentsSidebarTest] Step 4: Query result:", {
          dataLength: data?.length || 0,
          error: queryError,
          firstItem: data?.[0],
        });

        if (queryError) {
          throw new Error(`Query error: ${queryError.message}`);
        }

        setDocuments(data || []);
        setDebugInfo({
          step: "query_complete",
          userId: session.user.id,
          documentCount: data?.length || 0,
          analysisTargets: data ? [...new Set(data.map(d => d.analysis_target))] : [],
        });
        setIsLoading(false);
      } catch (err) {
        console.error("[DocumentsSidebarTest] ERROR:", err);
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
        setDebugInfo({ step: "error", error: err instanceof Error ? err.message : String(err) });
      }
    };

    testQuery();
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

