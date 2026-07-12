import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";

/** Redirects to home unless the logged-in user is an admin. Returns loading/auth state for gating the page render. */
export function useRequireAdmin() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      setLocation("/");
    }
  }, [isLoading, user, setLocation]);

  return { user, isLoading, ready: !isLoading && !!user?.isAdmin };
}
