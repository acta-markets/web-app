import { permanentRedirect } from "next/navigation";
import { DOCS_SITE_ORIGIN } from "@/lib/agent-discovery";

export default function DocsRedirect() {
  permanentRedirect(DOCS_SITE_ORIGIN);
}
