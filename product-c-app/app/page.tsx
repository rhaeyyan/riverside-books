const quickAnswers = [
  "Do you have The Left Hand of Darkness in stock?",
  "What are your store hours?",
  "What is your return policy?",
  "Is the author event tonight?",
];

const cannedResponses = [
  {
    role: "assistant",
    text: "Hi! I can help with stock checks, store hours, return policy, and event information.",
  },
  {
    role: "assistant",
    text: "For example, I can answer questions like whether a title is on the shelf right now or whether the store is open this evening.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f2ea] px-4 py-10 text-[#1d1b18]">
      <div className="mx-auto max-w-6xl rounded-[28px] border border-[#e3d8c4] bg-[#fffdf9] shadow-[0_20px_60px_rgba(71,56,35,0.08)]">
        <div className="grid min-h-[780px] gap-0 md:grid-cols-[1.1fr_1.4fr]">
          <aside className="border-b border-[#e3d8c4] bg-[#f2e6d6] p-6 md:border-r md:border-b-0 md:p-8">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3d2b1f] text-lg font-bold text-[#fefaf2]">
                R
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6c5847]">
                  Riverside Books
                </p>
                <h1 className="text-xl font-semibold text-[#1d1b18]">Support Bot</h1>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-[#d9c8a9] bg-[#fffaf2] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7a624d]">
                  Live support
                </p>
                <p className="mt-2 text-sm leading-6 text-[#3c3128]">
                  Answers grounded in current inventory, store hours, policies, and event details.
                </p>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-[#6c5847]">
                  Quick prompts
                </p>
                <div className="space-y-2">
                  {quickAnswers.map((question) => (
                    <button
                      key={question}
                      type="button"
                      className="w-full rounded-xl border border-[#d8c2a0] bg-[#fffaf2] px-3 py-2 text-left text-sm text-[#2a251f] transition hover:border-[#8b6b47] hover:bg-[#fff5e7]"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <section className="flex flex-col bg-[#fffdf9] p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-[#efe0c7] pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7a624d]">
                  Customer support
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[#1d1b18]">Ask Riverside</h2>
              </div>
              <span className="rounded-full bg-[#eaf6ee] px-3 py-1 text-xs font-medium text-[#1d5c3f]">
                Online
              </span>
            </div>

            <div className="flex-1 space-y-4 overflow-hidden rounded-2xl bg-[#f9f4ec] p-4">
              {cannedResponses.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "assistant"
                      ? "bg-[#fffaf2] text-[#2a251f]"
                      : "ml-auto bg-[#3d2b1f] text-[#fffaf2]"
                  }`}
                >
                  {message.text}
                </div>
              ))}

              <div className="rounded-2xl border border-dashed border-[#d8c2a0] bg-[#fdfaf3] p-3 text-sm text-[#695c4d]">
                Current response logic is intentionally grounded in bookstore facts, not generic AI guesses.
              </div>
            </div>

            <form className="mt-4 flex gap-3">
              <input
                type="text"
                aria-label="Ask a question"
                placeholder="Ask about stock, hours, events, or policies..."
                className="flex-1 rounded-xl border border-[#dcc7a5] bg-[#fffaf2] px-4 py-3 text-sm text-[#201c1a] outline-none ring-0 placeholder:text-[#8c7a65] focus:border-[#8b6b47]"
              />
              <button
                type="submit"
                className="rounded-xl bg-[#3d2b1f] px-5 py-3 text-sm font-medium text-[#fffaf2] transition hover:bg-[#2c2019]"
              >
                Send
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
