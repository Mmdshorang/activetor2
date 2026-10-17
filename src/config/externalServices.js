const normalizeBaseUrl = (value) => {
  const url = String(value || "").trim();
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

export const ACTIVECODE_SERVERS = [
  {
    key: "external",
    label: "خارجی",
    baseUrl: normalizeBaseUrl(
      process.env.REACT_APP_ACTIVECODE_BASE_URL_PRIMARY ||
        "http://109.201.15.164:4000",
    ),
  },
  {
    key: "internal",
    label: "داخلی",
    baseUrl: normalizeBaseUrl("http://192.168.1.16:4000"),
  },
];

export const ACTIVECODE_SERVER_STORAGE_KEY = "activetor_activecode_server";

export const getActivecodeServerKey = () => {
  try {
    const stored = localStorage.getItem(ACTIVECODE_SERVER_STORAGE_KEY);
    if (!stored) return "external";
    if (stored === "primary") return "external";
    if (stored === "secondary") return "internal";
    if (ACTIVECODE_SERVERS.some((s) => s.key === stored)) return stored;
  } catch {
    // ignore
  }
  return "external";
};

export const setActivecodeServerKey = (key) => {
  try {
    localStorage.setItem(ACTIVECODE_SERVER_STORAGE_KEY, key);
  } catch {
    // ignore
  }
};

export const resolveActivecodeServer = (key) =>
  ACTIVECODE_SERVERS.find((s) => s.key === key) || ACTIVECODE_SERVERS[0];

export const buildActivecodeUrl = (baseUrl) => {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return "";
  try {
    return new URL("/activecode", `${normalized}/`).toString();
  } catch {
    return "";
  }
};
