import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useI18n } from "../i18n";

type Item = {
  rating_id: string;
  product_id: string;
  name: string;
  barcode: string | null;
  overall: number;
  updated_at: number;
};

export function MyListPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch<{ items: Item[] }>("/api/ratings");
        setItems(r.items);
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, []);

  return (
    <div className="page">
      <h1 className="title">{t("myList")}</h1>
      {err ? <p className="subtitle">{err}</p> : null}
      <div className="list">
        {items.map((it) => (
          <Link
            key={it.rating_id}
            className="card row"
            to={`/product/${encodeURIComponent(it.product_id)}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{it.name}</div>
              <div className="subtitle">{it.barcode ?? ""}</div>
            </div>
            <span className="pill">{it.overall}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
