"use client";

import { useEffect, useRef, useState } from "react";
import { TalAvatar } from "@/components/ds/LogoTile";
import { useGlow } from "@/components/ds/useGlow";
import { useCopy } from "@/content/market";
import { useSeen } from "./useSeen";


/** Three dots, 1.2 s loop, 160 ms apart (opacity + 2 px lift). */
function Typing() {
  const C = useCopy().chat;
  return (
    <span className="flex h-5 items-center gap-1" aria-label={C.typing}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="chat-dot size-1.5 rounded-full bg-white/70" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}

/**
 * L2 Glass chat card (4:80). It types itself once it's 45 % in view: for each Tal message the typing dots show
 * for the message's `after` pause (up to 900 ms), then the bubble lands (y 12 → 0, scale .98 → 1, 520 ms
 * ease-out) and its role rows slide in 90 ms apart; your reply comes in from the right after a beat.
 * Every bubble is laid out from the start (invisible), so the card never changes height: CLS 0.
 * Reduced motion: the whole thread at once. CSS transitions only (no animation library on the landing).
 */
export function Chat() {
  const C = useCopy().chat;
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref, 0.45);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(-1);
  const glow = useGlow();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(C.messages.length);
    if (!seen) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    C.messages.forEach((msg, i) => {
      t += msg.after;
      if (msg.from === "tal") timers.push(setTimeout(() => setTyping(i), t - Math.min(msg.after, 900)));
      timers.push(
        setTimeout(() => {
          setTyping(-1);
          setShown(i + 1);
        }, t),
      );
      t += msg.roles ? 700 : 200; // a moment to read before the next one starts
    });
    return () => timers.forEach(clearTimeout);
  }, [seen]);

  return (
    <section aria-label={C.caption} className="flex flex-col items-center gap-4 px-4 pb-24 md:pb-[140px]">
      <div ref={ref} {...glow} className="glass glow w-full max-w-[720px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.4)]">
        <div className="relative flex items-center gap-3 border-b border-hair px-5 py-4">
          <TalAvatar />
          <div className="leading-5">
            <p className="text-[14px] font-medium text-white">{C.tal}</p>
            <p className="t-helper text-white/48">{C.role}</p>
          </div>
        </div>
        <ol className="relative flex flex-col gap-5 px-4 pb-7 pt-6 md:px-5">
          {C.messages.map((msg, i) => {
            const on = i < shown;
            const isTal = msg.from === "tal";
            return (
              <li key={i} className={`relative flex items-end gap-3 ${isTal ? "" : "justify-end"}`}>
                {isTal ? (
                  <span className={`transition-opacity duration-300 ${on || typing === i ? "opacity-100" : "opacity-0"}`}>
                    <TalAvatar />
                  </span>
                ) : null}
                <div className={`relative min-w-0 ${isTal ? "" : "max-w-[80%]"}`}>
                  {isTal ? (
                    <div
                      aria-hidden={typing !== i}
                      className={`absolute bottom-0 left-0 rounded-[16px] border border-white/10 bg-white/6 px-4 py-2.5 transition-[opacity,transform] duration-250 ${typing === i ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"}`}
                    >
                      <Typing />
                    </div>
                  ) : null}
                  <div
                    className={`chat-bubble rounded-[16px] px-4 py-3 leading-5 ${isTal ? "origin-bottom-left border border-white/10 bg-white/6" : "origin-bottom-right bg-white/14"} ${on ? "is-on" : ""}`}
                  >
                    {msg.meta ? <p className="t-helper mb-1 text-white/48">{msg.meta}</p> : null}
                    <p className="text-[14px] text-white">{msg.text}</p>
                    {msg.roles ? (
                      <ul className="mt-2 flex flex-col text-[14px] md:w-[380px]">
                        {msg.roles.map(([title, what], r) => (
                          <li
                            key={title}
                            className="chat-row flex flex-col border-t border-white/10 py-2 md:h-9 md:flex-row md:items-center md:gap-2"
                            style={{ transitionDelay: on ? `${180 + r * 90}ms` : "0ms" }}
                          >
                            <span className="font-medium text-white">{title}</span>
                            <span className="text-white/64">{what}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="t-helper max-w-[342px] text-center text-white/48 md:max-w-none">{C.caption}</p>
      <style>{`
        .chat-dot { animation: chat-dot 1.2s ease-in-out infinite; }
        @keyframes chat-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
        .chat-bubble { opacity: 0; transform: translateY(12px) scale(.98); transition: opacity 520ms var(--ease-out), transform 520ms var(--ease-out); }
        .chat-bubble.is-on { opacity: 1; transform: none; }
        .chat-row { opacity: 0; transform: translateX(-6px); transition: opacity 450ms var(--ease-out), transform 450ms var(--ease-out); }
        .is-on .chat-row { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: reduce) { .chat-dot { animation: none; } .chat-bubble, .chat-row { transition: none; } }
      `}</style>
    </section>
  );
}
