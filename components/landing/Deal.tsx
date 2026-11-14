"use client";

import { useGlow } from "@/components/ds/useGlow";
import { useCopy } from "@/content/market";


/** L5 What to expect (22:1165 / 22:1393; v4.2: the orb is gone, text only): glass card, cursor highlight, the title
 *  on the left and four hairline rows on the right (stacked on phones). */
export function Deal() {
  const D = useCopy().deal;
  const glow = useGlow();
  return (
    <section aria-labelledby="deal" className="px-4 pb-24 md:px-12 md:pb-40">
      <div {...glow} className="glass glow mx-auto flex max-w-[1344px] flex-col gap-6 p-6 md:flex-row md:gap-16 md:p-12">
        <h2 id="deal" className="relative text-[28px] font-medium leading-[34px] tracking-[-0.42px] text-white md:w-[464px] md:shrink-0 md:text-[32px] md:leading-10">
          {D.heading}
        </h2>
        <ul className="relative flex flex-1 flex-col border-b border-hair">
          {D.rows.map(([lead, rest]) => (
            <li key={lead} className="border-t border-hair py-5 text-[18px] leading-7 tracking-[-0.1px] text-white/64 md:py-[22px]">
              <span className="text-white">{lead}</span>
              {rest}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
