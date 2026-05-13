import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";

export function ProfilePage() {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [isPasswordAccount, setIsPasswordAccount] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await apiFetch<{
        user: { email: string; name: string | null; username?: string | null; isPasswordAccount?: boolean } | null;
      }>("/api/auth/me");
      if (r.user) {
        setEmail(r.user.email);
        setName(r.user.name ?? "");
        setUsername(r.user.username ?? null);
        setIsPasswordAccount(Boolean(r.user.isPasswordAccount));
      }
    })();
  }, []);

  const save = async () => {
    await apiFetch("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ name: name.trim() || null }) });
  };

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    nav("/login", { replace: true });
  };

  return (
    <div className="page">
      <h1 className="title">{t("profile")}</h1>
      <div className="card list">
        {isPasswordAccount && username ? (
          <>
            <div style={{ fontWeight: 600 }}>
              {t("profileUsername")}: @{username}
            </div>
            <p className="subtitle">{t("profilePasswordAccountHint")}</p>
          </>
        ) : (
          <div className="subtitle">{email}</div>
        )}
        <div className="field">
          <label>{t("displayName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="button" className="btn" onClick={() => void save()}>
          {t("saveProfile")}
        </button>
      </div>

      <div className="card list" style={{ marginTop: 12 }}>
        <div className="field">
          <label>{t("language")}</label>
          <select value={locale} onChange={(e) => setLocale(e.target.value as "en" | "ru")}>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </div>
        <div className="field">
          <label>{t("theme")}</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as "light" | "dark" | "system")}>
            <option value="system">{t("themeSystem")}</option>
            <option value="light">{t("themeLight")}</option>
            <option value="dark">{t("themeDark")}</option>
          </select>
        </div>
      </div>

      <div className="card list" style={{ marginTop: 12 }}>
        <Link to="/share" className="row" style={{ textDecoration: "none", color: "inherit" }}>
          <span style={{ fontWeight: 600 }}>{t("share")}</span>
          <span>›</span>
        </Link>
        <Link to="/family" className="row" style={{ textDecoration: "none", color: "inherit" }}>
          <span style={{ fontWeight: 600 }}>{t("family")}</span>
          <span>›</span>
        </Link>
      </div>

      <button type="button" className="btn secondary" style={{ marginTop: 16 }} onClick={() => void logout()}>
        {t("logout")}
      </button>
    </div>
  );
}
