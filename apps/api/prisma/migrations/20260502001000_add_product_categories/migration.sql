CREATE TABLE "CategorieProduit" (
  "id" SERIAL NOT NULL,
  "organisationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "nomComplet" TEXT NOT NULL,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CategorieProduit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategorieProduit_organisationId_code_key"
ON "CategorieProduit"("organisationId", "code");

CREATE UNIQUE INDEX "CategorieProduit_organisationId_nom_key"
ON "CategorieProduit"("organisationId", "nom");

CREATE INDEX "CategorieProduit_organisationId_idx"
ON "CategorieProduit"("organisationId");

CREATE INDEX "CategorieProduit_actif_idx"
ON "CategorieProduit"("actif");

ALTER TABLE "CategorieProduit"
ADD CONSTRAINT "CategorieProduit_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Produit"
ADD COLUMN "categorieId" INTEGER;

WITH category_seed(code, nom, nomComplet) AS (
  VALUES
    ('ACCESSOIRES_UTILES', 'Accessoires_Utiles', 'Accessoires_Utiles / اكسسوارات مفيدة'),
    ('ANIMALERIE', 'Animalerie', 'Animalerie / مستلزمات الحيوانات'),
    ('AUTRE', 'Autre', 'Autre / أخرى'),
    ('BEBE', 'Bebe', 'Bebe / مستلزمات الطفل'),
    ('BIO_SANS_GLUTEN', 'Bio_et_Sans_gluten', 'Bio_et_Sans_gluten / منتجات حيوية وبدون غلوتين'),
    ('BISCUITS', 'Biscuits', 'Biscuits / بسكويت'),
    ('BOISSONS', 'BOISSONS', 'BOISSONS / المشروبات'),
    ('BOULANGERIE_PATISSERIE', 'Boulangerie_patisserie', 'Boulangerie_patisserie / مخبوزات وحلويات'),
    ('CHARCUTERIE', 'Charcuterie', 'Charcuterie / لحوم مصبرة'),
    ('ELECTROMENAGER', 'Electromenager', 'Electromenager / كهرومنزلية'),
    ('ENTRETIEN_NETTOYAGE', 'Entretien_Nettoyage', 'Entretien_Nettoyage / مواد التنظيف'),
    ('EPICERIE', 'Epicerie', 'Epicerie / البقالة'),
    ('FRUITS_SECS', 'FRUITS_SECS', 'FRUITS_SECS / فواكه جافة'),
    ('HYGIENEBEAUTE', 'HygieneBeaute', 'HygieneBeaute / العناية والجمال'),
    ('LES_PATISSERIE', 'les_patisserie', 'les_patisserie / الحلويات'),
    ('PETIT_DEJEUNER', 'Petit_dejeuner', 'Petit_dejeuner / الفطور'),
    ('PRODUITPESABLE', 'ProduitPesable', 'ProduitPesable / منتج بالوزن'),
    ('PRODUITS_LAITIERS_FROMAGERIE_CREMERIE', 'Produits_laitiers_Fromagerie_Cremerie', 'Produits_laitiers_Fromagerie_Cremerie / منتجات الألبان والأجبان'),
    ('TEXTILES', 'Textiles', 'Textiles / المنسوجات')
)
INSERT INTO "CategorieProduit" ("organisationId", "code", "nom", "nomComplet", "actif")
SELECT o."id", cs.code, cs.nom, cs.nomComplet, true
FROM "Organisation" o
CROSS JOIN category_seed cs
WHERE NOT EXISTS (
  SELECT 1
  FROM "CategorieProduit" cp
  WHERE cp."organisationId" = o."id"
    AND cp."code" = cs.code
);

UPDATE "Produit" p
SET "categorieId" = cp."id",
    "categorie" = cp."nom"
FROM "CategorieProduit" cp
WHERE cp."organisationId" = p."organisationId"
  AND cp."code" = CASE
    WHEN LOWER(TRIM(p."categorie")) IN ('boissons', 'boisson') THEN 'BOISSONS'
    WHEN LOWER(TRIM(p."categorie")) IN ('epicerie', 'épicerie') THEN 'EPICERIE'
    WHEN LOWER(TRIM(p."categorie")) IN ('snacks', 'snack', 'biscuits', 'biscuit') THEN 'BISCUITS'
    WHEN LOWER(TRIM(p."categorie")) IN ('hygiene', 'hygiène', 'hygienebeaute', 'hygienebeaute') THEN 'HYGIENEBEAUTE'
    WHEN LOWER(TRIM(p."categorie")) IN ('bebe', 'bébé') THEN 'BEBE'
    ELSE 'AUTRE'
  END;

UPDATE "Produit" p
SET "categorieId" = cp."id",
    "categorie" = cp."nom"
FROM "CategorieProduit" cp
WHERE p."categorieId" IS NULL
  AND cp."organisationId" = p."organisationId"
  AND cp."code" = 'AUTRE';

ALTER TABLE "Produit"
ALTER COLUMN "categorieId" SET NOT NULL;

ALTER TABLE "Produit"
ADD CONSTRAINT "Produit_categorieId_fkey"
FOREIGN KEY ("categorieId") REFERENCES "CategorieProduit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Produit_categorieId_idx"
ON "Produit"("categorieId");
