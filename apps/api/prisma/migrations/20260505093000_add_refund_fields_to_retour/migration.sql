ALTER TABLE "Retour"
ADD COLUMN "numero" TEXT,
ADD COLUMN "montant" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "Retour"
ALTER COLUMN "venteId" DROP NOT NULL;

WITH numbered_returns AS (
  SELECT
    id,
    "organisationId",
    ROW_NUMBER() OVER (
      PARTITION BY "organisationId", EXTRACT(YEAR FROM "createdAt")
      ORDER BY "createdAt" ASC, id ASC
    ) AS annual_counter,
    EXTRACT(YEAR FROM "createdAt")::TEXT AS annual_year
  FROM "Retour"
)
UPDATE "Retour" AS r
SET "numero" = numbered_returns.annual_counter::TEXT || '/' || numbered_returns.annual_year
FROM numbered_returns
WHERE r.id = numbered_returns.id
  AND r."numero" IS NULL;

ALTER TABLE "Retour"
ALTER COLUMN "numero" SET NOT NULL;

CREATE UNIQUE INDEX "Retour_organisationId_numero_key" ON "Retour"("organisationId", "numero");
CREATE INDEX "Retour_numero_idx" ON "Retour"("numero");
