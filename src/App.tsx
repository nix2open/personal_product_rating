import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const BarcodeScanner = lazy(() => import("./components/BarcodeScanner"));
const API_BASE = "/api";
const TOKENS_KEY = "rating_tokens_v2";
const USER_KEY = "rating_user_v2";

type User = { id: string; email: string; nickname: string; is_admin: boolean };
type Tokens = { accessToken: string; refreshToken: string };
type Share = { id: string; role: "viewer" | "editor"; grantee_email: string };
type Reward = { id: string; points: number; title: string; description: string };
type Product = {
  id: string; owner_email: string; owner_nickname: string; barcode: string | null; name: string; brand: string | null;
  category: string; photo_url: string | null; rating: number; taste_rating: number | null; quality_rating: number | null;
  price_rating: number | null; pros: string | null; cons: string | null; note_text: string | null;
};
type RewardRule = {
  key: string; title: string; description: string; activity_key: string; period_days: number; target_count: number; points: number; enabled: boolean;
};
type AuthResponse = { user: User; accessToken: string; refreshToken: string };
type SpeechRecognitionConstructor = new () => {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; start: () => void;
};

function readStorage() {
  const tokenRaw = localStorage.getItem(TOKENS_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!tokenRaw || !userRaw) return null;
  try { return { tokens: JSON.parse(tokenRaw) as Tokens, user: JSON.parse(userRaw) as User }; } catch { return null; }
}

function App() {
  const stored = useMemo(readStorage, []);
  const [user, setUser] = useState<User | null>(stored?.user ?? null);
  const [tokens, setTokens] = useState<Tokens | null>(stored?.tokens ?? null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@local.dev");
  const [nickname, setNickname] = useState("demo");
  const [password, setPassword] = useState("DemoPass123!");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<Product[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [rewards, setRewards] = useState<{ totalPoints: number; rewards: Reward[] }>({ totalPoints: 0, rewards: [] });
  const [adminRules, setAdminRules] = useState<RewardRule[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [shareEmails, setShareEmails] = useState("");
  const [shareRole, setShareRole] = useState<"viewer" | "editor">("viewer");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    barcode: "", name: "", brand: "", category: "other", photoUrl: "",
    rating: 7, tasteRating: 0, qualityRating: 0, priceRating: 0, pros: "", cons: "", noteText: "",
  });
  const needsSecureContext = typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost";

  useEffect(() => {
    if (!user || !tokens) {
      localStorage.removeItem(TOKENS_KEY);
      localStorage.removeItem(USER_KEY);
      return;
    }
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }, [tokens, user]);

  const withAuth = useCallback(async (path: string, init?: RequestInit, retry = true): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (tokens?.accessToken) headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (response.status !== 401 || !tokens?.refreshToken || !retry) return response;
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!refreshed.ok) { setUser(null); setTokens(null); throw new Error("Unauthorized"); }
    const auth = (await refreshed.json()) as AuthResponse;
    setUser(auth.user);
    setTokens({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
    return withAuth(path, init, false);
  }, [tokens]);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [catsRes, productsRes, sharesRes, rewardsRes] = await Promise.all([
      fetch(`${API_BASE}/meta/categories`),
      withAuth(`/products?q=${encodeURIComponent(search)}&category=${encodeURIComponent(categoryFilter)}`),
      withAuth("/shares"),
      withAuth("/rewards/me"),
    ]);
    if (catsRes.ok) setCategories(await catsRes.json());
    if (productsRes.ok) setProducts(await productsRes.json());
    if (sharesRes.ok) setShares(await sharesRes.json());
    if (rewardsRes.ok) setRewards(await rewardsRes.json());
    if (user.is_admin) {
      const admin = await withAuth("/admin/reward-rules");
      if (admin.ok) setAdminRules(await admin.json());
    }
  }, [categoryFilter, search, user, withAuth]);

  useEffect(() => { void loadData().catch(() => setMessage("Ошибка загрузки данных")); }, [loadData]);

  const submitAuth = async () => {
    setLoading(true); setMessage("");
    try {
      const body = authMode === "register" ? { email, nickname, password } : { email, password };
      const response = await fetch(`${API_BASE}/auth/${authMode}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Auth failed");
      const data = (await response.json()) as AuthResponse;
      setUser(data.user); setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      setMessage("Успешный вход.");
    } catch { setMessage("Ошибка авторизации."); } finally { setLoading(false); }
  };

  const logout = async () => {
    if (tokens?.refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }).catch(() => undefined);
    }
    setUser(null); setTokens(null); setProducts([]); setShares([]);
  };

  const startVoiceInput = () => {
    const Recognition = (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
    if (!Recognition) { setMessage("В этом браузере голосовой ввод недоступен."); return; }
    const recognition = new Recognition();
    recognition.lang = "ru-RU"; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setForm((prev) => ({ ...prev, noteText: [prev.noteText, text].filter(Boolean).join(" ") }));
    };
    recognition.onerror = () => setMessage("Не удалось распознать голос.");
    recognition.start();
  };

  const uploadPhoto = async (file: File) => {
    const fd = new FormData(); fd.append("photo", file);
    const response = await withAuth("/uploads/photo", { method: "POST", body: fd });
    if (!response.ok) throw new Error("Upload failed");
    const data = (await response.json()) as { photoUrl: string };
    setForm((prev) => ({ ...prev, photoUrl: data.photoUrl }));
  };

  const saveProduct = async () => {
    setLoading(true); setMessage("");
    try {
      const payload = {
        barcode: form.barcode || null, name: form.name, brand: form.brand || null, category: form.category,
        photoUrl: form.photoUrl || null, rating: form.rating, tasteRating: form.tasteRating || null,
        qualityRating: form.qualityRating || null, priceRating: form.priceRating || null,
        pros: form.pros || null, cons: form.cons || null, noteText: form.noteText || null,
      };
      const response = await withAuth("/products", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Save failed");
      setForm((prev) => ({ ...prev, barcode: "", name: "", brand: "", pros: "", cons: "", noteText: "", photoUrl: "" }));
      setMessage("Оценка сохранена.");
      await loadData();
    } catch { setMessage("Не удалось сохранить продукт."); } finally { setLoading(false); }
  };

  const createShare = async () => {
    const emails = shareEmails.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (!emails.length) return;
    const response = await withAuth("/shares", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails, role: shareRole }),
    });
    if (!response.ok) { setMessage("Ошибка выдачи доступа."); return; }
    setShareEmails(""); await loadData(); setMessage("Доступы обновлены.");
  };

  const showRatings = async (productId: string) => {
    const response = await withAuth(`/products/${productId}/ratings`);
    if (!response.ok) { setMessage("Не удалось загрузить рейтинги других пользователей."); return; }
    setSelectedProductId(productId);
    setSelectedRatings(await response.json());
  };

  const createRule = async () => {
    const key = prompt("Rule key (example weekly_10_reviews)");
    if (!key) return;
    const response = await withAuth("/admin/reward-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key, title: "Custom rule", description: "Created from admin panel",
        activityKey: "product_rated", periodDays: 7, targetCount: 10, points: 100, enabled: true,
      }),
    });
    if (!response.ok) { setMessage("Не удалось создать правило."); return; }
    await loadData();
  };

  const recalcRewards = async () => {
    const response = await withAuth("/admin/rewards/recalculate", { method: "POST" });
    if (!response.ok) { setMessage("Ошибка пересчета наград."); return; }
    await loadData();
  };

  const openScanner = useCallback(() => setScannerOpen(true), []);
  const closeScanner = useCallback(() => setScannerOpen(false), []);

  if (!user) {
    return (
      <main className="screen authScreen">
        <section className="glass authCard">
          <h1>RateLoop</h1>
          <p className="subtle">Личные и shared-рейтинги продуктов</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          {authMode === "register" && (
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname" />
          )}
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
          <div className="row">
            <button className="primary" onClick={submitAuth} disabled={loading}>
              {authMode === "register" ? "Создать аккаунт" : "Войти"}
            </button>
            <button className="secondary" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
              {authMode === "login" ? "Регистрация" : "Уже есть аккаунт"}
            </button>
          </div>
          {message && <p className="message">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      {needsSecureContext && (
        <div className="secureBanner">
          Для стабильной камеры в iPhone Safari открывай приложение через HTTPS (`rate.ethanoloop.ru`).
        </div>
      )}
      <header className="header">
        <div>
          <h1>RateLoop</h1>
          <p className="subtle">{user.nickname} · {user.email}</p>
        </div>
        <button className="secondary" onClick={logout}>Выйти</button>
      </header>

      <section className="glass card">
        <h2>Каталог</h2>
        <div className="row">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию, бренду, штрихкоду" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Все категории</option>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <button className="secondary" onClick={() => void loadData()}>Найти</button>
        </div>
        <div className="productList">
          {products.map((product) => (
            <button key={product.id} className={`productItem ${selectedProductId === product.id ? "active" : ""}`} onClick={() => void showRatings(product.id)}>
              <strong>{product.name}</strong>
              <span>{product.category} · {product.rating}/10 · {product.owner_nickname}</span>
              <span>{product.barcode || "без штрихкода"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="glass card">
        <h2>Новая оценка</h2>
        <div className="formGrid">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название *" />
          <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Бренд" />
          <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Штрихкод (необязательно)" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <label>Общий рейтинг: {form.rating}/10<input type="range" min={0} max={10} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} /></label>
          <label>Вкус: {form.tasteRating}/10<input type="range" min={0} max={10} value={form.tasteRating} onChange={(e) => setForm({ ...form, tasteRating: Number(e.target.value) })} /></label>
          <label>Качество: {form.qualityRating}/10<input type="range" min={0} max={10} value={form.qualityRating} onChange={(e) => setForm({ ...form, qualityRating: Number(e.target.value) })} /></label>
          <label>Цена: {form.priceRating}/10<input type="range" min={0} max={10} value={form.priceRating} onChange={(e) => setForm({ ...form, priceRating: Number(e.target.value) })} /></label>
          <textarea value={form.pros} onChange={(e) => setForm({ ...form, pros: e.target.value })} placeholder="Плюсы" />
          <textarea value={form.cons} onChange={(e) => setForm({ ...form, cons: e.target.value })} placeholder="Минусы" />
          <textarea value={form.noteText} onChange={(e) => setForm({ ...form, noteText: e.target.value })} placeholder="Комментарий/голосовая заметка" />
          <div className="row">
            <button className="secondary" onClick={openScanner}>Сканировать</button>
            <button className="secondary" onClick={startVoiceInput}>Голосом</button>
            <label className="uploadBtn">Фото<input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadPhoto(e.target.files[0])} /></label>
            <button className="primary" disabled={loading || !form.name.trim()} onClick={saveProduct}>Сохранить</button>
          </div>
          {form.photoUrl && <img className="photoPreview" src={form.photoUrl} alt="uploaded" />}
        </div>
      </section>

      <section className="glass card">
        <h2>Поделиться базой</h2>
        <div className="row">
          <input value={shareEmails} onChange={(e) => setShareEmails(e.target.value)} placeholder="email1@mail.com, email2@mail.com" />
          <select value={shareRole} onChange={(e) => setShareRole(e.target.value as "viewer" | "editor")}>
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
          </select>
          <button className="primary" onClick={createShare}>Выдать доступ</button>
        </div>
        <div className="chips">{shares.map((s) => <span key={s.id} className="chip">{s.grantee_email} · {s.role}</span>)}</div>
      </section>

      <section className="glass card">
        <h2>Награды и поощрения</h2>
        <p className="subtle">Баллы: {rewards.totalPoints}</p>
        <div className="chips">{rewards.rewards.map((r) => <span key={r.id} className="chip">{r.title} +{r.points}</span>)}</div>
        {user.is_admin && (
          <div className="adminBox">
            <h3>Админка наград</h3>
            <div className="row">
              <button className="secondary" onClick={createRule}>Добавить правило</button>
              <button className="secondary" onClick={recalcRewards}>Пересчитать награды</button>
            </div>
            <div className="ruleList">
              {adminRules.map((rule) => (
                <span key={rule.key}>{rule.key} · {rule.activity_key} · {rule.target_count} · {rule.points} pts</span>
              ))}
            </div>
          </div>
        )}
      </section>

      {selectedRatings.length > 0 && (
        <section className="glass card">
          <h2>Рейтинги пользователей по выбранному продукту</h2>
          <div className="ruleList">
            {selectedRatings.map((r) => (
              <span key={r.id}>{r.owner_nickname}: {r.rating}/10, вкус {r.taste_rating ?? "—"}, качество {r.quality_rating ?? "—"}, цена {r.price_rating ?? "—"}</span>
            ))}
          </div>
        </section>
      )}

      {message && <p className="message">{message}</p>}

      {scannerOpen && (
        <Suspense fallback={<div className="scannerLoading">Загрузка сканера…</div>}>
          <BarcodeScanner
            onDetected={(barcode) => { setForm((prev) => ({ ...prev, barcode })); setScannerOpen(false); }}
            onClose={closeScanner}
            onError={(msg) => setMessage(msg)}
          />
        </Suspense>
      )}
    </main>
  );
}

export default App;
