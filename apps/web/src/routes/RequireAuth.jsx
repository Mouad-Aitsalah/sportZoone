import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ROUTE_PATHS } from "./paths";
import { isAuthenticated } from "../store/authStore";

function RequireAuth() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return (
      <Navigate
        to={ROUTE_PATHS.LOGIN}
        replace
        state={{ from: location }}
      />
    );
  }

  return <Outlet />;
}

export default RequireAuth;
