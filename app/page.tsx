import type { Metadata, Viewport } from "next";
import { Landing } from "@/components/landing/Landing";
import { site } from "@/content/site";

const { title, description, siteName } = site.select.seo;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName, title, description },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default function Home() {
  return <Landing market="us" />;
}
