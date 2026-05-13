import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "ru";

type Dict = Record<string, string>;

const en: Dict = {
  appName: "Product Rating",
  search: "Search",
  myList: "My list",
  profile: "Profile",
  share: "Sharing",
  family: "Family",
  loginTitle: "Sign in",
  loginSubtitle: "Rate products you buy. Your data stays on your account.",
  email: "Email",
  sendMagicLink: "Email sign-in link",
  continueGoogle: "Continue with Google",
  logout: "Sign out",
  language: "Language",
  theme: "Appearance",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "System",
  scan: "Scan barcode",
  scannerHint: "Point the camera at a barcode. You can close anytime.",
  close: "Close",
  searchPlaceholder: "Search your ratings or catalog…",
  recent: "Recent",
  mine: "Your ratings",
  catalog: "Catalog",
  local: "Manual entries",
  noResults: "Nothing found yet",
  overall: "Overall impression",
  price: "Price",
  quality: "Quality",
  optional: "optional",
  comment: "Comment",
  save: "Save",
  photos: "Photos",
  addPhoto: "Add photo",
  othersCollapsed: "Others’ ratings",
  othersExpand: "Show",
  othersHide: "Hide",
  inviteEmail: "Invite by email",
  sendInvite: "Send invite",
  incoming: "Incoming",
  outgoing: "Outgoing",
  accept: "Accept",
  reject: "Reject",
  revoke: "Remove access",
  createFamily: "Create family group",
  groupName: "Group name",
  members: "Members",
  inviteMember: "Invite member",
  pending: "Pending",
  owner: "Owner",
  member: "Member",
  displayName: "Display name",
  saveProfile: "Save profile",
  ratingRequired: "Overall score is required (0–10).",
  newManual: "Add product manually",
  productName: "Product name",
  barcodeOptional: "Barcode (optional)",
  create: "Create",
  open: "Open",
  loadError: "Could not load. Check connection.",
  devMagicHint: "Dev: open the link from the response if email is not configured.",
  granted: "People you share with",
  loginEmailNotConfigured:
    "Email sign-in is not set up on the server. In Cloudflare → Worker → Variables and Secrets add RESEND_API_KEY (secret) and RESEND_FROM (e.g. onboarding@resend.dev or your verified domain sender).",
  loginGoogleNotConfigured:
    "Google sign-in is not configured. In Cloudflare add plain variable GOOGLE_CLIENT_ID and secret GOOGLE_CLIENT_SECRET; set the OAuth redirect URL to https://YOUR_DOMAIN/api/auth/google/callback.",
};

const ru: Dict = {
  appName: "Рейтинг продуктов",
  search: "Поиск",
  myList: "Мой список",
  profile: "Профиль",
  share: "Доступ",
  family: "Семья",
  loginTitle: "Вход",
  loginSubtitle: "Оценивайте покупки. Данные хранятся в вашем аккаунте.",
  email: "Почта",
  sendMagicLink: "Ссылка на почту",
  continueGoogle: "Войти через Google",
  logout: "Выйти",
  language: "Язык",
  theme: "Оформление",
  themeLight: "Светлая",
  themeDark: "Тёмная",
  themeSystem: "Как в системе",
  scan: "Сканировать штрих-код",
  scannerHint: "Наведите камеру на штрих-код. Можно закрыть в любой момент.",
  close: "Закрыть",
  searchPlaceholder: "Поиск по своим оценкам и каталогу…",
  recent: "Недавние",
  mine: "Ваши оценки",
  catalog: "Каталог",
  local: "Вручную",
  noResults: "Пока ничего не найдено",
  overall: "Общее впечатление",
  price: "Цена",
  quality: "Качество",
  optional: "необязательно",
  comment: "Комментарий",
  save: "Сохранить",
  photos: "Фото",
  addPhoto: "Добавить фото",
  othersCollapsed: "Оценки других",
  othersExpand: "Показать",
  othersHide: "Скрыть",
  inviteEmail: "Пригласить по email",
  sendInvite: "Отправить",
  incoming: "Входящие",
  outgoing: "Исходящие",
  accept: "Принять",
  reject: "Отклонить",
  revoke: "Отозвать доступ",
  createFamily: "Создать семейную группу",
  groupName: "Название группы",
  members: "Участники",
  inviteMember: "Пригласить участника",
  pending: "Ожидает",
  owner: "Владелец",
  member: "Участник",
  displayName: "Отображаемое имя",
  saveProfile: "Сохранить профиль",
  ratingRequired: "Нужна оценка общего впечатления (0–10).",
  newManual: "Добавить товар вручную",
  productName: "Название",
  barcodeOptional: "Штрих-код (необязательно)",
  create: "Создать",
  open: "Открыть",
  loadError: "Не удалось загрузить. Проверьте соединение.",
  devMagicHint: "Dev: откройте ссылку из ответа, если почта не настроена.",
  granted: "Кому открыт доступ",
  loginEmailNotConfigured:
    "Вход по почте не настроен на сервере. В Cloudflare → Worker → Variables and Secrets: добавьте секрет RESEND_API_KEY и переменную RESEND_FROM (например onboarding@resend.dev или отправитель с проверенного домена в Resend).",
  loginGoogleNotConfigured:
    "Вход через Google не настроен. В Cloudflare добавьте переменную GOOGLE_CLIENT_ID и секрет GOOGLE_CLIENT_SECRET; в Google Cloud укажите redirect URI: https://ВАШ_ДОМЕН/api/auth/google/callback.",
};

const I18nCtx = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: keyof typeof en) => string;
} | null>(null);

const STORAGE = "locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const s = localStorage.getItem(STORAGE) as Locale | null;
    return s === "ru" || s === "en" ? s : navigator.language.startsWith("ru") ? "ru" : "en";
  });
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE, l);
  }, []);
  const t = useCallback(
    (key: keyof typeof en) => {
      const table = locale === "ru" ? ru : en;
      return table[key] ?? en[key] ?? key;
    },
    [locale],
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const v = useContext(I18nCtx);
  if (!v) throw new Error("I18nProvider missing");
  return v;
}
