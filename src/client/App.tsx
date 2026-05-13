import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import { FamilyPage } from "./pages/FamilyPage";
import { LoginPage } from "./pages/LoginPage";
import { ManualProductPage } from "./pages/ManualProductPage";
import { MyListPage } from "./pages/MyListPage";
import { ProductPage } from "./pages/ProductPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SearchPage } from "./pages/SearchPage";
import { SharePage } from "./pages/SharePage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<SearchPage />} />
          <Route path="/my" element={<MyListPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/share" element={<SharePage />} />
          <Route path="/family" element={<FamilyPage />} />
          <Route path="/product/manual" element={<ManualProductPage />} />
          <Route path="/product/:productId" element={<ProductPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
