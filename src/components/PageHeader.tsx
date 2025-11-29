import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  return (
    <div className={cn("bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60", className)}>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo and Title */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <img src="/Untitled design.svg" alt="MCP Messenger logo" className="h-8 w-auto sm:h-10" />
              <div className="leading-tight hidden sm:block">
                <p className="font-semibold text-sm sm:text-base text-foreground">MCP Messenger</p>
                <p className="text-[0.7rem] uppercase tracking-[0.35em] text-muted-foreground">
                  Scrape anything with MCP Messenger
                </p>
              </div>
            </Link>
            {(title || description) && (
              <div className="hidden md:block border-l border-border/40 pl-4">
                {title && <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>}
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
              </div>
            )}
          </div>
          
          {/* Actions and Theme Toggle */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {children}
            <ThemeToggle />
          </div>
        </div>
        {/* Mobile title/description */}
        {(title || description) && (
          <div className="md:hidden mt-3 pt-3">
            {title && <h1 className="text-xl font-bold">{title}</h1>}
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

