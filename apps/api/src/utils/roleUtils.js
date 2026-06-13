const normalizeUserRole = (role) => {
  const normalizedRole = String(role || "").trim().toUpperCase();

  if (normalizedRole === "CAISSIER" || normalizedRole === "CASHIER") {
    return "EMPLOYE";
  }

  return normalizedRole;
};

const ROLE_HIERARCHY = {
  SUPER_ADMIN: ["SUPER_ADMIN", "ADMIN_GLOBAL", "ADMIN", "EMPLOYE"],
  ADMIN_GLOBAL: ["ADMIN_GLOBAL", "ADMIN", "EMPLOYE"],
  ADMIN: ["ADMIN", "EMPLOYE"],
  EMPLOYE: ["EMPLOYE"],
};

const hasRequiredRole = (userRole, allowedRoles = []) => {
  const normalizedUserRole = normalizeUserRole(userRole);
  const inheritedRoles = ROLE_HIERARCHY[normalizedUserRole] || [normalizedUserRole];

  return allowedRoles.some(
    (allowedRole) => inheritedRoles.includes(normalizeUserRole(allowedRole))
  );
};

module.exports = {
  hasRequiredRole,
  normalizeUserRole,
};
