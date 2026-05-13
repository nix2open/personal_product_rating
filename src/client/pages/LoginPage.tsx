import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { useI18n } from "../i18n";

function mapAuthError(t: (key: string) => string, code?: string): string {
  switch (code) {
    case "username_taken":
      return t("usernameTaken");
    case "invalid_credentials":
      return t("invalidCredentials");
    case "invalid_body":
      return t("invalidBody");
    default:
      return code ?? "";
  }
}

export function LoginPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") !== "google") return;
    setMsg(t("loginGoogleNotConfigured"));
    const next = new URLSearchParams(searchParams);
    next.delete("error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, t]);

  const goHome = () => nav("/", { replace: true });

  const magic = async () => {
    setMsg(null);
    setDevLink(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ ok?: boolean; devMagicLinkUrl?: string; emailNotConfigured?: boolean }>(
        "/api/auth/magic-link",
        { method: "POST", body: JSON.stringify({ email }) },
      );
      if (res.devMagicLinkUrl) setDevLink(res.devMagicLinkUrl);
      setMsg(t("sendMagicLink") + " ✓");
    } catch (e: unknown) {
      const err = e as Error & { apiDetail?: string };
      if (err.apiDetail === "email_not_configured") {
        setMsg(t("loginEmailNotConfigured"));
      } else {
        setMsg(String(e));
      }
    } finally {
      setLoading(false);
    }
  };

  const google = () => {
    window.location.assign(new URL("/api/auth/google", window.location.origin).toString());
  };

  const passwordLogin = async () => {
    setMsg(null);
    setDevLink(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/password-login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      goHome();
    } catch (e: unknown) {
      const err = e as Error & { apiCode?: string };
      setMsg(mapAuthError(t, err.apiCode) || String(e));
    } finally {
      setLoading(false);
    }
  };

  const register = async () => {
    setMsg(null);
    setDevLink(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username: regUsername.trim(), password: regPassword }),
      });
      goHome();
    } catch (e: unknown) {
      const err = e as Error & { apiCode?: string };
      setMsg(mapAuthError(t, err.apiCode) || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1 className="title">{t("loginTitle")}</h1>
      <p className="subtitle">{t("loginSubtitle")}</p>

      <div className="card list">
        <h2 className="subtitle" style={{ fontWeight: 700, marginTop: 0 }}>
          {t("email")}
        </h2>
        <div className="field">
          <label htmlFor="em">{t("email")}</label>
          <input id="em" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <button type="button" className="btn" disabled={loading || !email} onClick={() => void magic()}>
          {t("sendMagicLink")}
        </button>
        <button type="button" className="btn secondary" onClick={google}>
          {t("continueGoogle")}
        </button>
      </div>

      <div className="card list" style={{ marginTop: 16 }}>
        <h2 className="subtitle" style={{ fontWeight: 700, marginTop: 0 }}>
          {t("loginUsernamePassword")}
        </h2>
        <div className="field">
          <label htmlFor="lu">{t("loginUsername")}</label>
          <input
            id="lu"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="lp">{t("loginPassword")}</label>
          <input
            id="lp"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button
          type="button"
          className="btn"
          disabled={loading || !username.trim() || !password}
          onClick={() => void passwordLogin()}
        >
          {t("loginSignIn")}
        </button>
      </div>

      <div className="card list" style={{ marginTop: 16 }}>
        <h2 className="subtitle" style={{ fontWeight: 700, marginTop: 0 }}>
          {t("loginRegister")}
        </h2>
        <p className="subtitle">{t("loginSubtitle")}</p>
        <div className="field">
          <label htmlFor="ru">{t("loginUsername")}</label>
          <input
            id="ru"
            value={regUsername}
            onChange={(e) => setRegUsername(e.target.value)}
            autoComplete="username"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="rp">{t("loginPassword")}</label>
          <input
            id="rp"
            type="password"
            value={regPassword}
            onChange={(e) => setRegPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <button
          type="button"
          className="btn secondary"
          disabled={loading || regUsername.trim().length < 3 || regPassword.length < 8}
          onClick={() => void register()}
        >
          {t("registerSubmit")}
        </button>
      </div>

      {msg ? <p className="subtitle">{msg}</p> : null}
      {devLink ? (
        <p className="subtitle">
          {t("devMagicHint")} <a href={devLink}>{devLink}</a>
        </p>
      ) : null}
    </div>
  );
}
