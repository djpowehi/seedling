import Link from "next/link";

// Linking pass — design will be replaced via Claude Design later.
// Per GuiBibeau review pattern: one primary CTA, no wallet connect on
// the landing page (trust before friction). Wallet connect lives on
// /dashboard, where the user has already chosen to engage.

export default function Home() {
  return (
    <main className="flex flex-1 w-full flex-col items-center justify-center px-6 py-24">
      <section className="w-full max-w-2xl flex flex-col items-center text-center gap-10">
        <div className="flex flex-col gap-4 items-center">
          <span className="text-5xl">🌱</span>
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight text-emerald-900">
            seedling
          </h1>
          <p className="text-2xl text-stone-600">allowance that grows</p>
        </div>

        <p className="text-lg leading-relaxed text-stone-700 max-w-xl">
          Parents deposit USDC once. Kamino lends it out at ~8% APY. The kid
          gets paid on the 1st of every month, plus a yield bonus when the
          period ends.
        </p>

        <div className="flex flex-col items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-emerald-700 px-8 py-3 text-base font-medium text-white hover:bg-emerald-800 transition-colors"
          >
            Open the dashboard →
          </Link>
          <p className="text-xs text-stone-500">Live on Solana devnet</p>
        </div>

        <footer className="mt-16 flex flex-col items-center gap-2 text-sm text-stone-500">
          <p>
            Built on{" "}
            <a
              href="https://kamino.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-stone-700"
            >
              Kamino
            </a>{" "}
            • Solana devnet
          </p>
          <p>
            <a
              href="https://github.com/djpowehi/seedling"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-stone-700"
            >
              github
            </a>{" "}
            ·{" "}
            <a
              href="https://twitter.com/seedling_sol"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-stone-700"
            >
              @seedling_sol
            </a>
          </p>
        </footer>
      </section>
    </main>
  );
}
