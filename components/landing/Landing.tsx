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
import { MarketProvider } from "@/content/market";
import type { Market } from "@/content/site";

/** The landing (Figma 01 Landing · 1440 4:42 / 02 Landing · 390 5:64). Section order = Figma order. Same page for every
 *  market; only the words change (content/site.ts: `select` for "/", `india` for "/pune"). */
export function Landing({ market }: { market: Market }) {
  return (
    <MarketProvider market={market}>
      <div className="on-dark min-h-dvh bg-black text-white">
        <RaisedBar />
        <Nav />
        <main>
          <Hero market={market} />
          <Marquee />
          <Chat />
          <BehindTal market={market} />
          <Deal />
          <Faq />
        </main>
        <Footer market={market} />
        <SmoothScroll />
        <LandingView />
      </div>
    </MarketProvider>
  );
}
