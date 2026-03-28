import axios from "axios";

/**
 * Public API origin (no trailing slash, no /path suffix).
 * - Local dev: leave VITE_API_URL unset → Vite proxies `/api` and `/uploads` to localhost:5000.
 * - Render / production: set VITE_API_URL to your backend URL at build time, e.g. https://your-api.onrender.com
 */
function apiOrigin() {
  let raw = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") || "";
  if (raw.endsWith("/api")) raw = raw.slice(0, -4);
  if (raw) return raw;
  if (import.meta.env.DEV) {
    return typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  }
  if (typeof window !== "undefined") {
    console.warn(
      "[Trello_Clone] VITE_API_URL was not set at build time. Using this site’s origin for API (only works if API is on the same host)."
    );
    return window.location.origin;
  }
  return "http://localhost:5000";
}

function apiOriginRuntime() {
  return apiOrigin();
}

const useDevProxy = import.meta.env.DEV && !import.meta.env.VITE_API_URL?.trim();

/** Axios: `/api` via Vite proxy in local dev, or `https://your-api.onrender.com/api` when deployed. */
export const api = axios.create({
  baseURL: useDevProxy ? "/api" : `${apiOriginRuntime()}/api`,
});

/** Uploaded files & relative paths → absolute URL (works on phone + desktop when env is set). */
export function fileUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  const s = String(pathOrUrl);
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  const path = s.startsWith("/") ? s : `/${s}`;
  if (useDevProxy) return path;
  return `${apiOriginRuntime().replace(/\/$/, "")}${path}`;
}

/**
 * Board shell style: solid color and/or full-bleed background image (Trello-style).
 * Pass a board `{ background, backgroundImage }` or a hex string for color-only.
 */
export function boardBackgroundStyle(boardOrHex) {
  if (!boardOrHex) return { backgroundColor: "#0079bf" };
  if (typeof boardOrHex === "string") {
    return { backgroundColor: boardOrHex };
  }
  const b = boardOrHex;
  const color = b.background || "#0079bf";
  if (b.backgroundImage) {
    const url = fileUrl(b.backgroundImage);
    return {
      backgroundColor: color,
      backgroundImage: `linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.15)), url(${url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundAttachment: "fixed",
    };
  }
  return { backgroundColor: color };
}
