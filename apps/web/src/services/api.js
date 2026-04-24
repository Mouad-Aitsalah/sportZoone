import axios from "axios";
import { getAuthToken, logout } from "../store/authStore";

const API_BASE_URL = "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      logout();

      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/"
      ) {
        window.location.assign("/");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
