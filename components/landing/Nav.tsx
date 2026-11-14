"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/ds/Wordmark";
import { useCopy } from "@/content/market";
import { StartLink } from "./StartLink";


/**
 * Sticky nav under the raised bar. Over the hero it is clear and the wordmark is hidden (the hero logo is the
 * one "tal" on screen); once the hero logo scrolls away the bar turns to glass and the small wordmark fades in
 * (opacity + 6 px rise, 320 ms ease-out).
 */
export function Nav() {
  const T = useCopy().topBar;
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const logo = document.getElementById("hero-logo");
    if (!logo) return;
    const io = new IntersectionObserver(([e]) => setSolid(!e.isIntersecting), { rootMargin: "-120px 0px 0px 0px" });
    io.observe(logo);
    return () => io.disconnect();
  }, []);
  return (
    <nav
      aria-label="Main"
      className={`sticky top-[53px] z-40 -mb-16 flex h-16 items-center justify-between px-4 transition-[background-color,border-color,backdrop-filter] duration-300 ease-[var(--ease-out)] md:top-9 md:-mb-[88px] md:h-[88px] md:px-12 ${
        solid ? "border-b border-hair bg-black/85 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <a
        href="#top"
        aria-label={T.wordmarkLabel}
        tabIndex={solid ? 0 : -1}
        className={`block transition-[opacity,transform] duration-[320ms] ease-[var(--ease-out)] ${solid ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0"}`}
      >
        <Wordmark className="h-[22px] w-[36px]" interactive={false} />
      </a>
      <StartLink from="nav" className="pill pill-s pill-white">
        {T.cta}
      </StartLink>
    </nav>
  );
}
