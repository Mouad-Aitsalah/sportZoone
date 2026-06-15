const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");

const GLOBAL_ORGANISATION_NAME =
  process.env.SUPER_ADMIN_ORGANISATION_NAME || "SportZone Global";
const SUPER_ADMIN_EMAIL = String(
  process.env.SUPER_ADMIN_EMAIL || "superadmin@sportzone.local"
)
  .trim()
  .toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "admin123456";
const SUPER_ADMIN_NAME = process.env.SUPER_ADMIN_NAME || "Super Admin SportZone";

async function ensureGlobalOrganisation() {
  const existingOrganisation = await prisma.organisation.findFirst({
    where: {
      name: GLOBAL_ORGANISATION_NAME,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (existingOrganisation) {
    return existingOrganisation;
  }

  return prisma.organisation.create({
    data: {
      name: GLOBAL_ORGANISATION_NAME,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

async function ensureSuperAdmin() {
  const organisation = await ensureGlobalOrganisation();
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
  const existingSuperAdmin = await prisma.utilisateur.findUnique({
    where: {
      email: SUPER_ADMIN_EMAIL,
    },
    select: {
      id: true,
    },
  });

  const superAdmin = await prisma.utilisateur.upsert({
    where: {
      email: SUPER_ADMIN_EMAIL,
    },
    update: {
      nom: SUPER_ADMIN_NAME,
      motDePasse: hashedPassword,
      role: "SUPER_ADMIN",
      estActif: true,
      approvalStatus: "APPROVED",
      organisationId: organisation.id,
      pointDeVenteId: null,
      caisseId: null,
    },
    create: {
      organisationId: organisation.id,
      nom: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      motDePasse: hashedPassword,
      role: "SUPER_ADMIN",
      estActif: true,
      approvalStatus: "APPROVED",
      pointDeVenteId: null,
      caisseId: null,
    },
    select: {
      id: true,
      email: true,
      role: true,
      organisationId: true,
      estActif: true,
    },
  });

  return {
    organisation,
    superAdmin,
    action: existingSuperAdmin ? "updated" : "created",
  };
}

module.exports = {
  ensureSuperAdmin,
  GLOBAL_ORGANISATION_NAME,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
};
