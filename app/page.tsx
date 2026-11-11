import type { Metadata, Viewport } from "next";
import { BehindTal } from "@/components/landing/BehindTal";
import { Chat } from "@/components/landing/Chat";
import { Deal } from "@/components/landing/Deal";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { LandingView } from "@/components/landing/LandingView";
import { Marquee } from "@/components/landing/Marquee";
import { Nav } from "@/components/landing/Nav";
import { RaisedBar } from "@/components/landing/RaisedBar";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
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

/** The landing (Figma 01 Landing · 1440 4:42 / 02 Landing · 390 5:64). Section order = Figma order. */
export default function Home() {
  return (
    <div className="on-dark min-h-dvh bg-black text-white">
      <RaisedBar />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Chat />
        <BehindTal />
        <Deal />
        <Faq />
      </main>
      <Footer />
      <SmoothScroll />
      <LandingView />
    </div>
  );
}
