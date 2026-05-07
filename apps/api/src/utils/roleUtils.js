const normalizeUserRole = (role) => {
  const normalizedRole = String(role || "").trim().toUpperCase();

  if (normalizedRole === "CAISSIER" || normalizedRole === "CASHIER") {
    return "EMPLOYE";
  }

  return normalizedRole;
};

const hasRequiredRole = (userRole, allowedRoles = []) => {
  const normalizedUserRole = normalizeUserRole(userRole);

  return allowedRoles.some(
    (allowedRole) => normalizeUserRole(allowedRole) === normalizedUserRole
  );
};

module.exports = {
  hasRequiredRole,
  normalizeUserRole,
};
