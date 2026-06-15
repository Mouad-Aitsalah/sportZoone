require("dotenv").config();

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const {
  buildNextNumeroCompte,
  COMPTE_TYPES,
  DEFAULT_SUPPLIER_NAME,
} = require("../src/services/compteService");

const prisma = new PrismaClient();
const GLOBAL_ORGANISATION_NAME =
  process.env.SUPER_ADMIN_ORGANISATION_NAME || "SportZone Global";
const SUPER_ADMIN_EMAIL = String(
  process.env.SUPER_ADMIN_EMAIL || "superadmin@sportzone.local"
)
  .trim()
  .toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "admin123456";

const categories = [
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

const organisationSeeds = [
  {
    name: "SportZone Rabat",
    storeName: "SportZone Rabat",
    storeAddress: "Avenue Mohammed V, Rabat",
    storePhone: "0537000001",
    admin: {
      name: "Admin Rabat",
      email: "admin-rabat@sportzone.local",
      password: "Admin12345",
    },
    cashier: {
      name: "Caissier Rabat",
      email: "caissier-rabat@sportzone.local",
      password: "Caisse12345",
    },
    suppliers: [
      {
        key: "atlas-rabat",
        nom: "Atlas Sport Rabat",
        email: "atlas-rabat@sportzone.local",
        telephone: "0600001001",
        adresse: "Rabat",
      },
      {
        key: "run-rabat",
        nom: "Run Pro Rabat",
        email: "run-rabat@sportzone.local",
        telephone: "0600001002",
        adresse: "Temara",
      },
    ],
    products: [
      {
        codeBarres: "6201000000011",
        nom: "Ballon Football",
        categoryCode: "EQUIPIMENT_ACCESSOIRES_FOOT",
        supplierKey: "atlas-rabat",
        prixAchat: 90,
        prixDetail: 140,
        seuilMinimum: 5,
        variants: [
          { taille: "Unique", couleur: null, codeBarres: "6201000000011001", stock: 18 },
        ],
      },
      {
        codeBarres: "6201000000012",
        nom: "Maillot Sport",
        categoryCode: "MAILLOT",
        supplierKey: "atlas-rabat",
        prixAchat: 110,
        prixDetail: 180,
        seuilMinimum: 6,
        variants: [
          { taille: "S", couleur: "Rouge", codeBarres: "6201000000012001", stock: 4 },
          { taille: "M", couleur: "Rouge", codeBarres: "6201000000012002", stock: 5 },
          { taille: "L", couleur: "Bleu", codeBarres: "6201000000012003", stock: 6 },
          { taille: "XL", couleur: "Noir", codeBarres: "6201000000012004", stock: 5 },
        ],
      },
      {
        codeBarres: "6201000000013",
        nom: "Chaussures Running",
        categoryCode: "CHAUSSURES",
        supplierKey: "run-rabat",
        prixAchat: 320,
        prixDetail: 470,
        seuilMinimum: 4,
        variants: [
          { taille: "40", couleur: "Noir", codeBarres: "6201000000013001", stock: 3 },
          { taille: "41", couleur: "Noir", codeBarres: "6201000000013002", stock: 3 },
          { taille: "42", couleur: "Blanc", codeBarres: "6201000000013003", stock: 3 },
          { taille: "43", couleur: "Bleu", codeBarres: "6201000000013004", stock: 3 },
        ],
      },
      {
        codeBarres: "6201000000014",
        nom: "Gants Gardien",
        categoryCode: "EQUIPIMENT_ACCESSOIRES_FOOT",
        supplierKey: "atlas-rabat",
        prixAchat: 85,
        prixDetail: 135,
        seuilMinimum: 4,
        variants: [
          { taille: "M", couleur: "Noir", codeBarres: "6201000000014001", stock: 4 },
          { taille: "L", couleur: "Noir", codeBarres: "6201000000014002", stock: 3 },
          { taille: "XL", couleur: "Bleu", codeBarres: "6201000000014003", stock: 3 },
        ],
      },
      {
        codeBarres: "6201000000015",
        nom: "Bouteille Sport",
        categoryCode: "SHAKERS",
        supplierKey: "run-rabat",
        prixAchat: 28,
        prixDetail: 49,
        seuilMinimum: 8,
        variants: [
          { taille: "Unique", couleur: null, codeBarres: "6201000000015001", stock: 30 },
        ],
      },
      {
        codeBarres: "6201000000016",
        nom: "Sac de Sport",
        categoryCode: "EQUIPEMENT_ACCESSOIRES",
        supplierKey: "atlas-rabat",
        prixAchat: 150,
        prixDetail: 230,
        seuilMinimum: 3,
        variants: [
          { taille: "Unique", couleur: "Noir", codeBarres: "6201000000016001", stock: 9 },
        ],
      },
    ],
  },
  {
    name: "SportZone Casa",
    storeName: "SportZone Casa",
    storeAddress: "Boulevard Zerktouni, Casablanca",
    storePhone: "0522000002",
    admin: {
      name: "Admin Casa",
      email: "admin-casa@sportzone.local",
      password: "Admin12345",
    },
    cashier: {
      name: "Caissier Casa",
      email: "caissier-casa@sportzone.local",
      password: "Caisse12345",
    },
    suppliers: [
      {
        key: "fit-casa",
        nom: "Fit Market Casa",
        email: "fit-casa@sportzone.local",
        telephone: "0600002001",
        adresse: "Casablanca",
      },
      {
        key: "combat-casa",
        nom: "Combat Gear Casa",
        email: "combat-casa@sportzone.local",
        telephone: "0600002002",
        adresse: "Mohammedia",
      },
    ],
    products: [
      {
        codeBarres: "6202000000011",
        nom: "Whey Gold",
        categoryCode: "WHEY",
        supplierKey: "fit-casa",
        prixAchat: 260,
        prixDetail: 360,
        seuilMinimum: 5,
        variants: [
          { taille: "900G", couleur: "Vanille", codeBarres: "6202000000011001", stock: 12 },
          { taille: "2KG", couleur: "Chocolat", codeBarres: "6202000000011002", stock: 8 },
        ],
      },
      {
        codeBarres: "6202000000012",
        nom: "Creatine Monohydrate",
        categoryCode: "CREATINE",
        supplierKey: "fit-casa",
        prixAchat: 110,
        prixDetail: 165,
        seuilMinimum: 6,
        variants: [
          { taille: "300G", couleur: "Standard", codeBarres: "6202000000012001", stock: 16 },
        ],
      },
      {
        codeBarres: "6202000000013",
        nom: "Short Training",
        categoryCode: "SHORT",
        supplierKey: "fit-casa",
        prixAchat: 70,
        prixDetail: 120,
        seuilMinimum: 5,
        variants: [
          { taille: "M", couleur: "Noir", codeBarres: "6202000000013001", stock: 7 },
          { taille: "L", couleur: "Noir", codeBarres: "6202000000013002", stock: 6 },
          { taille: "XL", couleur: "Bleu", codeBarres: "6202000000013003", stock: 5 },
        ],
      },
      {
        codeBarres: "6202000000014",
        nom: "T-shirt Performance",
        categoryCode: "T_SHIRT",
        supplierKey: "fit-casa",
        prixAchat: 80,
        prixDetail: 135,
        seuilMinimum: 4,
        variants: [
          { taille: "S", couleur: "Blanc", codeBarres: "6202000000014001", stock: 5 },
          { taille: "M", couleur: "Blanc", codeBarres: "6202000000014002", stock: 5 },
          { taille: "L", couleur: "Vert", codeBarres: "6202000000014003", stock: 4 },
        ],
      },
      {
        codeBarres: "6202000000015",
        nom: "Gants Kickboxing",
        categoryCode: "KICKBOXING",
        supplierKey: "combat-casa",
        prixAchat: 190,
        prixDetail: 280,
        seuilMinimum: 3,
        variants: [
          { taille: "10OZ", couleur: "Rouge", codeBarres: "6202000000015001", stock: 4 },
          { taille: "12OZ", couleur: "Noir", codeBarres: "6202000000015002", stock: 4 },
        ],
      },
      {
        codeBarres: "6202000000016",
        nom: "Shaker Pro",
        categoryCode: "SHAKERS",
        supplierKey: "fit-casa",
        prixAchat: 25,
        prixDetail: 45,
        seuilMinimum: 8,
        variants: [
          { taille: "Unique", couleur: "Noir", codeBarres: "6202000000016001", stock: 24 },
        ],
      },
    ],
  },
];

async function resetCopiedProjectData() {
  await prisma.organisation.deleteMany({
    where: {
      name: {
        in: [
          "Manager 1",
          "Manager 2",
          "Manager 3",
          "SportZone",
          GLOBAL_ORGANISATION_NAME,
          "SportZone Rabat",
          "SportZone Casa",
        ],
      },
    },
  });
}

async function ensureDefaultSupplier(prismaClient, organisationId) {
  const existingSupplier = await prismaClient.fournisseur.findFirst({
    where: {
      organisationId,
      nom: {
        equals: DEFAULT_SUPPLIER_NAME,
        mode: "insensitive",
      },
    },
    include: {
      compte: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  if (existingSupplier?.compte) {
    return {
      fournisseur: existingSupplier,
      compte: existingSupplier.compte,
    };
  }

  const numeroCompte = await buildNextNumeroCompte(
    prismaClient,
    organisationId,
    COMPTE_TYPES.FOURNISSEUR
  );

  if (existingSupplier) {
    const compte = await prismaClient.compte.create({
      data: {
        organisationId,
        numeroCompte,
        type: COMPTE_TYPES.FOURNISSEUR,
        nom: existingSupplier.nom,
        actif: true,
        fournisseurSourceId: existingSupplier.id,
      },
    });

    return {
      fournisseur: existingSupplier,
      compte,
    };
  }

  const fournisseur = await prismaClient.fournisseur.create({
    data: {
      organisationId,
      nom: DEFAULT_SUPPLIER_NAME,
    },
  });

  const compte = await prismaClient.compte.create({
    data: {
      organisationId,
      numeroCompte,
      type: COMPTE_TYPES.FOURNISSEUR,
      nom: DEFAULT_SUPPLIER_NAME,
      actif: true,
      fournisseurSourceId: fournisseur.id,
    },
  });

  return {
    fournisseur,
    compte,
  };
}

async function createOrganisationSeed(config, passwordHashes) {
  const organisation = await prisma.organisation.create({
    data: {
      name: config.name,
    },
  });

  const store = await prisma.pointDeVente.create({
    data: {
      organisationId: organisation.id,
      nom: config.storeName,
      adresse: config.storeAddress,
      telephone: config.storePhone,
    },
  });

  const cashRegister = await prisma.caisse.create({
    data: {
      organisationId: organisation.id,
      nom: "Caisse 1",
      code: `${config.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-CAISSE-1`,
      pointDeVenteId: store.id,
      estActive: true,
    },
  });

  const admin = await prisma.utilisateur.create({
    data: {
      organisationId: organisation.id,
      nom: config.admin.name,
      email: config.admin.email,
      motDePasse: passwordHashes.admin,
      role: "ADMIN",
      estActif: true,
      approvalStatus: "APPROVED",
    },
  });

  const cashier = await prisma.utilisateur.create({
    data: {
      organisationId: organisation.id,
      nom: config.cashier.name,
      email: config.cashier.email,
      motDePasse: passwordHashes.cashier,
      role: "EMPLOYE",
      estActif: true,
      approvalStatus: "APPROVED",
      pointDeVenteId: store.id,
      caisseId: cashRegister.id,
    },
  });

  await prisma.sessionCaisse.create({
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

  const defaultCustomer = await prisma.client.create({
    data: {
      organisationId: organisation.id,
      numeroClient: 1,
      nom: "Client inconnu",
      credit: 0,
      estActif: true,
    },
  });

  await prisma.compte.create({
    data: {
      organisationId: organisation.id,
      numeroCompte: "CL-0001",
      type: "CLIENT",
      nom: "Client inconnu",
      actif: true,
      clientSourceId: defaultCustomer.id,
    },
  });

  const categoryMap = new Map();

  for (const category of categories) {
    const createdCategory = await prisma.categorieProduit.create({
      data: {
        organisationId: organisation.id,
        code: category.code,
        nom: category.nom,
        nomComplet: category.nomComplet,
        actif: true,
      },
    });

    categoryMap.set(category.code, createdCategory);
  }

  const supplierMap = new Map();
  const defaultSupplier = await ensureDefaultSupplier(prisma, organisation.id);

  supplierMap.set("autre", defaultSupplier);

  for (const supplier of config.suppliers) {
    const fournisseur = await prisma.fournisseur.create({
      data: {
        organisationId: organisation.id,
        nom: supplier.nom,
        email: supplier.email,
        telephone: supplier.telephone,
        adresse: supplier.adresse,
      },
    });

    const numeroCompte = await buildNextNumeroCompte(
      prisma,
      organisation.id,
      COMPTE_TYPES.FOURNISSEUR
    );

    const compte = await prisma.compte.create({
      data: {
        organisationId: organisation.id,
        numeroCompte,
        type: COMPTE_TYPES.FOURNISSEUR,
        nom: supplier.nom,
        telephone: supplier.telephone,
        email: supplier.email,
        adresse: supplier.adresse,
        actif: true,
        fournisseurSourceId: fournisseur.id,
      },
    });

    supplierMap.set(supplier.key, {
      fournisseur,
      compte,
    });
  }

  for (const product of config.products) {
    const category = categoryMap.get(product.categoryCode);
    const supplier = supplierMap.get(product.supplierKey);

    const createdProduct = await prisma.produit.create({
      data: {
        organisationId: organisation.id,
        codeBarres: product.codeBarres,
        nom: product.nom,
        categorie: category.nom,
        categorieId: category.id,
        prixAchat: product.prixAchat,
        prixVente: product.prixDetail,
        tauxTVA: 20,
        prixDetail: product.prixDetail,
        prixGros: product.prixDetail,
        prixMiniGros: product.prixDetail,
        seuilMinimum: product.seuilMinimum,
        estActif: true,
        fournisseurId: supplier?.fournisseur.id || null,
      },
    });

    const totalVariantStock = (product.variants || []).reduce(
      (sum, variant) => sum + Number(variant.stock || 0),
      0
    );

    await prisma.produitVariante.createMany({
      data: (product.variants || []).map((variant) => ({
        organisationId: organisation.id,
        produitId: createdProduct.id,
        taille: variant.taille || "Unique",
        couleur: variant.couleur || null,
        codeBarres: variant.codeBarres || null,
        prixAchat: product.prixAchat,
        prixVente: product.prixDetail,
        quantiteStock: Number(variant.stock || 0),
        seuilMinimum: product.seuilMinimum,
        actif: true,
      })),
    });

    await prisma.stock.create({
      data: {
        organisationId: organisation.id,
        produitId: createdProduct.id,
        pointDeVenteId: store.id,
        quantite: totalVariantStock,
      },
    });
  }

  return {
    organisation,
    admin,
    cashier,
  };
}

async function createGlobalSuperAdmin(passwordHash) {
  const organisation = await prisma.organisation.create({
    data: {
      name: GLOBAL_ORGANISATION_NAME,
    },
  });

  const superAdmin = await prisma.utilisateur.create({
    data: {
      organisationId: organisation.id,
      nom: "Super Admin SportZone",
      email: SUPER_ADMIN_EMAIL,
      motDePasse: passwordHash,
      role: "SUPER_ADMIN",
      estActif: true,
      approvalStatus: "APPROVED",
    },
  });

  return {
    organisation,
    superAdmin,
  };
}

async function main() {
  console.log("Resetting copied Comdis data for SportZone multi-tenant...");
  await resetCopiedProjectData();

  const [superAdminPassword, adminPassword, cashierPassword] = await Promise.all([
    bcrypt.hash(SUPER_ADMIN_PASSWORD, 10),
    bcrypt.hash("Admin12345", 10),
    bcrypt.hash("Caisse12345", 10),
  ]);

  const globalSeed = await createGlobalSuperAdmin(superAdminPassword);
  const passwordHashes = {
    admin: adminPassword,
    cashier: cashierPassword,
  };

  const seededOrganisations = [];

  for (const organisationConfig of organisationSeeds) {
    const seededOrganisation = await createOrganisationSeed(
      organisationConfig,
      passwordHashes
    );
    seededOrganisations.push(seededOrganisation);
  }

  console.log("SportZone multi-tenant seed completed.");
  console.log("Organisation globale:");
  console.log(`  Super admin: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
  console.log("Organisation Rabat:");
  console.log("  Admin: admin-rabat@sportzone.local / Admin12345");
  console.log("  Caissier: caissier-rabat@sportzone.local / Caisse12345");
  console.log("Organisation Casa:");
  console.log("  Admin: admin-casa@sportzone.local / Admin12345");
  console.log("  Caissier: caissier-casa@sportzone.local / Caisse12345");
  console.log(`Organisation globale creee: ${globalSeed.organisation.name}`);
  console.log(`Organisations creees: ${seededOrganisations.length}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
