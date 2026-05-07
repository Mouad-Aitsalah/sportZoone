import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import sportZoneLogo from "../assets/sportzone-logo.jpeg";
import api from "../services/api";
import { ROUTE_PATHS } from "../routes/paths";
import { getCurrentUser, isAuthenticated, saveAuthSession } from "../store/authStore";

const resolveNextPath = (role, redirectPath) => {
  if (role === "super_admin" || role === "admin_global") {
    return ROUTE_PATHS.ORGANISATIONS;
  }

  return role === "admin" ? redirectPath : ROUTE_PATHS.POS;
};

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const redirectPath = location.state?.from?.pathname || ROUTE_PATHS.DASHBOARD;

  useEffect(() => {
    if (isAuthenticated()) {
      const currentUser = getCurrentUser();
      const nextPath = resolveNextPath(currentUser?.role, redirectPath);
      navigate(nextPath, { replace: true });
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
      const nextPath = resolveNextPath(user?.role, redirectPath);

      saveAuthSession(token, user);
      navigate(nextPath, { replace: true });
    } catch (error) {
      if (false) {
        setErrorMessage(
          "Votre demande d'accès a été envoyée. Attendez la validation de l'administrateur."
        );
      } else {
        setErrorMessage("Email ou mot de passe incorrect.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-showcase">
          <span className="brand-badge">Sport Store POS</span>
          <h1 className="login-title">
            Pilotez SportZone depuis une interface caisse simple et rapide.
          </h1>
          <p className="login-subtitle">
            Suivez les ventes, gerez les produits de sport et encaissez pour
            chaque organisation SportZone depuis une experience back-office claire.
          </p>

          <div className="login-highlight-grid">
            <div className="highlight-card">
              <strong>2 Organisations</strong>
              <span>Rabat et Casa en activite</span>
            </div>
            <div className="highlight-card">
              <strong>24/7 Access</strong>
              <span>Desktop-first interface for teams</span>
            </div>
            <div className="highlight-card">
              <strong>Stock Control</strong>
              <span>Stock SportZone en direct</span>
            </div>
            <div className="highlight-card">
              <strong>Fast Checkout</strong>
              <span>Flux caisse avec code-barres</span>
            </div>
          </div>
        </section>

        <div className="login-card">
          <img
            className="login-logo"
            src={sportZoneLogo}
            alt="SportZone"
            style={{
              display: "block",
              width: "90px",
              maxWidth: "100%",
              height: "auto",
              margin: "0 auto 18px",
            }}
          />
          <p className="login-card-eyebrow">SportZone</p>
          <h2 className="login-form-title">Connexion</h2>
          <p className="helper-text">
            Connectez-vous avec votre compte pour acceder au dashboard.
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
                placeholder="admin@sportzone.local"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="password">
                Mot de passe
              </label>
              <input
                id="password"
                className="text-input"
                type="password"
                name="password"
                placeholder="Saisir votre mot de passe"
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
              {isLoading ? "Connexion..." : "Acceder au dashboard"}
            </button>
          </form>

          <div className="login-footer-note">
            <span>Super admin demo:</span>
            <strong>superadmin@sportzone.local</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
