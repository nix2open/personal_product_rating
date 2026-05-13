import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, apiUpload } from "../api";
import { useI18n } from "../i18n";

type Detail = {
  product: { id: string; name: string; barcode: string | null; brand: string | null; image_url: string | null };
  mine: Record<string, unknown> | null;
  others: Array<{
    user_id: string;
    overall: number;
    price: number | null;
    quality: number | null;
    comment: string | null;
    display_name: string;
  }>;
};

function Stepper({
  label,
  value,
  onChange,
  clearable,
  hint,
  required,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  clearable?: boolean;
  hint?: string;
  required?: boolean;
}) {
  const display = value === null ? "—" : String(value);
  const dec = () => {
    if (required) {
      onChange(Math.max(0, (value as number) - 1));
      return;
    }
    if (clearable) {
      if (value === null) return;
      if (value <= 0) onChange(null);
      else onChange(value - 1);
      return;
    }
    onChange(Math.max(0, (value ?? 0) - 1));
  };
  const inc = () => {
    if (required) {
      onChange(Math.min(10, (value as number) + 1));
      return;
    }
    if (clearable && value === null) {
      onChange(0);
      return;
    }
    const base = clearable ? (value ?? 0) : (value ?? 0);
    onChange(Math.min(10, base + 1));
  };
  return (
    <div className="field">
      <label>
        {label}
        {hint ? <span className="subtitle"> ({hint})</span> : null}
      </label>
      <div className="stepper">
        <button type="button" onClick={dec}>
          −
        </button>
        <span className="pill" style={{ minWidth: 48 }}>
          {display}
        </span>
        <button type="button" onClick={inc}>
          +
        </button>
        {clearable ? (
          <button type="button" className="btn ghost" style={{ width: "auto" }} onClick={() => onChange(null)}>
            ∅
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ProductPage() {
  const { productId } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [overall, setOverall] = useState(7);
  const [price, setPrice] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string }>>([]);

  const load = async () => {
    if (!productId) return;
    setErr(null);
    try {
      const d = await apiFetch<Detail>(`/api/search/product/${encodeURIComponent(productId)}/detail`);
      setDetail(d);
      if (d.mine) {
        setOverall(Number(d.mine.overall ?? 0));
        setPrice(d.mine.price === null || d.mine.price === undefined ? null : Number(d.mine.price));
        setQuality(d.mine.quality === null || d.mine.quality === undefined ? null : Number(d.mine.quality));
        setComment(String(d.mine.comment ?? ""));
        const rid = String(d.mine.id ?? "");
        if (rid) {
          const ph = await apiFetch<{ photos: Array<{ id: string; url: string }> }>(
            `/api/ratings/${encodeURIComponent(rid)}/photos`,
          );
          setPhotos(ph.photos);
        } else {
          setPhotos([]);
        }
      } else {
        setOverall(7);
        setPrice(null);
        setQuality(null);
        setComment("");
        setPhotos([]);
      }
    } catch (e) {
      setErr(String(e));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when product id changes
  }, [productId]);

  const save = async () => {
    if (!productId) return;
    if (overall < 0 || overall > 10) {
      setErr(t("ratingRequired"));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiFetch(`/api/ratings/product/${encodeURIComponent(productId)}`, {
        method: "PUT",
        body: JSON.stringify({ overall, price, quality, comment: comment || null }),
      });
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!productId) return;
    if (photos.length >= 3) return;
    setErr(null);
    try {
      let ratingId = detail?.mine?.id ? String(detail.mine.id) : null;
      if (!ratingId) {
        await apiFetch(`/api/ratings/product/${encodeURIComponent(productId)}`, {
          method: "PUT",
          body: JSON.stringify({ overall, price, quality, comment: comment || null }),
        });
        const fresh = await apiFetch<Detail>(`/api/search/product/${encodeURIComponent(productId)}/detail`);
        ratingId = fresh.mine?.id ? String(fresh.mine.id) : null;
      }
      if (!ratingId) {
        setErr(t("ratingRequired"));
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload(`/api/ratings/${encodeURIComponent(ratingId)}/photos`, fd);
      await load();
    } catch (e) {
      setErr(String(e));
    }
  };

  if (!productId) return null;
  if (!detail && !err) {
    return (
      <div className="page">
        <div className="skeleton" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="page">
        <p className="subtitle">{err}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <button type="button" className="btn ghost" style={{ width: "auto", marginBottom: 8 }} onClick={() => nav(-1)}>
        ←
      </button>
      <div className="card list" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {detail.product.image_url ? (
            <img
              src={detail.product.image_url}
              alt=""
              style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover" }}
            />
          ) : null}
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.product.name}</div>
            <div className="subtitle">
              {[detail.product.brand, detail.product.barcode].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      </div>

      <div className="card list">
        <h2 className="subtitle" style={{ fontWeight: 700, margin: 0 }}>
          {t("mine")}
        </h2>
        <Stepper label={t("overall")} value={overall} onChange={(v) => setOverall(v ?? 0)} required />
        <Stepper label={t("price")} value={price} onChange={setPrice} clearable hint={t("optional")} />
        <Stepper label={t("quality")} value={quality} onChange={setQuality} clearable hint={t("optional")} />
        <div className="field">
          <label>{t("comment")}</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        {err ? <p className="subtitle">{err}</p> : null}
        <button type="button" className="btn" disabled={saving} onClick={() => void save()}>
          {t("save")}
        </button>
        <div style={{ marginTop: 12 }}>
          <div className="subtitle" style={{ fontWeight: 600 }}>
            {t("photos")}
          </div>
          <div className="list">
            {photos.map((p) => (
              <img key={p.id} src={p.url} alt="" style={{ width: "100%", borderRadius: 12 }} />
            ))}
          </div>
          {photos.length < 3 ? (
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
                e.target.value = "";
              }}
            />
          ) : null}
        </div>
      </div>

      {detail.others.length > 0 ? (
        <div className="card list" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="row"
            style={{ border: "none", background: "none", padding: 0, width: "100%", cursor: "pointer" }}
            onClick={() => setShowOthers(!showOthers)}
          >
            <span style={{ fontWeight: 600 }}>{t("othersCollapsed")}</span>
            <span className="pill">{showOthers ? t("othersHide") : t("othersExpand")}</span>
          </button>
          {showOthers ? (
            <div className="list" style={{ marginTop: 8 }}>
              {detail.others.map((o) => (
                <div key={o.user_id} className="card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{o.display_name}</div>
                  <div className="subtitle">
                    {t("overall")}: {o.overall}
                    {o.price != null ? ` · ${t("price")}: ${o.price}` : ""}
                    {o.quality != null ? ` · ${t("quality")}: ${o.quality}` : ""}
                  </div>
                  {o.comment ? <p>{o.comment}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
