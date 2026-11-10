import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Room",
};

export default function DataRoomIndexPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[920px] flex-col items-start justify-center px-8 py-16 max-md:px-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
        Data Room
      </p>
      <h1 className="mt-3 font-space text-4xl font-semibold tracking-tight text-content-primary">
        Select a document
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-content-secondary">
        Choose a folder or document from the sidebar to start reading. Everything here is
        read-only.
      </p>
    </div>
  );
}
