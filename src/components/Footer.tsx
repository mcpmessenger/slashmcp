import { Link } from "react-router-dom";
import { Github, Youtube } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="border-t border-border/40 mt-auto">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/privacy"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/mcpmessenger/slashmcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
            <a
              href="https://www.youtube.com/@MCPMessenger"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="YouTube"
            >
              <Youtube className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
