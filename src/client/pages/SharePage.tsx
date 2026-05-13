import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useI18n } from "../i18n";

type TokenRow = { id: string; created_at: number; revoked_at: number | null };

export function SharePage() {
  const { t } = useI18n();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [granted, setGranted] = useState<Array<Record<string, unknown>>>([]);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [importToken, setImportToken] = useState("");
  const [importName, setImportName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [incoming, setIncoming] = useState<Array<Record<string, unknown>>>([]);
  const [outgoing, setOutgoing] = useState<Array<Record<string, unknown>>>([]);

  const reload = async () => {
    const tok = await apiFetch<{ tokens: TokenRow[] }>("/api/share/tokens");
    const out = await apiFetch<{ invites: Array<Record<string, unknown>>; granted: Array<Record<string, unknown>> }>(
      "/api/share/outgoing",
    );
    const inc = await apiFetch<{ invites: Array<Record<string, unknown>> }>("/api/share/incoming");
    setTokens(tok.tokens);
    setGranted(out.granted);
    setOutgoing(out.invites);
    setIncoming(inc.invites);
  };

  useEffect(() => {
    void reload().catch((e) => setErr(String(e)));
  }, []);

  const createToken = async () => {
    setErr(null);
    setOkMsg(null);
    setLastToken(null);
    try {
      const r = await apiFetch<{ token: string }>("/api/share/token/create", { method: "POST", body: "{}" });
      setLastToken(r.token);
      setOkMsg(t("shareTokenCreated"));
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const copyToken = async () => {
    if (!lastToken) return;
    try {
      await navigator.clipboard.writeText(lastToken);
      setOkMsg(t("shareTokenCopied"));
    } catch {
      setOkMsg(lastToken);
    }
  };

  const revokeTok = async (id: string) => {
    setErr(null);
    await apiFetch("/api/share/token/revoke", { method: "POST", body: JSON.stringify({ id }) });
    await reload();
  };

  const doImport = async () => {
    setErr(null);
    setOkMsg(null);
    try {
      await apiFetch("/api/share/import-token", {
        method: "POST",
        body: JSON.stringify({ token: importToken.trim(), sharerName: importName.trim() || null }),
      });
      setImportToken("");
      setImportName("");
      setOkMsg(t("shareImportOk"));
      await reload();
    } catch (e: unknown) {
      const err = e as Error & { apiCode?: string };
      if (err.apiCode === "invalid_token") setErr(t("shareErrInvalidToken"));
      else if (err.apiCode === "cannot_share_with_self") setErr(t("shareErrCannotSelf"));
      else setErr(String(e));
    }
  };

  const invite = async () => {
    setErr(null);
    try {
      await apiFetch("/api/share/invite", { method: "POST", body: JSON.stringify({ email }) });
      setEmail("");
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const accept = async (id: string) => {
    await apiFetch("/api/share/accept", { method: "POST", body: JSON.stringify({ inviteId: id }) });
    await reload();
  };

  const reject = async (id: string) => {
    await apiFetch("/api/share/reject", { method: "POST", body: JSON.stringify({ inviteId: id }) });
    await reload();
  };

  const revoke = async (viewerUserId: string) => {
    await apiFetch("/api/share/revoke-access", { method: "POST", body: JSON.stringify({ viewerUserId }) });
    await reload();
  };

  return (
    <div className="page">
      <h1 className="title">{t("share")}</h1>

      <section className="card list" style={{ marginBottom: 16 }}>
        <h2 className="subtitle" style={{ fontWeight: 700, marginTop: 0 }}>
          {t("shareGenerateAccess")}
        </h2>
        <p className="subtitle">{t("shareGenerateHint")}</p>
        <button type="button" className="btn" onClick={() => void createToken()}>
          {t("shareGenerateButton")}
        </button>
        {lastToken ? (
          <div style={{ marginTop: 12 }}>
            <div className="field">
              <label>{t("shareTokenOnce")}</label>
              <input readOnly value={lastToken} onFocus={(e) => e.target.select()} />
            </div>
            <button type="button" className="btn secondary" onClick={() => void copyToken()}>
              {t("shareCopyToken")}
            </button>
          </div>
        ) : null}
        <h3 className="subtitle" style={{ fontWeight: 600, marginTop: 16 }}>
          {t("shareActiveTokens")}
        </h3>
        <div className="list">
          {tokens.map((tok) => (
            <div key={tok.id} className="card row">
              <div>
                <div className="subtitle">{new Date(tok.created_at).toLocaleString()}</div>
                <div>{tok.revoked_at ? t("shareTokenRevoked") : t("shareTokenActive")}</div>
              </div>
              {!tok.revoked_at ? (
                <button type="button" className="btn secondary" style={{ width: "auto" }} onClick={() => void revokeTok(tok.id)}>
                  {t("shareRevokeToken")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="card list" style={{ marginBottom: 16 }}>
        <h2 className="subtitle" style={{ fontWeight: 700, marginTop: 0 }}>
          {t("shareImportTitle")}
        </h2>
        <p className="subtitle">{t("shareImportHint")}</p>
        <div className="field">
          <label>{t("shareImportName")}</label>
          <input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder={t("shareImportNamePh")} />
        </div>
        <div className="field">
          <label>{t("shareImportToken")}</label>
          <input value={importToken} onChange={(e) => setImportToken(e.target.value)} placeholder={t("shareImportTokenPh")} />
        </div>
        <button type="button" className="btn" disabled={!importToken.trim()} onClick={() => void doImport()}>
          {t("shareImportSubmit")}
        </button>
      </section>

      {okMsg ? <p className="subtitle">{okMsg}</p> : null}
      {err ? <p className="subtitle" style={{ color: "var(--danger)" }}>{err}</p> : null}

      <section style={{ marginTop: 16 }}>
        <h2 className="subtitle" style={{ fontWeight: 700 }}>
          {t("granted")}
        </h2>
        <div className="list">
          {granted.map((g) => (
            <div key={String(g.viewer_user_id)} className="card row">
              <div>
                <div style={{ fontWeight: 600 }}>
                  {String(g.viewer_name ?? g.viewer_username ?? g.viewer_email)}
                </div>
                {g.import_label ? <div className="subtitle">{String(g.import_label)}</div> : null}
              </div>
              <button type="button" className="btn secondary" style={{ width: "auto" }} onClick={() => void revoke(String(g.viewer_user_id))}>
                {t("revoke")}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card list" style={{ marginTop: 24 }}>
        <h2 className="subtitle" style={{ fontWeight: 700, marginTop: 0 }}>
          {t("shareEmailLegacy")}
        </h2>
        <div className="field">
          <label>{t("inviteEmail")}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button type="button" className="btn secondary" onClick={() => void invite()}>
          {t("sendInvite")}
        </button>

        <h3 className="subtitle" style={{ fontWeight: 600, marginTop: 16 }}>
          {t("incoming")}
        </h3>
        <div className="list">
          {incoming.map((inv) => (
            <div key={String(inv.id)} className="card row">
              <div>
                <div style={{ fontWeight: 600 }}>{String(inv.owner_name ?? inv.owner_email)}</div>
                <div className="subtitle">{String(inv.owner_email)}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void accept(String(inv.id))}>
                  {t("accept")}
                </button>
                <button type="button" className="btn secondary" style={{ width: "auto" }} onClick={() => void reject(String(inv.id))}>
                  {t("reject")}
                </button>
              </div>
            </div>
          ))}
        </div>

        <h3 className="subtitle" style={{ fontWeight: 600, marginTop: 16 }}>
          {t("outgoing")}
        </h3>
        <div className="list">
          {outgoing.map((inv) => (
            <div key={String(inv.id)} className="card row">
              <div style={{ fontWeight: 600 }}>{String(inv.invitee_email)}</div>
              <div className="subtitle">{String(inv.status)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
