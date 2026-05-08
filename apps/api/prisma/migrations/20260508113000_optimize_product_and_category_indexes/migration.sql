-- CreateIndex
CREATE INDEX "CategorieProduit_organisationId_actif_idx"
ON "CategorieProduit"("organisationId", "actif");

-- CreateIndex
CREATE INDEX "Produit_organisationId_nom_idx"
ON "Produit"("organisationId", "nom");

-- CreateIndex
CREATE INDEX "Produit_organisationId_categorieId_idx"
ON "Produit"("organisationId", "categorieId");
