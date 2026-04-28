import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import DashboardPage from "./pages/DashboardPage";
import CustomersPage from "./pages/CustomersPage";
import LoginPage from "./pages/LoginPage";
import PosPage from "./pages/PosPage";
import ProductsPage from "./pages/ProductsPage";
import ReportsPage from "./pages/ReportsPage";
import SalesHistoryPage from "./pages/SalesHistoryPage";
import StockPage from "./pages/StockPage";
import StoresPage from "./pages/StoresPage";
import SuppliersPage from "./pages/SuppliersPage";
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
              <Route path={ROUTE_PATHS.SUPPLIERS} element={<SuppliersPage />} />
              <Route path={ROUTE_PATHS.SALES} element={<SalesHistoryPage />} />
              <Route path={ROUTE_PATHS.REPORTS} element={<ReportsPage />} />
              <Route path={ROUTE_PATHS.USERS} element={<UsersPage />} />
              <Route path={ROUTE_PATHS.STORES} element={<StoresPage />} />
              <Route path={ROUTE_PATHS.CUSTOMERS} element={<CustomersPage />} />
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
