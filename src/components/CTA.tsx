import { Button } from "@/components/ui/button";
import { ArrowRight, Github } from "lucide-react";

export const CTA = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-hero opacity-50" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.1)_0%,transparent_70%)]" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold">
            Ready to Transform
            <span className="block bg-gradient-primary bg-clip-text text-transparent mt-2">
              Your Research Workflow?
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground">
            Join the next generation of AI-powered research assistants. Start building with MCP Messenger today.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" className="group bg-gradient-primary hover:shadow-glow-primary transition-all duration-300">
              Get Started Now
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button size="lg" variant="outline" className="border-primary/20 hover:bg-primary/5">
              <Github className="mr-2 h-5 w-5" />
              View on GitHub
            </Button>
          </div>

          <div className="pt-8 flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Open Source</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span>100% Local First</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <span>MCP Compatible</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
