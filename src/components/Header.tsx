import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";

export const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/slashmcp-logo.svg" alt="MCP Messenger logo" className="h-9 w-auto" />
          <div className="flex flex-col leading-tight">
            <span className="text-xl font-semibold tracking-tight">MCP Messenger</span>
            <span className="text-[0.65rem] uppercase tracking-[0.35em] text-muted-foreground font-medium">
              Scrape anything with MCP Messenger
            </span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Features
          </a>
          <a href="#integrations" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Integrations
          </a>
          <a href="#architecture" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Architecture
          </a>
          <a href="#docs" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Docs
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Button className="bg-gradient-primary hover:shadow-glow-primary transition-all duration-300">
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
};
