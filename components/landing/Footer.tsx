/* eslint-disable @next/next/no-img-element -- logo tile mark */
import { copyFor, site, type Market } from "@/content/site";
import { StartLink } from "./StartLink";


/**
 * L7 The bottom CTA (v4.2: "Apply for Tal", centred above the footer), then the footer (4:224): hairline, logo tile, © line, links; then the giant metallic wordmark cropped at the fold
 * (560 tall at 1440) under a mask that fades it to 8 % at the bottom. It rises 14 % → 0 as the footer scrolls in
 * (CSS scroll-driven animation; still where scroll timelines aren't supported or motion is reduced).
 */
export function Footer({ market = "us" }: { market?: Market }) {
  const C = copyFor(market).credits;
  return (
    <>
    {/* The hero's pill and fine print again, as the close (pulled up into the Questions padding). */}
    <div className="-mt-6 flex flex-col items-center gap-3 px-4 pb-20 md:-mt-12 md:pb-28">
      <StartLink from="footer" className="pill pill-l pill-white px-10">
        {C.cta}
      </StartLink>
      <p className="t-helper text-white/64">{copyFor(market).hero.note}</p>
    </div>
    <footer className="border-t border-hair px-6 pt-8 md:px-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[7.5px] bg-white shadow-[0_2.5px_3.8px_rgba(0,0,0,0.14)]">
          <img src="/ds/tal-logo.svg" alt="" width={17} height={10} className="h-[10.4px] w-[16.9px]" />
        </span>
        <p className="t-helper flex-1 text-white/48">{C.copyright}</p>
        <nav aria-label="Legal" className="t-helper flex flex-wrap gap-x-6 gap-y-2 text-white/64">
          <a className="hover:text-white" href="#questions">{C.questions}</a>
          <a className="hover:text-white" href="/privacy">{C.privacy}</a>
          <a className="hover:text-white" href="/terms">{C.terms}</a>
          <a className="hover:text-white" href={`mailto:${site.legal.supportEmail}`}>{site.legal.supportEmail}</a>
        </nav>
      </div>
      <div aria-hidden className="footer-crop relative mt-4 h-[200px] overflow-hidden md:h-[560px]">
        <div className="footer-mark absolute left-0 top-6 aspect-[1344/826] w-full md:top-10">
          <div className="wordmark size-full" />
        </div>
      </div>
      <style>{`
        .footer-crop { -webkit-mask-image: linear-gradient(180deg, #000 45%, rgba(0,0,0,.08) 100%); mask-image: linear-gradient(180deg, #000 45%, rgba(0,0,0,.08) 100%); }
        @supports (animation-timeline: view()) {
          .footer-mark { animation: footer-rise linear both; animation-timeline: view(); animation-range: entry 0% cover 60%; }
        }
        @keyframes footer-rise { from { transform: translateY(14%); } to { transform: none; } }
        @media (prefers-reduced-motion: reduce) { .footer-mark { animation: none !important; } }
      `}</style>
    </footer>
    </>
  );
}
