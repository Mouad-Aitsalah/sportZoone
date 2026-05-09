const {
  z,
  requiredString,
  optionalString,
  emailString,
  optionalEmailString,
  optionalPhoneString,
  numberValue,
  positiveNumber,
  nonNegativeNumber,
  positiveInt,
  optionalPositiveInt,
  nonNegativeInt,
  optionalBoolean,
} = require("./validation");

const loginSchema = z.object({
  email: emailString("L'email"),
  password: requiredString("Le mot de passe"),
});

const authLoginSchema = z.object({
  email: emailString("L'email"),
  motDePasse: requiredString("Le mot de passe"),
});

const customerCreateSchema = z.object({
  name: requiredString("Le nom du client"),
  phone: optionalPhoneString("Le telephone"),
  email: optionalEmailString("L'email"),
  address: optionalString("L'adresse"),
});

const customerCreditPaymentSchema = z.object({
  amount: positiveNumber("Le montant"),
  note: optionalString("La note"),
});

const salePaymentSchema = z.object({
  amount: positiveNumber("Le montant"),
  paymentMethod: requiredString("Le mode de paiement"),
  note: optionalString("La note"),
});

const saleItemSchema = z.object({
  productId: positiveInt("Le produit"),
  variantId: optionalPositiveInt("La variante"),
  quantity: positiveNumber("La quantite"),
  unitPrice: positiveNumber("Le prix unitaire"),
});

const saleCreateSchema = z.object({
  storeId: optionalPositiveInt("Le magasin"),
  cashRegisterId: optionalPositiveInt("La caisse"),
  userId: optionalPositiveInt("L'utilisateur"),
  customerId: optionalPositiveInt("Le client"),
  paymentMethod: requiredString("Le mode de paiement"),
  paidAmount: nonNegativeNumber("Le montant paye").optional(),
  remainingAmount: nonNegativeNumber("Le reste a payer").optional(),
  total: nonNegativeNumber("Le total"),
  items: z
    .array(saleItemSchema, {
      invalid_type_error: "Les articles doivent etre un tableau valide.",
    })
    .min(1, "Au moins un article est obligatoire."),
});

const refundItemSchema = z.object({
  productId: positiveInt("Le produit"),
  variantId: optionalPositiveInt("La variante"),
  quantity: positiveNumber("La quantite"),
  unitPrice: nonNegativeNumber("Le prix unitaire").optional(),
});

const refundCreateSchema = z.object({
  saleId: optionalPositiveInt("La vente"),
  customerId: optionalPositiveInt("Le client"),
  paymentMethod: optionalString("Le mode de remboursement"),
  items: z
    .array(refundItemSchema, {
      invalid_type_error: "Les articles du remboursement doivent etre un tableau valide.",
    })
    .min(1, "Au moins un article est obligatoire pour le remboursement."),
  reason: optionalString("Le motif"),
});

const stockEntrySchema = z.object({
  productId: positiveInt("Le produit"),
  variantId: optionalPositiveInt("La variante"),
  storeId: positiveInt("Le magasin"),
  quantity: positiveNumber("La quantite"),
  reason: optionalString("La raison"),
});

const stockCorrectionSchema = z.object({
  productId: positiveInt("Le produit"),
  variantId: optionalPositiveInt("La variante"),
  storeId: positiveInt("Le magasin"),
  quantity: numberValue("La quantite"),
  reason: optionalString("La raison"),
});

const purchaseModeSchema = z
  .string({
    required_error: "Le mode de reglement est obligatoire.",
    invalid_type_error: "Le mode de reglement doit etre une chaine valide.",
  })
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => value === "ESPECE" || value === "CHEQUE" || value === "CREDIT",
    "Le mode de reglement doit etre ESPECE, CHEQUE ou CREDIT."
  );

const purchaseLineSchema = z.object({
  produitId: positiveInt("Le produit"),
  quantite: positiveInt("La quantite"),
  prixAchatUnitaireHT: nonNegativeNumber("Le prix d'achat HT"),
  prixDetail: nonNegativeNumber("Le prix detail"),
});

const purchaseCreateSchema = z.object({
  compteFournisseurId: positiveInt("Le fournisseur"),
  dateAchat: requiredString("La date d'achat"),
  modeReglement: purchaseModeSchema,
  dateReglement: optionalString("La date de reglement"),
  numeroCheque: optionalString("Le numero de cheque"),
  observations: optionalString("Les observations"),
  pointDeVenteId: positiveInt("Le point de vente"),
  lignes: z
    .array(purchaseLineSchema, {
      invalid_type_error: "Les lignes d'achat doivent etre un tableau valide.",
    })
    .min(1, "Au moins une ligne d'achat est obligatoire."),
});

const avoirLineSchema = z.object({
  produitId: positiveInt("Le produit"),
  quantite: positiveInt("La quantite"),
  prixUnitaire: nonNegativeNumber("Le prix unitaire"),
});

const avoirCreateSchema = z.object({
  compteClientId: positiveInt("Le client"),
  pointDeVenteId: positiveInt("Le point de vente"),
  dateAvoir: optionalString("La date de l'avoir"),
  motif: optionalString("Le motif"),
  lignes: z
    .array(avoirLineSchema, {
      invalid_type_error: "Les lignes d'avoir doivent etre un tableau valide.",
    })
    .min(1, "Au moins une ligne d'avoir est obligatoire."),
});

const supplierAvoirCompensationModeSchema = z
  .string({
    required_error: "Le mode de compensation est obligatoire.",
    invalid_type_error: "Le mode de compensation doit etre une chaine valide.",
  })
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) =>
      value === "REMBOURSEMENT" ||
      value === "AVOIR_PROCHAINE_FACTURE" ||
      value === "REMPLACEMENT_PRODUIT",
    "Le mode de compensation doit etre REMBOURSEMENT, AVOIR_PROCHAINE_FACTURE ou REMPLACEMENT_PRODUIT."
  );

const supplierAvoirLineSchema = z.object({
  produitId: positiveInt("Le produit"),
  quantite: positiveInt("La quantite"),
  prixAchat: nonNegativeNumber("Le prix d'achat"),
});

const supplierAvoirCreateSchema = z.object({
  compteFournisseurId: positiveInt("Le fournisseur"),
  achatId: optionalPositiveInt("L'achat"),
  pointDeVenteId: positiveInt("Le point de vente"),
  date: optionalString("La date"),
  motif: optionalString("Le motif"),
  compensationMode: supplierAvoirCompensationModeSchema,
  commentaire: optionalString("Le commentaire"),
  lignes: z
    .array(supplierAvoirLineSchema, {
      invalid_type_error:
        "Les lignes d'avoir fournisseur doivent etre un tableau valide.",
    })
    .min(1, "Au moins une ligne d'avoir fournisseur est obligatoire."),
});

const productCategoryCreateSchema = z.object({
  code: requiredString("Le code categorie"),
  nom: requiredString("Le nom categorie"),
  nomComplet: requiredString("Le nom complet categorie"),
  actif: optionalBoolean("Le statut actif"),
});

const productCategoryUpdateSchema = z.object({
  code: requiredString("Le code categorie").optional(),
  nom: requiredString("Le nom categorie").optional(),
  nomComplet: requiredString("Le nom complet categorie").optional(),
  actif: optionalBoolean("Le statut actif"),
});

const initialStockSchema = z.object({
  storeId: positiveInt("Le point de vente"),
  quantity: numberValue("La quantite initiale"),
});

const productVariantSchema = z.object({
  id: optionalPositiveInt("La variante"),
  taille: optionalString("La taille"),
  couleur: optionalString("La couleur"),
  valeursVariante: optionalString("Les valeurs variante"),
  codeBarres: optionalString("Le code-barres variante"),
  prixAchat: nonNegativeNumber("Le prix d'achat variante").optional(),
  prixVente: nonNegativeNumber("Le prix de vente variante").optional(),
  quantiteStock: numberValue("Le stock variante").optional(),
  seuilMinimum: nonNegativeInt("Le seuil minimum variante").optional(),
  actif: optionalBoolean("Le statut actif variante"),
});

const productCreateSchema = z.object({
  codeBarres: requiredString("Le code-barres").optional(),
  nom: requiredString("Le nom du produit"),
  categorieId: positiveInt("La categorie"),
  categorie: optionalString("La categorie"),
  prixAchat: nonNegativeNumber("Le prix d'achat"),
  prixVente: nonNegativeNumber("Le prix de vente"),
  tauxTVA: nonNegativeNumber("Le taux TVA").optional(),
  prixDetail: nonNegativeNumber("Le prix detail").optional(),
  prixGros: nonNegativeNumber("Le prix gros").optional(),
  prixMiniGros: nonNegativeNumber("Le prix mini-gros").optional(),
  seuilMinimum: nonNegativeInt("Le seuil minimum").optional(),
  estActif: optionalBoolean("Le statut actif"),
  fournisseurId: optionalPositiveInt("Le fournisseur"),
  compteId: optionalPositiveInt("Le compte fournisseur"),
  fournisseurCompteId: optionalPositiveInt("Le compte fournisseur"),
  initialStocks: z
    .array(initialStockSchema, {
      invalid_type_error: "Les stocks initiaux doivent etre un tableau valide.",
    })
    .optional(),
  variants: z
    .array(productVariantSchema, {
      invalid_type_error: "Les variantes doivent etre un tableau valide.",
    })
    .optional(),
});

const productUpdateSchema = z.object({
  codeBarres: requiredString("Le code-barres").optional(),
  nom: requiredString("Le nom du produit").optional(),
  categorieId: optionalPositiveInt("La categorie"),
  categorie: optionalString("La categorie"),
  prixAchat: nonNegativeNumber("Le prix d'achat").optional(),
  prixVente: nonNegativeNumber("Le prix de vente").optional(),
  tauxTVA: nonNegativeNumber("Le taux TVA").optional(),
  prixDetail: nonNegativeNumber("Le prix detail").optional(),
  prixGros: nonNegativeNumber("Le prix gros").optional(),
  prixMiniGros: nonNegativeNumber("Le prix mini-gros").optional(),
  seuilMinimum: nonNegativeInt("Le seuil minimum").optional(),
  estActif: optionalBoolean("Le statut actif"),
  fournisseurId: optionalPositiveInt("Le fournisseur"),
  compteId: optionalPositiveInt("Le compte fournisseur"),
  fournisseurCompteId: optionalPositiveInt("Le compte fournisseur"),
  variants: z
    .array(productVariantSchema, {
      invalid_type_error: "Les variantes doivent etre un tableau valide.",
    })
    .optional(),
});

const supplierCreateSchema = z.object({
  nom: requiredString("Le nom du fournisseur"),
  email: optionalEmailString("L'email"),
  telephone: optionalPhoneString("Le telephone"),
  adresse: optionalString("L'adresse"),
});

const supplierUpdateSchema = z.object({
  nom: requiredString("Le nom du fournisseur").optional(),
  email: optionalEmailString("L'email"),
  telephone: optionalPhoneString("Le telephone"),
  adresse: optionalString("L'adresse"),
});

const compteTypeSchema = z
  .string({
    required_error: "Le type de compte est obligatoire.",
    invalid_type_error: "Le type de compte doit etre une chaine valide.",
  })
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => value === "CLIENT" || value === "FOURNISSEUR",
    "Le type de compte doit etre CLIENT ou FOURNISSEUR."
  );

const compteCreateSchema = z.object({
  numeroCompte: requiredString("Le numero de compte"),
  type: compteTypeSchema,
  nom: requiredString("Le nom"),
  telephone: optionalPhoneString("Le telephone"),
  email: optionalEmailString("L'email"),
  adresse: optionalString("L'adresse"),
  actif: optionalBoolean("Le statut actif"),
});

const compteUpdateSchema = z.object({
  numeroCompte: requiredString("Le numero de compte").optional(),
  type: compteTypeSchema.optional(),
  nom: requiredString("Le nom").optional(),
  telephone: optionalPhoneString("Le telephone"),
  email: optionalEmailString("L'email"),
  adresse: optionalString("L'adresse"),
  actif: optionalBoolean("Le statut actif"),
});

const userCreateSchema = z.object({
  nom: requiredString("Le nom"),
  email: emailString("L'email"),
  motDePasse: requiredString("Le mot de passe"),
  role: requiredString("Le role"),
  estActif: optionalBoolean("Le statut actif"),
  pointDeVenteId: optionalPositiveInt("Le point de vente"),
  caisseId: optionalPositiveInt("La caisse"),
});

const userUpdateSchema = z.object({
  nom: requiredString("Le nom").optional(),
  email: emailString("L'email").optional(),
  motDePasse: requiredString("Le mot de passe").optional(),
  role: requiredString("Le role").optional(),
  estActif: optionalBoolean("Le statut actif"),
  pointDeVenteId: optionalPositiveInt("Le point de vente"),
  caisseId: optionalPositiveInt("La caisse"),
});

const userPasswordUpdateSchema = z.object({
  newPassword: requiredString("Le nouveau mot de passe"),
});

const organisationCreateSchema = z.object({
  name: requiredString("Le nom de l'organisation"),
  adminName: requiredString("Le nom de l'admin"),
  adminEmail: emailString("L'email admin"),
  adminPassword: requiredString("Le mot de passe admin"),
  cashierName: requiredString("Le nom du caissier"),
  cashierEmail: emailString("L'email caissier"),
  cashierPassword: requiredString("Le mot de passe caissier"),
});

const organisationUpdateSchema = z.object({
  name: requiredString("Le nom de l'organisation").optional(),
  adminName: requiredString("Le nom de l'admin").optional(),
  adminEmail: emailString("L'email admin").optional(),
  adminPassword: requiredString("Le mot de passe admin").optional(),
  cashierName: requiredString("Le nom du caissier").optional(),
  cashierEmail: emailString("L'email caissier").optional(),
  cashierPassword: requiredString("Le mot de passe caissier").optional(),
});

const authRegisterSchema = z.object({
  nom: requiredString("Le nom"),
  email: emailString("L'email"),
  motDePasse: requiredString("Le mot de passe"),
  role: optionalString("Le role"),
  pointDeVenteId: optionalPositiveInt("Le point de vente"),
  caisseId: optionalPositiveInt("La caisse"),
});

module.exports = {
  loginSchema,
  authLoginSchema,
  customerCreateSchema,
  customerCreditPaymentSchema,
  salePaymentSchema,
  saleCreateSchema,
  refundCreateSchema,
  stockEntrySchema,
  stockCorrectionSchema,
  purchaseCreateSchema,
  avoirCreateSchema,
  supplierAvoirCreateSchema,
  productCategoryCreateSchema,
  productCategoryUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  supplierCreateSchema,
  supplierUpdateSchema,
  compteCreateSchema,
  compteUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
  userPasswordUpdateSchema,
  organisationCreateSchema,
  organisationUpdateSchema,
  authRegisterSchema,
};
