-- Create enum for account types
CREATE TYPE "CompteType" AS ENUM ('CLIENT', 'FOURNISSEUR');

-- Create accounts table
CREATE TABLE "Compte" (
  "id" SERIAL NOT NULL,
  "organisationId" TEXT NOT NULL,
  "numeroCompte" TEXT NOT NULL,
  "type" "CompteType" NOT NULL,
  "nom" TEXT NOT NULL,
  "telephone" TEXT,
  "email" TEXT,
  "adresse" TEXT,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "clientSourceId" INTEGER,
  "fournisseurSourceId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Compte_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Compte_clientSourceId_key" ON "Compte"("clientSourceId");
CREATE UNIQUE INDEX "Compte_fournisseurSourceId_key" ON "Compte"("fournisseurSourceId");
CREATE UNIQUE INDEX "Compte_organisationId_numeroCompte_key" ON "Compte"("organisationId", "numeroCompte");
CREATE INDEX "Compte_organisationId_idx" ON "Compte"("organisationId");
CREATE INDEX "Compte_type_idx" ON "Compte"("type");
CREATE INDEX "Compte_nom_idx" ON "Compte"("nom");

ALTER TABLE "Compte"
ADD CONSTRAINT "Compte_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Compte"
ADD CONSTRAINT "Compte_clientSourceId_fkey"
FOREIGN KEY ("clientSourceId") REFERENCES "Client"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Compte"
ADD CONSTRAINT "Compte_fournisseurSourceId_fkey"
FOREIGN KEY ("fournisseurSourceId") REFERENCES "Fournisseur"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing clients into Compte
INSERT INTO "Compte" (
  "organisationId",
  "numeroCompte",
  "type",
  "nom",
  "telephone",
  "email",
  "adresse",
  "actif",
  "clientSourceId",
  "createdAt",
  "updatedAt"
)
SELECT
  c."organisationId",
  'CL-' || LPAD((ROW_NUMBER() OVER (PARTITION BY c."organisationId" ORDER BY c."numeroClient"))::text, 4, '0'),
  'CLIENT'::"CompteType",
  c."nom",
  c."telephone",
  c."email",
  NULL,
  c."estActif",
  c."id",
  c."createdAt",
  c."updatedAt"
FROM "Client" c
WHERE NOT EXISTS (
  SELECT 1
  FROM "Compte" compte
  WHERE compte."clientSourceId" = c."id"
);

-- Backfill existing suppliers into Compte
INSERT INTO "Compte" (
  "organisationId",
  "numeroCompte",
  "type",
  "nom",
  "telephone",
  "email",
  "adresse",
  "actif",
  "fournisseurSourceId",
  "createdAt",
  "updatedAt"
)
SELECT
  f."organisationId",
  'FR-' || LPAD((ROW_NUMBER() OVER (PARTITION BY f."organisationId" ORDER BY f."id"))::text, 4, '0'),
  'FOURNISSEUR'::"CompteType",
  f."nom",
  f."telephone",
  f."email",
  f."adresse",
  true,
  f."id",
  f."createdAt",
  f."updatedAt"
FROM "Fournisseur" f
WHERE NOT EXISTS (
  SELECT 1
  FROM "Compte" compte
  WHERE compte."fournisseurSourceId" = f."id"
);
