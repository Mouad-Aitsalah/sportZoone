-- CreateTable
CREATE TABLE "ProduitVariante" (
    "id" SERIAL NOT NULL,
    "organisationId" TEXT NOT NULL,
    "produitId" INTEGER NOT NULL,
    "taille" TEXT,
    "couleur" TEXT,
    "codeBarres" TEXT,
    "prixAchat" DECIMAL(10,2),
    "prixVente" DECIMAL(10,2),
    "quantiteStock" INTEGER NOT NULL DEFAULT 0,
    "seuilMinimum" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProduitVariante_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Retour" ADD COLUMN "varianteId" INTEGER;

-- AlterTable
ALTER TABLE "VenteLigne" ADD COLUMN "varianteId" INTEGER;

-- Seed default variants for existing products
INSERT INTO "ProduitVariante" (
    "organisationId",
    "produitId",
    "taille",
    "couleur",
    "codeBarres",
    "prixAchat",
    "prixVente",
    "quantiteStock",
    "seuilMinimum",
    "actif",
    "createdAt",
    "updatedAt"
)
SELECT
    p."organisationId",
    p."id",
    'Unique',
    NULL,
    p."codeBarres",
    p."prixAchat",
    p."prixVente",
    COALESCE(stock_totals."quantite", 0),
    COALESCE(p."seuilMinimum", 0),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Produit" p
LEFT JOIN (
    SELECT
        "organisationId",
        "produitId",
        SUM("quantite")::INTEGER AS "quantite"
    FROM "Stock"
    GROUP BY "organisationId", "produitId"
) AS stock_totals
    ON stock_totals."organisationId" = p."organisationId"
   AND stock_totals."produitId" = p."id"
LEFT JOIN "ProduitVariante" pv
    ON pv."organisationId" = p."organisationId"
   AND pv."produitId" = p."id"
WHERE pv."id" IS NULL;

-- Backfill existing sale lines and returns
UPDATE "VenteLigne" vl
SET "varianteId" = pv."id"
FROM "ProduitVariante" pv
WHERE vl."varianteId" IS NULL
  AND pv."organisationId" = vl."organisationId"
  AND pv."produitId" = vl."produitId";

UPDATE "Retour" r
SET "varianteId" = pv."id"
FROM "ProduitVariante" pv
WHERE r."varianteId" IS NULL
  AND pv."organisationId" = r."organisationId"
  AND pv."produitId" = r."produitId";

-- CreateIndex
CREATE INDEX "ProduitVariante_organisationId_idx" ON "ProduitVariante"("organisationId");

-- CreateIndex
CREATE INDEX "ProduitVariante_produitId_idx" ON "ProduitVariante"("produitId");

-- CreateIndex
CREATE INDEX "ProduitVariante_actif_idx" ON "ProduitVariante"("actif");

-- CreateIndex
CREATE UNIQUE INDEX "ProduitVariante_organisationId_codeBarres_key" ON "ProduitVariante"("organisationId", "codeBarres");

-- CreateIndex
CREATE INDEX "VenteLigne_varianteId_idx" ON "VenteLigne"("varianteId");

-- CreateIndex
CREATE INDEX "Retour_varianteId_idx" ON "Retour"("varianteId");

-- AddForeignKey
ALTER TABLE "ProduitVariante" ADD CONSTRAINT "ProduitVariante_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduitVariante" ADD CONSTRAINT "ProduitVariante_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenteLigne" ADD CONSTRAINT "VenteLigne_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "ProduitVariante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retour" ADD CONSTRAINT "Retour_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "ProduitVariante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
