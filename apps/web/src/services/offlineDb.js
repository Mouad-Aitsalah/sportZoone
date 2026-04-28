import { openDB } from "idb";

const DB_NAME = "multi-pos-offline";
const DB_VERSION = 1;
const SALES_STORE = "pending-sales";

const getOfflineDb = () =>
  openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SALES_STORE)) {
        const store = db.createObjectStore(SALES_STORE, {
          keyPath: "localId",
        });
        store.createIndex("syncStatus", "syncStatus");
        store.createIndex("createdAt", "createdAt");
      }
    },
  });

export const savePendingSale = async (sale) => {
  const db = await getOfflineDb();
  await db.put(SALES_STORE, sale);
  return sale;
};

export const getOfflineSales = async () => {
  const db = await getOfflineDb();
  const sales = await db.getAll(SALES_STORE);

  return sales.sort(
    (left, right) =>
      new Date(right.createdAt || 0).getTime() -
      new Date(left.createdAt || 0).getTime()
  );
};

export const getPendingSales = async () => {
  const sales = await getOfflineSales();
  return sales.filter((sale) => sale.syncStatus === "pending");
};

export const updateSaleStatus = async (localId, status, errorMessage = null) => {
  const db = await getOfflineDb();
  const sale = await db.get(SALES_STORE, localId);

  if (!sale) {
    return null;
  }

  const updatedSale = {
    ...sale,
    syncStatus: status,
    syncError: errorMessage || null,
    updatedAt: new Date().toISOString(),
  };

  await db.put(SALES_STORE, updatedSale);
  return updatedSale;
};

export const markSaleAsSynced = async (localId) =>
  updateSaleStatus(localId, "synced", null);

export const markSaleAsFailed = async (localId, errorMessage = null) =>
  updateSaleStatus(localId, "failed", errorMessage);
