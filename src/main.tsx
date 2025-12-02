import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// FIX: Capture the OAuth hash early and strip it from the URL to prevent
// Supabase GoTrue's automatic session detection from running and failing.
if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
  // Store the hash globally so the application's session logic can access it.
  (window as any).oauthHash = window.location.hash;
  // Strip the hash from the URL immediately to prevent GoTrue from seeing it.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
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
