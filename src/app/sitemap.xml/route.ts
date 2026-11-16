import {
  getRequestDeploymentContext,
  getSitemapUrls,
} from "@/lib/agent-discovery";
import {
  getDocsSitemapUrls,
  isDocsRequest,
} from "@/lib/docs-content";
import { VAULT_LINEUP } from "@/lib/vaults/lineup";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET(request: Request) {
  const context = getRequestDeploymentContext(request);
  // the vaults Earn lists by address on this environment; one with no address yet has no page
  const network = context.environment === "beta" ? "mainnet" : "devnet";
  const vaultAddresses = VAULT_LINEUP.map((entry) => entry.pda[network]).filter((address): address is string => address !== null);
  const sitemapUrls = isDocsRequest(request)
    ? getDocsSitemapUrls()
    : getSitemapUrls(context, { vaultAddresses });
  const urls = sitemapUrls
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
