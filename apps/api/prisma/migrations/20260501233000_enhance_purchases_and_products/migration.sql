CREATE TYPE "AchatModeReglement" AS ENUM ('ESPECE', 'CHEQUE', 'CREDIT');

CREATE TYPE "AchatStatut" AS ENUM ('ENREGISTRE', 'PAYE', 'CREDIT_EN_ATTENTE');

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'PURCHASE';

ALTER TABLE "Produit"
ADD COLUMN IF NOT EXISTS "tauxTVA" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "prixDetail" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "prixGros" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "prixMiniGros" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "Produit"
SET
  "prixDetail" = CASE WHEN "prixDetail" = 0 THEN "prixVente" ELSE "prixDetail" END,
  "prixGros" = CASE WHEN "prixGros" = 0 THEN "prixVente" ELSE "prixGros" END,
  "prixMiniGros" = CASE WHEN "prixMiniGros" = 0 THEN "prixVente" ELSE "prixMiniGros" END;

ALTER TABLE "Achat" RENAME COLUMN "reference" TO "numeroAchat";
ALTER TABLE "Achat" RENAME COLUMN "total" TO "totalTTC";
ALTER TABLE "Achat" RENAME COLUMN "status" TO "statut";

ALTER TABLE "Achat"
ADD COLUMN IF NOT EXISTS "compteFournisseurId" INTEGER,
ADD COLUMN IF NOT EXISTS "modeReglement" TEXT NOT NULL DEFAULT 'ESPECE',
ADD COLUMN IF NOT EXISTS "dateReglement" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "totalHT" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalTVA" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Achat"
ALTER COLUMN "fournisseurId" DROP NOT NULL;

UPDATE "Achat" a
SET
  "compteFournisseurId" = c.id,
  "dateAchat" = COALESCE(a."dateAchat", a."createdAt", CURRENT_TIMESTAMP),
  "dateReglement" = COALESCE(a."dateReglement", a."createdAt"),
  "totalHT" = COALESCE(NULLIF(a."totalHT", 0), a."totalTTC"),
  "totalTVA" = COALESCE(a."totalTVA", 0),
  "totalTTC" = COALESCE(a."totalTTC", 0)
FROM "Compte" c
WHERE c."organisationId" = a."organisationId"
  AND c."fournisseurSourceId" = a."fournisseurId";

UPDATE "Achat"
SET
  "dateAchat" = COALESCE("dateAchat", "createdAt"),
  "dateReglement" = COALESCE("dateReglement", "createdAt"),
  "totalHT" = COALESCE(NULLIF("totalHT", 0), "totalTTC"),
  "totalTVA" = COALESCE("totalTVA", 0),
  "totalTTC" = COALESCE("totalTTC", 0);

ALTER TABLE "Achat" ALTER COLUMN "modeReglement" DROP DEFAULT;

ALTER TABLE "Achat"
ALTER COLUMN "modeReglement" TYPE "AchatModeReglement"
USING (
  CASE UPPER(COALESCE("modeReglement"::text, ''))
    WHEN 'CHEQUE' THEN 'CHEQUE'::"AchatModeReglement"
    WHEN 'CREDIT' THEN 'CREDIT'::"AchatModeReglement"
    ELSE 'ESPECE'::"AchatModeReglement"
  END
);

ALTER TABLE "Achat" ALTER COLUMN "modeReglement" SET DEFAULT 'ESPECE';

ALTER TABLE "Achat" ALTER COLUMN "statut" DROP DEFAULT;

ALTER TABLE "Achat"
ALTER COLUMN "statut" TYPE "AchatStatut"
USING (
  CASE UPPER(COALESCE("statut"::text, ''))
    WHEN 'PAYE' THEN 'PAYE'::"AchatStatut"
    WHEN 'CREDIT_EN_ATTENTE' THEN 'CREDIT_EN_ATTENTE'::"AchatStatut"
    ELSE 'ENREGISTRE'::"AchatStatut"
  END
);

ALTER TABLE "Achat" ALTER COLUMN "statut" SET DEFAULT 'ENREGISTRE';

ALTER TABLE "Achat"
ALTER COLUMN "compteFournisseurId" SET NOT NULL;

ALTER TABLE "Achat"
ADD CONSTRAINT "Achat_compteFournisseurId_fkey"
FOREIGN KEY ("compteFournisseurId") REFERENCES "Compte"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Achat_compteFournisseurId_idx" ON "Achat"("compteFournisseurId");
DROP INDEX IF EXISTS "Achat_reference_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Achat_numeroAchat_key" ON "Achat"("numeroAchat");

ALTER TABLE "AchatItem" RENAME COLUMN "prixAchat" TO "prixAchatUnitaireHT";

ALTER TABLE "AchatItem"
ADD COLUMN IF NOT EXISTS "tauxTVA" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "montantTVA" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalHT" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalTTC" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "prixDetail" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "prixGros" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "prixMiniGros" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "AchatItem" ai
SET
  "tauxTVA" = COALESCE(p."tauxTVA", 0),
  "prixDetail" = COALESCE(NULLIF(p."prixDetail", 0), p."prixVente"),
  "prixGros" = COALESCE(NULLIF(p."prixGros", 0), p."prixVente"),
  "prixMiniGros" = COALESCE(NULLIF(p."prixMiniGros", 0), p."prixVente"),
  "totalHT" = ai."quantite" * ai."prixAchatUnitaireHT",
  "montantTVA" = (ai."quantite" * ai."prixAchatUnitaireHT") * COALESCE(p."tauxTVA", 0) / 100,
  "totalTTC" = (ai."quantite" * ai."prixAchatUnitaireHT") * (1 + COALESCE(p."tauxTVA", 0) / 100),
  "createdAt" = COALESCE(ai."createdAt", CURRENT_TIMESTAMP)
FROM "Produit" p
WHERE p."id" = ai."produitId";

UPDATE "Achat"
SET
  "totalHT" = aggregated."sumHT",
  "totalTVA" = aggregated."sumTVA",
  "totalTTC" = aggregated."sumTTC"
FROM (
  SELECT
    "achatId",
    COALESCE(SUM("totalHT"), 0) AS "sumHT",
    COALESCE(SUM("montantTVA"), 0) AS "sumTVA",
    COALESCE(SUM("totalTTC"), 0) AS "sumTTC"
  FROM "AchatItem"
  GROUP BY "achatId"
) AS aggregated
WHERE aggregated."achatId" = "Achat"."id";
