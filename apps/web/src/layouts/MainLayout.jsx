import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import sportZoneLogo from "../assets/sportzone-logo.jpeg";
import { getCurrentUser, logout } from "../store/authStore";
import { ROUTE_PATHS } from "../routes/paths";


const navigationItems = [
  {
    label: "Dashboard",
    description: "Vue globale des ventes et operations.",
    path: ROUTE_PATHS.DASHBOARD,
    index: "01",
    roles: ["admin"],
  },
  {
    label: "POS / Caisse",
    description: "Encaissement et passage en caisse.",
    path: ROUTE_PATHS.POS,
    index: "02",
    roles: ["admin", "employe"],
  },
  {
    label: "Products / Produits",
    description: "Catalogue, prix et produits.",
    path: ROUTE_PATHS.PRODUCTS,
    index: "03",
    roles: ["admin", "employe"],
  },
  {
    label: "Stock",
    description: "Niveaux et ajustements de stock.",
    path: ROUTE_PATHS.STOCK,
    index: "04",
    roles: ["admin", "employe"],
  },
  {
    label: "Comptes",
    description: "Clients centralises.",
    path: ROUTE_PATHS.COMPTES,
    index: "05",
    roles: ["admin", "employe"],
  },
  {
    label: "Sales History / Historique ventes",
    description: "Tickets, ventes et synchronisation.",
    path: ROUTE_PATHS.SALES,
    index: "06",
    roles: ["admin", "employe"],
  },
  {
    label: "Reports / Rapports",
    description: "Analyse jour, semaine et mois.",
    path: ROUTE_PATHS.REPORTS,
    index: "07",
    roles: ["admin"],
  },
  {
    label: "Users / Utilisateurs",
    description: "Profils, roles et affectations.",
    path: ROUTE_PATHS.USERS,
    index: "08",
    roles: ["admin"],
  },
  {
    label: "Organisations",
    description: "Creer et piloter les organisations SportZone.",
    path: ROUTE_PATHS.ORGANISATIONS,
    index: "09",
    roles: ["super_admin", "admin_global"],
  },
  {
    label: "Achat / Achats",
    description: "Achats aupres des fournisseurs.",
    path: ROUTE_PATHS.PURCHASES,
    index: "11",
    roles: ["admin"],
  },
  {
    label: "Charges / Depenses",
    description: "Suivi des depenses du magasin.",
    path: ROUTE_PATHS.EXPENSES,
    index: "12",
    roles: ["admin", "super_admin", "admin_global"],
  },
];

const sectionHighlights = {
  [ROUTE_PATHS.DASHBOARD]: {
    title: "Pilotage du magasin",
    subtitle: "Suivi en temps reel des ventes et du stock SportZone.",
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
  [ROUTE_PATHS.COMPTES]: {
    title: "Gestion des clients",
    subtitle: "Centraliser les clients du magasin dans un seul module.",
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
  [ROUTE_PATHS.ORGANISATIONS]: {
    title: "Gestion des organisations",
    subtitle: "Creer de nouvelles organisations et suivre leur structure.",
  },
  [ROUTE_PATHS.PURCHASES]: {
    title: "Gestion des achats",
    subtitle: "Enregistrer les approvisionnements fournisseurs et leur impact magasin.",
  },
  [ROUTE_PATHS.EXPENSES]: {
    title: "Suivi des charges",
    subtitle: "Centraliser les depenses du magasin et leur impact financier.",
  },
};

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = getCurrentUser();
  const visibleNavigationItems = navigationItems.filter((item) =>
    item.roles.includes(currentUser?.role || "employe")
  );
  const activeSection =
    visibleNavigationItems.find((item) => item.path === location.pathname) ||
    visibleNavigationItems[0] ||
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
  const displayRole =
    currentUser?.role === "super_admin"
      ? "super admin"
      : currentUser?.role === "admin_global"
      ? "admin global"
      : currentUser?.role === "admin"
      ? "admin"
      : "caissier";
  const organisationName = currentUser?.organisationName || currentUser?.storeName || "SportZone";
  const accessLabel =
    currentUser?.role === "super_admin" || currentUser?.role === "admin_global"
      ? "Pilotage global SportZone"
      : currentUser?.role === "admin"
      ? organisationName
      : [
          currentUser?.storeName || organisationName,
          currentUser?.cashRegisterName || "Caisse 1",
        ]
          .filter(Boolean)
          .join(" - ") || organisationName;

  const handleLogout = () => {
    logout();
    navigate(ROUTE_PATHS.LOGIN, { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <img
            className="brand-logo"
            src={sportZoneLogo}
            alt="SportZone"
            style={{
              display: "block",
              width: "78px",
              maxWidth: "100%",
              height: "auto",
              margin: "0 auto 14px",
            }}
          />
          <span className="brand-badge">{organisationName}</span>
          <h1 className="brand-title">SportZone Manager</h1>
          <p className="brand-subtitle">
            Centraliser les ventes, le stock, les clients, les utilisateurs et
            la caisse de l'organisation connectee.
          </p>
        </div>

        <nav className="sidebar-nav">
          {visibleNavigationItems.map((item) => (
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
            Stock, tickets, clients et performances sont accessibles depuis une
            meme interface.
          </p>
        </div>
      </aside>

      <main className="content-area">
        <div className="content-shell">
          <section className="dashboard-header">
            <div className="dashboard-header-top">
              <div className="dashboard-header-copy">
                <p className="topbar-title">{activeSection.label}</p>
                <h1 className="dashboard-header-title">{sectionHighlight.title}</h1>
                <p className="dashboard-header-subtitle">
                  {sectionHighlight.subtitle}
                </p>
              </div>

              <div className="dashboard-header-user">
                <div className="topbar-card user-card">
                  <div className="user-avatar">{initials}</div>
                  <div>
                    <p className="topbar-label">Utilisateur connecte</p>
                    <p className="topbar-value">
                      {currentUser?.name || "Demo User"}
                    </p>
                    <p className="topbar-meta">{displayRole}</p>
                    <p className="topbar-meta">{accessLabel}</p>
                  </div>
                </div>

                <button
                  className="ghost-button header-logout-button"
                  type="button"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            </div>

            <div className="dashboard-header-grid">
              <div className="topbar-card header-stat-card compact-header-card">
                <div className="header-card-row">
                  <div>
                    <p className="topbar-label">Business snapshot</p>
                    <p className="topbar-value">{organisationName}</p>
                  </div>
                  <span className="header-card-aside">Organisation active</span>
                </div>
              </div>

              <div className="topbar-card header-stat-card compact-header-card status-header-card">
                <span className="system-status-indicator">
                  <span className="system-status-dot" />
                  En ligne
                </span>
                <div className="header-card-row">
                  <div>
                    <p className="topbar-label">System status</p>
                    <p className="topbar-value">Operations stables</p>
                  </div>
                </div>
              </div>

              <div className="topbar-card header-stat-card compact-header-card">
                <div className="header-card-row">
                  <div>
                    <p className="topbar-label">Today focus</p>
                    <p className="topbar-value">{activeSection.label}</p>
                  </div>
                  <span className="header-card-aside">Priorite du jour</span>
                </div>
                <p className="topbar-meta compact-meta">{activeSection.description}</p>
              </div>
            </div>
          </section>

          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default MainLayout;
