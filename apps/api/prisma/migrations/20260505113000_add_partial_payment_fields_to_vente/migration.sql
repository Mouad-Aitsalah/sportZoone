ALTER TABLE "Vente"
ADD COLUMN "paidAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN "remainingAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'PAID';

UPDATE "Vente"
SET
  "paidAmount" = CASE
    WHEN "total" < 0 OR "status" = 'refunded' THEN 0
    WHEN "paymentMethod" = 'credit' THEN 0
    ELSE "total"
  END,
  "remainingAmount" = CASE
    WHEN "total" < 0 OR "status" = 'refunded' THEN 0
    WHEN "paymentMethod" = 'credit' THEN "total"
    ELSE 0
  END,
  "paymentStatus" = CASE
    WHEN "total" < 0 OR "status" = 'refunded' THEN 'REFUNDED'
    WHEN "paymentMethod" = 'credit' THEN 'CREDIT'
    ELSE 'PAID'
  END;
