-- CreateEnum
CREATE TYPE "ChargeCategorie" AS ENUM (
    'ELECTRICITE',
    'EAU',
    'LOYER',
    'REPARATION',
    'TRANSPORT',
    'CARBURANT',
    'INTERNET',
    'SALAIRE',
    'AUTRE'
);

-- CreateEnum
CREATE TYPE "ChargeModePaiement" AS ENUM (
    'ESPECE',
    'CARTE',
    'VIREMENT',
    'CHEQUE',
    'AUTRE'
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" SERIAL NOT NULL,
    "organisationId" TEXT NOT NULL,
    "pointDeVenteId" INTEGER NOT NULL,
    "utilisateurId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "categorie" "ChargeCategorie" NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "dateCharge" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modePaiement" "ChargeModePaiement" NOT NULL DEFAULT 'ESPECE',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Charge_organisationId_idx" ON "Charge"("organisationId");
CREATE INDEX "Charge_pointDeVenteId_idx" ON "Charge"("pointDeVenteId");
CREATE INDEX "Charge_utilisateurId_idx" ON "Charge"("utilisateurId");
CREATE INDEX "Charge_dateCharge_idx" ON "Charge"("dateCharge");
CREATE INDEX "Charge_categorie_idx" ON "Charge"("categorie");
CREATE INDEX "Charge_organisationId_pointDeVenteId_dateCharge_idx" ON "Charge"("organisationId", "pointDeVenteId", "dateCharge");

-- AddForeignKey
ALTER TABLE "Charge"
ADD CONSTRAINT "Charge_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Charge"
ADD CONSTRAINT "Charge_pointDeVenteId_fkey"
FOREIGN KEY ("pointDeVenteId") REFERENCES "PointDeVente"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Charge"
ADD CONSTRAINT "Charge_utilisateurId_fkey"
FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
