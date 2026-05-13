const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

function getTokens() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("oryx_tokens");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { accessToken: string; refreshToken: string };
  } catch {
    return null;
  }
}

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const next = { accessToken: data.accessToken, refreshToken: data.refreshToken ?? tokens.refreshToken };
  localStorage.setItem("oryx_tokens", JSON.stringify(next));
  return next.accessToken;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (tokens?.accessToken) headers["Authorization"] = `Bearer ${tokens.accessToken}`;

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && tokens?.refreshToken) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      if (newToken) {
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];
        headers["Authorization"] = `Bearer ${newToken}`;
        res = await fetch(`${API_BASE}${path}`, { ...init, headers });
      } else {
        localStorage.removeItem("oryx_tokens");
        window.location.href = "/login";
        throw new Error("Session expired");
      }
    } else {
      const newToken = await new Promise<string>((resolve) => refreshQueue.push(resolve));
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─── Mock helpers (used when backend not available) ─────────────────────────
export function isMockMode() {
  return process.env.NEXT_PUBLIC_MOCK_API === "true";
}
