import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";
import { ROUTE_PATHS } from "../routes/paths";
import { isAuthenticated, saveAuthSession } from "../store/authStore";

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: "admin@multipos.com",
    password: "123456",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const redirectPath = location.state?.from?.pathname || ROUTE_PATHS.DASHBOARD;

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(redirectPath, { replace: true });
    }
  }, [navigate, redirectPath]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setErrorMessage("");
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setIsLoading(true);
      setErrorMessage("");

      const response = await api.post("/auth/login", {
        email: formData.email,
        password: formData.password,
      });
      const { token, user } = response.data;

      saveAuthSession(token, user);
      navigate(redirectPath, { replace: true });
    } catch (error) {
      setErrorMessage(
        error.response?.data?.message ||
          "Login failed. Please check your email and password."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-showcase">
          <span className="brand-badge">Retail Command Center</span>
          <h1 className="login-title">Run every point of sale from one clean workspace.</h1>
          <p className="login-subtitle">
            Monitor revenue, manage products, and process checkout activity for
            all stores with a professional back-office experience.
          </p>

          <div className="login-highlight-grid">
            <div className="highlight-card">
              <strong>4 Stores</strong>
              <span>Live synchronized operations</span>
            </div>
            <div className="highlight-card">
              <strong>24/7 Access</strong>
              <span>Desktop-first interface for teams</span>
            </div>
            <div className="highlight-card">
              <strong>Stock Control</strong>
              <span>Unified product visibility</span>
            </div>
            <div className="highlight-card">
              <strong>Fast Checkout</strong>
              <span>Barcode-based cashier workflow</span>
            </div>
          </div>
        </section>

        <div className="login-card">
          <p className="login-card-eyebrow">Welcome back</p>
          <h2 className="login-form-title">Sign in</h2>
          <p className="helper-text">
            Sign in with your backend account to access the dashboard.
          </p>

          {errorMessage ? (
            <div className="inline-notice error">{errorMessage}</div>
          ) : null}

          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="text-input"
                type="email"
                name="email"
                placeholder="admin@multipos.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="text-input"
                type="password"
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>

            <button
              className="primary-button full-width-button"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Login to dashboard"}
            </button>
          </form>

          <div className="login-footer-note">
            <span>Admin demo:</span>
            <strong>admin@multipos.com</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
