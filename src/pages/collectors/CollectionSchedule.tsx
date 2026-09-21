import { CalendarDays, ChevronRight } from "lucide-react";
import { Link } from "react-router";

const schedules = [
  {
    id: "1",
    location: "Twin Road, Bin 1",
    date: "September 21, 2026",
    time: "8:00 AM",
    status: "Pending",
  },
  {
    id: "2",
    location: "Barangay Gym",
    date: "September 21, 2026",
    time: "10:00 AM",
    status: "Pending",
  },
];

export default function CollectionSchedule() {
  return (
    <main className="min-h-[100dvh] bg-neutral-50 p-5 pb-24">
      <header className="mb-5">
        <h1 className="text-xl font-bold">
          Collection Schedule
        </h1>

        <p className="text-xs text-neutral-500">
          Your assigned waste collection schedule
        </p>
      </header>

      <div className="space-y-3">
        {schedules.map((schedule) => (
          <Link
            key={schedule.id}
            to={`/collector/collection/${schedule.id}`}
            className="
              flex items-center gap-3 rounded-2xl
              border border-neutral-200 bg-white p-4
              shadow-sm
            "
          >
            <div className="rounded-xl bg-red-50 p-3 text-red-600">
              <CalendarDays size={21} />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">
                {schedule.location}
              </h2>

              <p className="text-[10px] text-neutral-500">
                {schedule.date} · {schedule.time}
              </p>

              <span className="text-[9px] font-semibold text-orange-600">
                {schedule.status}
              </span>
            </div>

            <ChevronRight size={18} />
          </Link>
        ))}
      </div>
    </main>
  );
}