ALTER TABLE "AchatItem" ADD COLUMN "varianteId" INTEGER;

UPDATE "AchatItem" ai
SET "varianteId" = pv."id"
FROM "ProduitVariante" pv
WHERE ai."varianteId" IS NULL
  AND pv."produitId" = ai."produitId"
  AND pv."actif" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "ProduitVariante" pv2
    WHERE pv2."produitId" = ai."produitId"
      AND pv2."actif" = true
      AND pv2."id" <> pv."id"
  );

CREATE INDEX "AchatItem_varianteId_idx" ON "AchatItem"("varianteId");

ALTER TABLE "AchatItem"
ADD CONSTRAINT "AchatItem_varianteId_fkey"
FOREIGN KEY ("varianteId") REFERENCES "ProduitVariante"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
