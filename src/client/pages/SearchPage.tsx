import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { useI18n } from "../i18n";

const RECENT_KEY = "recent_searches_v1";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  const t = q.trim();
  if (t.length < 2) return;
  const prev = loadRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
  prev.unshift(t);
  localStorage.setItem(RECENT_KEY, JSON.stringify(prev.slice(0, 8)));
}

type SearchResp = {
  mine?: Array<Record<string, unknown>>;
  catalog?: Array<{ code: string; name: string; brand?: string; image?: string }>;
  localCatalog?: Array<Record<string, unknown>>;
};

export function SearchPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResp | null>(null);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [scan, setScan] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 320);
    return () => window.clearTimeout(id);
  }, [q]);

  const runSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setData(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch<SearchResp>(`/api/search?q=${encodeURIComponent(query)}`);
      setData(r);
      saveRecent(query);
      setRecent(loadRecent());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch(debounced);
  }, [debounced, runSearch]);

  const openProduct = (id: string) => {
    nav(`/product/${encodeURIComponent(id)}`);
  };

  const pickOff = async (code: string) => {
    setErr(null);
    try {
      const r = await apiFetch<{ product: { id: string } }>("/api/search/product/from-off", {
        method: "POST",
        body: JSON.stringify({ barcode: code }),
      });
      openProduct(r.product.id);
    } catch (e) {
      setErr(String(e));
    }
  };

  const onScan = async (text: string) => {
    setScan(false);
    const clean = text.replace(/\s+/g, "");
    if (/^\d{4,}$/.test(clean)) {
      try {
        const r = await apiFetch<{ offProduct?: { dbId: string | null }; myRated?: { product_id?: string } }>(
          `/api/search?barcode=${encodeURIComponent(clean)}`,
        );
        if (r.myRated?.product_id) {
          openProduct(String(r.myRated.product_id));
          return;
        }
        if (r.offProduct?.dbId) {
          openProduct(String(r.offProduct.dbId));
          return;
        }
        await pickOff(clean);
      } catch (e) {
        setErr(String(e));
      }
    } else {
      setQ(clean);
    }
  };

  const mine = data?.mine ?? [];
  const catalog = data?.catalog ?? [];
  const local = data?.localCatalog ?? [];

  const showEmpty = debounced.length >= 2 && !loading && mine.length === 0 && catalog.length === 0 && local.length === 0;

  return (
    <div className="page">
      <h1 className="title">{t("search")}</h1>
      <div className="field">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn secondary" style={{ flex: 1 }} onClick={() => setScan(true)}>
          {t("scan")}
        </button>
        <button
          type="button"
          className="btn secondary"
          style={{ flex: 1 }}
          onClick={() => nav("/product/manual")}
        >
          {t("newManual")}
        </button>
      </div>
      {err ? <p className="subtitle">{err}</p> : null}
      {recent.length > 0 && debounced.length < 2 ? (
        <div style={{ marginBottom: 12 }}>
          <div className="subtitle">{t("recent")}</div>
          <div className="chips">
            {recent.map((r) => (
              <button key={r} type="button" className="chip" onClick={() => setQ(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {loading ? (
        <div className="list">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : null}
      {showEmpty ? <p className="subtitle">{t("noResults")}</p> : null}
      {mine.length > 0 ? (
        <section style={{ marginTop: 16 }}>
          <h2 className="subtitle" style={{ fontWeight: 600 }}>
            {t("mine")}
          </h2>
          <div className="list">
            {mine.map((row) => (
              <button
                key={String(row.product_id)}
                type="button"
                className="card row"
                style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
                onClick={() => openProduct(String(row.product_id))}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{String(row.name)}</div>
                  <div className="subtitle">{row.barcode ? String(row.barcode) : ""}</div>
                </div>
                <span className="pill">{String(row.overall ?? "—")}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {local.length > 0 ? (
        <section style={{ marginTop: 16 }}>
          <h2 className="subtitle" style={{ fontWeight: 600 }}>
            {t("local")}
          </h2>
          <div className="list">
            {local.map((row) => (
              <button
                key={String(row.product_id)}
                type="button"
                className="card row"
                style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
                onClick={() => openProduct(String(row.product_id))}
              >
                <div style={{ fontWeight: 600 }}>{String(row.name)}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {catalog.length > 0 ? (
        <section style={{ marginTop: 16 }}>
          <h2 className="subtitle" style={{ fontWeight: 600 }}>
            {t("catalog")}
          </h2>
          <div className="list">
            {catalog.map((row) => (
              <button
                key={row.code}
                type="button"
                className="card row"
                style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
                onClick={() => void pickOff(row.code)}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div className="subtitle">{row.code}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {scan ? <BarcodeScanner onDetected={(x) => void onScan(x)} onClose={() => setScan(false)} /> : null}
    </div>
  );
}
