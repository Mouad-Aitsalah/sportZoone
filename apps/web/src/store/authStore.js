const AUTH_STORAGE_KEY = "multipos-auth";
const TOKEN_STORAGE_KEY = "token";
const USER_STORAGE_KEY = "user";

function buildDisplayName(email) {
  const localPart = email.split("@")[0] || "team member";

  return localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();

  if (normalizedRole === "super_admin" || normalizedRole === "super-admin") {
    return "super_admin";
  }

  if (normalizedRole === "admin_global" || normalizedRole === "admin-global") {
    return "admin_global";
  }

  if (normalizedRole === "admin") {
    return "admin";
  }

  if (["employee", "employe", "caissier", "cashier"].includes(normalizedRole)) {
    return "employe";
  }

  return normalizedRole || "employe";
}

function normalizeUser(user) {
  const email = user.email?.trim().toLowerCase() || "";
  const name = user.name || user.nom || buildDisplayName(email || "team member");
  const storeId =
    user.storeId ?? user.pointDeVenteId ?? user.pointDeVente?.id ?? null;
  const storeName =
    user.storeName ?? user.pointDeVente?.nom ?? user.store?.name ?? null;
  const organisationName =
    user.organisationName ?? user.organisation?.name ?? user.organisation?.nom ?? null;
  const cashRegisterId = user.cashRegisterId ?? user.caisseId ?? user.caisse?.id ?? null;
  const cashRegisterName =
    user.cashRegisterName ?? user.caisse?.nom ?? user.cashRegister?.name ?? null;

  return {
    ...user,
    email,
    name,
    role: normalizeRole(user.role),
    organisationName,
    storeId,
    storeName,
    cashRegisterId,
    cashRegisterName,
  };
}

function readAuthState() {
  try {
    const storedValue = localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedValue) {
      return JSON.parse(storedValue);
    }

    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    const user = storedUser ? JSON.parse(storedUser) : null;

    return token && user ? { token, user } : null;
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function saveAuthSession(token, user) {
  const normalizedUser = normalizeUser(user);
  const authState = {
    token,
    user: normalizedUser,
  };

  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUser));
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
  return authState;
}

export function getCurrentUser() {
  const user = readAuthState()?.user;
  return user ? normalizeUser(user) : null;
}

export function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}

export function isCashierRole(role) {
  return normalizeRole(role) === "employe";
}

export function getAuthToken() {
  return readAuthState()?.token || null;
}

export function isAuthenticated() {
  return Boolean(getCurrentUser() && getAuthToken());
}

export function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}
