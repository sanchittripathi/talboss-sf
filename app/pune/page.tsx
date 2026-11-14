import type { Metadata, Viewport } from "next";
import { Landing } from "@/components/landing/Landing";
import { india } from "@/content/site";

const { title, description, siteName } = india.seo;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pune" },
  openGraph: { type: "website", siteName, title, description, url: "/pune" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

/** The India landing (14 Nov 2026): the "/" page with India words. Leads land on /leads/pune. */
export default function Pune() {
  return <Landing market="india" />;
}
