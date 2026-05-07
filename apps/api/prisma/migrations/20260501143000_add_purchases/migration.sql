-- CreateTable
CREATE TABLE "Achat" (
    "id" SERIAL NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fournisseurId" INTEGER NOT NULL,
    "pointDeVenteId" INTEGER NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENREGISTRE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchatItem" (
    "id" SERIAL NOT NULL,
    "organisationId" TEXT NOT NULL,
    "achatId" INTEGER NOT NULL,
    "produitId" INTEGER NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixAchat" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "AchatItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Achat_reference_key" ON "Achat"("reference");

-- CreateIndex
CREATE INDEX "Achat_organisationId_idx" ON "Achat"("organisationId");
CREATE INDEX "Achat_fournisseurId_idx" ON "Achat"("fournisseurId");
CREATE INDEX "Achat_pointDeVenteId_idx" ON "Achat"("pointDeVenteId");
CREATE INDEX "Achat_createdAt_idx" ON "Achat"("createdAt");

-- CreateIndex
CREATE INDEX "AchatItem_organisationId_idx" ON "AchatItem"("organisationId");
CREATE INDEX "AchatItem_achatId_idx" ON "AchatItem"("achatId");
CREATE INDEX "AchatItem_produitId_idx" ON "AchatItem"("produitId");

-- AddForeignKey
ALTER TABLE "Achat"
ADD CONSTRAINT "Achat_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Achat"
ADD CONSTRAINT "Achat_fournisseurId_fkey"
FOREIGN KEY ("fournisseurId") REFERENCES "Fournisseur"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Achat"
ADD CONSTRAINT "Achat_pointDeVenteId_fkey"
FOREIGN KEY ("pointDeVenteId") REFERENCES "PointDeVente"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AchatItem"
ADD CONSTRAINT "AchatItem_organisationId_fkey"
FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AchatItem"
ADD CONSTRAINT "AchatItem_achatId_fkey"
FOREIGN KEY ("achatId") REFERENCES "Achat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AchatItem"
ADD CONSTRAINT "AchatItem_produitId_fkey"
FOREIGN KEY ("produitId") REFERENCES "Produit"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
