const CACHE_STORAGE_PREFIX = "sportzone-cache:";
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const memoryCache = new Map();

const now = () => Date.now();

const getStorageKey = (key) => `${CACHE_STORAGE_PREFIX}${key}`;

const safeReadLocalStorage = (key) => {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
};

const safeWriteLocalStorage = (key, value) => {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Ignore quota/storage errors and keep the in-memory cache hot.
  }
};

const safeRemoveLocalStorage = (key) => {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Ignore storage cleanup errors.
  }
};

const normalizeCacheRecord = (record) => {
  if (!record || typeof record !== "object") {
    return null;
  }

  if (record.updatedAt === undefined || record.data === undefined) {
    return null;
  }

  const updatedAt = Number(record.updatedAt);

  if (!Number.isFinite(updatedAt)) {
    return null;
  }

  return {
    updatedAt,
    data: record.data,
  };
};

const readStoredCacheRecord = (key) => {
  const inMemoryRecord = normalizeCacheRecord(memoryCache.get(key));

  if (inMemoryRecord) {
    return inMemoryRecord;
  }

  const rawValue = safeReadLocalStorage(getStorageKey(key));

  if (!rawValue) {
    return null;
  }

  try {
    const parsedRecord = normalizeCacheRecord(JSON.parse(rawValue));

    if (!parsedRecord) {
      safeRemoveLocalStorage(getStorageKey(key));
      return null;
    }

    memoryCache.set(key, parsedRecord);
    return parsedRecord;
  } catch (error) {
    safeRemoveLocalStorage(getStorageKey(key));
    return null;
  }
};

export const CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;

export const CACHE_KEYS = {
  analytics: (period = "week") => `analytics:${period}`,
  cashRegisters: (storeId) => `cash-registers:${storeId || "default"}`,
  currentCashSession: (storeId, cashRegisterId, userId = "current") =>
    `cash-session:${storeId || "default"}:${cashRegisterId || "default"}:${userId || "current"}`,
  comptes: (scope = "all") => `comptes:${scope}`,
  customers: () => "customers",
  productCategories: () => "product-categories",
  products: (scope = "default") => `products:${scope}`,
  sales: (scope = "default") => `sales:${scope}`,
  salesSessions: (scope = "default") => `sales-sessions:${scope}`,
  stock: (scope = "default") => `stock:${scope}`,
  stockAlerts: () => "stock-alerts",
  stores: () => "stores",
  suppliers: () => "suppliers",
};

export const readCache = (key, ttlMs = DEFAULT_CACHE_TTL_MS) => {
  const record = readStoredCacheRecord(key);

  if (!record) {
    return null;
  }

  const age = now() - record.updatedAt;

  return {
    data: record.data,
    updatedAt: record.updatedAt,
    isExpired: age > ttlMs,
  };
};

export const writeCache = (key, data) => {
  const record = {
    updatedAt: now(),
    data,
  };

  memoryCache.set(key, record);
  safeWriteLocalStorage(getStorageKey(key), JSON.stringify(record));
  return record;
};

export const invalidateCache = (key) => {
  memoryCache.delete(key);
  safeRemoveLocalStorage(getStorageKey(key));
};

export const invalidateCacheMany = (keys = []) => {
  keys.forEach((key) => invalidateCache(key));
};

export const invalidateCacheByPrefix = (prefix) => {
  if (!prefix) {
    return;
  }

  Array.from(memoryCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  });

  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    const keysToRemove = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index);

      if (storageKey?.startsWith(getStorageKey(prefix))) {
        keysToRemove.push(storageKey);
      }
    }

    keysToRemove.forEach((storageKey) => safeRemoveLocalStorage(storageKey));
  } catch (error) {
    // Ignore storage cleanup errors.
  }
};

export const invalidateDomainCaches = (...prefixes) => {
  prefixes.filter(Boolean).forEach((prefix) => invalidateCacheByPrefix(prefix));
};
