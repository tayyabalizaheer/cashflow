import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OfflinePage } from "./pages/OfflinePage";
import { ProfilePage } from "./pages/ProfilePage";
import { RecordsPage } from "./pages/RecordsPage";
import { ZakatPage } from "./pages/ZakatPage";
import { useOnlineSync } from "./lib/useOnlineSync";

function Protected() {
  const { user } = useAuth();
  useOnlineSync(Boolean(user));
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/offline" element={<OfflinePage />} />
        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="expenses" element={<RecordsPage module="expenses" />} />
          <Route path="loans" element={<RecordsPage module="loans" />} />
          <Route path="investments" element={<RecordsPage module="investments" />} />
          <Route path="assets" element={<RecordsPage module="assets" />} />
          <Route path="zakat" element={<ZakatPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
