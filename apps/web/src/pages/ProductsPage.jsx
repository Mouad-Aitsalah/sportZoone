import { useEffect, useMemo, useState } from "react";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import SearchInput from "../components/SearchInput";
import api from "../services/api";
import { formatCurrencyDh } from "../utils/formatters";

function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchProducts() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await api.get("/products");

        if (isMounted) {
          setProducts(response.data?.data || []);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les produits pour le moment."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const query = searchTerm.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return (
          product.name?.toLowerCase().includes(query) ||
          product.barcode?.toLowerCase().includes(query) ||
          product.category?.toLowerCase().includes(query) ||
          product.supplierName?.toLowerCase().includes(query)
        );
      }),
    [products, searchTerm]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Produits"
        description="Piloter les references, les prix et la disponibilite produit sur les points de vente."
        actions={
          <button className="primary-button" type="button">
            Ajouter produit
          </button>
        }
      />

      <SectionCard
        title="Catalogue produits"
        description="Rechercher une reference par nom ou code-barres."
      >
        <div className="table-toolbar">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher par nom ou code-barres"
          />
        </div>

        {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        <DataTable
          columns={[
            { key: "product", label: "Produit" },
            { key: "barcode", label: "Code-barres" },
            { key: "supplier", label: "Fournisseur" },
            { key: "category", label: "Categorie" },
            { key: "purchasePrice", label: "Prix achat" },
            { key: "salePrice", label: "Prix vente" },
            { key: "status", label: "Statut" },
            { key: "actions", label: "Actions" },
          ]}
          data={filteredProducts}
          emptyTitle={isLoading ? "Chargement des produits..." : "Aucun produit trouve"}
          emptyDescription={
            isLoading
              ? "Veuillez patienter pendant la recuperation des donnees."
              : "Essayez un autre nom ou code-barres."
          }
          renderRow={(product) => (
            <tr key={product.id}>
              <td>
                <strong>{product.name}</strong>
              </td>
              <td>{product.barcode}</td>
              <td>{product.supplierName || "-"}</td>
              <td>{product.category}</td>
              <td>{formatCurrencyDh(product.purchasePrice || 0)}</td>
              <td>{formatCurrencyDh(product.salePrice || 0)}</td>
              <td>
                <Badge tone={product.active ? "success" : "warning"}>
                  {product.active ? "Actif" : "Inactif"}
                </Badge>
              </td>
              <td>
                <div className="table-action-row">
                  <button className="table-action-button" type="button">
                    Edit
                  </button>
                  <button className="table-action-button danger" type="button">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          )}
        />
      </SectionCard>
    </div>
  );
}

export default ProductsPage;
