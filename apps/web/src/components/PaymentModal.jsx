import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { formatCurrencyDh } from "../utils/formatters";

const paymentOptions = [
  { label: "Especes", value: "cash" },
  { label: "Carte bancaire", value: "card" },
  { label: "Credit", value: "credit" },
  { label: "Paiement partiel", value: "partial" },
];

function PaymentModal({
  isOpen,
  totalAmount,
  totalItems,
  onClose,
  onConfirm,
  isProcessing = false,
}) {
  const [paymentMethod, setPaymentMethod] = useState(paymentOptions[0].value);
  const [partialPaidAmount, setPartialPaidAmount] = useState("");
  const [validationError, setValidationError] = useState("");

  const partialValues = useMemo(() => {
    const paidAmount = Number(partialPaidAmount);
    const isValidNumber = partialPaidAmount !== "" && Number.isFinite(paidAmount);
    const remainingAmount = isValidNumber ? totalAmount - paidAmount : totalAmount;

    return {
      paidAmount,
      remainingAmount,
      isValidNumber,
    };
  }, [partialPaidAmount, totalAmount]);

  useEffect(() => {
    if (!isOpen) {
      setPaymentMethod(paymentOptions[0].value);
      setPartialPaidAmount("");
      setValidationError("");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const validatePayment = () => {
    if (paymentMethod !== "partial") {
      setValidationError("");
      return {
        paymentMethod,
      };
    }

    if (!partialValues.isValidNumber) {
      setValidationError("Le montant paye est obligatoire.");
      return null;
    }

    if (partialValues.paidAmount <= 0) {
      setValidationError("Le montant paye doit etre superieur a 0.");
      return null;
    }

    if (partialValues.paidAmount >= totalAmount) {
      setValidationError(
        "Le montant paye doit etre inferieur au total pour utiliser le paiement partiel."
      );
      return null;
    }

    setValidationError("");
    return {
      paymentMethod,
      paidAmount: partialValues.paidAmount,
      remainingAmount: partialValues.remainingAmount,
    };
  };

  const submitPayment = async () => {
    const payload = validatePayment();

    if (!payload) {
      return false;
    }

    return onConfirm(payload);
  };

  const handleConfirm = async () => {
    await submitPayment();
  };

  const handlePrintAndConfirm = async () => {
    const confirmed = await submitPayment();

    if (confirmed) {
      window.print();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      eyebrow="Validation paiement"
      title="Confirmer la transaction"
      description="Confirmation finale avant enregistrement de la vente."
      onClose={onClose}
      actions={
        <>
          <button
            className="ghost-button"
            type="button"
            onClick={onClose}
            disabled={isProcessing}
          >
            Annuler
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handlePrintAndConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? "Confirmation..." : "Imprimer"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? "Confirmation..." : "Confirmer"}
          </button>
        </>
      }
    >
      <div className="modal-summary">
        <div>
          <span>Total articles</span>
          <strong>{totalItems}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatCurrencyDh(totalAmount)}</strong>
        </div>
      </div>

      <div className="payment-option-grid">
        {paymentOptions.map((option) => (
          <button
            key={option.value}
            className={`payment-option ${
              paymentMethod === option.value ? "selected" : ""
            }`}
            type="button"
            onClick={() => {
              setPaymentMethod(option.value);
              setValidationError("");
            }}
            disabled={isProcessing}
          >
            {option.label}
          </button>
        ))}
      </div>

      {paymentMethod === "partial" ? (
        <>
          {validationError ? (
            <div className="inline-notice error">{validationError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="partial-paid-amount">
              Montant paye
            </label>
            <input
              id="partial-paid-amount"
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={partialPaidAmount}
              onChange={(event) => {
                setValidationError("");
                setPartialPaidAmount(event.target.value);
              }}
              disabled={isProcessing}
              placeholder="0.00"
            />
          </div>

          <div className="modal-summary">
            <div>
              <span>Montant paye</span>
              <strong>
                {partialValues.isValidNumber
                  ? formatCurrencyDh(partialValues.paidAmount)
                  : "-"}
              </strong>
            </div>
            <div>
              <span>Reste a payer</span>
              <strong>
                {partialValues.isValidNumber &&
                partialValues.paidAmount > 0 &&
                partialValues.paidAmount < totalAmount
                  ? formatCurrencyDh(partialValues.remainingAmount)
                  : formatCurrencyDh(totalAmount)}
              </strong>
            </div>
          </div>
        </>
      ) : null}

      {paymentMethod === "credit" ? (
        <div className="inline-notice warning">
          Le montant sera ajoute au credit du client.
        </div>
      ) : null}
    </Modal>
  );
}

export default PaymentModal;
