/**
 * Normalizes a Salesforce instance URL or host string into a bare hostname.
 * e.g., "https://acme-dev-ed.my.salesforce.com/" -> "acme-dev-ed.my.salesforce.com"
 *       "acme-dev-ed.my.salesforce.com" -> "acme-dev-ed.my.salesforce.com"
 */
export function normalizeSfHost(inputUrlOrHost?: string | null): string {
  if (!inputUrlOrHost || typeof inputUrlOrHost !== "string") return "";
  try {
    const withProtocol = inputUrlOrHost.startsWith("http")
      ? inputUrlOrHost
      : `https://${inputUrlOrHost}`;
    return new URL(withProtocol).hostname;
  } catch {
    return inputUrlOrHost.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
  }
}
