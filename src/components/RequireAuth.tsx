import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/use-session";

interface RequireAuthProps {
  children: ReactNode;
  /** Shown while the session is being read from storage (usually a page skeleton). */
  fallback?: ReactNode;
  /** Where signed-out visitors go. Defaults to the sign-in page. */
  redirectTo?: string;
}

/**
 * Renders protected pages only for signed-in users. Signed-out visitors are sent to
 * the sign-in page with a `redirect` param so they come back here after logging in.
 */
const RequireAuth = ({ children, fallback = null, redirectTo = "/auth" }: RequireAuthProps) => {
  const location = useLocation();
  const session = useSession();

  if (session === undefined) return <>{fallback}</>;

  if (!session) {
    const target = location.pathname + location.search;
    const to = redirectTo === "/auth" ? `/auth?redirect=${encodeURIComponent(target)}` : redirectTo;
    return <Navigate to={to} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
