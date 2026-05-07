import { createContext, useContext, useReducer } from "react";

const CartContext = createContext(null);
const QUANTITY_STEP = 0.25;

const roundToStep = (value, step = QUANTITY_STEP) => {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Number((Math.round(numericValue / step) * step).toFixed(2));
};

const roundCurrency = (value) => Number(Number(value || 0).toFixed(2));

const normalizeQuantity = (value) => roundToStep(Math.max(0, Number(value || 0)));

function cartReducer(state, action) {
  switch (action.type) {
    case "ADD_ITEM": {
      const existingItem = state.items.find((item) => item.id === action.payload.id);

      if (existingItem) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload.id
              ? { ...item, quantity: normalizeQuantity(item.quantity + QUANTITY_STEP) }
              : item
          ),
        };
      }

      return {
        ...state,
        items: [...state.items, { ...action.payload, quantity: QUANTITY_STEP }],
      };
    }

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload),
      };

    case "INCREASE_QUANTITY":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload
            ? { ...item, quantity: normalizeQuantity(item.quantity + QUANTITY_STEP) }
            : item
        ),
      };

    case "DECREASE_QUANTITY":
      return {
        ...state,
        items: state.items
          .map((item) =>
            item.id === action.payload
              ? { ...item, quantity: normalizeQuantity(item.quantity - QUANTITY_STEP) }
              : item
          )
          .filter((item) => item.quantity > 0),
      };

    case "UPDATE_QUANTITY":
      return {
        ...state,
        items: state.items
          .map((item) =>
            item.id === action.payload.id
              ? { ...item, quantity: normalizeQuantity(action.payload.quantity) }
              : item
          )
          .filter((item) => item.quantity > 0),
      };

    case "UPDATE_PRICE":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id
            ? { ...item, price: roundCurrency(action.payload.price) }
            : item
        ),
      };

    case "CLEAR_CART":
      return { ...state, items: [] };

    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  const value = {
    items: state.items,
    addItem: (item) => dispatch({ type: "ADD_ITEM", payload: item }),
    removeItem: (id) => dispatch({ type: "REMOVE_ITEM", payload: id }),
    increaseQuantity: (id) =>
      dispatch({ type: "INCREASE_QUANTITY", payload: id }),
    decreaseQuantity: (id) =>
      dispatch({ type: "DECREASE_QUANTITY", payload: id }),
    updateQuantity: (id, quantity) =>
      dispatch({ type: "UPDATE_QUANTITY", payload: { id, quantity } }),
    updatePrice: (id, price) =>
      dispatch({ type: "UPDATE_PRICE", payload: { id, price } }),
    clearCart: () => dispatch({ type: "CLEAR_CART" }),
    totalItems: roundToStep(
      state.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    ),
    totalAmount: roundCurrency(
      state.items.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0),
        0
      )
    ),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}
