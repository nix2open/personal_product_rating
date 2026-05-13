import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { apiFetch } from "../api";

type Me = { user: { id: string; email: string; name: string | null } | null };

export function RequireAuth() {
  const loc = useLocation();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await apiFetch<Me>("/api/auth/me");
        if (alive) setMe(r);
      } catch {
        if (alive) setMe({ user: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [loc.pathname]);

  if (me === null) {
    return (
      <div className="page">
        <div className="skeleton" />
        <div className="skeleton" style={{ marginTop: 10 }} />
      </div>
    );
  }
  if (!me.user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <Outlet context={me.user} />;
}
