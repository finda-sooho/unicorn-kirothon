const API_HOST = "localhost:8080";

export const API_BASE_URL = `http://${API_HOST}`;
export const WS_BASE_URL = `ws://${API_HOST}`;

export const API_ENDPOINTS = {
  baseUrl: API_BASE_URL,
  wsBaseUrl: WS_BASE_URL,
} as const;

