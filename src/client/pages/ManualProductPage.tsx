import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useI18n } from "../i18n";

export function ManualProductPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await apiFetch<{ product: { id: string } }>("/api/search/product/manual", {
        method: "POST",
        body: JSON.stringify({ name, barcode: barcode || null }),
      });
      nav(`/product/${encodeURIComponent(r.product.id)}`, { replace: true });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1 className="title">{t("newManual")}</h1>
      <div className="card list">
        <div className="field">
          <label>{t("productName")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>{t("barcodeOptional")}</label>
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </div>
        {err ? <p className="subtitle">{err}</p> : null}
        <button type="button" className="btn" disabled={loading || !name.trim()} onClick={() => void submit()}>
          {t("create")}
        </button>
        <button type="button" className="btn secondary" onClick={() => nav(-1)}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}
