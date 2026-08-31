import Console from "@/components/Console";
import config from "@/generated/product.config.json";

export const metadata = { title: `Console — ${config.name}` };

export default function ConsolePage() {
  return (
    <main className="voice-proof wrap surface">
      <header className="mb-7">
        <p className="mono eyebrow-p" >
          {config.wordmark} / CONSOLE
        </p>
        <h2 className="mb-4">Watch it reason</h2>
        <p className="muted">
          Every claim is cited to a passage. Where the evidence does not support an
          answer, it says so. Anything above the risk threshold stops for a human.
          The numbers below are from the run you just watched.
        </p>
      </header>
      <Console />
    </main>
  );
}
