-- Add only the purchase date column introduced before the full Achat enhancement.
ALTER TABLE "Achat"
ADD COLUMN IF NOT EXISTS "dateAchat" TIMESTAMP(3);

UPDATE "Achat"
SET "dateAchat" = COALESCE("dateAchat", "createdAt")
WHERE "dateAchat" IS NULL;

ALTER TABLE "Achat"
ALTER COLUMN "dateAchat" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Achat"
ALTER COLUMN "dateAchat" SET NOT NULL;
