import type { Metadata } from "next";
import { WheelLab } from "./wheel-lab";

export const metadata: Metadata = {
  title: "Wheel lab",
  robots: { index: false, follow: false },
};

/**
 * Review harness for the expiry wheel: the thesis sentence on sample data, with no backend
 * and no wallet. It sits outside the app's route group on purpose, so it opens on a preview
 * build that cannot reach the devnet backend. Remove it with the experiment.
 */
export default function Page() {
  return <WheelLab />;
}
