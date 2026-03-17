import { WS_BASE_URL } from "@/lib/api/config";

export function createWebSocketUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${WS_BASE_URL}${normalizedPath}`;
}

