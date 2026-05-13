import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useI18n } from "../i18n";

export function SharePage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [incoming, setIncoming] = useState<Array<Record<string, unknown>>>([]);
  const [outgoing, setOutgoing] = useState<Array<Record<string, unknown>>>([]);
  const [granted, setGranted] = useState<Array<Record<string, unknown>>>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    const inc = await apiFetch<{ invites: Array<Record<string, unknown>> }>("/api/share/incoming");
    const out = await apiFetch<{ invites: Array<Record<string, unknown>>; granted: Array<Record<string, unknown>> }>(
      "/api/share/outgoing",
    );
    setIncoming(inc.invites);
    setOutgoing(out.invites);
    setGranted(out.granted);
  };

  useEffect(() => {
    void reload().catch((e) => setErr(String(e)));
  }, []);

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
      <div className="card list">
        <div className="field">
          <label>{t("inviteEmail")}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {err ? <p className="subtitle">{err}</p> : null}
        <button type="button" className="btn" onClick={() => void invite()}>
          {t("sendInvite")}
        </button>
      </div>

      <section style={{ marginTop: 16 }}>
        <h2 className="subtitle" style={{ fontWeight: 700 }}>
          {t("incoming")}
        </h2>
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
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 className="subtitle" style={{ fontWeight: 700 }}>
          {t("outgoing")}
        </h2>
        <div className="list">
          {outgoing.map((inv) => (
            <div key={String(inv.id)} className="card row">
              <div style={{ fontWeight: 600 }}>{String(inv.invitee_email)}</div>
              <div className="subtitle">{String(inv.status)}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 className="subtitle" style={{ fontWeight: 700 }}>
          {t("granted")}
        </h2>
        <div className="list">
          {granted.map((g) => (
            <div key={String(g.viewer_user_id)} className="card row">
              <div style={{ fontWeight: 600 }}>{String(g.viewer_name ?? g.viewer_email)}</div>
              <button type="button" className="btn secondary" style={{ width: "auto" }} onClick={() => void revoke(String(g.viewer_user_id))}>
                {t("revoke")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
