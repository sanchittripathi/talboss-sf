"use client";

import { AnimatePresence, domMax, LazyMotion, m, MotionConfig } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { HeroField } from "@/components/ds/HeroField";
import { LogoTile } from "@/components/ds/LogoTile";
import { Magnetic } from "@/components/ds/Magnetic";
import { Progress } from "@/components/ds/Progress";
import { basePath, programFor, site } from "@/content/site";
import { useCopy, useMarket } from "@/content/market";
import { track } from "@/lib/analytics";
import type { Profile } from "@/lib/linkedin";
import { checkResumeFile, formatBytes } from "@/lib/validation";
import { busyCode, EMAIL_RE, LINKEDIN_RE, poll, post, searchProgress, stageIndex, untilDate, UTM_KEYS, type BusyCode, type Reply } from "./api";
import { Done } from "./Done";
import { LinkedInVisual } from "./LinkedInVisual";
import { mockEmail, mockPerson, mockProfile } from "./mock";
import { cascade, EASE_IO, EASE_OUT, screen, travel } from "./motion";
import { ProfileCard } from "./ProfileCard";

/* eslint-disable @next/next/no-img-element -- local DS icons */

const errors = site.upload.errors;
const accept = [...site.upload.extensions, ...site.upload.mimeTypes].join(",");
// v4.2 §10 (docs/team/LOOKUP_PREFETCH.md): each poll holds on the server (≤ 5 s) until a run finishes or the stage
// changes, so the browser asks again at once instead of adding its own wait on top.
const FIRST_POLL_MS = 0;
const POLL_MS = 150;
const GIVE_UP_MS = 120_000;
/** After "Yes" on a partial card, keep polling this long so the full card can replace it before the upload. */
const FILL_AFTER_YES_MS = 8_000;
/** The A2 prefetch is for this person (name + company); a different one means a new start. */
const personKey = (name: string, company: string) => `${name.trim()}|${company.trim()}`.toLowerCase();

export type Step =
  | "name" | "company" | "title" | "search" | "confirm" | "link" | "notFound"
  | "rateLimited" | "dailyCap" | "searchDown" | "offline" | "resume" | "email" | "done";
type Status = "confirmed" | "typed" | "skipped";

/** Figma frame codes, used for analytics (`step_view`) and the ?state= preview. */
export const CODES: Record<Step, string> = {
  name: "A1", company: "A2", title: "A3", search: "A4", confirm: "A5", link: "A5-link", notFound: "A5b-notfound",
  rateLimited: "A5b-ratelimited", dailyCap: "A5b-dailycap", searchDown: "A5b-searchdown", offline: "A5b-offline",
  resume: "A6", email: "A6b", done: "A7",
};
/** ?state= values → steps (dev preview). */
export const PREVIEW: Record<string, Step> = {
  a1: "name", a2: "company", a3: "title", a4: "search", a5: "confirm", a5partial: "confirm", link: "link", notfound: "notFound",
  ratelimited: "rateLimited", dailycap: "dailyCap", searchdown: "searchDown", offline: "offline",
  a6: "resume", a6b: "email", noemail: "email", sending: "resume", a7: "done", done: "done",
};

/** "linkedin.com/in/x" → "https://linkedin.com/in/x" (what the field accepts before it checks LINKEDIN_RE). */
const normaliseLink = (raw: string) => raw.trim().replace(/^(?!https?:\/\/)/, "https://").replace(/^http:/, "https:");

const BUSY_STEP: Record<BusyCode, Step> = { rate_limited: "rateLimited", daily_cap: "dailyCap", search_down: "searchDown", offline: "offline" };

type State = {
  step: Step;
  dir: number;
  history: Step[];
  name: string;
  company: string;
  title: string;
  url: string;
  email: string;
  token: string | null;
  stage: number;
  stageAt: number;
  startedAt: number;
  profile: Profile | null;
  next: string | null;
  /** The card on A5 is a search-data card (no photo, no roles); the full one may replace it in place. */
  partial: boolean;
  /** While a partial card is up: the token to keep polling with in the background. null = not polling. */
  bg: string | null;
  /** When "Yes" was pressed (the background poll runs FILL_AFTER_YES_MS past it). */
  yesAt: number;
  status: Status;
  file: { name: string; size: number } | null;
  error: string | null;
  sending: boolean;
  sentEmail: string | null;
  retryAt: number;
  checkingNext: boolean;
  /** The resume was saved but had no email on it: A6b asks for one, and the resume goes again with it. */
  needEmail: boolean;
  preview: boolean;
  /** Bumped by a preview load so the screen swaps without a transition. */
  epoch: number;
};

const initial: State = {
  step: "name", dir: 1, history: [], name: "", company: "", title: "", url: "", email: "", token: null, stage: 0, stageAt: 0,
  startedAt: 0, profile: null, next: null, partial: false, bg: null, yesAt: 0, status: "skipped", file: null, error: null, sending: false, sentEmail: null,
  retryAt: 0, checkingNext: false, needEmail: false, preview: false, epoch: 0,
};

type Action =
  | { type: "field"; key: "name" | "company" | "title" | "url" | "email"; value: string }
  | { type: "go"; step: Step; error?: string | null; push?: boolean }
  | { type: "back" }
  | { type: "searching"; token: string; index: number; restart?: boolean; checkingNext?: boolean }
  | { type: "found"; profile: Profile; next: string | null; partial?: boolean; bg?: string | null }
  /** Background poll on a partial card: the card stays, poll again with `token`. */
  | { type: "bg"; token: string | null; next?: string | null }
  /** The full card for the partial one on screen (same person): replace it in place. */
  | { type: "fill"; profile: Profile; next: string | null }
  /** The partial card was someone else: take it down (and undo a "Yes"); the caller then says where to go. */
  | { type: "retract" }
  | { type: "busy"; code: BusyCode; retryAfter?: number }
  | { type: "status"; status: Status; url?: string }
  | { type: "file"; file: State["file"] }
  | { type: "error"; message: string | null }
  | { type: "sending"; on: boolean }
  | { type: "needEmail" }
  | { type: "done"; email: string | null }
  | { type: "load"; state: State };

/** Steps that Back skips over (they're transient). */
const TRANSIENT: Step[] = ["search"];

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "field":
      return { ...s, [a.key]: a.value, error: null };
    case "go": {
      const history = a.push === false || TRANSIENT.includes(s.step) || s.step === a.step ? s.history : [...s.history, s.step];
      return { ...s, step: a.step, dir: 1, history, error: a.error ?? null, sending: false };
    }
    case "back": {
      const history = [...s.history];
      const prev = history.pop() ?? "name";
      return { ...s, step: prev, dir: -1, history, error: null, token: null, bg: null, sending: false, needEmail: false };
    }
    case "searching": {
      const now = Date.now();
      const index = a.restart ? a.index : Math.max(s.stage, a.index);
      const history = s.step === "search" || TRANSIENT.includes(s.step) ? s.history : [...s.history, s.step];
      return {
        ...s, step: "search", dir: 1, history, token: a.token || null, error: null,
        stage: index, stageAt: index !== s.stage || a.restart ? now : s.stageAt,
        startedAt: a.restart ? now : s.startedAt, checkingNext: a.checkingNext ?? s.checkingNext,
        ...(a.restart ? { bg: null, partial: false } : {}),
      };
    }
    case "found":
      return {
        ...s, step: "confirm", dir: 1, profile: a.profile, next: a.next, token: null, checkingNext: false,
        partial: a.partial ?? false, bg: a.bg ?? null,
      };
    case "bg":
      return { ...s, bg: a.token, next: a.next === undefined ? s.next : a.next };
    case "fill":
      return { ...s, profile: a.profile, next: a.next, partial: false, bg: null };
    case "retract": {
      // Back to the lookup as if the card had never been shown: drop it, undo a "Yes", and cut history back to
      // before A5 so Back never returns to it. Step "search" (transient) so the follow-up dispatch pushes nothing.
      const at = s.history.indexOf("confirm");
      return {
        ...s, step: "search", dir: -1, history: at >= 0 ? s.history.slice(0, at) : s.history, profile: null,
        partial: false, bg: null, status: "skipped", yesAt: 0, token: null, error: null, checkingNext: false,
      };
    }
    case "busy":
      return {
        ...s, step: BUSY_STEP[a.code], dir: 1, token: null, error: null,
        retryAt: a.retryAfter ? Date.now() + a.retryAfter * 1000 : 0,
        history: TRANSIENT.includes(s.step) ? s.history : [...s.history, s.step],
      };
    case "status":
      // The caller decides typed vs skipped: only a link that passed LINKEDIN_RE counts as typed (Steve v4.1 #5).
      return {
        ...s, status: a.status, url: a.url ?? s.url, step: "resume", dir: 1, history: [...s.history, s.step], token: null, error: null,
        yesAt: a.status === "confirmed" ? Date.now() : 0,
        // Only a confirmed partial card keeps its background poll (so the full card can still land before the upload).
        bg: a.status === "confirmed" ? s.bg : null,
      };
    case "needEmail":
      return { ...s, step: "email", dir: 1, needEmail: true, sending: false, error: null, history: [...s.history, s.step] };
    case "file":
      return { ...s, file: a.file, error: null };
    case "error":
      return { ...s, error: a.message, sending: false };
    case "sending":
      return { ...s, sending: a.on, error: null };
    case "done":
      return { ...s, step: "done", dir: 1, sentEmail: a.email, sending: false, history: [...s.history, s.step] };
    case "load":
      return { ...a.state, epoch: s.epoch + 1 };
  }
}

/** Progress fills per DS/Footer: done steps full, the current one a quarter, LinkedIn = the real search progress. */
function fillsFor(s: State, searchP: number): { fills: number[]; n: number } {
  const q = 0.25;
  switch (s.step) {
    case "name": return { fills: [q, 0, 0, 0, 0], n: 1 };
    case "company": return { fills: [1, q, 0, 0, 0], n: 2 };
    case "title": return { fills: [1, 1, q, 0, 0], n: 3 };
    case "search": return { fills: [1, 1, 1, Math.max(q, searchP), 0], n: 4 };
    case "confirm": return { fills: [1, 1, 1, 1, 0], n: 4 };
    case "resume":
    case "email": return { fills: [1, 1, 1, 1, s.sending ? 0.8 : q], n: 5 };
    case "done": return { fills: [1, 1, 1, 1, 1], n: 5 };
    default: return { fills: [1, 1, 1, q, 0], n: 4 };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clock = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ pieces */

function Heading({ title, sub, id }: { title: string; sub?: string; id?: string }) {
  return (
    <m.div variants={cascade} custom={0} className="flex w-full max-w-[560px] flex-col items-center gap-2.5 text-center">
      <h1 id={id} tabIndex={-1} className="t-question text-balance text-s1000 outline-none">
        {title}
      </h1>
      {sub ? <p className="t-sub text-balance text-s700">{sub}</p> : null}
    </m.div>
  );
}

/**
 * Your answers so far, quiet, above the question. Each one is a layoutId, so it arrives from the field you typed it in.
 * When the trail wraps (390: "Aryan Mehta · Halcyon Labs" / "Member of Technical Staff"), an answer that starts a line
 * drops its "·" and gets a hard break before it, so no line ever opens with a separator (Steve v4.1 #9). Measured with
 * every separator shown, then applied once; re-measured when the answers or the column width change.
 */
function Trail({ items }: { items: { id: string; text: string }[] }) {
  const shown = items.filter((i) => i.text.trim());
  const ref = useRef<HTMLParagraphElement>(null);
  const key = shown.map((i) => i.text.trim()).join("\u0000");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const units = [...el.querySelectorAll<HTMLElement>("[data-unit]")];
      el.querySelectorAll<HTMLElement>("[data-br]").forEach((b) => (b.style.display = "none"));
      el.querySelectorAll<HTMLElement>("[data-sep]").forEach((d) => (d.style.display = ""));
      const tops = units.map((u) => u.offsetTop);
      units.forEach((u, i) => {
        if (i === 0 || tops[i] <= tops[i - 1] + 1) return;
        const sep = u.querySelector<HTMLElement>("[data-sep]");
        const br = el.querySelector<HTMLElement>(`[data-br="${i}"]`);
        if (sep) sep.style.display = "none";
        if (br) br.style.display = "block";
      });
    };
    fit();
    let width = el.parentElement?.clientWidth ?? 0;
    const ro = new ResizeObserver(() => {
      const w = el.parentElement?.clientWidth ?? 0;
      if (w === width) return;
      width = w;
      fit();
    });
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [key]);
  if (!shown.length) return null;
  return (
    <p ref={ref} className="t-helper -mb-2 flex max-w-full flex-wrap items-center justify-center gap-x-2 text-s600" aria-label="Your answers">
      {shown.map((it, i) => (
        <span key={it.id} className="contents">
          {i > 0 ? <span data-br={i} aria-hidden className="hidden h-0 basis-full" /> : null}
          <span data-unit className="flex items-center gap-2">
            {i > 0 ? <span data-sep aria-hidden className="text-s400">·</span> : null}
            <m.span layoutId={it.id} transition={travel} className="whitespace-nowrap">
              {it.text.trim()}
            </m.span>
          </span>
        </span>
      ))}
    </p>
  );
}

/** A4: the stage the poll reports, in words, cross-fading as it changes (Steve v4.1 #4). */
function StageLine({ text }: { text: string }) {
  return (
    <div className="relative h-5 w-[320px] max-w-full" aria-live="polite">
      <AnimatePresence initial={false} mode="wait">
        <m.p
          key={text}
          className="absolute inset-0 truncate text-center text-[14px] font-medium leading-5 text-s1000"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: -5, transition: { duration: 0.18, ease: EASE_IO } }}
        >
          {text}
        </m.p>
      </AnimatePresence>
    </div>
  );
}

/** True on touch-first devices (`(pointer: coarse)`), after mount, so the server render and hydration agree. */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const on = () => setCoarse(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return coarse;
}

function Primary({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Magnetic className="flex w-full md:inline-flex md:w-auto">
      <button className="pill pill-l pill-dark w-full md:w-auto" {...rest}>
        {children}
      </button>
    </Magnetic>
  );
}

function Secondary({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Magnetic className="flex min-w-0 flex-1 md:inline-flex md:flex-none">
      <button className="pill pill-l pill-outline w-full md:w-auto" {...rest}>
        {children}
      </button>
    </Magnetic>
  );
}

function TextButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="text-link" {...rest}>
      {children}
    </button>
  );
}

function EnterHint() {
  const A = useCopy().apply;
  return <p className="t-helper hidden text-s700 md:block">{A.enterHint.replace("Enter", "⏎")}</p>;
}

/** Desktop: everything centred as one group. Phone: content from the top, actions pinned to the bottom (DS 390 anatomy). */
function Screen({ children, actions, onSubmit, label }: { children: ReactNode; actions: ReactNode; onSubmit?: (e: FormEvent) => void; label: string }) {
  const Tag = onSubmit ? "form" : "div";
  return (
    <Tag
      onSubmit={onSubmit}
      noValidate
      aria-label={label}
      className="flex min-h-full w-full flex-1 flex-col items-center px-6 pt-14 short-phone:pt-6 md:justify-center md:px-0 md:pt-0"
    >
      <div className="flex w-full flex-1 flex-col items-center gap-8 short-phone:gap-5 md:flex-none">{children}</div>
      {/* Phones: pinned to the bottom. On short phones the screen tightens (short-phone) so A5's card clears the bar at
          720 px; shorter still, the content scrolls out from under it, and a 16 px white fade marks the edge. */}
      <m.div variants={cascade} custom={3} className="sticky bottom-0 mt-8 flex w-full flex-col items-center gap-3 bg-white pb-[max(34px,env(safe-area-inset-bottom))] pt-4 before:pointer-events-none before:absolute before:inset-x-0 before:-top-4 before:h-4 before:bg-[linear-gradient(0deg,#fff,rgba(255,255,255,0))] short-phone:mt-4 md:static md:w-auto md:bg-transparent md:pb-0 md:pt-0 md:before:hidden">
        {actions}
      </m.div>
    </Tag>
  );
}

/* --------------------------------------------------------------------- flow */

/**
 * The flow loads Motion's layout features synchronously (domMax): a layoutId element only gets a projection node
 * if the feature is there when it mounts, and the very first field is one.
 */
export function Flow() {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <FlowInner />
      </MotionConfig>
    </LazyMotion>
  );
}

function FlowInner() {
  const market = useMarket();
  const S = useCopy();
  const A = S.apply;
  const [s, dispatch] = useReducer(reducer, initial);
  const [until, setUntil] = useState("");
  const [now, setNow] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touch = useCoarsePointer();
  const pickedFile = useRef<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const polls = useRef(0);
  const viewed = useRef<string>("");
  const main = useRef<HTMLDivElement>(null);
  /** The A2 start (LOOKUP_PREFETCH.md §1): fired at A2 submit, awaited at A3 submit, never shown on its own. */
  const prefetch = useRef<{ key: string; reply: Promise<Reply> } | null>(null);
  /** Bumped by every new lookup (start, "not me") and by leaving the search, so a held poll that answers late is dropped. */
  const lookupGen = useRef(0);
  /** The same for the background poll behind a partial card. */
  const bgGen = useRef(0);
  const bgBusy = useRef(false);
  /** The latest state, for replies that land after a held poll (up to ~5 s later). */
  const latest = useRef(s);
  useLayoutEffect(() => {
    latest.current = s;
  });

  useEffect(() => setUntil(untilDate()), []);

  // The landing's white wipe (StartLink) lands here; fade it off once the first screen is painted.
  useEffect(() => {
    const wipe = document.getElementById("tal-wipe");
    if (!wipe) return;
    wipe.style.transition = "opacity 240ms ease-out";
    requestAnimationFrame(() => (wipe.style.opacity = "0"));
    const t = setTimeout(() => wipe.remove(), 300);
    return () => clearTimeout(t);
  }, []);

  // Dev preview: /start?state=A1…A7 | A5partial | link | notfound | ratelimited | dailycap | searchdown | offline | A6b | sending
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const want = new URLSearchParams(window.location.search).get("state")?.toLowerCase();
    if (!want || !PREVIEW[want]) return;
    const step = PREVIEW[want];
    const base: State = { ...initial, ...mockPerson, preview: true, step };
    const confirmed = { profile: mockProfile, status: "confirmed" as const };
    const states: Partial<Record<string, Partial<State>>> = {
      a1: { name: "" },
      a2: { company: "" },
      a3: { title: "" },
      a4: { stage: 1, stageAt: Date.now() - 1500, startedAt: Date.now() - 6000 },
      a5: { profile: mockProfile, next: "mock" },
      // A partial card (search data) waiting for its full profile: initials tile + skeleton rows.
      a5partial: { profile: { ...mockProfile, photo: "", experience: [] }, next: "mock", partial: true, bg: "mock" },
      link: { url: "" },
      ratelimited: { retryAt: Date.now() + 42_000 },
      a6: confirmed,
      a6b: { ...confirmed, email: mockEmail },
      noemail: { ...confirmed, needEmail: true, file: { name: "aryan-mehta-resume.pdf", size: 214_000 }, history: ["resume"] },
      sending: { ...confirmed, file: { name: "aryan-mehta-resume.pdf", size: 214_000 }, sending: true },
      a7: { ...confirmed, sentEmail: mockEmail },
      done: { ...confirmed, sentEmail: mockEmail },
    };
    dispatch({ type: "load", state: { ...base, ...states[want] } });
  }, []);

  // Analytics: flow_start once, step_view per screen.
  useEffect(() => {
    track("flow_start", { source: document.referrer ? new URL(document.referrer).pathname : "direct" });
  }, []);
  useEffect(() => {
    if (viewed.current === s.step) return;
    viewed.current = s.step;
    track("step_view", { step: CODES[s.step] });
    if (s.step === "done") track("done", { linkedin: s.status, resume: Boolean(s.file), email: Boolean(s.sentEmail) });
  }, [s.step, s.status, s.file, s.sentEmail]);
  // Each new screen: focus its field (fine pointers; on phones that would throw the keyboard up mid-transition),
  // otherwise its heading, so a screen reader lands on the new question.
  useEffect(() => {
    const t = setTimeout(() => {
      const root = main.current;
      if (!root) return;
      const current = root.querySelector(`section[data-step="${s.step}"]`);
      if (!current) return;
      const field = current.querySelector<HTMLInputElement>("input:not([type=file])");
      if (field && window.matchMedia("(pointer: fine)").matches) field.focus({ preventScroll: true });
      else current.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    }, 80);
    return () => clearTimeout(t);
  }, [s.step]);

  // A clock for the honest progress bar and the rate-limit countdown.
  useEffect(() => {
    if (s.step !== "search" && !(s.step === "rateLimited" && s.retryAt)) return;
    const id = setInterval(() => setNow(Date.now()), 120);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [s.step, s.retryAt]);

  // Preview: walk the search the way the prototype does (stage every ~0.9 s, found at ~2.6 s), but only when you
  // got there by answering; /start?state=A4 holds still for screenshots.
  useEffect(() => {
    if (!s.preview || s.step !== "search" || s.history.length === 0) return;
    const timers = [
      setTimeout(() => dispatch({ type: "searching", token: "", index: 1 }), 900),
      setTimeout(() => dispatch({ type: "searching", token: "", index: 2 }), 1800),
      setTimeout(() => dispatch({ type: "searching", token: "", index: 3 }), 2500),
      setTimeout(() => dispatch({ type: "found", profile: mockProfile, next: "mock" }), 2950),
    ];
    return () => timers.forEach(clearTimeout);
  }, [s.preview, s.step, s.history.length]);

  // Poll the lookup while it runs. Always the token from the latest reply.
  useEffect(() => {
    if (s.step !== "search" || !s.token || s.preview) return;
    const token = s.token;
    const gen = lookupGen.current;
    const delay = polls.current++ === 0 ? FIRST_POLL_MS : POLL_MS;
    // A poll can hold ~5 s; drop its answer if the person left the search (Back, "paste your link") meanwhile.
    const stale = () => gen !== lookupGen.current || latest.current.step !== "search";
    const timer = setTimeout(async () => {
      if (Date.now() - s.startedAt > GIVE_UP_MS) {
        track("linkedin_failed", { reason: "timeout" });
        return dispatch({ type: "go", step: "notFound", push: false });
      }
      const reply = await poll(token);
      if (stale()) return;
      if (reply.state === "pending") {
        dispatch({ type: "searching", token: reply.token, index: reply.stage ? stageIndex(reply.stage) : 0 });
      } else if (reply.state === "found") {
        const tm = reply.timings;
        track("linkedin_found", {
          score: reply.profile.score, seconds: Math.round((Date.now() - s.startedAt) / 1000), partial: Boolean(reply.partial),
          src: tm?.src, ...(tm?.first !== undefined && tm?.attach !== undefined ? { after_title_ms: tm.first - tm.attach } : {}),
        });
        dispatch({ type: "searching", token: "", index: 3 });
        await sleep(450); // the bar reaches 100 % and you see it
        if (gen !== lookupGen.current || latest.current.step !== "search") return;
        dispatch({
          type: "found", profile: reply.profile, next: reply.next,
          partial: reply.partial === true, bg: reply.partial === true ? reply.token ?? null : null,
        });
      } else {
        const code = busyCode(reply);
        track("linkedin_failed", { reason: code ?? reply.state });
        dispatch(code ? { type: "busy", code, retryAfter: reply.state === "error" ? reply.retryAfter : undefined } : { type: "go", step: "notFound", push: false });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [s.step, s.token, s.startedAt, s.preview]);

  // A partial card is up (A5, or A6/A6b within FILL_AFTER_YES_MS of "Yes"): keep polling behind it, fill it in with
  // the full card, or take it down when the full profile turns out to be someone else (LOOKUP_PREFETCH.md §3).
  const bgOn =
    Boolean(s.bg) && !s.preview && !s.sending &&
    (s.step === "confirm" || (s.status === "confirmed" && (s.step === "resume" || s.step === "email")));
  useEffect(() => {
    if (!bgOn || !s.bg || bgBusy.current) return;
    const token = s.bg;
    const gen = bgGen.current;
    const timer = setTimeout(async () => {
      const at = latest.current;
      if (at.status === "confirmed" && Date.now() - at.yesAt > FILL_AFTER_YES_MS) return dispatch({ type: "bg", token: null });
      bgBusy.current = true;
      const reply = await poll(token);
      bgBusy.current = false;
      const cur = latest.current;
      const onCard = cur.step === "confirm" || (cur.status === "confirmed" && (cur.step === "resume" || cur.step === "email") && !cur.sending);
      if (gen !== bgGen.current || !onCard || !cur.bg) return; // they moved on ("not me", Back, the upload started)
      const same = reply.state === "found" && reply.profile.slug === cur.profile?.slug && !reply.retracted;
      if (reply.state === "error") return dispatch({ type: "bg", token: null }); // keep the partial card as it is
      if (reply.state === "pending" && !reply.retracted) return dispatch({ type: "bg", token: reply.token });
      if (same && reply.partial === true) return dispatch({ type: "bg", token: reply.token ?? null, next: reply.next });
      if (same) {
        track("linkedin_found", { full_after_partial: true, after_yes: cur.status === "confirmed" });
        return dispatch({ type: "fill", profile: reply.profile, next: reply.next });
      }
      // Retracted: the partial card was someone else. Back to A4, the next card, or not-found; a "Yes" is undone.
      track("linkedin_failed", { reason: "retracted", after_yes: cur.status === "confirmed" });
      lookupGen.current++;
      polls.current = 1;
      dispatch({ type: "retract" });
      if (reply.state === "pending") dispatch({ type: "searching", token: reply.token, index: stageIndex(reply.stage), checkingNext: false });
      else if (reply.state === "found")
        dispatch({ type: "found", profile: reply.profile, next: reply.next, partial: reply.partial === true, bg: reply.partial === true ? reply.token ?? null : null });
      else dispatch({ type: "go", step: "notFound", push: false });
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [bgOn, s.bg]);

  const begin = useCallback(
    async (body: Record<string, string | boolean>, usePrefetch = false) => {
      polls.current = 0;
      const gen = ++lookupGen.current;
      bgGen.current++;
      dispatch({ type: "searching", token: "", index: body.url ? 2 : 0, restart: true, checkingNext: false });
      if (s.preview) return;
      // A3: the A2 prefetch has almost always answered by now (~1 s). Always await it before this start, so the server
      // attaches to its job instead of catching two starts at once (which costs the A3 start up to 3 s).
      const key = personKey(String(body.name), String(body.company));
      const pre = usePrefetch && prefetch.current?.key === key ? await prefetch.current.reply : null;
      if (pre && pre.state !== "pending") prefetch.current = null; // it failed (429, 502, 400): start as usual; the A3 reply carries the error
      const reply = await post("/api/linkedin/start", pre?.state === "pending" ? { ...body, token: pre.token } : body);
      if (gen !== lookupGen.current || latest.current.step !== "search") return; // Back or "paste your link" meanwhile
      const code = busyCode(reply);
      if (reply.state === "pending") dispatch({ type: "searching", token: reply.token, index: stageIndex(reply.stage) });
      else if (code) dispatch({ type: "busy", code, retryAfter: reply.state === "error" ? reply.retryAfter : undefined });
      else dispatch({ type: "go", step: body.url ? "link" : "notFound", push: false, error: reply.state === "error" ? reply.message || null : null });
    },
    [s.preview],
  );

  const lookup = () => begin({ name: s.name.trim(), company: s.company.trim(), role: s.title.trim(), partial: true }, true);

  /* ------------------------------------------------------------ handlers */
  const submitName = (e: FormEvent) => {
    e.preventDefault();
    if (s.name.trim().length < 2 || !/\s/.test(s.name.trim())) return dispatch({ type: "error", message: A.name.missing });
    dispatch({ type: "go", step: "company" });
  };
  const submitCompany = (e: FormEvent) => {
    e.preventDefault();
    if (s.company.trim().length < 2) return dispatch({ type: "error", message: A.company.missing });
    // Prefetch: start the search now, while they type their title. Not polled, nothing shown from it (errors
    // included). A changed name or company (Back from A3) fires a new one; the same pair again fires nothing.
    const key = personKey(s.name, s.company);
    if (!s.preview && prefetch.current?.key !== key)
      prefetch.current = { key, reply: post("/api/linkedin/start", { name: s.name.trim(), company: s.company.trim(), partial: true }) };
    dispatch({ type: "go", step: "title" });
  };
  const submitTitle = (e: FormEvent) => {
    e.preventDefault();
    lookup();
  };
  const submitLink = (e: FormEvent) => {
    e.preventDefault();
    const url = normaliseLink(s.url);
    if (!LINKEDIN_RE.test(url)) return dispatch({ type: "error", message: A.link.badUrl });
    dispatch({ type: "field", key: "url", value: url });
    begin({ name: s.name.trim(), company: s.company.trim(), role: s.title.trim(), url });
  };
  const yes = () => {
    track("linkedin_confirmed", { score: s.profile?.score ?? null });
    dispatch({ type: "status", status: "confirmed" });
  };
  const notMe = async () => {
    track("linkedin_rejected", {});
    if (!s.next) return dispatch({ type: "go", step: "notFound", error: A.confirm.outOfProfiles });
    polls.current = 0;
    const gen = ++lookupGen.current;
    bgGen.current++; // "Not me" on a partial card: its background poll stops; that person is never shown again
    dispatch({ type: "searching", token: "", index: 2, restart: true, checkingNext: true });
    if (s.preview) return;
    const reply = await post("/api/linkedin/profile", { next: s.next });
    if (gen !== lookupGen.current || latest.current.step !== "search") return;
    const code = busyCode(reply);
    if (reply.state === "pending") dispatch({ type: "searching", token: reply.token, index: 2, checkingNext: true });
    else if (code) dispatch({ type: "busy", code });
    else dispatch({ type: "go", step: "notFound", push: false, error: A.confirm.outOfProfiles });
  };
  const skipLinkedIn = () => {
    track("linkedin_failed", { reason: "skipped" });
    // A link left in the field counts only if it is a real linkedin.com/in/ link; anything else is a plain skip.
    const url = normaliseLink(s.url);
    if (s.url.trim() && LINKEDIN_RE.test(url)) dispatch({ type: "status", status: "typed", url });
    else dispatch({ type: "status", status: "skipped" });
  };

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    if (files.length > 1) return dispatch({ type: "error", message: errors.multiple });
    const file = files[0];
    const check = checkResumeFile(file);
    if (!check.ok) {
      track("resume_rejected", { reason: check.reason });
      return dispatch({ type: "error", message: check.message });
    }
    pickedFile.current = file;
    dispatch({ type: "file", file: { name: file.name, size: file.size } });
  };
  const onDrag = (e: DragEvent, over: boolean) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(over);
  };

  const send = async (via: "resume" | "email") => {
    // After a resume with no email on it, A6b sends the same resume again with the typed address.
    const file = via === "resume" || s.needEmail ? pickedFile.current : null;
    const email = via === "email" ? s.email.trim() : null;
    if (via === "resume" && !file && !s.preview) return fileRef.current?.click();
    if (via === "email") {
      if (!email) return dispatch({ type: "error", message: A.noResume.emailMissing });
      if (!EMAIL_RE.test(email)) return dispatch({ type: "error", message: A.noResume.emailInvalid });
    }
    dispatch({ type: "sending", on: true });
    if (s.preview) {
      await sleep(1400);
      return dispatch({ type: "done", email: email ?? mockEmail });
    }
    const params = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(UTM_KEYS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])));
    const body = new FormData();
    if (file) body.append("resume", file);
    body.append("utm", JSON.stringify(utm));
    body.append(
      "application",
      JSON.stringify({
        name: (s.status === "confirmed" && s.profile?.fullname) || s.name.trim(),
        company: s.company.trim(),
        designation: s.title.trim(),
        // Never an unchecked link: "typed" is only set for a URL that passed LINKEDIN_RE, and it's checked again here.
        linkedinUrl: (s.status === "confirmed" && s.profile?.url) || (s.status === "typed" && LINKEDIN_RE.test(s.url) ? s.url : ""),
        linkedinStatus: s.status,
        linkedinProfile: s.status === "confirmed" ? s.profile : null,
        ...(email ? { email } : {}),
        program: programFor(market),
      }),
    );
    const minWait = sleep(1100); // long enough to read "Saving your resume"
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; email?: string | null; error?: string } | null;
      await minWait;
      if (!res.ok || !data?.ok) {
        track("upload_failed", { status: res.status });
        return dispatch({ type: "error", message: res.status === 413 ? errors.tooBigForServer : data?.error ?? errors.server });
      }
      track(file ? "resume_added" : "resume_skipped", { linkedin: s.status, email_found: Boolean(data.email) });
      const reachAt = data.email ?? null;
      // No email on Done, ever (Steve v4.1 #6): a resume without one goes to A6b; a typed address the server refused
      // stays on A6b with the error.
      if (!reachAt) return dispatch(email ? { type: "error", message: A.noResume.emailInvalid } : { type: "needEmail" });
      dispatch({ type: "done", email: reachAt });
    } catch {
      await minWait;
      dispatch({ type: "error", message: errors.network });
    }
  };

  /* ---------------------------------------------------------------- render */
  const searchP = s.step === "search" ? searchProgress(s.stage, Math.max(0, now - s.stageAt)) : 0;
  const { fills, n } = fillsFor(s, searchP);
  const fullName = ((s.status === "confirmed" && s.profile?.fullname) || s.name).trim();
  const trailAll = [
    { id: "ans-name", text: s.name },
    { id: "ans-company", text: s.company },
    { id: "ans-title", text: s.title },
  ];
  const canBack = s.history.length > 0 && s.step !== "done";

  const screens: Record<Step, () => ReactNode> = {
    name: () => (
      <Screen label={A.name.question} onSubmit={submitName} actions={<><Primary type="submit">{A.continue}</Primary><EnterHint /></>}>
        <Heading title={A.name.question} sub={A.name.sub} />
        <m.div variants={cascade} custom={1} className="w-full max-w-[560px]">
          <HeroField id="f-name" value={s.name} onValue={(v) => dispatch({ type: "field", key: "name", value: v })} placeholder={A.name.placeholder} layoutId="ans-name" autoComplete="name" autoCapitalize="words" enterKeyHint="next" error={s.error} errorId="f-name-err" aria-label={A.name.question} />
        </m.div>
      </Screen>
    ),
    company: () => (
      <Screen label={A.company.question} onSubmit={submitCompany} actions={<><Primary type="submit">{A.continue}</Primary><EnterHint /></>}>
        <Trail items={trailAll.slice(0, 1)} />
        <Heading title={A.company.question} sub={A.company.sub} />
        <m.div variants={cascade} custom={1} className="w-full max-w-[560px]">
          <HeroField id="f-company" value={s.company} onValue={(v) => dispatch({ type: "field", key: "company", value: v })} placeholder={A.company.placeholder} layoutId="ans-company" autoComplete="organization" enterKeyHint="next" error={s.error} errorId="f-company-err" aria-label={A.company.question} />
        </m.div>
      </Screen>
    ),
    title: () => (
      <Screen label={A.title.question} onSubmit={submitTitle} actions={<><Primary type="submit">{A.continue}</Primary><EnterHint /></>}>
        <Trail items={trailAll.slice(0, 2)} />
        <Heading title={A.title.question} sub={A.title.sub} />
        <m.div variants={cascade} custom={1} className="w-full max-w-[560px]">
          <HeroField id="f-title" value={s.title} onValue={(v) => dispatch({ type: "field", key: "title", value: v })} placeholder={A.title.placeholder} layoutId="ans-title" autoComplete="organization-title" enterKeyHint="search" error={s.error} errorId="f-title-err" aria-label={A.title.question} />
        </m.div>
      </Screen>
    ),
    search: () => {
      const pct = Math.round(searchP * 100);
      const st = A.search.stages;
      const first = s.name.trim().split(/\s+/)[0] ?? "";
      // STAGES order: search, people, profile, found (the reducer keeps the furthest one reached).
      const stageLine = [st.search, st.people(first), st.profile, st.found][Math.min(3, Math.max(0, s.stage))];
      return (
        <Screen label={A.search.title} actions={<TextButton onClick={() => dispatch({ type: "go", step: "link", push: false })}>{A.search.manual}</TextButton>}>
          <m.div variants={cascade} custom={0}>
            <LinkedInVisual searching />
          </m.div>
          <Trail items={trailAll} />
          <Heading title={s.checkingNext ? A.confirm.trying : A.search.title} sub={A.search.sub} />
          <m.div variants={cascade} custom={2} className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-1.5 w-[220px] overflow-hidden rounded-[3px] bg-s300 md:w-[320px]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={A.search.title}>
                <div className="absolute inset-0 origin-left rounded-[3px] bg-s1000 transition-transform duration-300 ease-linear motion-reduce:transition-none" style={{ transform: `scaleX(${searchP})` }} />
              </div>
              <p className="w-10 text-left text-[14px] font-medium tabular-nums leading-5 text-s1000">{pct}%</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <StageLine text={stageLine} />
              <p className="t-helper text-s600">{A.search.wait}</p>
            </div>
          </m.div>
        </Screen>
      );
    },
    confirm: () =>
      s.profile ? (
        <Screen
          label={A.confirm.title}
          actions={
            <>
              <div className="flex w-full gap-3 md:w-auto">
                <Secondary type="button" onClick={notMe}>{A.confirm.no}</Secondary>
                <Magnetic className="flex min-w-0 flex-1 md:inline-flex md:flex-none">
                  <button type="button" className="pill pill-l pill-dark w-full md:w-auto" onClick={yes} autoFocus>
                    {A.confirm.yes}
                  </button>
                </Magnetic>
              </div>
              <TextButton onClick={() => dispatch({ type: "go", step: "link" })}>{A.confirm.manual}</TextButton>
            </>
          }
        >
          <Heading title={A.confirm.title} sub={A.confirm.hint} />
          <ProfileCard profile={s.profile} nameId="ans-name" filling={s.partial && Boolean(s.bg)} />
        </Screen>
      ) : null,
    link: () => linkScreen(A.link.question),
    notFound: () => linkScreen(A.notFound.title, s.error ?? A.notFound.sub),
    rateLimited: () => {
      const left = s.retryAt ? s.retryAt - now : 0;
      return (
        <Screen
          label={A.rateLimited.title}
          actions={
            <>
              <Primary type="button" disabled={left > 0} onClick={lookup}>
                {left > 0 ? A.rateLimited.wait(clock(left)) : A.rateLimited.retry}
              </Primary>
              <TextButton onClick={() => dispatch({ type: "go", step: "link" })}>{A.search.manual}</TextButton>
            </>
          }
        >
          <m.div variants={cascade} custom={0}><LinkedInVisual /></m.div>
          <Heading title={A.rateLimited.title} sub={A.rateLimited.sub} />
        </Screen>
      );
    },
    dailyCap: () => busyScreen(A.dailyCap),
    searchDown: () => busyScreen(A.searchDown),
    offline: () => (
      <Screen
        label={A.offline.title}
        actions={
          <>
            <Primary type="button" onClick={lookup}>{A.offline.retry}</Primary>
            <TextButton onClick={() => dispatch({ type: "go", step: "link" })}>{A.offline.manual}</TextButton>
          </>
        }
      >
        <m.div variants={cascade} custom={0}><LinkedInVisual /></m.div>
        <Heading title={A.offline.title} sub={A.offline.sub} />
      </Screen>
    ),
    resume: () => (
      <Screen
        label={A.resume.title}
        actions={
          <>
            <Primary type="button" onClick={() => send("resume")} disabled={s.sending} aria-busy={s.sending}>
              {s.sending ? <Saving /> : A.resume.cta}
            </Primary>
            <TextButton onClick={() => dispatch({ type: "go", step: "email" })} disabled={s.sending}>
              {s.status === "skipped" ? A.noResume.linkNoLinkedIn : A.noResume.link}
            </TextButton>
            <Consent />
          </>
        }
      >
        <Trail items={[{ id: "ans-name", text: fullName }]} />
        <Heading title={A.resume.title} sub={A.resume.sub} />
        <m.div variants={cascade} custom={1} className="relative w-full max-w-[560px]">
          <label
            htmlFor="f-resume"
            onDragEnter={(e) => onDrag(e, true)}
            onDragOver={(e) => onDrag(e, true)}
            onDragLeave={(e) => onDrag(e, false)}
            onDrop={(e) => {
              onDrag(e, false);
              pick(e.dataTransfer.files);
            }}
            className={`group flex h-40 w-full flex-col items-center justify-center gap-3 rounded-[16px] border px-6 text-center transition-[border-color,background-color,transform] duration-200 ease-[var(--ease-out)] focus-within:border-s1000 ${
              dragging ? "scale-[1.01] border-solid border-s1000 bg-s100" : s.file ? "border-solid border-s300 bg-s100" : "border-dashed border-s400 hover:border-s1000"
            }`}
          >
            <input ref={fileRef} id="f-resume" type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files)} aria-describedby="f-resume-hint" />
            <img src="/ds/file-upload.svg" alt="" width={32} height={32} className={`size-8 transition-transform duration-300 ease-[var(--ease-out)] ${dragging ? "-translate-y-1" : "group-hover:-translate-y-0.5"}`} />
            {s.file ? (
              <m.div key={s.file.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex flex-col items-center">
                <p className="max-w-full truncate text-[14px] font-medium leading-5 text-s1000">{s.file.name}</p>
                <p className="t-helper text-s600">{formatBytes(s.file.size)} · {touch ? A.resume.replaceTouch : A.resume.replace}</p>
              </m.div>
            ) : (
              <>
                <p className="text-[14px] font-medium leading-5 text-s1000">{dragging ? site.upload.idle.dragging : touch ? A.resume.dropTouch : A.resume.drop}</p>
                <p id="f-resume-hint" className="t-helper text-s600">{site.upload.idle.hint}</p>
              </>
            )}
          </label>
          <p role={s.error ? "alert" : undefined} className={`t-helper absolute inset-x-0 top-full mt-2 text-center text-danger ${s.error ? "" : "hidden"}`}>
            {s.error}
          </p>
        </m.div>
      </Screen>
    ),
    email: () => (
      <Screen
        label={A.noResume.title}
        onSubmit={(e) => {
          e.preventDefault();
          send("email");
        }}
        actions={
          <>
            <Primary type="submit" disabled={s.sending} aria-busy={s.sending}>{s.sending ? <Saving label={A.noResume.sending} /> : A.noResume.cta}</Primary>
            <EnterHint />
            {s.needEmail ? null : <TextButton onClick={() => dispatch({ type: "back" })}>{A.noResume.back}</TextButton>}
            <Consent />
          </>
        }
      >
        <Trail items={[{ id: "ans-name", text: fullName }]} />
        <Heading title={A.noResume.title} sub={s.needEmail ? A.noResume.subNoEmail : A.noResume.sub} />
        <m.div variants={cascade} custom={1} className="w-full max-w-[560px]">
          <HeroField id="f-email" type="email" inputMode="email" autoComplete="email" enterKeyHint="done" value={s.email} onValue={(v) => dispatch({ type: "field", key: "email", value: v })} placeholder={A.noResume.emailPlaceholder} error={s.error} errorId="f-email-err" aria-label={A.noResume.emailLabel} />
        </m.div>
      </Screen>
    ),
    done: () => <Done name={fullName} email={s.sentEmail} until={until} />,
  };

  // Render helpers, not components: a component defined in here would remount (and drop focus) on every keystroke.
  function linkScreen(title: string, sub?: string) {
    return (
      <Screen
        label={title}
        onSubmit={submitLink}
        actions={
          <>
            <Primary type="submit">{A.continue}</Primary>
            <TextButton onClick={skipLinkedIn}>{A.notFound.skip}</TextButton>
          </>
        }
      >
        <m.div variants={cascade} custom={0}><LinkedInVisual /></m.div>
        <Heading title={title} sub={sub} />
        <m.div variants={cascade} custom={1} className="w-full max-w-[560px]">
          <HeroField id="f-link" type="url" inputMode="url" autoComplete="url" autoCapitalize="none" enterKeyHint="go" value={s.url} onValue={(v) => dispatch({ type: "field", key: "url", value: v })} placeholder={A.link.placeholder} error={s.error && s.step === "link" ? s.error : null} errorId="f-link-err" aria-label={A.link.question} />
        </m.div>
      </Screen>
    );
  }

  function busyScreen(copy: { title: string; sub: string; manual: string; skip: string }) {
    return (
      <Screen
        label={copy.title}
        actions={
          <>
            <Primary type="button" onClick={() => dispatch({ type: "go", step: "link" })}>{copy.manual}</Primary>
            <TextButton onClick={skipLinkedIn}>{copy.skip}</TextButton>
          </>
        }
      >
        <m.div variants={cascade} custom={0}><LinkedInVisual /></m.div>
        <Heading title={copy.title} sub={copy.sub} />
      </Screen>
    );
  }

  const isDone = s.step === "done";

  return (
    <div className={`flex min-h-dvh flex-col ${isDone ? "bg-white" : "bg-white"}`}>
      <header className="relative z-20 flex h-16 shrink-0 items-center justify-between px-6 md:h-[88px] md:px-12">
        <LogoTile href={basePath(market) || "/"} />
        {/* v4.2: no "Questions?" button. Phones have no footer, so Back sits here (desktop keeps it in the footer). */}
        {canBack ? (
          <button type="button" onClick={() => dispatch({ type: "back" })} className="pill pill-s -mr-2 gap-0.5 px-2 text-s1000 hover:bg-s100 md:hidden">
            <img src="/ds/chevron-left.svg" alt="" width={20} height={20} className="size-5" />
            <span className="pr-1">{A.back}</span>
          </button>
        ) : null}
      </header>
      {!isDone ? (
        <div className="md:hidden">
          <Progress fills={fills} step={n} />
        </div>
      ) : null}

      <main ref={main} className="relative flex flex-1 flex-col">
        <AnimatePresence key={s.epoch} mode="popLayout" initial={false} custom={s.dir}>
          <m.section
            key={s.step === "search" ? `search-${s.checkingNext}` : s.step === "confirm" ? `confirm-${s.profile?.slug ?? ""}` : s.step}
            custom={s.dir}
            variants={screen}
            initial="initial"
            animate="animate"
            exit="exit"
            data-step={s.step}
            className="flex w-full flex-1 flex-col"
          >
            {screens[s.step]()}
          </m.section>
        </AnimatePresence>
      </main>

      {!isDone ? (
        <footer className="hidden h-[88px] shrink-0 flex-col md:flex">
          <Progress fills={fills} step={n} />
          <div className="flex flex-1 items-center pl-12">
            {canBack ? (
              <button type="button" onClick={() => dispatch({ type: "back" })} className="pill pill-l -ml-1 gap-0.5 px-4 text-s1000 hover:bg-s100" style={{ padding: "12px 16px" }}>
                <img src="/ds/chevron-left.svg" alt="" width={20} height={20} className="size-5" />
                <span className="px-1">{A.back}</span>
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

function Saving({ label }: { label?: string }) {
  const fallback = useCopy().apply.resume.sending;
  label = label ?? fallback;
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative size-3.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white motion-reduce:animate-none" aria-hidden />
      {label}
    </span>
  );
}

function Consent() {
  const c = site.upload.consent;
  return (
    <p className="t-helper text-center text-s600">
      {c.before}{" "}
      <a className="underline underline-offset-2 hover:text-s1000" href={site.legal.privacyUrl} target="_blank" rel="noreferrer">
        {c.privacy}
      </a>{" "}
      {c.and}{" "}
      <a className="underline underline-offset-2 hover:text-s1000" href={site.legal.termsUrl} target="_blank" rel="noreferrer">
        {c.terms}
      </a>
      .
    </p>
  );
}
