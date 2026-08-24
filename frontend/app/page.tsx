import Link from "next/link";
import type { ReactNode } from "react";

type Tool = {
  href: string;
  name: string;
  description: string;
  icon: ReactNode;
  /** Literal class strings so Tailwind can statically detect them. */
  iconClass: string;
  hoverBorderClass: string;
};

const tools: Tool[] = [
  {
    href: "/combine",
    name: "Combine PDFs",
    description: "Merge several documents into a single file, in the order you choose.",
    iconClass: "bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400",
    hoverBorderClass: "hover:border-blue-500/40 dark:hover:border-blue-400/40",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 3H5a2 2 0 0 0-2 2v4m6-6h1m9 6V5a2 2 0 0 0-2-2h-4M8 21H7a4 4 0 0 1-4-4v-1m18 0v1a4 4 0 0 1-4 4h-1M8 12h8m-4-4v8"
      />
    ),
  },
  {
    href: "/images-to-pdf",
    name: "Images to PDF",
    description: "Turn a batch of photos or scans into a single PDF, one page per image.",
    iconClass: "bg-orange-500/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400",
    hoverBorderClass: "hover:border-orange-500/40 dark:hover:border-orange-400/40",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16l4.5-4.5a2 2 0 0 1 2.83 0L15 15m-2-2 1.5-1.5a2 2 0 0 1 2.83 0L20 14M4 8h.01M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
      />
    ),
  },
  {
    href: "/extract",
    name: "Extract Pages",
    description: "Pull out just the pages you need and save them as a new document.",
    iconClass: "bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400",
    hoverBorderClass: "hover:border-violet-500/40 dark:hover:border-violet-400/40",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2m2-14h4m0 0v4m0-4-7 7"
      />
    ),
  },
  {
    href: "/compress",
    name: "Compress PDF",
    description: "Shrink file size for email and uploads while keeping pages readable.",
    iconClass: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400",
    hoverBorderClass: "hover:border-amber-500/40 dark:hover:border-amber-400/40",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v6m0 0 3-3m-3 3L9 6m3 15v-6m0 0 3 3m-3-3-3 3M4 12h16"
      />
    ),
  },
];

const highlights = ["Runs on your machine", "No sign-up", "Files never leave your network"];

export default function Home() {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <Backdrop />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-xl bg-zinc-900 text-xs font-bold text-white shadow-sm dark:bg-white dark:text-zinc-900"
          >
            PDF
          </span>
          PDF Tools
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-20 pt-8 sm:pt-12">
        <section aria-labelledby="tools-heading" className="mt-14">
          <h2
            id="tools-heading"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500"
          >
            Tools
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {tools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className={`group relative flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-none dark:hover:shadow-black/40 dark:focus-visible:ring-offset-zinc-950 ${tool.hoverBorderClass}`}
              >
                <span
                  className={`flex size-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${tool.iconClass}`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    className="size-6"
                  >
                    {tool.icon}
                  </svg>
                </span>
                <span className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
                  {tool.name}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="size-4 text-zinc-400 transition-transform duration-200 group-hover:translate-x-1 dark:text-zinc-500"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </span>
                <span className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {tool.description}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

/** Decorative background: soft color glow over a faint grid. */
function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute left-1/2 top-[-16rem] size-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.20),rgba(139,92,246,0.10),transparent)] blur-2xl dark:bg-[radial-gradient(closest-side,rgba(59,130,246,0.24),rgba(139,92,246,0.14),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(9,9,11,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(9,9,11,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)]" />
    </div>
  );
}
