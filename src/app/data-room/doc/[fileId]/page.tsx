import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataRoomDocView } from "@/components/data-room/doc-view";
import { getDoc } from "@/lib/data-room/drive";

export const dynamic = "force-dynamic";

interface DocPageProps {
  params: { fileId: string };
}

export async function generateMetadata({
  params,
}: DocPageProps): Promise<Metadata> {
  const doc = await getDoc(params.fileId);
  return { title: doc ? doc.name : "Document not found" };
}

export default async function DataRoomDocPage({ params }: DocPageProps) {
  const doc = await getDoc(params.fileId);
  if (!doc) notFound();
  return <DataRoomDocView doc={doc} />;
}
