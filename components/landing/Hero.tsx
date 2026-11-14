/* eslint-disable @next/next/no-img-element -- art is pre-sized AVIF/WebP in <picture> */
import { preload } from "react-dom";
import { Wordmark } from "@/components/ds/Wordmark";
import { copyFor, type Market } from "@/content/site";
import { HeroLive } from "./HeroLive";
import { StartLink } from "./StartLink";


/* Round 6 (docs/team/art/round6/PICK.md, `fog-e1`), generated at 4K and never upscaled. The wordmark must sit in black
   sky above the ridge (y ≈ 0.36) and the sub on the dark grass under the crest (y ≈ 0.69). The ridge-to-crest span
   grows with the width (0.33 × the drawn height), so a fixed 720 px box cannot hold both: at 1440 the old bottom anchor
   put the ridge behind the wordmark, at 1920 "tal" sat on the white fog. Steve r4, desktop:
   - the art box is 105 % wide (`md:right-[-5%]`, clipped by the section), so Sutro (x 0.60) clears the "l" by ~60 px;
   - centre anchor, box height max(720, 550 + 0.164 W): the ridge lands at ≈ 265–286 px at every width from 1024 to
     2560 (the wordmark ends at 260);
   - the sub starts at max(506, 305 + 0.1934 W), ≈ 30 px under the crest (1440: crest 553, sub 583);
   - `sizes` is the drawn width: max(105vw, 1290px) (the height-bound case at 1024–1300 draws ≥ 1290 wide).
   Tablets (768–1023, Steve r4): the box is height-bound, so a centre anchor crops ~240 px off the left at 768 and the
   coder (x 0.15–0.27) lands on the edge; the plate is anchored at 20 % across there instead, which puts them at
   ≈ 100–250 px (768) and ≈ 150–300 px (1023); centre again from 1024.
   Phones: the 4:5 (1600 × 1986) in a 100vw × 480 box, drawn ≥ 387 px wide; crest ≈ 332 px, sub at 356 px.
   HeroLive reads the img's object-position and box, so the canvas follows. */
const D_AVIF = "/art/hero-16x9-1440.avif 1440w, /art/hero-16x9-2880.avif 2880w, /art/hero-16x9-3840.avif 3840w";
const D_WEBP = "/art/hero-16x9-1440.webp 1440w, /art/hero-16x9-2880.webp 2880w, /art/hero-16x9-3840.webp 3840w";
const D_SIZES = "max(105vw, 1290px)";
const M_AVIF = "/art/hero-4x5-800.avif 800w, /art/hero-4x5-1600.avif 1600w";
const M_WEBP = "/art/hero-4x5-800.webp 800w, /art/hero-4x5-1600.webp 1600w";
const M_SIZES = "max(100vw, 387px)";

/**
 * L1 Hero (Figma 4:43 / 5:65). The round-6 still, "the fog is thinking" (docs/team/HERO_DIRECTION.md): a person alone
 * on a dark SF hill at night, the fog pouring over the ridge and glowing from inside. Revealed with a slow scale (1.08 → 1,
 * 2.4 s ease-out); over it, once loaded and idle, the WebGL motion (HeroLive: the fog drifts, a light finds the person,
 * film grain), which replaces the CSS grain while it runs. The metallic wordmark (160 tall, 96 on phones) in the black
 * sky; sub, white pill and fine print on the dark grass. Opacity of the art never animates, so it counts for LCP at once.
 */
export function Hero({ market = "us" }: { market?: Market }) {
  const H = copyFor(market).hero;
  const SUB = H.sub.split(/(?<=\.) /);
  // The still is the LCP: preload the right crop, AVIF first (the same srcset and sizes as the <picture>).
  preload("/art/hero-4x5-800.avif", { as: "image", type: "image/avif", fetchPriority: "high", imageSrcSet: M_AVIF, imageSizes: M_SIZES, media: "(max-width: 767px)" });
  preload("/art/hero-16x9-2880.avif", { as: "image", type: "image/avif", fetchPriority: "high", imageSrcSet: D_AVIF, imageSizes: D_SIZES, media: "(min-width: 768px)" });
  return (
    <section id="top" aria-label="Tal" className="relative h-[560px] overflow-hidden md:h-[max(720px,550px_+_16.4vw)]">
      <div className="hero-art grain absolute inset-0 overflow-hidden md:right-[-5%]">
        <picture>
          <source type="image/avif" media="(min-width: 768px)" srcSet={D_AVIF} sizes={D_SIZES} />
          <source type="image/webp" media="(min-width: 768px)" srcSet={D_WEBP} sizes={D_SIZES} />
          <source type="image/avif" srcSet={M_AVIF} sizes={M_SIZES} />
          <img
            src="/art/hero-4x5-800.webp"
            srcSet={M_WEBP}
            sizes={M_SIZES}
            alt=""
            fetchPriority="high"
            className="hero-img absolute inset-x-0 top-0 h-[480px] w-full object-cover md:h-full md:object-[20%_50%] lg:object-center"
          />
        </picture>
        {/* The motion (HERO_DIRECTION §3): a WebGL canvas over the still, same box; the <img> stays for LCP and no-JS. */}
        <HeroLive />
      </div>
      {/* Scrim (HERO_DIRECTION §4: one soft radial, alpha ≤ 0.5): the linear fade (50 % at the top for the nav, 100 % at
          the bottom edge) plus one radial pool behind the copy, the 4:45 ellipse on desktop and a wider, flatter one on
          phones. The sub measures ≥ 7.1:1 on the real pixels across the whole loop (FRONTEND.md). */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 78%, #000 100%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 hidden md:block"
        style={{ background: "radial-gradient(ellipse 30% 22% at 50% 77%, rgba(0,0,0,0.5), rgba(0,0,0,0.3) 60%, rgba(0,0,0,0) 100%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 md:hidden"
        style={{ background: "radial-gradient(ellipse 64% 15% at 50% 71%, rgba(0,0,0,0.5), rgba(0,0,0,0.27) 62%, rgba(0,0,0,0) 100%)" }}
      />
      <div className="relative flex h-full flex-col items-center px-4 pt-[82px] text-center md:pt-[100px]">
        <h1 id="hero-logo" className="hero-logo">
          <Wordmark className="h-24 w-[156px] md:h-40 md:w-[260px]" label="tal" />
        </h1>
        <div aria-hidden className="h-[178px] shrink-0 md:h-[max(246px,45px_+_19.34vw)]" />
        {/* Two sentences: on desktop each gets its own line ("In early preview…" never orphans "In"). */}
        <p className="hero-copy max-w-[342px] text-[16px] leading-6 tracking-[-0.1px] text-white/72 md:max-w-[640px] md:text-[18px] md:leading-7">
          {SUB.map((part, i) => (
            <span key={i} className="md:block">
              {i ? " " : ""}
              {part}
            </span>
          ))}
        </p>
        <div className="hero-copy mt-6 [animation-delay:120ms]">
          <StartLink from="hero" className="pill pill-l pill-white px-10">
            {H.cta}
          </StartLink>
        </div>
        <p className="hero-copy t-helper mt-3 text-white/64 [animation-delay:200ms]">{H.note}</p>
      </div>
    </section>
  );
}
