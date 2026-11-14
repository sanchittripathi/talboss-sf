"use client";

import { useState } from "react";
import { useCopy } from "@/content/market";


/**
 * L6 Questions (4:195): accordion, the first open. The answer's height animates with the grid-rows trick
 * (0fr ↔ 1fr, 360 ms in-out; no measuring), the text fades in 220 ms after 100 ms; the vertical bar of the
 * + turns 90° and collapses into a – (240 ms ease-out). Buttons carry aria-expanded / aria-controls.
 */
export function Faq() {
  const F = useCopy().faq;
  const [open, setOpen] = useState(0);
  return (
    <section id="questions" aria-labelledby="questions-h" className="flex scroll-mt-32 flex-col gap-6 px-6 pb-24 md:flex-row md:gap-16 md:px-12 md:pb-40">
      <h2 id="questions-h" className="flex-1 text-[28px] font-semibold leading-[34px] tracking-[-0.6px] text-white md:text-[40px] md:leading-[48px] md:tracking-[-1px]">
        {F.heading}
      </h2>
      <ul className="w-full border-b border-hair md:w-[720px] md:shrink-0">
        {F.items.map(([q, a], i) => {
          const on = open === i;
          return (
            <li key={q} className="border-t border-hair">
              <h3>
                <button
                  type="button"
                  aria-expanded={on}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpen(on ? -1 : i)}
                  className="group flex w-full items-center justify-between gap-6 py-[22px] text-left text-[16px] font-medium leading-6 tracking-[-0.04px] text-white"
                >
                  <span className="transition-opacity duration-150 group-hover:opacity-80">{q}</span>
                  <span aria-hidden className="relative size-2.5 shrink-0">
                    <span className="absolute left-0 top-1/2 h-px w-2.5 -translate-y-1/2 bg-white/64" />
                    <span className={`absolute left-1/2 top-0 h-2.5 w-px -translate-x-1/2 bg-white/64 transition-transform duration-[240ms] ease-[var(--ease-out)] ${on ? "rotate-90 scale-y-0" : ""}`} />
                  </span>
                </button>
              </h3>
              <div
                id={`faq-${i}`}
                role="region"
                aria-hidden={!on}
                className={`grid transition-[grid-template-rows] duration-[360ms] ease-[var(--ease-io)] motion-reduce:transition-none ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <p className={`max-w-[600px] pb-[22px] text-[14px] leading-5 text-white/64 transition-opacity ${on ? "opacity-100 delay-100 duration-[220ms]" : "opacity-0 duration-[120ms]"}`}>{a}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
