"use client";

import { ErrorView, NotFoundView, StatusFrame } from "@/components/site/status-view";
import { TYPE_LABEL } from "@/components/app-ui/type-styles";

const sample = Object.assign(new Error("Sample error for the gallery"), { digest: "2874561930" });
const noop = () => {};

function Sample({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-bg-border">
      <p className={`${TYPE_LABEL} px-6 pt-6 text-content-tertiary max-md:px-3`}>{label}</p>
      {children}
    </section>
  );
}

export function StatesGallery() {
  return (
    <div>
      <Sample label="Not found, inside the app">
        <NotFoundView />
      </Sample>
      <Sample label="Error, inside the app">
        <ErrorView error={sample} reset={noop} />
      </Sample>
      <Sample label="Error, outside the app (its own frame)">
        <StatusFrame>
          <ErrorView error={sample} reset={noop} />
        </StatusFrame>
      </Sample>
    </div>
  );
}
