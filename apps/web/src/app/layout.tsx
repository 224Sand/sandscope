import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Bricolage_Grotesque,
  Instrument_Serif,
  Instrument_Sans,
  JetBrains_Mono,
} from "next/font/google";
import Mark from "@/components/Mark";
import config from "@/generated/product.config.json";
import "./globals.css";
import Lookup from "@/components/Lookup";
import { SiteStructuredData } from "@/components/StructuredData";

/**
 * Three typographic voices, one per surface family (S9-TYPE).
 *
 * Until this sprint the site declared `-apple-system, "SF Pro Text"` and shipped
 * no webfont at all. On a Mac that resolves to SF Pro and looks deliberate; on
 * Windows, where most readers are, neither face exists and the whole type scale
 * falls through to a generic system sans. The care taken in Sprint 6 was
 * invisible to the majority of viewers for three sprints because the fallback
 * path is the one nobody tests on their own machine.
 *
 * `next/font/google` downloads these at BUILD time and serves them from our own
 * origin, so there is no runtime request to Google, no CSP exception, and no
 * layout shift. The strict `default-src 'self'` policy in next.config.ts stays
 * exactly as tight as it was.
 *
 * Every family here is variable where one exists, which is what keeps six
 * families affordable: one file covers a weight range instead of one file per
 * weight (IMP-11).
 */

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400", // the only weight this face ships
  variable: "--font-instrument-serif",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const fontVariables = [
  geist.variable,
  geistMono.variable,
  bricolage.variable,
  instrumentSerif.variable,
  instrumentSans.variable,
  jetbrainsMono.variable,
].join(" ");

export const metadata: Metadata = {
  // metadataBase makes every relative OG/canonical URL absolute. Without it
  // Next emits relative og:image and canonical values, which crawlers and
  // social unfurlers both resolve inconsistently.
  metadataBase: new URL(config.frontendUrl),
  title: {
    default: `${config.name} — ${config.tagline}`,
    // Every page already sets its own title; this stops them being anonymous
    // in a results list by naming the site they belong to.
    template: `%s — ${config.name}`,
  },
  description: config.description,
  applicationName: config.name,
  authors: [{ name: "Sandeep Chavan", url: "https://github.com/224Sand" }],
  creator: "Sandeep Chavan",
  publisher: "Sandeep Chavan",
  keywords: [
    "agent reliability", "evidence gating", "retrieval-augmented generation",
    "LLM infrastructure", "AI governance", "MCP server", "hallucination",
    "forward deployed engineering", "Sandeep Chavan",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: `${config.name} — ${config.tagline}`,
    description: config.description,
    type: "website",
    url: config.frontendUrl,
    siteName: config.name,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: `${config.name} — ${config.tagline}`,
    description: config.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1,
                 "max-image-preview": "large", "max-video-preview": -1 },
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <SiteStructuredData />
        {/* The navigation keeps ONE voice across every surface. Three
            typographic identities is already one more than most sites can hold
            together; letting the masthead change too would read as three
            different sites rather than one with three registers. */}
        <nav className="site-nav">
          <div className="wrap nav-links" style={{ height: 52 }}>
            <a href="/" className="wordmark" aria-label={`${config.name} home`}>
              <Mark size={20} />
              <span>{config.wordmark}</span>
            </a>
            <span className="grow" />
            {[
              ["/story", "Story"],
              ["/handover", "Handover"],
              ["/console", "Console"],
              ["/data", "Data"],
              ["/architecture", "Architecture"],
              ["/charter", "Charter"],
              ["/lora", "LoRA"],
              ["/council", "Council"],
              ["/reliability", "Reliability"],
              ["/delivery", "Delivery"],
              ["/find", "Find"],
              [`https://github.com/${config.repo}`, "Source"],
            ].map(([href, label]) => (
              <a key={href} href={href} style={{ color: "var(--text-2)", fontSize: "0.875rem" }}>
                {label}
              </a>
            ))}
          </div>
        </nav>
        {children}
        {/* The site never said who built it. JSON-LD tells a crawler, but a
            visible, crawlable link is what actually consolidates the author,
            this site and the repositories into one entity -- and it is the
            only way a reader gets from the work to the person. */}
        <footer className="site-footer">
          <div className="wrap row-links">
            <span className="muted fine">
              Built by <strong>Sandeep Chavan</strong> — Technical Product Manager ·
              Forward Deployed AI Engineer, Hyderabad
            </span>
            <span className="grow" />
            <a className="mono finer" href="https://github.com/224Sand"
               rel="me author">GitHub</a>
            <a className="mono finer" href="https://www.linkedin.com/in/sandeep-c04"
               rel="me author">LinkedIn</a>
            <a className="mono finer" href="https://github.com/224Sand/sandscope">Source</a>
            <a className="mono finer" href="https://github.com/224Sand/charter">Charter</a>
          </div>
        </footer>
        {/* Site-wide. Makes every identifier on every surface clickable after
            hydration and offers a lookup on any text selection, so a reference
            is followable without twenty pages each remembering to link it. */}
        <Lookup />
      </body>
    </html>
  );
}
