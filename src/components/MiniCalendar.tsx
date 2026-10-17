import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CollectionSchedule = {
  date: string; // YYYY-MM-DD
  status: "priority" | "scheduled" | "open";
};

type MiniCalendarProps = {
  schedules?: CollectionSchedule[];
  onDateSelect?: (date: string) => void;
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const statusColors = {
  priority: "bg-red-500",
  scheduled: "bg-amber-400",
  open: "bg-green-500",
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function MiniCalendar({
  schedules = [],
  onDateSelect,
}: MiniCalendarProps) {
  const [today, setToday] = useState(() => new Date());

  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(
    null
  );

  // Update today's highlight when the local date changes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function refreshToday() {
      const now = new Date();
      setToday(now);

      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );

      clearTimeout(timer);

      timer = setTimeout(
        refreshToday,
        nextMidnight.getTime() - now.getTime() + 100
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshToday();
      }
    }

    refreshToday();

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      clearTimeout(timer);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, []);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const todayKey = formatDate(today);

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const totalCells =
    Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const monthLabel = visibleMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  function changeMonth(direction: number) {
    setVisibleMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + direction,
          1
        )
    );
  }

  function selectDate(date: string) {
  setSelectedDate(date);
  onDateSelect?.(date);
}

  return (
    <div className="mini-calendar w-full min-w-0 overflow-hidden rounded-t-xl bg-white sm:rounded-t-2xl">
      {/* Month navigation */}
      <div className="flex items-center justify-between gap-2 px-2 py-2 sm:px-4 sm:py-3">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => changeMonth(-1)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
        >
          <ChevronLeft
            strokeWidth={1.5}
            className="h-[18px] w-[18px] sm:h-5 sm:w-5"
          />
        </button>

        <h2
          aria-live="polite"
          className="min-w-0 text-center text-[13px] font-bold leading-tight text-black sm:text-base lg:text-lg"
        >
          {monthLabel}
        </h2>

        <button
          type="button"
          aria-label="Next month"
          onClick={() => changeMonth(1)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
        >
          <ChevronRight
            strokeWidth={1.5}
            className="h-[18px] w-[18px] sm:h-5 sm:w-5"
          />
        </button>
      </div>

      {/* Weekdays and dates */}
      <div className="grid grid-cols-7 gap-x-0.5 px-1 pb-2 text-center sm:gap-x-1 sm:px-3 sm:pb-3">
        {weekdays.map((weekday) => (
          <span
            key={weekday}
            className="min-w-0 py-2 text-[10px] text-neutral-800 sm:py-3 sm:text-xs lg:text-sm"
          >
            {weekday}
          </span>
        ))}

        {Array.from({ length: totalCells }, (_, index) => {
          const day = index - firstWeekday + 1;

          if (day < 1 || day > daysInMonth) {
            return (
              <span
                key={`empty-${index}`}
                aria-hidden="true"
                className="calendar-date-cell h-11 min-w-0 sm:h-12 lg:h-16"
              />
            );
          }

          const date = new Date(year, month, day);
          const dateKey = formatDate(date);
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDate;

          const statuses = [
            ...new Set(
              schedules
                .filter((schedule) => schedule.date === dateKey)
                .map((schedule) => schedule.status)
            ),
          ];

          const dateLabel = date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });

          return (
            <button
              key={dateKey}
              type="button"
              aria-label={`${dateLabel}${
                statuses.length
                  ? `: ${statuses.join(", ")}`
                  : ""
              }`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              onClick={() => selectDate(dateKey)}
              className={`calendar-date-cell relative flex h-11 min-w-0 w-full items-center justify-center rounded-md text-[11px] transition-colors hover:bg-red-50 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-600 sm:h-12 sm:rounded-lg sm:text-sm lg:h-16 lg:text-base ${
                isToday
                  ? "font-bold text-blue-600"
                  : "text-black"
              } ${isSelected ? "bg-red-50" : ""}`}
            >
              {day}

              {statuses.length > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 flex items-center justify-center gap-1 sm:bottom-1.5"
                >
                  {statuses.map((status) => (
                    <span
                      key={status}
                      className={`h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5 ${statusColors[status]}`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Keep the calendar compact on landscape screens. */}
      <style>{`
        @media (max-height: 600px) and (orientation: landscape) {
          .mini-calendar .calendar-date-cell {
            height: 36px;
          }
        }
      `}</style>
    </div>
  );
}