import { CheckCircle } from "lucide-react";

const history = [
  {
    id: "COL-001",
    location: "Twin Road, Bin 1",
    date: "September 19, 2026",
  },
  {
    id: "COL-002",
    location: "Barangay Gym",
    date: "September 18, 2026",
  },
];

export default function CollectionHistory() {
  return (
    <main className="min-h-[100dvh] bg-neutral-50 p-5 pb-24">
      <header className="mb-5">
        <h1 className="text-xl font-bold">
          Collection History
        </h1>

        <p className="text-xs text-neutral-500">
          Previously completed collections
        </p>
      </header>

      <div className="space-y-3">
        {history.map((item) => (
          <article
            key={item.id}
            className="
              flex items-center gap-3 rounded-2xl
              border border-neutral-200 bg-white p-4
              shadow-sm
            "
          >
            <div className="rounded-xl bg-green-50 p-3 text-green-600">
              <CheckCircle size={21} />
            </div>

            <div className="flex-1">
              <h2 className="text-sm font-semibold">
                {item.location}
              </h2>

              <p className="text-[10px] text-neutral-500">
                {item.date}
              </p>
            </div>

            <span className="text-[9px] font-semibold text-green-600">
              Collected
            </span>
          </article>
        ))}
      </div>
    </main>
  );
}