import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { AppUpdatePrompt } from "./components/AppUpdatePrompt";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { CurrencySettingsPage } from "./pages/CurrencySettingsPage";
import { Dashboard } from "./pages/Dashboard";
import { ExpenseDetailPage } from "./pages/ExpenseDetailPage";
import { LoanDetailPage } from "./pages/LoanDetailPage";
import { LoansPage } from "./pages/LoansPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OfflinePage } from "./pages/OfflinePage";
import { ProfilePage } from "./pages/ProfilePage";
import { RecordsPage } from "./pages/RecordsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StocksPage } from "./pages/StocksPage";
import { TrashPage } from "./pages/TrashPage";
import { ZakatPage } from "./pages/ZakatPage";
import { useOnlineSync } from "./lib/useOnlineSync";

function Protected() {
  const { user, initializing } = useAuth();
  useOnlineSync(Boolean(user));
  if (initializing) return <div className="center-page"><div className="empty-state">Checking session...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppUpdatePrompt />
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/offline" element={<OfflinePage />} />
        <Route path="/l/:shareId" element={<LoanDetailPage />} />
        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="expenses" element={<RecordsPage module="expenses" />} />
          <Route path="expenses/:expenseId" element={<ExpenseDetailPage />} />
          <Route path="loans" element={<LoansPage />} />
          <Route path="loans/:loanId" element={<LoanDetailPage />} />
          <Route path="investments" element={<RecordsPage module="investments" />} />
          <Route path="stocks" element={<StocksPage />} />
          <Route path="assets" element={<RecordsPage module="assets" />} />
          <Route path="zakat" element={<ZakatPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/profile" element={<ProfilePage />} />
          <Route path="settings/currencies" element={<CurrencySettingsPage />} />
          <Route path="settings/trash" element={<TrashPage />} />
          <Route path="profile" element={<Navigate to="/settings/profile" replace />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
