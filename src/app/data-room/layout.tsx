import type { Metadata } from "next";
import { getTree } from "@/lib/data-room/drive";
import { DataRoomShell } from "@/components/data-room/shell";

export const dynamic = "force-dynamic";

// documents shared by address: never a search result, and none of their links are followed
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DataRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { nodes, config } = await getTree();
  return (
    <DataRoomShell tree={nodes} config={config}>
      {children}
    </DataRoomShell>
  );
}
