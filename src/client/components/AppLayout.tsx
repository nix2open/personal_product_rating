import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../i18n";

export function AppLayout() {
  const { t } = useI18n();
  return (
    <>
      <Outlet />
      <nav className="bottom-nav">
        <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "")} end>
          {t("search")}
        </NavLink>
        <NavLink to="/my" className={({ isActive }) => (isActive ? "active" : "")}>
          {t("myList")}
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
          {t("profile")}
        </NavLink>
      </nav>
    </>
  );
}
