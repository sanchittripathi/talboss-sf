import type { Metadata } from "next";
import { Flow } from "@/components/flow/Flow";
import { MarketProvider } from "@/content/market";
import { india } from "@/content/site";

export const metadata: Metadata = {
  title: india.topBar.cta,
  alternates: { canonical: "/pune/start" },
  robots: { index: false },
};

/** The same onboarding flow as /start; applications are tagged "tal-india" and land on /leads/pune. */
export default function PuneStart() {
  return (
    <MarketProvider market="india">
      <Flow />
    </MarketProvider>
  );
}
