"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Magnetic } from "@/components/ds/Magnetic";
import { track } from "@/lib/analytics";
import { useMarket } from "@/content/market";
import { basePath } from "@/content/site";

/**
 * Every "Apply for Tal" pill. On click a white circle grows from the pointer (clip-path, 560 ms,
 * the in-out curve) while /start loads underneath; the flow is white, so the wipe hands over seamlessly
 * and the flow removes it. Modifier-clicks and reduced motion get a plain link.
 */
export function StartLink({ children, className, from, magnetic = true }: { children: ReactNode; className: string; from: string; magnetic?: boolean }) {
  const router = useRouter();
  const market = useMarket();
  const href = `${basePath(market)}/start`;
  // Prefetch the flow when the browser is idle after load (or on first hover/focus), never on the critical path.
  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      router.prefetch(href);
    };
    const idle = () => ("requestIdleCallback" in window ? window.requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 3000));
    const onLoad = () => setTimeout(idle, 2500);
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    window.addEventListener("pointerover", go, { once: true, passive: true });
    return () => window.removeEventListener("load", onLoad);
  }, [router, href]);

  const go = (e: React.MouseEvent<HTMLAnchorElement>) => {
    track("flow_start", { from, market });
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    const wipe = document.createElement("div");
    wipe.id = "tal-wipe";
    Object.assign(wipe.style, {
      position: "fixed", inset: "0", zIndex: "100", background: "#fff", pointerEvents: "none",
      clipPath: `circle(0px at ${x}px ${y}px)`, transition: "clip-path 560ms cubic-bezier(0.7, 0, 0.3, 1)",
    });
    document.body.appendChild(wipe);
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    requestAnimationFrame(() => requestAnimationFrame(() => (wipe.style.clipPath = `circle(${r + 20}px at ${x}px ${y}px)`)));
    setTimeout(() => router.push(href), 380);
    setTimeout(() => wipe.remove(), 4000); // safety net if the flow never mounts
  };

  const link = (
    <a href={href} onClick={go} onFocus={() => router.prefetch(href)} className={className}>
      {children}
    </a>
  );
  return magnetic ? <Magnetic>{link}</Magnetic> : link;
}
