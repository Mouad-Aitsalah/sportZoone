import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";

function SuppliersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchSuppliers() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await api.get("/suppliers");
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];

        if (isMounted) {
          setSuppliers(list);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les fournisseurs pour le moment."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchSuppliers();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter((supplier) => {
        const query = searchTerm.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return (
          supplier.name?.toLowerCase().includes(query) ||
          supplier.email?.toLowerCase().includes(query) ||
          supplier.phone?.toLowerCase().includes(query)
        );
      }),
    [searchTerm, suppliers]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Fournisseurs"
        title="Gestion des fournisseurs"
        description="Conserver les contacts, coordonner les approvisionnements et suivre les partenaires actifs."
        actions={
          <button className="primary-button" type="button">
            Ajouter fournisseur
          </button>
        }
      />

      <SectionCard
        title="Liste fournisseurs"
        description="Recherche rapide par nom, email ou numero de telephone."
      >
        <div className="table-toolbar">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un fournisseur"
          />
        </div>

        {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        <DataTable
          columns={[
            { key: "name", label: "Nom" },
            { key: "phone", label: "Telephone" },
            { key: "email", label: "Email" },
            { key: "address", label: "Adresse" },
            { key: "productsCount", label: "Nb produits" },
            { key: "actions", label: "Actions" },
          ]}
          data={filteredSuppliers}
          emptyTitle={isLoading ? "Chargement..." : "Aucun fournisseur trouve"}
          emptyDescription={
            isLoading
              ? "Recuperation des fournisseurs en cours."
              : "Ajustez votre recherche pour afficher un fournisseur."
          }
          renderRow={(supplier) => (
            <tr key={supplier.id}>
              <td>
                <strong>{supplier.name}</strong>
              </td>
              <td>{supplier.phone || "-"}</td>
              <td>{supplier.email || "-"}</td>
              <td>{supplier.address || "-"}</td>
              <td>{supplier.productsCount || supplier.products?.length || 0}</td>
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

export default SuppliersPage;
