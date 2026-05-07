CREATE TYPE "SessionCaisseStatut" AS ENUM ('OUVERTE', 'FERMEE');

CREATE TABLE "SessionCaisse" (
  "id" SERIAL NOT NULL,
  "organisationId" TEXT NOT NULL,
  "numeroSession" TEXT NOT NULL,
  "caisseId" INTEGER NOT NULL,
  "pointDeVenteId" INTEGER NOT NULL,
  "utilisateurId" INTEGER NOT NULL,
  "dateOuverture" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dateFermeture" TIMESTAMP(3),
  "statut" "SessionCaisseStatut" NOT NULL DEFAULT 'OUVERTE',
  "totalVentes" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "nombreTickets" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionCaisse_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Vente"
ADD COLUMN "sessionCaisseId" INTEGER;

CREATE UNIQUE INDEX "SessionCaisse_organisationId_numeroSession_key"
ON "SessionCaisse"("organisationId", "numeroSession");

CREATE INDEX "SessionCaisse_organisationId_idx" ON "SessionCaisse"("organisationId");
CREATE INDEX "SessionCaisse_caisseId_idx" ON "SessionCaisse"("caisseId");
CREATE INDEX "SessionCaisse_pointDeVenteId_idx" ON "SessionCaisse"("pointDeVenteId");
CREATE INDEX "SessionCaisse_utilisateurId_idx" ON "SessionCaisse"("utilisateurId");
CREATE INDEX "SessionCaisse_statut_idx" ON "SessionCaisse"("statut");
CREATE INDEX "SessionCaisse_dateOuverture_idx" ON "SessionCaisse"("dateOuverture");
CREATE INDEX "Vente_sessionCaisseId_idx" ON "Vente"("sessionCaisseId");

ALTER TABLE "SessionCaisse"
ADD CONSTRAINT "SessionCaisse_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionCaisse"
ADD CONSTRAINT "SessionCaisse_caisseId_fkey"
FOREIGN KEY ("caisseId") REFERENCES "Caisse"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SessionCaisse"
ADD CONSTRAINT "SessionCaisse_pointDeVenteId_fkey"
FOREIGN KEY ("pointDeVenteId") REFERENCES "PointDeVente"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SessionCaisse"
ADD CONSTRAINT "SessionCaisse_utilisateurId_fkey"
FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vente"
ADD CONSTRAINT "Vente_sessionCaisseId_fkey"
FOREIGN KEY ("sessionCaisseId") REFERENCES "SessionCaisse"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
