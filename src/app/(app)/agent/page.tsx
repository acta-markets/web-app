import type { Metadata } from "next";
import { AgentPage } from "@/components/agent/agent-page";
import { pageMetadata, siteOrigin } from "@/lib/site-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Agent",
  description: "Connect your AI trading agent to Acta over MCP. It reads markets and vaults, and trades with its own wallet inside limits you set.",
  path: "/agent",
  image: "agent",
});

export default function Page() {
  return <AgentPage siteOrigin={siteOrigin()} />;
}
