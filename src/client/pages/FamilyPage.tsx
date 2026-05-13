import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useI18n } from "../i18n";

type GroupRow = { id: string; name: string; created_at: number; role: string; status: string };

export function FamilyPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);

  const reloadGroups = async () => {
    const me = await apiFetch<{ user: { email: string } | null }>("/api/auth/me");
    setMyEmail(me.user?.email ?? null);
    const r = await apiFetch<{ groups: GroupRow[] }>("/api/family/groups");
    setGroups(r.groups);
  };

  useEffect(() => {
    void reloadGroups().catch((e) => setErr(String(e)));
  }, []);

  const create = async () => {
    setErr(null);
    try {
      await apiFetch("/api/family/groups", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      await reloadGroups();
    } catch (e) {
      setErr(String(e));
    }
  };

  const loadMembers = async (gid: string) => {
    const r = await apiFetch<{ members: Array<Record<string, unknown>> }>(`/api/family/groups/${gid}/members`);
    setMembers(r.members);
    setActiveGroup(gid);
  };

  const invite = async () => {
    if (!activeGroup) return;
    await apiFetch(`/api/family/groups/${activeGroup}/invite`, {
      method: "POST",
      body: JSON.stringify({ email: inviteEmail }),
    });
    setInviteEmail("");
    await loadMembers(activeGroup);
  };

  const accept = async (inviteId: string) => {
    await apiFetch(`/api/family/invites/${inviteId}/accept`, { method: "POST" });
    await reloadGroups();
  };

  return (
    <div className="page">
      <h1 className="title">{t("family")}</h1>
      {err ? <p className="subtitle">{err}</p> : null}
      <div className="card list">
        <div className="field">
          <label>{t("groupName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="button" className="btn" onClick={() => void create()}>
          {t("createFamily")}
        </button>
      </div>

      <div className="list" style={{ marginTop: 16 }}>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className="card row"
            style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
            onClick={() => void loadMembers(g.id)}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{g.name}</div>
              <div className="subtitle">
                {g.role} · {g.status}
              </div>
            </div>
          </button>
        ))}
      </div>

      {activeGroup ? (
        <div className="card list" style={{ marginTop: 16 }}>
          <h2 className="subtitle" style={{ fontWeight: 700 }}>
            {t("members")}
          </h2>
          {members.map((m) => (
            <div key={String(m.id)} className="row">
              <div>
                <div style={{ fontWeight: 600 }}>{String(m.user_name ?? m.user_email ?? m.invitee_email ?? "—")}</div>
                <div className="subtitle">
                  {String(m.role)} · {String(m.status)}
                </div>
              </div>
              {String(m.status) === "pending" &&
              m.invitee_email &&
              myEmail &&
              String(m.invitee_email).toLowerCase() === myEmail.toLowerCase() ? (
                <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void accept(String(m.id))}>
                  {t("accept")}
                </button>
              ) : null}
            </div>
          ))}
          <div className="field" style={{ marginTop: 12 }}>
            <label>{t("inviteMember")}</label>
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </div>
          <button type="button" className="btn secondary" onClick={() => void invite()}>
            {t("sendInvite")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
