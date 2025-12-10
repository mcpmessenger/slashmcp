import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { Registry } from "./pages/Registry";
import { WorkflowBuilder } from "./pages/WorkflowBuilder";
import { Workflows } from "./pages/Workflows";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import OAuthCallback from "./pages/OAuthCallback";
import { ChatProvider } from "./context/ChatContext";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <FeedbackWidget />
        <BrowserRouter>
          <ChatProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth/callback" element={<OAuthCallback />} />
              <Route path="/registry" element={<Registry />} />
              <Route path="/workflows" element={<Workflows />} />
              <Route path="/workflows/new" element={<WorkflowBuilder />} />
              <Route path="/workflows/:id" element={<WorkflowBuilder />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ChatProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
