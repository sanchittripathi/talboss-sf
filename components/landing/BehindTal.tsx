/* eslint-disable @next/next/no-img-element -- pre-sized art */
import type { CSSProperties } from "react";
import { networkStats } from "@/content/network";
import { copyFor, type Market } from "@/content/site";
import { CountUp } from "./CountUp";
import { Faces } from "./Faces";
import { LOGOS } from "./Marquee";


/** How many columns the last tile spans so the grid ends flush, for `n` tiles in `cols` columns. */
const span = (n: number, cols: number) => {
  const rem = n % cols;
  return rem === 0 ? 1 : cols - rem + 1;
};

/**
 * L3 The numbers wall (white card 4:124 / 5:120, v4.3: "a room full of people, not a dashboard"). Eyebrow; the lead
 * (300,000+ and the rest of the sentence, one count-up, slow and soft) with eight Tal faces beside it (`Faces`); the
 * one line; five tiles (`B.tiles` picks the keys from content/network.json, via content/network.ts, which lets only
 * clean rounded figures through): a static number at 28/36 (40/48 from 768), a hairline above, a small label; then a
 * quiet row of the verified company marks (Marquee's `LOGOS`, black at ~16 px) under its one line.
 * Tiles: 2 columns on phones, 3 at tablet, 5 from 1024; the last tile spans to end the grid flush.
 * Behind the card, full-bleed on the black page: the round-5 node map (`public/art/wall-*`, PICK.md) at 18 %, faded
 * out at its top and bottom edges, so the people sit on "a network".
 */
export function BehindTal({ market = "us" }: { market?: Market }) {
  const B = copyFor(market).stats;
  const { stats } = networkStats();
  const byKey = new Map(stats.map((s) => [s.key, s]));
  const tiles = B.tiles.flatMap((k) => {
    const s = byKey.get(k);
    return s ? [{ key: s.key, value: s.display, label: s.label }] : [];
  });
  const n = tiles.length;
  return (
    <section aria-labelledby="behind" className="relative px-4 pb-24 md:px-12 md:pb-40">
      <picture aria-hidden className="wall-art pointer-events-none absolute inset-x-0 -top-24 bottom-0 opacity-[0.18] md:-top-36">
        <source type="image/avif" media="(min-width: 768px)" srcSet="/art/wall-16x9-1024.avif 1024w, /art/wall-16x9-1376.avif 1376w" sizes="100vw" />
        <source type="image/webp" media="(min-width: 768px)" srcSet="/art/wall-16x9-1024.webp 1024w, /art/wall-16x9-1376.webp 1376w" sizes="100vw" />
        <source type="image/avif" srcSet="/art/wall-4x5-480.avif 480w, /art/wall-4x5-928.avif 928w" sizes="100vw" />
        <img src="/art/wall-4x5-480.webp" srcSet="/art/wall-4x5-480.webp 480w, /art/wall-4x5-928.webp 928w" sizes="100vw" alt="" loading="lazy" className="size-full object-cover" />
      </picture>
      <div className="relative mx-auto flex max-w-[1344px] flex-col gap-8 rounded-[28px] bg-white px-6 py-8 md:gap-14 md:p-16">
        <div className="flex flex-col gap-4">
          <p className="text-[12px] font-medium uppercase leading-5 tracking-[1.2px] text-s600 md:text-[13px]">{B.eyebrow}</p>
          {/* v4.3: the lead is one sentence, lighter than r3's 112-px total, with the faces beside it (above it on phones). */}
          <div className="flex flex-col-reverse gap-5 md:flex-row md:items-center md:justify-between md:gap-10">
            <h2 id="behind" className="max-w-[760px] text-balance text-[36px] font-semibold leading-[42px] tracking-[-1px] text-s1000 md:text-[56px] md:leading-[64px] md:tracking-[-1.6px]">
              <CountUp value={B.total} duration={2400} soft /> {B.headline}
            </h2>
            <Faces className="shrink-0 md:pr-1" />
          </div>
          <p className="t-sub max-w-[560px] text-s700">{B.body}</p>
        </div>
        <dl aria-label={B.gridLabel} className="grid grid-cols-2 gap-x-6 md:grid-cols-3 md:gap-x-8 lg:grid-cols-5">
          {tiles.map((t, i) => {
            const last = i === n - 1;
            return (
              <div
                key={t.key}
                className={`flex min-w-0 flex-col gap-1 border-t border-s300 pb-5 pt-5 md:pb-2 ${last ? "stat-last" : ""}`}
                style={last ? ({ "--s2": span(n, 2), "--s3": span(n, 3), "--s5": span(n, 5) } as CSSProperties) : undefined}
              >
                <dt className="sr-only">{t.label}</dt>
                <dd className="order-first text-[28px] font-medium leading-9 tracking-[-0.8px] text-s1000 tabular-nums md:text-[40px] md:leading-[48px] md:tracking-[-1px]">
                  {t.value}
                </dd>
                <dd aria-hidden className="t-helper text-pretty text-s700">
                  {t.label}
                </dd>
              </div>
            );
          })}
        </dl>
        <div className="flex flex-col gap-4 border-t border-s300 pt-5 md:gap-5 md:pt-8">
          <p className="t-helper text-s600">{B.companies}</p>
          <ul aria-label={B.companies} className="flex flex-wrap items-center gap-x-6 gap-y-3 md:gap-x-10">
            {LOGOS.map(([file, name, w, h]) => (
              <li key={file} className="flex items-center">
                <img
                  src={`/logos/${file}.svg`}
                  alt={name}
                  width={w}
                  height={h}
                  loading="lazy"
                  className="wall-logo block h-[calc(var(--h)*0.62px)] w-auto md:h-[calc(var(--h)*0.72px)]"
                  style={{ ["--h" as string]: h }}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <style>{`
        .wall-art { -webkit-mask-image: linear-gradient(180deg, transparent, #000 22%, #000 70%, transparent); mask-image: linear-gradient(180deg, transparent, #000 22%, #000 70%, transparent); }
        .stat-last { grid-column: span var(--s2) / span var(--s2); }
        @media (min-width: 768px) { .stat-last { grid-column: span var(--s3) / span var(--s3); } }
        @media (min-width: 1024px) { .stat-last { grid-column: span var(--s5) / span var(--s5); } }
        /* The marks are white SVGs (the marquee's): black on the card, quiet. */
        .wall-logo { filter: brightness(0); opacity: 0.55; }
      `}</style>
    </section>
  );
}
