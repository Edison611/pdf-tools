
export default function Home() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center justify-center w-full max-w-xl p-8 bg-white rounded-lg shadow-md dark:bg-zinc-900">
        <h1 className="text-4xl font-bold mb-6 text-black dark:text-zinc-50">PDF Tools</h1>
        <p className="mb-10 text-lg text-zinc-600 dark:text-zinc-300 text-center">
          Choose a tool below:
        </p>
        <div className="flex flex-col gap-4 w-full">
          <a
            href="/combine"
            className="w-full px-6 py-3 rounded-lg bg-blue-600 text-white text-lg font-semibold text-center shadow hover:bg-blue-700 transition-colors"
          >
            Combine PDFs
          </a>
          <a
            href="/split"
            className="w-full px-6 py-3 rounded-lg bg-green-600 text-white text-lg font-semibold text-center shadow hover:bg-green-700 transition-colors"
          >
            Split PDF
          </a>
          <a
            href="/extract"
            className="w-full px-6 py-3 rounded-lg bg-purple-600 text-white text-lg font-semibold text-center shadow hover:bg-purple-700 transition-colors"
          >
            Extract Pages
          </a>
          <a
            href="/compress"
            className="w-full px-6 py-3 rounded-lg bg-orange-600 text-white text-lg font-semibold text-center shadow hover:bg-orange-700 transition-colors"
          >
            Compress PDF
          </a>
        </div>
      </main>
    </div>
  );
}
