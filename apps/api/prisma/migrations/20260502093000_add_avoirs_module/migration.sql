CREATE TYPE "AvoirStatut" AS ENUM ('ENREGISTRE', 'REMBOURSE', 'ANNULE');

CREATE TABLE "Avoir" (
    "id" SERIAL NOT NULL,
    "organisationId" TEXT NOT NULL,
    "numeroAvoir" TEXT NOT NULL,
    "compteClientId" INTEGER NOT NULL,
    "pointDeVenteId" INTEGER NOT NULL,
    "dateAvoir" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT,
    "total" DECIMAL(10,2) NOT NULL,
    "statut" "AvoirStatut" NOT NULL DEFAULT 'ENREGISTRE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avoir_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvoirLigne" (
    "id" SERIAL NOT NULL,
    "organisationId" TEXT NOT NULL,
    "avoirId" INTEGER NOT NULL,
    "produitId" INTEGER NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" DECIMAL(10,2) NOT NULL,
    "totalLigne" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvoirLigne_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Avoir_organisationId_numeroAvoir_key" ON "Avoir"("organisationId", "numeroAvoir");
CREATE INDEX "Avoir_organisationId_idx" ON "Avoir"("organisationId");
CREATE INDEX "Avoir_compteClientId_idx" ON "Avoir"("compteClientId");
CREATE INDEX "Avoir_pointDeVenteId_idx" ON "Avoir"("pointDeVenteId");
CREATE INDEX "Avoir_dateAvoir_idx" ON "Avoir"("dateAvoir");
CREATE INDEX "Avoir_statut_idx" ON "Avoir"("statut");

CREATE INDEX "AvoirLigne_organisationId_idx" ON "AvoirLigne"("organisationId");
CREATE INDEX "AvoirLigne_avoirId_idx" ON "AvoirLigne"("avoirId");
CREATE INDEX "AvoirLigne_produitId_idx" ON "AvoirLigne"("produitId");

ALTER TABLE "Avoir"
ADD CONSTRAINT "Avoir_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Avoir"
ADD CONSTRAINT "Avoir_compteClientId_fkey"
FOREIGN KEY ("compteClientId") REFERENCES "Compte"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Avoir"
ADD CONSTRAINT "Avoir_pointDeVenteId_fkey"
FOREIGN KEY ("pointDeVenteId") REFERENCES "PointDeVente"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AvoirLigne"
ADD CONSTRAINT "AvoirLigne_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvoirLigne"
ADD CONSTRAINT "AvoirLigne_avoirId_fkey"
FOREIGN KEY ("avoirId") REFERENCES "Avoir"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvoirLigne"
ADD CONSTRAINT "AvoirLigne_produitId_fkey"
FOREIGN KEY ("produitId") REFERENCES "Produit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
