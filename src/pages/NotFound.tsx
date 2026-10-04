import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const NotFound = () => {
  const location = useLocation();
  useSEO({ title: "Page not found", description: "This page doesn't exist on CloudBook." });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="auth-gradient-bg flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <p className="text-7xl font-display font-extrabold tracking-tight gradient-text">404</p>
        <h1 className="mt-4 text-2xl font-bold">This page doesn't exist</h1>
        <p className="mt-2 text-muted-foreground">
          The link may be broken, or the page may have been removed.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="rounded-full gradient-brand text-primary-foreground">
            <Link to="/">
              <Home className="h-4 w-4 mr-2" /> Go to your feed
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/explore">
              <Compass className="h-4 w-4 mr-2" /> Explore
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
