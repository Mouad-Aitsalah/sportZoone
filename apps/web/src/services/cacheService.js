import api from "./api";
import { CACHE_KEYS, CACHE_TTL_MS, invalidateCache, readCache, writeCache } from "../utils/appCache";
import { normalizeStores } from "../utils/storeAccess";

const getCollection = (payload, keys = []) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
};

const normalizeProducts = (payload) => getCollection(payload, ["data", "products"]);
const normalizeComptes = (payload) => getCollection(payload, ["data", "comptes"]);
const normalizeCategories = (payload) => getCollection(payload, ["categories", "data"]);

export const FRONTEND_CACHE_TTL_MS = CACHE_TTL_MS;

export const createCacheResource = ({ key, fetcher, ttlMs = FRONTEND_CACHE_TTL_MS }) => ({
  key,
  ttlMs,
  fetcher,
});

export const readCachedResource = (resource) => readCache(resource.key, resource.ttlMs);

export const readCachedResourceData = (resource, fallbackValue = null) =>
  readCachedResource(resource)?.data ?? fallbackValue;

export const refreshCachedResource = async (resource) => {
  const nextValue = await resource.fetcher();

  if (nextValue === undefined) {
    invalidateCache(resource.key);
    return undefined;
  }

  writeCache(resource.key, nextValue);
  return nextValue;
};

export const hydrateCachedResource = ({
  resource,
  onCachedData,
  onFreshData,
  onError,
  shouldRevalidate = true,
}) => {
  const cachedEntry = readCachedResource(resource);

  if (cachedEntry) {
    onCachedData?.(cachedEntry.data, cachedEntry);
  }

  const refreshPromise = shouldRevalidate
    ? refreshCachedResource(resource)
        .then((freshData) => {
          onFreshData?.(freshData, cachedEntry);
          return freshData;
        })
        .catch((error) => {
          onError?.(error, cachedEntry);
          throw error;
        })
    : Promise.resolve(cachedEntry?.data ?? null);

  return {
    cached: cachedEntry?.data ?? null,
    cachedEntry,
    hasCachedData: Boolean(cachedEntry),
    refreshPromise,
  };
};

export const cacheResources = {
  productsCatalog: () =>
    createCacheResource({
      key: CACHE_KEYS.products("catalog"),
      fetcher: async () => {
        const response = await api.getProducts({
          params: {
            includePagination: false,
          },
        });

        return {
          products: normalizeProducts(response.data),
          stats: response.data?.stats || null,
        };
      },
    }),
  stores: () =>
    createCacheResource({
      key: CACHE_KEYS.stores(),
      fetcher: async () => {
        const response = await api.getStores();
        return normalizeStores(response.data);
      },
    }),
  comptes: ({ type = null, view = "summary" } = {}) =>
    createCacheResource({
      key: CACHE_KEYS.comptes([type || "all", view || "default"].join(":")),
      fetcher: async () => {
        const response = await api.getComptes({
          params: {
            ...(type ? { type } : {}),
            ...(view ? { view } : {}),
          },
        });

        return normalizeComptes(response.data);
      },
    }),
  productCategories: ({ activeOnly = true } = {}) =>
    createCacheResource({
      key: CACHE_KEYS.productCategories(),
      fetcher: async () => {
        const response = await api.getProductCategories({
          params: {
            activeOnly,
          },
        });

        return normalizeCategories(response.data);
      },
    }),
  currentCashSession: ({ storeId, cashRegisterId, userId = "current", view = "default" }) =>
    createCacheResource({
      key: CACHE_KEYS.currentCashSession(storeId, cashRegisterId, userId),
      fetcher: async () => {
        if (!storeId || !cashRegisterId) {
          return null;
        }

        const response = await api.getCurrentCashSession({
          params: {
            storeId,
            cashRegisterId,
            userId,
            view,
          },
        });

        return response.data?.data || null;
      },
    }),
};
