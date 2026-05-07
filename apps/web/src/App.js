import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ComptesPage from "./pages/ComptesPage";
import MainLayout from "./layouts/MainLayout";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import PosPage from "./pages/PosPage";
import OrganisationsPage from "./pages/OrganisationsPage";
import PurchasesPage from "./pages/PurchasesPage";
import ProductsPage from "./pages/ProductsPage";
import ReportsPage from "./pages/ReportsPage";
import SalesHistoryPage from "./pages/SalesHistoryPage";
import StockPage from "./pages/StockPage";
import UsersPage from "./pages/UsersPage";
import RequireAuth from "./routes/RequireAuth";
import { ROUTE_PATHS } from "./routes/paths";
import { CartProvider } from "./store/cartStore";

function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Routes>
          <Route path={ROUTE_PATHS.LOGIN} element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<MainLayout />}>
              <Route path={ROUTE_PATHS.DASHBOARD} element={<DashboardPage />} />
              <Route path={ROUTE_PATHS.POS} element={<PosPage />} />
              <Route path={ROUTE_PATHS.PRODUCTS} element={<ProductsPage />} />
              <Route path={ROUTE_PATHS.STOCK} element={<StockPage />} />
              <Route path={ROUTE_PATHS.COMPTES} element={<ComptesPage />} />
              <Route
                path={ROUTE_PATHS.SUPPLIERS}
                element={<Navigate to={ROUTE_PATHS.COMPTES} replace />}
              />
              <Route path={ROUTE_PATHS.SALES} element={<SalesHistoryPage />} />
              <Route path={ROUTE_PATHS.REPORTS} element={<ReportsPage />} />
              <Route path={ROUTE_PATHS.USERS} element={<UsersPage />} />
              <Route
                path={ROUTE_PATHS.ORGANISATIONS}
                element={<OrganisationsPage />}
              />
              <Route
                path={ROUTE_PATHS.STORES}
                element={<Navigate to={ROUTE_PATHS.DASHBOARD} replace />}
              />
              <Route
                path={ROUTE_PATHS.CUSTOMERS}
                element={<Navigate to={ROUTE_PATHS.COMPTES} replace />}
              />
              <Route path={ROUTE_PATHS.PURCHASES} element={<PurchasesPage />} />
            </Route>
          </Route>

          <Route
            path="*"
            element={<Navigate to={ROUTE_PATHS.LOGIN} replace />}
          />
        </Routes>
      </BrowserRouter>
    </CartProvider>
  );
}

export default App;
