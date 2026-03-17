import axios from "axios";

import { API_BASE_URL } from "@/lib/api/config";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: false,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
);

