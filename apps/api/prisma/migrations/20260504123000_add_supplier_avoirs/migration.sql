DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AvoirFournisseurStatut') THEN
    CREATE TYPE "AvoirFournisseurStatut" AS ENUM (
      'BROUILLON',
      'VALIDE',
      'REMBOURSE',
      'ANNULE'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompensationMode') THEN
    CREATE TYPE "CompensationMode" AS ENUM (
      'REMBOURSEMENT',
      'AVOIR_PROCHAINE_FACTURE',
      'REMPLACEMENT_PRODUIT'
    );
  END IF;
END $$;

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';

CREATE TABLE "AvoirFournisseur" (
  "id" SERIAL NOT NULL,
  "organisationId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "compteFournisseurId" INTEGER NOT NULL,
  "achatId" INTEGER,
  "pointDeVenteId" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total" DECIMAL(10,2) NOT NULL,
  "statut" "AvoirFournisseurStatut" NOT NULL DEFAULT 'BROUILLON',
  "motif" TEXT,
  "compensationMode" "CompensationMode" NOT NULL,
  "commentaire" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AvoirFournisseur_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvoirFournisseurLigne" (
  "id" SERIAL NOT NULL,
  "organisationId" TEXT NOT NULL,
  "avoirFournisseurId" INTEGER NOT NULL,
  "produitId" INTEGER NOT NULL,
  "quantite" INTEGER NOT NULL,
  "prixAchat" DECIMAL(10,2) NOT NULL,
  "sousTotal" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AvoirFournisseurLigne_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvoirFournisseur_organisationId_numero_key"
ON "AvoirFournisseur"("organisationId", "numero");

CREATE INDEX "AvoirFournisseur_organisationId_idx"
ON "AvoirFournisseur"("organisationId");

CREATE INDEX "AvoirFournisseur_compteFournisseurId_idx"
ON "AvoirFournisseur"("compteFournisseurId");

CREATE INDEX "AvoirFournisseur_achatId_idx"
ON "AvoirFournisseur"("achatId");

CREATE INDEX "AvoirFournisseur_pointDeVenteId_idx"
ON "AvoirFournisseur"("pointDeVenteId");

CREATE INDEX "AvoirFournisseur_date_idx"
ON "AvoirFournisseur"("date");

CREATE INDEX "AvoirFournisseur_statut_idx"
ON "AvoirFournisseur"("statut");

CREATE INDEX "AvoirFournisseurLigne_organisationId_idx"
ON "AvoirFournisseurLigne"("organisationId");

CREATE INDEX "AvoirFournisseurLigne_avoirFournisseurId_idx"
ON "AvoirFournisseurLigne"("avoirFournisseurId");

CREATE INDEX "AvoirFournisseurLigne_produitId_idx"
ON "AvoirFournisseurLigne"("produitId");

ALTER TABLE "AvoirFournisseur"
ADD CONSTRAINT "AvoirFournisseur_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvoirFournisseur"
ADD CONSTRAINT "AvoirFournisseur_compteFournisseurId_fkey"
FOREIGN KEY ("compteFournisseurId") REFERENCES "Compte"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AvoirFournisseur"
ADD CONSTRAINT "AvoirFournisseur_achatId_fkey"
FOREIGN KEY ("achatId") REFERENCES "Achat"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AvoirFournisseur"
ADD CONSTRAINT "AvoirFournisseur_pointDeVenteId_fkey"
FOREIGN KEY ("pointDeVenteId") REFERENCES "PointDeVente"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AvoirFournisseurLigne"
ADD CONSTRAINT "AvoirFournisseurLigne_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvoirFournisseurLigne"
ADD CONSTRAINT "AvoirFournisseurLigne_avoirFournisseurId_fkey"
FOREIGN KEY ("avoirFournisseurId") REFERENCES "AvoirFournisseur"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvoirFournisseurLigne"
ADD CONSTRAINT "AvoirFournisseurLigne_produitId_fkey"
FOREIGN KEY ("produitId") REFERENCES "Produit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
