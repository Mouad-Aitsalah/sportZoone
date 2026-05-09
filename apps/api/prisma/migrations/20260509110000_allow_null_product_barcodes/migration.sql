ALTER TABLE "Produit" ALTER COLUMN "codeBarres" DROP NOT NULL;

UPDATE "Produit"
SET "codeBarres" = NULL
WHERE TRIM(COALESCE("codeBarres", '')) = '';

UPDATE "ProduitVariante"
SET "codeBarres" = NULL
WHERE TRIM(COALESCE("codeBarres", '')) = '';
