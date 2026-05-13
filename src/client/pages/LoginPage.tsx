import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import { useI18n } from "../i18n";

export function LoginPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState("");
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

  return (
    <div className="page">
      <h1 className="title">{t("loginTitle")}</h1>
      <p className="subtitle">{t("loginSubtitle")}</p>
      <div className="card list">
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
        {msg ? <p className="subtitle">{msg}</p> : null}
        {devLink ? (
          <p className="subtitle">
            {t("devMagicHint")} <a href={devLink}>{devLink}</a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
