import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/authprovider";
import { AppUpdatePrompt } from "./components/appupdateprompt";
import { Layout } from "./components/layout";
import { ThemeProvider } from "./components/themeprovider";
import { AuthPage } from "./pages/authpage";
import { CurrencySettingsPage } from "./pages/currencysettingspage";
import { Dashboard } from "./pages/dashboard";
import { ExpenseDetailPage } from "./pages/expensedetailpage";
import { LoanDetailPage } from "./pages/loandetailpage";
import { LoansPage } from "./pages/loanspage";
import { NotFoundPage } from "./pages/notfoundpage";
import { OfflinePage } from "./pages/offlinepage";
import { ProfilePage } from "./pages/profilepage";
import { RecordsPage } from "./pages/recordspage";
import { SettingsPage } from "./pages/settingspage";
import { StocksPage } from "./pages/stockspage";
import { TrashPage } from "./pages/trashpage";
import { ZakatPage } from "./pages/zakatpage";
import { useOnlineSync } from "./lib/useonlinesync";

function Protected() {
  const { user, localAvailable, initializing } = useAuth();
  useOnlineSync(Boolean(user));
  if (initializing)
    return (
      <div className="center-page">
        <div className="empty-state">Checking session...</div>
      </div>
    );
  if (!user && !localAvailable) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppUpdatePrompt />
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route path="/l/:shareId" element={<LoanDetailPage />} />
          <Route element={<Protected />}>
            <Route index element={<Dashboard />} />
            <Route
              path="expenses"
              element={<RecordsPage module="expenses" />}
            />
            <Route path="expenses/:expenseId" element={<ExpenseDetailPage />} />
            <Route path="loans" element={<LoansPage />} />
            <Route path="loans/:loanId" element={<LoanDetailPage />} />
            <Route
              path="investments"
              element={<RecordsPage module="investments" />}
            />
            <Route path="stocks" element={<StocksPage />} />
            <Route path="assets" element={<RecordsPage module="assets" />} />
            <Route path="zakat" element={<ZakatPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/profile" element={<ProfilePage />} />
            <Route
              path="settings/currencies"
              element={<CurrencySettingsPage />}
            />
            <Route path="settings/trash" element={<TrashPage />} />
            <Route
              path="profile"
              element={<Navigate to="/settings/profile" replace />}
            />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
