/**
 * Every word on the site lives here. Components only read from this file.
 *
 * v4 (4 Nov 2026): short and plain, one line per screen, in the voice of the India onboarding.
 * v4.2 (5 Nov 2026, FEEDBACK_V4_2.md): "Apply for Tal" everywhere, early preview in the SF Bay Area, "What to expect"
 * instead of "The deal", four warm questions, the numbers wall. Voice: a good friend explaining it over coffee.
 * The key map, with where each string appears, is in docs/team/COPY.md.
 *
 * House rules: Tal is "Tal" or "it", never a gendered pronoun. The page speaks as "we".
 * The old programme name never appears on screen. `program: "select"` is an internal value only.
 */

export const BRAND_NAME = "Tal";

/**
 * Claims. Change them here only.
 * network: verified (~234K Tal app + ~1.04M Grapevine). Never say "active" or "every week".
 * startups: founder-stated, approved for use 4 Nov 2026.
 * network is used once, on the numbers wall (select.stats.total). startups is held off the page since v4.3 (five tiles,
 * FEEDBACK_V4_3); it stays here, approved, for when a place for it comes back.
 * The per-function counts are not here: they come from content/network.json (the data lane), never typed by hand.
 */
const claims = {
  network: "300,000+",
  startups: "5,000+",
};

const applyForTal = "Apply for Tal";
/** Exact (FEEDBACK_V4_2 §1). Non-breaking spaces keep "SF Bay Area." on one line. */
const preview = "In early preview within the SF\u00a0Bay\u00a0Area.";
const pasteLink = "Paste my LinkedIn link";
const pasteLinkInstead = "Paste my LinkedIn link instead";

export const site = {
  name: BRAND_NAME,

  claims,

  /** Root layout metadata (app/layout.tsx). */
  seo: {
    title: "Tal: a talent agent for engineers, researchers, PMs and designers",
    description:
      "Tal is a talent agent for engineers, researchers, PMs and designers, in early preview within the SF Bay Area. You see every role first, and it's free for you.",
  },

  /** The one funding claim. The pinned bar above the nav only (v4.1: cut from the footer). */
  funding: {
    line: "We’ve raised $7 million from Peak XV (formerly Sequoia Capital).",
  },

  /** Resume upload rules and messages (resume step, app/api/upload, lib/validation). */
  upload: {
    maxBytes: 5 * 1024 * 1024,
    extensions: [".pdf", ".docx"],
    mimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    idle: {
      hint: "PDF or DOCX, up to 5 MB",
      dragging: "Drop it here",
    },
    errors: {
      wrongType: (ext: string) => `That's ${ext ? `a ${ext} file` : "a file we can't read"}. Please use a PDF or DOCX.`,
      tooBig: (size: string) => `That file is ${size}. The limit is 5 MB.`,
      empty: "That file is empty. Try another one.",
      corrupt: "We couldn't open that file. Try saving it again as a PDF.",
      multiple: "One file at a time, please.",
      network: "We couldn't reach Tal. Check your connection and try again.",
      server: "Something went wrong on our side. Please try again in a minute.",
      tooBigForServer: "That file is too big to upload. A PDF under 5 MB will work.",
    },
    /** Under the drop area and the email field. Links come from `legal`. */
    consent: { before: "By continuing, you agree to our", privacy: "Privacy Policy", and: "and", terms: "Terms" },
  },

  /* ---------------------------------------------------------------- */
  /* v4: the US site at "/". `select` is an internal key name only.    */
  /* ---------------------------------------------------------------- */
  select: {
    seo: {
      title: "Tal: a talent agent for engineers, researchers, PMs and designers",
      description:
        "Tal is a talent agent for engineers, researchers, PMs and designers, in early preview within the SF Bay Area. You see every role first, and it's free for you.",
      siteName: BRAND_NAME,
    },

    /** Social card text. The OG image is the hero art with the metallic tal wordmark (scripts/og.mjs, art lane). */
    og: {
      line: "tal",
      sub: `The talent agent for engineers, researchers, PMs and designers. ${preview}`,
      alt: `The silver tal wordmark on black, with the line: The talent agent for engineers, researchers, PMs and designers. ${preview}`,
    },

    /** Top nav (landing) and header (flow). Funding line: site.funding.line. v4.2: no "Questions?" button (a footer link only). */
    topBar: {
      wordmark: "tal",
      wordmarkLabel: "Tal, home",
      cta: applyForTal,
    },

    /* ------------------------------ Landing ------------------------------ */

    /** L1. Hero (Figma 4:43 / 5:65). The metallic tal wordmark is the headline; this is the line under it. */
    hero: {
      sub: `The talent agent for engineers, researchers, PMs and designers. ${preview}`,
      cta: applyForTal,
      note: "Free for you. Companies pay when they hire.",
    },

    /** L2. Glass chat card (4:80). Names no real company. The caption under the card says what it is. */
    chat: {
      tal: "Tal",
      role: "Your talent agent",
      caption: "An example of a week with Tal. Nothing goes to a company until you say yes.",
      /** The thread types itself in when it scrolls into view. `after` is the pause before each message (ms). */
      messages: [
        {
          from: "tal",
          meta: "Tal · Monday",
          text: "Three new roles for you: SF, the Bay Area and remote.",
          roles: [
            ["Staff engineer", "a Series B payments company"],
            ["Founding engineer", "a seed-stage dev tools company"],
            ["ML engineer", "a Series A health company"],
          ],
          after: 400,
        },
        { from: "you", text: "Yes to the payments one. No to the other two.", after: 1500 },
        { from: "tal", meta: "Tal · Tuesday", text: "Intro sent to the founder. They'll write to you directly.", after: 1100 },
      ] as { from: "tal" | "you"; meta?: string; text: string; roles?: [string, string][]; after: number }[],
      typing: "Tal is typing",
    },

    /**
     * L3. The numbers wall (white card 4:124, v4.3). The people are the proof: the lead carries the network claim with
     * eight Tal faces beside it, five tiles show real counts by function from content/network.json (`tiles` picks the
     * keys, in order), and a quiet row of the verified company marks closes it (`companies`). Claims appear here only.
     */
    stats: {
      eyebrow: "The people behind Tal",
      /**
       * Steve r3: the total is set big on its own line (`total`), the headline finishes the sentence. "In early preview"
       * moved out of the headline: next to "300,000+" it read as 300,000 people in the Bay Area (NETWORK_NUMBERS: 522).
       */
      total: claims.network,
      headline: "tech professionals in Tal's network.",
      body: "Engineers, product managers, designers and founders, from Google to seed-stage startups. Tal is opening in the SF Bay Area first.",
      /**
       * FEEDBACK_V4_3: five tiles, not ten. Keys from content/network.json, shown in this order; the other rows stay in
       * the JSON, off the page.
       */
      tiles: ["swe", "product", "design", "ai", "founder"],
      /** Over the quiet logo row under the tiles. Backed by NETWORK_NUMBERS: 53,744 current employees of the 12. */
      companies: "People from these companies are in Tal's network.",
      /** Screen-reader name for the grid. */
      gridLabel: "Tech professionals behind Tal, by what they do",
    },

    /** L5. What to expect (glass card 22:1165; v4.2: no orb, text only). Each row leads in white and continues in 64 % white. */
    deal: {
      heading: "What to expect",
      rows: [
        ["It's free for you.", " Companies pay Tal when they hire someone."],
        ["You'll see every role first.", " Tal only applies to the ones you approve."],
        ["Tal works for you for six months.", " Go quiet and Tal will stop reaching out."],
        ["Roles are in San Francisco, the Bay Area, and remote.", ""],
      ] as [string, string][],
    },

    /** L6. Questions (4:195). v4.2: four warm ones, nothing that plants a fear. Each answer two sentences or fewer. */
    faq: {
      heading: "Questions",
      items: [
        ["Who is Tal for?", "Engineers, researchers, PMs and designers who'd like to hear about good roles in San Francisco, the Bay Area or remote. You don't have to be looking right now."],
        ["Does it cost anything?", "No, it's free for you. Companies pay Tal when they hire someone it introduced."],
        ["Which companies does Tal work with?", "AI and consumer startups, from seed to late stage. Tal only sends you the roles that fit what you do."],
        ["What happens after six months?", "Tal checks in to ask if you'd like to keep going. If you don't reply, it stops."],
      ] as [string, string][],
    },

    /** L7. Closing CTA, footer (4:224) and the giant wordmark. Email: site.legal.supportEmail. */
    credits: {
      /** v4.2: the bottom CTA, centred above the footer hairline. */
      cta: applyForTal,
      /** The one quiet "Questions" link (to #questions); the nav and flow buttons are gone. */
      questions: "Questions",
      copyright: "© 2026 Tal",
      privacy: "Privacy",
      terms: "Terms",
    },

    /** Logo marquee caption (21:965), exact (FEEDBACK_V4_3). India hiring managers; never implies US openings. */
    proofLine: "Hiring managers from these companies hire on Tal",

    /* -------------------------------- Flow -------------------------------- */

    /** Bottom progress bar, five segments (A1 to A6). */
    steps: {
      label: (n: number, total: number) => `Step ${n} of ${total}`,
      names: ["Name", "Company", "Title", "LinkedIn", "Resume"],
    },

    apply: {
      /** Shared by every question screen. */
      continue: "Continue",
      enterHint: "or press Enter to continue",
      /** v4.1: the footer's back pill (desktop). */
      back: "Back",

      /** A1. */
      name: {
        question: "What's your full name?",
        sub: "This is the name Tal introduces you by.",
        placeholder: "Your full name",
        missing: "Add your full name to continue.",
      },
      /** A2. */
      company: {
        question: "Where do you work?",
        sub: "Company name is enough.",
        placeholder: "Company",
        missing: "Add where you work to continue.",
      },
      /** A3. */
      title: {
        question: "What's your title?",
        sub: "Member of Technical Staff, Staff Engineer, Product Lead…",
        placeholder: "Member of Technical Staff",
      },

      /** A4. */
      search: {
        title: "Finding you on LinkedIn",
        /** Under the title (v4.1, from the Figma frame). */
        sub: "Tal is reading your photo, roles and history so you don't have to type them.",
        wait: "This usually takes a few seconds.",
        /**
         * v4.1: under the bar, the stage the poll really reports (docs/team/API.md), cross-fading as it changes.
         * `search` = Google + the people search started; `people` = Google done, people search still running;
         * `profile` = a profile is being pulled (also a pasted link, or "No, not me"); `found` = held at 100 % for 450 ms.
         */
        stages: {
          search: "Searching LinkedIn…",
          people: (first: string) => (first ? `Looking through people named ${first}…` : "Looking through the people we found…"),
          profile: "Reading the profile…",
          found: "Checking it's you…",
        },
        manual: pasteLinkInstead,
      },

      /** Paste-link screen, reachable from A1 to A5b. */
      link: {
        question: "What's your LinkedIn link?",
        placeholder: "linkedin.com/in/your-name",
        badUrl: "That isn't a LinkedIn profile link. It looks like linkedin.com/in/your-name.",
      },

      /** A5. */
      confirm: {
        title: "Is this you?",
        hint: "We only read your public profile.",
        yes: "Yes, that's me",
        no: "No, not me",
        manual: "Paste my link",
        trying: "Checking the next profile",
        outOfProfiles: "That's everyone we found. Paste your LinkedIn link instead.",
      },

      /** A5b states. Primary action is always `manual`. Only notFound says we couldn't find them. */
      notFound: {
        title: "We couldn't find you on LinkedIn",
        sub: "Paste your LinkedIn link and we'll take it from there.",
        manual: pasteLink,
        skip: "Skip, I'll add my resume",
      },
      rateLimited: {
        title: "Tal is getting a lot of requests right now",
        sub: "Paste your LinkedIn link to keep going.",
        /** v4.1: primary action on this state, per the Figma frame. `wait(s)` while the server's Retry-After runs. */
        retry: "Try again",
        wait: (s: string) => `Try again in ${s}`,
        manual: pasteLink,
        skip: "Skip, I'll add my resume",
      },
      dailyCap: {
        title: "Tal's LinkedIn search is full for today",
        sub: "Paste your LinkedIn link to keep going, or try again tomorrow.",
        manual: pasteLink,
        skip: "Skip, I'll add my resume",
      },
      searchDown: {
        title: "Tal's LinkedIn search isn't working right now",
        sub: "Paste your LinkedIn link to keep going.",
        manual: pasteLink,
        skip: "Skip, I'll add my resume",
      },
      offline: {
        title: "You're offline",
        sub: "Check your connection and try again.",
        retry: "Try again",
        manual: pasteLink,
      },

      /** A6. */
      resume: {
        title: "Add your resume",
        sub: "Optional. It helps Tal represent you better.",
        drop: "Drop a PDF or DOCX, or click to choose",
        /** v4.1: the same line on touch devices (`(pointer: coarse)`), where nothing can be dropped. */
        dropTouch: "Tap to choose a PDF or DOCX",
        cta: "Continue",
        sending: "Saving your resume",
        /** v4.1: under a chosen file's name. */
        replace: "Click to choose another",
        replaceTouch: "Tap to choose another",
      },
      /** A6b. Reached from the quiet link under the drop area. */
      noResume: {
        link: "No resume handy? We'll work from your LinkedIn.",
        /** When LinkedIn was skipped, so the line stays true. */
        linkNoLinkedIn: "No resume handy? Your email is enough to start.",
        title: "Where should Tal write to you?",
        sub: "We'll email you when a role fits.",
        /** v4.1: when the resume was saved but had no email on it (the upload answers `email: null`). */
        subNoEmail: "Your resume is saved, but there's no email on it. We'll write to you when a role fits.",
        emailLabel: "Email",
        emailPlaceholder: "you@example.com",
        emailMissing: "Add your email to continue.",
        emailInvalid: "That email doesn't look right.",
        cta: "Continue",
        sending: "Saving",
        back: "Add a resume instead",
      },

      /** A7 (Figma 3:661 / 5:917). Their name, set large, the credit caps, the line about what's ahead, one warm note. */
      done: {
        /** `date` like "4 May 2027". Set in tracked caps by CSS. */
        credit: (date: string) => `Represented by Tal · until ${date}`,
        /** Exact (FEEDBACK_V4_2 §6, kept in V4_3). */
        sub: "Tal will mail you when a good role that matches you is found.",
        /**
         * v4.3 (FEEDBACK_V4_3): replaces the three sample chips and "Examples of what Tal sends." A reminder that a real
         * person is looking while Tal is in early preview. Rises from the horizon where the chips did.
         * Steve r4: "a real person … right now" was a promise we can't keep at 3 am, and "the moment one matches, it's in
         * your inbox" said the sub line again, one line below it. The founder's own words, shorter.
         */
        note: "Tal is in early preview. We've already started looking for roles for you.",
        /** No email ever reaches A7 any more: an upload without one goes to A6b first (v4.1). */
        email: (email: string) => `Tal will write to ${email}.`,
        close: "Done",
      },
    },
  },

  /** Runs under Grapevine's policies (Watercooler Chat Private Limited). /privacy and /terms redirect here. */
  legal: {
    privacyUrl: "https://www.grapevine.in/privacy",
    termsUrl: "https://www.grapevine.in/terms",
    supportEmail: "support@gvine.app",
    company: "Watercooler Chat Private Limited",
  },
};

export type Site = typeof site;
