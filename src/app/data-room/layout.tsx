import { getTree } from "@/lib/data-room/drive";
import { DataRoomShell } from "@/components/data-room/shell";

export const dynamic = "force-dynamic";

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
