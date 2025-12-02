import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = `Supabase configuration missing! 
    VITE_SUPABASE_URL: ${supabaseUrl ? 'set' : 'MISSING'}
    VITE_SUPABASE_PUBLISHABLE_KEY: ${supabaseAnonKey ? 'set' : 'MISSING'}
    
    This is a configuration error. Please check:
    1. GitHub Secrets are set (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
    2. Vercel environment variables are configured
    3. The deployment completed successfully`;
  console.error("[Supabase Client]", errorMsg);
  throw new Error("Supabase configuration is missing. Check environment variables.");
}

export const supabaseClient = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // Let Supabase SDK handle OAuth natively
  },
});

// Expose to window for debugging (browser console access)
if (typeof window !== "undefined") {
  (window as any).supabase = supabaseClient;
  // Expose environment variables for debugging
  (window as any).env = {
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: supabaseAnonKey ? `${supabaseAnonKey.slice(0, 20)}...` : undefined,
  };
  console.log("[Debug] Environment variables exposed to window.env");
  console.log("[Debug] VITE_SUPABASE_URL:", supabaseUrl);
}