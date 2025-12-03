/**
 * MINIMAL TEST: Query processing_jobs directly without any React complexity
 * This will help us determine if the issue is:
 * 1. Supabase client configuration
 * 2. React component lifecycle
 * 3. RLS policies
 * 4. Something else
 */

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

export const DocumentsSidebarMinimalTest: React.FC<{ userId: string }> = ({ userId }) => {
  const [result, setResult] = useState<{ data: any[] | null; error: any; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    console.log("[MinimalTest] ===== STARTING MINIMAL TEST =====");
    console.log("[MinimalTest] userId:", userId);
    console.log("[MinimalTest] supabaseClient:", !!supabaseClient);
    console.log("[MinimalTest] supabaseClient.from:", typeof supabaseClient?.from);

    const testQuery = async () => {
      try {
        // CRITICAL: Try calling getSession() first like ragService.ts does
        console.log("[MinimalTest] Step 0: Calling getSession() first (like ragService.ts)...");
        try {
          const sessionResult = await supabaseClient.auth.getSession();
          console.log("[MinimalTest] Step 0: getSession() result:", {
            hasSession: !!sessionResult.data?.session,
            userId: sessionResult.data?.session?.user?.id,
            matches: sessionResult.data?.session?.user?.id === userId,
          });
        } catch (sessionErr) {
          console.warn("[MinimalTest] Step 0: getSession() failed (non-fatal):", sessionErr);
        }
        
        console.log("[MinimalTest] Step 1: Building query...");
        const query = supabaseClient
          .from("processing_jobs")
          .select("id, file_name, status")
          .eq("user_id", userId)
          .limit(10);

        console.log("[MinimalTest] Step 2: Query built, type:", typeof query);
        console.log("[MinimalTest] Step 2: Has then:", typeof (query as any)?.then === 'function');

        console.log("[MinimalTest] Step 3: Creating timeout (5 seconds)...");
        const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) => {
          setTimeout(() => {
            console.error("[MinimalTest] ⚠️ TIMEOUT - Query never resolved");
            resolve({ data: null, error: { message: "Query timeout after 5 seconds" } });
          }, 5_000);
        });

        console.log("[MinimalTest] Step 4: Racing query and timeout...");
        const raceResult = await Promise.race([query, timeout]);

        console.log("[MinimalTest] Step 5: Promise.race completed");
        
        if (raceResult && 'data' in raceResult && raceResult.data === null && raceResult.error?.message === "Query timeout after 5 seconds") {
          console.error("[MinimalTest] ❌ TIMEOUT WON - Query never executed");
          setResult({ data: null, error: { message: "Query timeout" }, loading: false });
        } else {
          console.log("[MinimalTest] ✅ QUERY COMPLETED");
          const queryResult = raceResult as any;
          console.log("[MinimalTest] Result:", {
            hasData: !!queryResult.data,
            dataLength: queryResult.data?.length || 0,
            hasError: !!queryResult.error,
          });
          setResult({
            data: queryResult.data || null,
            error: queryResult.error || null,
            loading: false,
          });
        }
      } catch (err) {
        console.error("[MinimalTest] ❌ EXCEPTION:", err);
        setResult({
          data: null,
          error: { message: err instanceof Error ? err.message : String(err) },
          loading: false,
        });
      }
    };

    testQuery();
  }, [userId]);

  return (
    <div style={{ padding: "20px", border: "2px solid red", margin: "20px" }}>
      <h3>Minimal Test Component</h3>
      <p>userId: {userId}</p>
      <p>Loading: {result.loading ? "Yes" : "No"}</p>
      <p>Error: {result.error ? JSON.stringify(result.error) : "None"}</p>
      <p>Data: {result.data ? `${result.data.length} documents` : "None"}</p>
      {result.data && result.data.length > 0 && (
        <ul>
          {result.data.map((doc: any) => (
            <li key={doc.id}>{doc.file_name} - {doc.status}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

