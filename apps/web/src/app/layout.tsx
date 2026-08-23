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
  title: `${config.name} — ${config.tagline}`,
  description: config.description,
  applicationName: config.name,
  openGraph: {
    title: `${config.name} — ${config.tagline}`,
    description: config.description,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
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
            <span style={{ flex: 1 }} />
            {[
              ["/story", "Story"],
              ["/console", "Console"],
              ["/architecture", "Architecture"],
              ["/reliability", "Reliability"],
              ["/delivery", "Delivery"],
              [`https://github.com/${config.repo}`, "Source"],
            ].map(([href, label]) => (
              <a key={href} href={href} style={{ color: "var(--text-2)", fontSize: "0.875rem" }}>
                {label}
              </a>
            ))}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
