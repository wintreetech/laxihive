import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, ToastProvider } from "./lib/api";
import { ErrorBoundary, Loading } from "./components/UI";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
const Play = lazy(() => import("./pages/Play"));
const Daily = lazy(() =>
  import("./pages/Play").then((m) => ({ default: m.Daily })),
);
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Player"));
const Achievements = lazy(() =>
  import("./pages/Player").then((m) => ({ default: m.Achievements })),
);
const Settings = lazy(() =>
  import("./pages/Player").then((m) => ({ default: m.Settings })),
);
const Store = lazy(() => import("./pages/Store"));
const Wallet = lazy(() =>
  import("./pages/Store").then((m) => ({ default: m.Wallet })),
);
const Expansions = lazy(() =>
  import("./pages/Store").then((m) => ({ default: m.Expansions })),
);
const PurchaseHistory = lazy(() =>
  import("./pages/Store").then((m) => ({ default: m.PurchaseHistory })),
);
const PurchaseStatus = lazy(() =>
  import("./pages/Store").then((m) => ({ default: m.PurchaseStatus })),
);
const Leaderboards = lazy(() => import("./pages/Leaderboards"));
const Admin = lazy(() => import("./pages/Admin"));
const Info = lazy(() => import("./pages/Info"));
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30000 },
  },
});
function GameRoute() {
  const location = useLocation();
  return <Play key={location.pathname + location.search} />;
}
export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="games" element={<Catalog />} />
                    <Route path="games/:slug" element={<GameRoute />} />
                    <Route path="daily" element={<Daily />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="profile" element={<Dashboard profile />} />
                    <Route path="achievements" element={<Achievements />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="store" element={<Store />} />
                    <Route path="wallet" element={<Wallet />} />
                    <Route path="expansions" element={<Expansions />} />
                    <Route path="leaderboards" element={<Leaderboards />} />
                    <Route
                      path="purchase-history"
                      element={<PurchaseHistory />}
                    />
                    <Route
                      path="purchase/success"
                      element={<PurchaseStatus />}
                    />
                    <Route
                      path="purchase/cancelled"
                      element={<PurchaseStatus cancelled />}
                    />
                    <Route path="login" element={<Auth mode="login" />} />
                    <Route path="signup" element={<Auth mode="signup" />} />
                    <Route
                      path="forgot-password"
                      element={<Auth mode="forgot" />}
                    />
                    <Route
                      path="reset-password"
                      element={<Auth mode="reset" />}
                    />
                    <Route
                      path="verify-email"
                      element={<Auth mode="verify" />}
                    />
                    <Route path="admin" element={<Admin />} />
                    <Route path="*" element={<Info />} />
                  </Route>
                </Routes>
              </Suspense>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
