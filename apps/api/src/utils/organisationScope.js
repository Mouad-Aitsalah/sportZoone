const { createHttpError } = require("./httpError");

const getOrganisationIdFromUser = (user) => {
  const organisationId = user?.organisationId;

  if (!organisationId) {
    throw createHttpError(403, "Organisation introuvable pour l'utilisateur authentifie.");
  }

  return organisationId;
};

const withOrganisation = (user, where = {}) => ({
  ...where,
  organisationId: getOrganisationIdFromUser(user),
});

const scopeByOrganisation = (reqOrUser, extraWhere = {}) => {
  const user = reqOrUser?.user || reqOrUser;

  return {
    ...extraWhere,
    organisationId: getOrganisationIdFromUser(user),
  };
};

const ensureSameOrganisation = (record, user, label = "Ressource") => {
  if (!record) {
    return;
  }

  const organisationId = getOrganisationIdFromUser(user);

  if (record.organisationId !== organisationId) {
    throw createHttpError(404, `${label} introuvable.`);
  }
};

const ensureEmployeeStoreAccess = (user, pointDeVenteId) => {
  if (user?.role !== "EMPLOYE") {
    return;
  }

  if (!user.pointDeVenteId) {
    throw createHttpError(
      403,
      "Acces refuse. Aucun point de vente n'est associe a cet employe."
    );
  }

  if (user.pointDeVenteId !== pointDeVenteId) {
    throw createHttpError(
      403,
      "Acces refuse. Cette operation concerne un autre point de vente."
    );
  }
};

const ensureEmployeeCashRegisterAccess = (user, caisseId) => {
  if (user?.role !== "EMPLOYE") {
    return;
  }

  if (!user.caisseId) {
    throw createHttpError(403, "Acces refuse. Aucune caisse n'est associee a cet employe.");
  }

  if (user.caisseId !== caisseId) {
    throw createHttpError(403, "Acces refuse. Cette operation concerne une autre caisse.");
  }
};

module.exports = {
  getOrganisationIdFromUser,
  withOrganisation,
  scopeByOrganisation,
  ensureSameOrganisation,
  ensureEmployeeStoreAccess,
  ensureEmployeeCashRegisterAccess,
};
