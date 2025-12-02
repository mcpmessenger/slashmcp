import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// FIX: Strip OAuth hash IMMEDIATELY to prevent GoTrue from seeing it
// This must run synchronously before React renders and any Supabase code executes
const OAUTH_HASH_STORAGE_KEY = "slashmcp.oauth.hash";
if (typeof window !== "undefined") {
  const hash = window.location.hash;
  if (hash && hash.includes("access_token")) {
    try {
      window.sessionStorage.setItem(OAUTH_HASH_STORAGE_KEY, hash);
    } catch (error) {
      console.warn("Unable to persist OAuth hash to sessionStorage", error);
    }
    // Strip hash immediately - this prevents GoTrue from auto-parsing it
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

// Add error boundary for better debugging
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

createRoot(rootElement).render(<App />);
