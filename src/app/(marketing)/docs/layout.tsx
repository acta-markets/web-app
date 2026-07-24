import type { ReactNode } from "react";
import { DocsShell } from "@/components/docs/docs-shell";
import {
  getDocsNavigation,
  getDocsSearchIndex,
} from "@/lib/docs-content";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <DocsShell
      navigation={getDocsNavigation()}
      searchIndex={getDocsSearchIndex()}
    >
      {children}
    </DocsShell>
  );
}
