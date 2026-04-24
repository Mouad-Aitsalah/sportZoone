import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import PaymentModal from "../components/PaymentModal";
import SectionCard from "../components/SectionCard";
import api from "../services/api";
import { getCurrentUser } from "../store/authStore";
import { useCart } from "../store/cartStore";
import { formatCurrencyDh } from "../utils/formatters";

function PosPage() {
  const [barcode, setBarcode] = useState("");
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [notice, setNotice] = useState({
    type: "info",
    message:
      "Scannez un code-barres ou utilisez l'ajout rapide pour remplir le panier.",
  });
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const currentUser = getCurrentUser();
  const {
    items,
    addItem,
    removeItem,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
    totalItems,
    totalAmount,
  } = useCart();

  const activeStoreId = currentUser?.storeId || 1;

  useEffect(() => {
    let isMounted = true;

    async function fetchProducts() {
      try {
        setIsLoadingProducts(true);
        const response = await api.get("/products");
        const list = response.data?.data || [];

        if (isMounted) {
          setProducts(list);
        }
      } catch (error) {
        if (isMounted) {
          setNotice({
            type: "warning",
            message:
              error.response?.data?.message ||
              "Impossible de charger la liste rapide des produits.",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingProducts(false);
        }
      }
    }

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshProducts = async () => {
    try {
      const response = await api.get("/products");
      setProducts(response.data?.data || []);
    } catch (error) {
      // Keep the cashier flow stable even if the background refresh fails.
    }
  };

  const addProductWithStockCheck = (product) => {
    const existingItem = items.find((item) => item.id === product.id);
    const currentQuantity = existingItem?.quantity || 0;
    const availableStock = product.stock ?? existingItem?.stock ?? 0;

    if (availableStock <= 0) {
      setNotice({
        type: "error",
        message: `${product.name} n'est plus disponible en stock.`,
      });
      return false;
    }

    if (currentQuantity >= availableStock) {
      setNotice({
        type: "warning",
        message: `Stock insuffisant pour ${product.name}. Stock disponible: ${availableStock}.`,
      });
      return false;
    }

    addItem({
      ...product,
      price: product.price ?? product.salePrice ?? 0,
    });
    setNotice({
      type: "success",
      message: `${product.name} ajoute au panier.`,
    });
    return true;
  };

  const handleAddByBarcode = async (event) => {
    event.preventDefault();
    const trimmedBarcode = barcode.trim();

    if (!trimmedBarcode) {
      setNotice({
        type: "error",
        message: "Veuillez entrer ou scanner un code-barres.",
      });
      return;
    }

    try {
      setIsSearchingBarcode(true);

      const response = await api.get(
        `/products/barcode/${encodeURIComponent(trimmedBarcode)}`,
        {
          params: {
            storeId: activeStoreId,
          },
        }
      );
      const product = {
        ...response.data,
        price: response.data.salePrice,
      };
      const added = addProductWithStockCheck(product);

      if (added) {
        setBarcode("");
      }
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.status === 404
            ? "Produit introuvable. Verifiez le code-barres puis reessayez."
            : error.response?.data?.message ||
              "Erreur lors de la recherche du produit.",
      });
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  const handleOpenPayment = () => {
    if (!items.length) {
      setNotice({
        type: "warning",
        message: "Ajoutez au moins un produit avant de valider le paiement.",
      });
      return;
    }

    setIsPaymentOpen(true);
  };

  const handleQuickAdd = async (product) => {
    try {
      setIsSearchingBarcode(true);

      const response = await api.get(
        `/products/barcode/${encodeURIComponent(product.barcode)}`,
        {
          params: {
            storeId: activeStoreId,
          },
        }
      );

      addProductWithStockCheck({
        ...response.data,
        price: response.data.salePrice,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Impossible d'ajouter rapidement ce produit.",
      });
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  const handleClearCart = () => {
    clearCart();
    setNotice({
      type: "info",
      message: "Panier vide. Pret pour une nouvelle vente.",
    });
  };

  const handleConfirmPayment = async (method) => {
    const userId = currentUser?.id;

    if (!userId) {
      setIsPaymentOpen(false);
      setNotice({
        type: "error",
        message:
          "Utilisateur introuvable. Reconnectez-vous avant de valider la vente.",
      });
      return;
    }

    const salePayload = {
      storeId: activeStoreId,
      userId,
      paymentMethod: method,
      items: items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        unitPrice: item.salePrice ?? item.price,
      })),
      total: totalAmount,
    };

    try {
      setIsSubmittingSale(true);

      const response = await api.post("/sales", salePayload);
      const ticketNumber =
        response.data?.ticketNumber ||
        response.data?.data?.ticketNumber ||
        response.data?.sale?.ticketNumber;

      clearCart();
      setIsPaymentOpen(false);
      setNotice({
        type: "success",
        message: ticketNumber
          ? `Paiement confirme. Ticket ${ticketNumber} genere avec succes.`
          : "Paiement confirme avec succes.",
      });
      await refreshProducts();
    } catch (error) {
      const backendMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        (typeof error.response?.data?.details === "string"
          ? error.response.data.details
          : "");

      setNotice({
        type: "error",
        message:
          backendMessage ||
          "Impossible de finaliser la vente. Veuillez reessayer.",
      });
    } finally {
      setIsSubmittingSale(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Caisse"
        title="POS / Caisse"
        description="Scanner les produits, ajuster les quantites et finaliser l'encaissement en quelques clics."
      />

      <div className="pos-layout">
        <SectionCard
          title="Scanner des produits"
          description="Saisir un code-barres ou utiliser les raccourcis d'ajout rapide."
        >
          <div className={`inline-notice ${notice.type}`}>{notice.message}</div>

          <form className="pos-toolbar" onSubmit={handleAddByBarcode}>
            <input
              className="text-input"
              type="text"
              placeholder="Entrer ou scanner un code-barres"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
            />
            <button
              className="primary-button"
              type="submit"
              disabled={isSearchingBarcode}
            >
              {isSearchingBarcode ? "Recherche..." : "Ajouter"}
            </button>
          </form>

          <div className="product-hint-list">
            {isLoadingProducts ? (
              <div className="empty-state">
                Chargement des produits rapides...
              </div>
            ) : (
              products.map((product) => (
                <div className="hint-card" key={product.id}>
                  <h3>{product.name}</h3>
                  <p>Code-barres: {product.barcode}</p>
                  <p>Prix: {formatCurrencyDh(product.salePrice || 0)}</p>
                  <p className="muted-text">
                    {product.active ? "Actif" : "Inactif"}
                  </p>
                  <button
                    className="ghost-button small-button"
                    type="button"
                    onClick={() => handleQuickAdd(product)}
                    disabled={!product.active || isSearchingBarcode}
                  >
                    Ajout rapide
                  </button>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Panier courant"
          description="Verifier les quantites, les prix et le total avant paiement."
          actions={
            <button
              className="ghost-button"
              type="button"
              onClick={handleClearCart}
            >
              Vider panier
            </button>
          }
        >
          <div className="cart-headline">
            <span>Articles dans le panier</span>
            <strong>{totalItems}</strong>
          </div>

          {items.length ? (
            <div className="cart-list">
              {items.map((item) => (
                <div className="cart-item" key={item.id}>
                  <div className="cart-item-main">
                    <strong>{item.name}</strong>
                    <span>{item.storeName || item.store || "Magasin courant"}</span>
                  </div>

                  <div className="cart-quantity-controls">
                    <button
                      className="quantity-button"
                      type="button"
                      onClick={() => decreaseQuantity(item.id)}
                    >
                      -
                    </button>
                    <strong>{item.quantity}</strong>
                    <button
                      className="quantity-button"
                      type="button"
                      onClick={() => {
                        if (item.quantity >= (item.stock ?? 0)) {
                          setNotice({
                            type: "warning",
                            message: `Stock insuffisant pour ${item.name}. Stock disponible: ${item.stock ?? 0}.`,
                          });
                          return;
                        }

                        increaseQuantity(item.id);
                      }}
                    >
                      +
                    </button>
                  </div>

                  <div className="cart-price-block">
                    <span>Unite: {formatCurrencyDh(item.price)}</span>
                    <strong>
                      Sous-total: {formatCurrencyDh(item.quantity * item.price)}
                    </strong>
                  </div>

                  <button
                    className="table-action-button danger"
                    type="button"
                    onClick={() => removeItem(item.id)}
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Le panier est vide. Scannez un article pour demarrer la vente.
            </div>
          )}

          <div className="cart-summary">
            <div className="summary-row">
              <span>Produits</span>
              <strong>{items.length}</strong>
            </div>
            <div className="summary-row">
              <span>Unites</span>
              <strong>{totalItems}</strong>
            </div>
            <div className="summary-row grand-total">
              <span>Total</span>
              <span>{formatCurrencyDh(totalAmount)}</span>
            </div>
            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={handleOpenPayment}
              >
                Valider paiement
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => window.print()}
              >
                Imprimer ticket
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      <PaymentModal
        isOpen={isPaymentOpen}
        totalAmount={totalAmount}
        totalItems={totalItems}
        onClose={() => setIsPaymentOpen(false)}
        onConfirm={handleConfirmPayment}
        isProcessing={isSubmittingSale}
      />
    </div>
  );
}

export default PosPage;
