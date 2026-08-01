const DEFAULT_API_ORIGIN = "http://127.0.0.1:4317";

export const resolveWorkbenchApiOrigin = (candidate?: string) => {
  if (!candidate) return DEFAULT_API_ORIGIN;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Workbench API must be a local loopback HTTP endpoint");
  }
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (
    url.protocol !== "http:" ||
    !localHost ||
    !url.port ||
    url.username ||
    url.password ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search ||
    url.hash
  ) {
    throw new Error("Workbench API must be a local loopback HTTP endpoint with an explicit port");
  }
  return url.origin;
};
