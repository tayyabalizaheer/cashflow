import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

function refreshedQueryKeys(path: string) {
  const pathOnly = path.split("?")[0] ?? path;
  const keys: unknown[][] = [["dashboard"]];

  if (pathOnly === "/expenses" || pathOnly.startsWith("/expenses/")) {
    keys.push(
      ["expenses"],
      ["expense-purposes"],
      ["categories"],
      ["assets"],
      ["trash"],
    );
    const expenseId = pathOnly.match(/^\/expenses\/([^/]+)(?:\/|$)/)?.[1];
    if (expenseId) keys.push(["expense", expenseId]);
  } else if (
    pathOnly === "/loans" ||
    pathOnly.startsWith("/loans/") ||
    pathOnly.startsWith("/public/loans/")
  ) {
    keys.push(["loans"], ["loan-purposes"], ["trash"]);
    const loanId = pathOnly.match(/^\/loans\/([^/]+)(?:\/|$)/)?.[1];
    if (loanId) keys.push(["loan", loanId]);
  } else if (
    pathOnly === "/investments" ||
    pathOnly.startsWith("/investments/")
  ) {
    keys.push(["investments"], ["trash"]);
  } else if (pathOnly === "/assets" || pathOnly.startsWith("/assets/")) {
    keys.push(["assets"], ["trash"]);
  } else if (pathOnly === "/categories") {
    keys.push(["categories"]);
  } else if (pathOnly === "/user-currencies") {
    keys.push(["user-currencies"]);
  } else if (pathOnly === "/currencies") {
    keys.push(["currencies"]);
  } else if (pathOnly.startsWith("/trash/") || pathOnly === "/trash") {
    keys.push(["trash"], ["expenses"], ["loans"], ["investments"], ["assets"]);
  }

  return keys;
}

function allLocalQueryKeys() {
  return [
    ["dashboard"],
    ["expenses"],
    ["loans"],
    ["investments"],
    ["assets"],
    ["categories"],
    ["user-currencies"],
    ["currencies"],
    ["expense-purposes"],
    ["loan-purposes"],
    ["trash"],
  ];
}

function LocalDataRefreshListener() {
  const queryClient = useQueryClient();

  useEffect(() => {
    function invalidateKeys(queryKeys: unknown[][]) {
      queryKeys.forEach((queryKey) => {
        void queryClient.invalidateQueries({
          queryKey,
          refetchType: "active",
        });
      });
    }

    const onLocalDataRefreshed = (event: Event) => {
      const path =
        event instanceof CustomEvent && typeof event.detail?.path === "string"
          ? event.detail.path
          : "";
      invalidateKeys(refreshedQueryKeys(path));
    };

    const onOfflineSyncFlushed = () => {
      invalidateKeys(allLocalQueryKeys());
    };

    const onOnlineSyncChecked = () => {
      invalidateKeys(allLocalQueryKeys());
    };

    window.addEventListener(
      "cash-flow:local-data-refreshed",
      onLocalDataRefreshed,
    );
    window.addEventListener(
      "cash-flow:offline-sync-flushed",
      onOfflineSyncFlushed,
    );
    window.addEventListener(
      "cash-flow:online-sync-checked",
      onOnlineSyncChecked,
    );
    return () => {
      window.removeEventListener(
        "cash-flow:local-data-refreshed",
        onLocalDataRefreshed,
      );
      window.removeEventListener(
        "cash-flow:offline-sync-flushed",
        onOfflineSyncFlushed,
      );
      window.removeEventListener(
        "cash-flow:online-sync-checked",
        onOnlineSyncChecked,
      );
    };
  }, [queryClient]);

  return null;
}

function ModalScrollLock() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    function syncModalState() {
      const hasModal = Boolean(document.querySelector(".modal-backdrop"));
      html.classList.toggle("modal-open", hasModal);
      body.classList.toggle("modal-open", hasModal);
    }

    const observer = new MutationObserver(syncModalState);
    observer.observe(body, { childList: true, subtree: true });
    syncModalState();

    return () => {
      observer.disconnect();
      html.classList.remove("modal-open");
      body.classList.remove("modal-open");
    };
  }, []);

  return null;
}

function Protected() {
  const { user, localAvailable, loginRequired } = useAuth();
  useOnlineSync(Boolean(user));
  if (!user && (loginRequired || localAvailable === false))
    return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ModalScrollLock />
        <LocalDataRefreshListener />
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
