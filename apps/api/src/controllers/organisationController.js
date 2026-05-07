const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const { validateSchema } = require("../utils/validation");
const {
  organisationCreateSchema,
  organisationUpdateSchema,
} = require("../utils/validationSchemas");

const DEFAULT_STORE_NAME = "Magasin principal";
const DEFAULT_CASH_REGISTER_NAME = "Caisse 1";
const DEFAULT_UNKNOWN_CUSTOMER_NAME = "Client inconnu";
const GLOBAL_ORGANISATION_NAME = "SportZone Global";
const DEFAULT_PRODUCT_CATEGORIES = [
  { code: "CREATINE", nom: "Creatine", nomComplet: "Creatine" },
  { code: "OLIGO_ELEMENT", nom: "Oligo-element", nomComplet: "Oligo-element" },
  { code: "WHEY", nom: "Whey", nomComplet: "Whey" },
  { code: "PRE_WORKOUT", nom: "Pre-workout", nomComplet: "Pre-workout" },
  { code: "T_SHIRT", nom: "T-shirt", nomComplet: "T-shirt" },
  { code: "SHAKERS", nom: "SHAKERS", nomComplet: "SHAKERS" },
  { code: "SAUCES", nom: "SAUCES", nomComplet: "SAUCES" },
  { code: "MAILLOT", nom: "Maillot", nomComplet: "Maillot" },
  { code: "KICKBOXING", nom: "Kickboxing", nomComplet: "Kickboxing" },
  { code: "PANTALON", nom: "Pantalon", nomComplet: "Pantalon" },
  { code: "NATATION", nom: "Natation", nomComplet: "Natation" },
  {
    code: "NUTRITION_SPORTIVE",
    nom: "Nutrition Sportive",
    nomComplet: "Nutrition Sportive",
  },
  { code: "SHORT", nom: "Short", nomComplet: "Short" },
  { code: "ESPACE_FEMME", nom: "Espace Femme", nomComplet: "Espace Femme" },
  { code: "CHAUSSURES", nom: "Chaussures", nomComplet: "Chaussures" },
  {
    code: "EQUIPEMENT_ACCESSOIRES",
    nom: "Equipement et accessoires",
    nomComplet: "Equipement et accessoires",
  },
  { code: "COLLAGEN", nom: "Collagen", nomComplet: "Collagen" },
  {
    code: "EQUIPIMENT_ACCESSOIRES_FOOT",
    nom: "Equipiment et accessoires de Foot",
    nomComplet: "Equipiment et accessoires de Foot",
  },
  { code: "BASKET", nom: "Basket", nomComplet: "Basket" },
  { code: "VOLLEY", nom: "Volley", nomComplet: "Volley" },
];

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
};

const buildOrganisationCode = (name) =>
  String(name || "SPORTZONE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "SPORTZONE";

const organisationSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  pointsDeVente: {
    select: {
      id: true,
      nom: true,
    },
    orderBy: {
      id: "asc",
    },
    take: 1,
  },
  caisses: {
    select: {
      id: true,
      nom: true,
    },
    orderBy: {
      id: "asc",
    },
    take: 1,
  },
  utilisateurs: {
    select: {
      id: true,
      nom: true,
      email: true,
      role: true,
      estActif: true,
    },
    orderBy: {
      id: "asc",
    },
  },
  _count: {
    select: {
      utilisateurs: true,
      produits: true,
      clients: true,
      ventes: true,
    },
  },
};

const formatOrganisation = (organisation) => {
  const admin =
    organisation.utilisateurs.find(
      (user) => user.role === "SUPER_ADMIN" || user.role === "ADMIN_GLOBAL" || user.role === "ADMIN"
    ) || null;
  const cashier =
    organisation.utilisateurs.find((user) => user.role === "EMPLOYE") || null;

  return {
    id: organisation.id,
    name: organisation.name,
    storeName: organisation.pointsDeVente[0]?.nom || null,
    cashRegisterName: organisation.caisses[0]?.nom || null,
    admin: admin
      ? {
          id: admin.id,
          name: admin.nom,
          email: admin.email,
          active: admin.estActif,
          role: admin.role,
        }
      : null,
    cashier: cashier
      ? {
          id: cashier.id,
          name: cashier.nom,
          email: cashier.email,
          active: cashier.estActif,
          role: cashier.role,
        }
      : null,
    usersCount: organisation._count.utilisateurs,
    productsCount: organisation._count.produits,
    clientsCount: organisation._count.clients,
    salesCount: organisation._count.ventes,
    createdAt: organisation.createdAt,
    updatedAt: organisation.updatedAt,
  };
};

const ensureEmailAvailable = async (email, ignoredUserId = null) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const existingUser = await prisma.utilisateur.findFirst({
    where: {
      email: normalizedEmail,
      ...(ignoredUserId
        ? {
            id: {
              not: ignoredUserId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return false;
  }

  return true;
};

const createOrganisationDefaults = async (tx, organisationId) => {
  await tx.categorieProduit.createMany({
    data: DEFAULT_PRODUCT_CATEGORIES.map((category) => ({
      organisationId,
      code: category.code,
      nom: category.nom,
      nomComplet: category.nomComplet,
      actif: true,
    })),
    skipDuplicates: true,
  });
};

const getOrganisations = async (req, res) => {
  const organisations = await prisma.organisation.findMany({
    select: organisationSelect,
    orderBy: {
      createdAt: "desc",
    },
  });

  return res.status(200).json({
    data: organisations.map(formatOrganisation),
  });
};

const createOrganisation = async (req, res) => {
  const {
    name,
    adminName,
    adminEmail,
    adminPassword,
    cashierName,
    cashierEmail,
    cashierPassword,
  } = validateSchema(organisationCreateSchema, req.body);

  const normalizedName = String(name).trim();
  const normalizedAdminEmail = String(adminEmail).trim().toLowerCase();
  const normalizedCashierEmail = String(cashierEmail).trim().toLowerCase();

  if (adminPassword.trim().length < 8 || cashierPassword.trim().length < 8) {
    return res.status(400).json({
      message: "Les mots de passe admin et caissier doivent contenir au moins 8 caracteres.",
    });
  }

  const [existingOrganisation, isAdminEmailAvailable, isCashierEmailAvailable] =
    await Promise.all([
      prisma.organisation.findFirst({
        where: {
          name: normalizedName,
        },
        select: {
          id: true,
        },
      }),
      ensureEmailAvailable(normalizedAdminEmail),
      ensureEmailAvailable(normalizedCashierEmail),
    ]);

  if (existingOrganisation) {
    return res.status(409).json({
      message: "Une organisation avec ce nom existe deja.",
    });
  }

  if (!isAdminEmailAvailable || !isCashierEmailAvailable) {
    return res.status(409).json({
      message: "L'email admin ou caissier existe deja.",
    });
  }

  const [hashedAdminPassword, hashedCashierPassword] = await Promise.all([
    bcrypt.hash(adminPassword.trim(), 10),
    bcrypt.hash(cashierPassword.trim(), 10),
  ]);

  const createdOrganisation = await prisma.$transaction(async (tx) => {
    const organisation = await tx.organisation.create({
      data: {
        name: normalizedName,
      },
    });

    await createOrganisationDefaults(tx, organisation.id);

    const store = await tx.pointDeVente.create({
      data: {
        organisationId: organisation.id,
        nom: normalizedName,
        adresse: `${normalizedName} - ${DEFAULT_STORE_NAME}`,
      },
    });

    const cashRegister = await tx.caisse.create({
      data: {
        organisationId: organisation.id,
        nom: DEFAULT_CASH_REGISTER_NAME,
        code: `${buildOrganisationCode(normalizedName)}-CAISSE-1`,
        pointDeVenteId: store.id,
        estActive: true,
      },
    });

    const admin = await tx.utilisateur.create({
      data: {
        organisationId: organisation.id,
        nom: String(adminName).trim(),
        email: normalizedAdminEmail,
        motDePasse: hashedAdminPassword,
        role: "ADMIN",
        estActif: true,
        approvalStatus: "APPROVED",
      },
    });

    const cashier = await tx.utilisateur.create({
      data: {
        organisationId: organisation.id,
        nom: String(cashierName).trim(),
        email: normalizedCashierEmail,
        motDePasse: hashedCashierPassword,
        role: "EMPLOYE",
        estActif: true,
        approvalStatus: "APPROVED",
        pointDeVenteId: store.id,
        caisseId: cashRegister.id,
      },
    });

    await tx.sessionCaisse.create({
      data: {
        organisationId: organisation.id,
        numeroSession: "POS/1",
        caisseId: cashRegister.id,
        pointDeVenteId: store.id,
        utilisateurId: cashier.id,
        statut: "OUVERTE",
        totalVentes: 0,
        nombreTickets: 0,
      },
    });

    const defaultCustomer = await tx.client.create({
      data: {
        organisationId: organisation.id,
        numeroClient: 1,
        nom: DEFAULT_UNKNOWN_CUSTOMER_NAME,
        credit: 0,
        estActif: true,
      },
    });

    await tx.compte.create({
      data: {
        organisationId: organisation.id,
        numeroCompte: "CL-0001",
        type: "CLIENT",
        nom: DEFAULT_UNKNOWN_CUSTOMER_NAME,
        actif: true,
        clientSourceId: defaultCustomer.id,
      },
    });

    return tx.organisation.findUnique({
      where: {
        id: organisation.id,
      },
      select: organisationSelect,
    });
  });

  return res.status(201).json({
    message: "Organisation creee avec succes.",
    organisation: formatOrganisation(createdOrganisation),
  });
};

const updateOrganisation = async (req, res) => {
  const organisationId = String(req.params.id || "").trim();

  if (!organisationId) {
    return res.status(400).json({
      message: "ID organisation invalide.",
    });
  }

  const payload = validateSchema(organisationUpdateSchema, req.body);
  const existingOrganisation = await prisma.organisation.findUnique({
    where: {
      id: organisationId,
    },
    select: organisationSelect,
  });

  if (!existingOrganisation) {
    return res.status(404).json({
      message: "Organisation introuvable.",
    });
  }

  const normalizedName = normalizeOptionalString(payload.name);
  const normalizedAdminName = normalizeOptionalString(payload.adminName);
  const normalizedAdminEmail = normalizeOptionalString(payload.adminEmail)?.toLowerCase();
  const normalizedCashierName = normalizeOptionalString(payload.cashierName);
  const normalizedCashierEmail = normalizeOptionalString(payload.cashierEmail)?.toLowerCase();
  const normalizedAdminPassword = normalizeOptionalString(payload.adminPassword);
  const normalizedCashierPassword = normalizeOptionalString(payload.cashierPassword);

  if (normalizedAdminPassword && normalizedAdminPassword.length < 8) {
    return res.status(400).json({
      message: "Le mot de passe admin doit contenir au moins 8 caracteres.",
    });
  }

  if (normalizedCashierPassword && normalizedCashierPassword.length < 8) {
    return res.status(400).json({
      message: "Le mot de passe caissier doit contenir au moins 8 caracteres.",
    });
  }

  const adminUser =
    existingOrganisation.utilisateurs.find((user) => user.role === "ADMIN") || null;
  const cashierUser =
    existingOrganisation.utilisateurs.find((user) => user.role === "EMPLOYE") || null;

  if (normalizedName && normalizedName !== existingOrganisation.name) {
    const organisationWithSameName = await prisma.organisation.findFirst({
      where: {
        name: normalizedName,
        id: {
          not: organisationId,
        },
      },
      select: {
        id: true,
      },
    });

    if (organisationWithSameName) {
      return res.status(409).json({
        message: "Une organisation avec ce nom existe deja.",
      });
    }
  }

  if (normalizedAdminEmail && adminUser) {
    const isEmailAvailable = await ensureEmailAvailable(normalizedAdminEmail, adminUser.id);

    if (!isEmailAvailable) {
      return res.status(409).json({
        message: "L'email admin existe deja.",
      });
    }
  }

  if (normalizedCashierEmail && cashierUser) {
    const isEmailAvailable = await ensureEmailAvailable(
      normalizedCashierEmail,
      cashierUser.id
    );

    if (!isEmailAvailable) {
      return res.status(409).json({
        message: "L'email caissier existe deja.",
      });
    }
  }

  const updatedOrganisation = await prisma.$transaction(async (tx) => {
    if (normalizedName) {
      await tx.organisation.update({
        where: {
          id: organisationId,
        },
        data: {
          name: normalizedName,
        },
      });
    }

    if (adminUser && (normalizedAdminName || normalizedAdminEmail || normalizedAdminPassword)) {
      await tx.utilisateur.update({
        where: {
          id: adminUser.id,
        },
        data: {
          ...(normalizedAdminName ? { nom: normalizedAdminName } : {}),
          ...(normalizedAdminEmail ? { email: normalizedAdminEmail } : {}),
          ...(normalizedAdminPassword
            ? { motDePasse: await bcrypt.hash(normalizedAdminPassword, 10) }
            : {}),
        },
      });
    }

    if (
      cashierUser &&
      (normalizedCashierName || normalizedCashierEmail || normalizedCashierPassword)
    ) {
      await tx.utilisateur.update({
        where: {
          id: cashierUser.id,
        },
        data: {
          ...(normalizedCashierName ? { nom: normalizedCashierName } : {}),
          ...(normalizedCashierEmail ? { email: normalizedCashierEmail } : {}),
          ...(normalizedCashierPassword
            ? { motDePasse: await bcrypt.hash(normalizedCashierPassword, 10) }
            : {}),
        },
      });
    }

    return tx.organisation.findUnique({
      where: {
        id: organisationId,
      },
      select: organisationSelect,
    });
  });

  return res.status(200).json({
    message: "Organisation mise a jour avec succes.",
    organisation: formatOrganisation(updatedOrganisation),
  });
};

const deleteOrganisation = async (req, res) => {
  const organisationId = String(req.params.id || "").trim();

  if (!organisationId) {
    return res.status(400).json({
      message: "ID organisation invalide.",
    });
  }

  if (req.user?.organisationId === organisationId) {
    return res.status(400).json({
      message: "Vous ne pouvez pas supprimer votre organisation actuelle.",
    });
  }

  const organisation = await prisma.organisation.findUnique({
    where: {
      id: organisationId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!organisation) {
    return res.status(404).json({
      message: "Organisation introuvable.",
    });
  }

  if (organisation.name === GLOBAL_ORGANISATION_NAME) {
    return res.status(400).json({
      message: "L'organisation globale SportZone Global ne peut pas etre supprimee.",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.venteLigne.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.retour.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.vente.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.avoirLigne.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.avoir.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.avoirFournisseurLigne.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.avoirFournisseur.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.achatLigne.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.achat.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.stockMovement.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.stock.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.paiementClient.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.loginApprovalRequest.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.produitVariante.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.produit.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.compte.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.client.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.fournisseur.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.sessionCaisse.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.caisse.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.utilisateur.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.pointDeVente.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.categorieProduit.deleteMany({
      where: {
        organisationId,
      },
    });

    await tx.organisation.delete({
      where: {
        id: organisationId,
      },
    });
  });

  return res.status(200).json({
    message: `Organisation ${organisation.name} supprimee avec succes.`,
  });
};

module.exports = {
  getOrganisations,
  createOrganisation,
  updateOrganisation,
  deleteOrganisation,
};
