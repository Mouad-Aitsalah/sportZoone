import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, logout } from "../store/authStore";
import { ROUTE_PATHS } from "../routes/paths";

const navigationItems = [
  {
    label: "Dashboard",
    description: "Vue globale des ventes et operations.",
    path: ROUTE_PATHS.DASHBOARD,
    index: "01",
  },
  {
    label: "POS / Caisse",
    description: "Encaissement et passage en caisse.",
    path: ROUTE_PATHS.POS,
    index: "02",
  },
  {
    label: "Products / Produits",
    description: "Catalogue, prix et produits.",
    path: ROUTE_PATHS.PRODUCTS,
    index: "03",
  },
  {
    label: "Stock",
    description: "Niveaux et ajustements de stock.",
    path: ROUTE_PATHS.STOCK,
    index: "04",
  },
  {
    label: "Suppliers / Fournisseurs",
    description: "Contacts et partenaires fournisseurs.",
    path: ROUTE_PATHS.SUPPLIERS,
    index: "05",
  },
  {
    label: "Sales History / Historique ventes",
    description: "Tickets, ventes et synchronisation.",
    path: ROUTE_PATHS.SALES,
    index: "06",
  },
  {
    label: "Reports / Rapports",
    description: "Analyse jour, semaine et mois.",
    path: ROUTE_PATHS.REPORTS,
    index: "07",
  },
  {
    label: "Users / Utilisateurs",
    description: "Profils, roles et affectations.",
    path: ROUTE_PATHS.USERS,
    index: "08",
  },
  {
    label: "Stores / Points de vente",
    description: "Performance des points de vente.",
    path: ROUTE_PATHS.STORES,
    index: "09",
  },
];

const sectionHighlights = {
  [ROUTE_PATHS.DASHBOARD]: {
    title: "Pilotage multi-magasins",
    subtitle: "Suivi en temps reel des ventes et de la disponibilite stock.",
  },
  [ROUTE_PATHS.POS]: {
    title: "Encaissement rapide",
    subtitle: "Fluidifier le passage caisse et la validation paiement.",
  },
  [ROUTE_PATHS.PRODUCTS]: {
    title: "Catalogue unifie",
    subtitle: "Produits, prix et referencements centralises.",
  },
  [ROUTE_PATHS.STOCK]: {
    title: "Controle stock",
    subtitle: "Identifier les seuils critiques et corriger rapidement.",
  },
  [ROUTE_PATHS.SUPPLIERS]: {
    title: "Gestion fournisseurs",
    subtitle: "Conserver les contacts et le portefeuille d'approvisionnement.",
  },
  [ROUTE_PATHS.SALES]: {
    title: "Tracabilite des ventes",
    subtitle: "Consulter les tickets et les details de chaque transaction.",
  },
  [ROUTE_PATHS.REPORTS]: {
    title: "Analyse decisionnelle",
    subtitle: "Comparer les performances par periode et par magasin.",
  },
  [ROUTE_PATHS.USERS]: {
    title: "Gestion equipe",
    subtitle: "Suivre les utilisateurs, roles et statuts d'activite.",
  },
  [ROUTE_PATHS.STORES]: {
    title: "Reseau de magasins",
    subtitle: "Surveiller les points de vente et leur revenu du jour.",
  },
};

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = getCurrentUser();
  const activeSection =
    navigationItems.find((item) => item.path === location.pathname) ||
    navigationItems[0];
  const sectionHighlight =
    sectionHighlights[location.pathname] ||
    sectionHighlights[ROUTE_PATHS.DASHBOARD];
  const initials = currentUser?.name
    ? currentUser.name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "MP";

  const handleLogout = () => {
    logout();
    navigate(ROUTE_PATHS.LOGIN, { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-badge">4 Points de vente actifs</span>
          <h1 className="brand-title">Multi-POS Manager</h1>
          <p className="brand-subtitle">
            Centraliser les ventes, le stock, les utilisateurs et la caisse sur
            l'ensemble du reseau.
          </p>
        </div>

        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              className={({ isActive }) =>
                isActive ? "sidebar-link active" : "sidebar-link"
              }
              to={item.path}
            >
              <div>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </div>
              <span className="sidebar-link-index">{item.index}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-note">
          <h3>Operations Pulse</h3>
          <p>
            Stock, tickets, fournisseurs et performances sont accessibles depuis
            une meme interface.
          </p>
        </div>
      </aside>

      <main className="content-area">
        <div className="topbar-shell">
          <div>
            <p className="topbar-title">{activeSection.label}</p>
            <p className="topbar-subtitle">{sectionHighlight.title}</p>
          </div>

          <div className="topbar-actions">
            <div className="topbar-chip">Systeme en ligne</div>

            <div className="topbar-card user-card">
              <div className="user-avatar">{initials}</div>
              <div>
                <p className="topbar-label">Utilisateur connecte</p>
                <p className="topbar-value">{currentUser?.name || "Demo User"}</p>
                <p className="topbar-meta">
                  {currentUser?.role || "employe"} -{" "}
                  {currentUser?.email || "employee@multipos.com"}
                </p>
              </div>
            </div>

            <button
              className="ghost-button"
              type="button"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>

        <div className="topbar">
          <div className="topbar-card">
            <div>
              <p className="topbar-label">Business snapshot</p>
              <p className="topbar-value">4 magasins suivis</p>
              <p className="topbar-meta">{sectionHighlight.subtitle}</p>
            </div>
          </div>

          <div className="topbar-card">
            <div>
              <p className="topbar-label">Today focus</p>
              <p className="topbar-value">{activeSection.label}</p>
              <p className="topbar-meta">Execution rapide et supervision continue</p>
            </div>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
