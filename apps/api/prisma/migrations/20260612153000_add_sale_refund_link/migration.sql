ALTER TABLE "Vente"
ADD COLUMN "originalSaleId" INTEGER;

CREATE INDEX "Vente_originalSaleId_idx" ON "Vente"("originalSaleId");

ALTER TABLE "Vente"
ADD CONSTRAINT "Vente_originalSaleId_fkey"
FOREIGN KEY ("originalSaleId") REFERENCES "Vente"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
