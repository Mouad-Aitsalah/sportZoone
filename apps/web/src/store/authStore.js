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
  const normalizedUser = {
    ...user,
    email: user.email?.trim().toLowerCase() || "",
    name: user.name || buildDisplayName(user.email || "team member"),
  };
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
  return readAuthState()?.user || null;
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
