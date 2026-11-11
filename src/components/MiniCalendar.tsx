
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export type CalendarDot =
  | "collected"
  | "pending"
  | "delayed"
  | "priority"
  | "scheduled"
  | "open";

export type CalendarMarkers = Record<
  string,
  CalendarDot[]
>;

type MiniCalendarProps = {
  onDateSelect?: (date: string) => void;
  onMonthChange?: (firstDayOfMonth: string) => void;
  markers?: CalendarMarkers;
  role?: "collector" | "resident";
};

const WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

const DOT_COLORS: Record<CalendarDot, string> = {
  collected: "bg-[#26A966]",
  pending: "bg-[#F3B23E]",
  delayed: "bg-[#D52222]",
  priority: "bg-[#D52222]",
  scheduled: "bg-[#F3B23E]",
  open: "bg-[#9DB77A]",
};

const DOT_LABELS: Record<CalendarDot, string> = {
  collected: "Collected",
  pending: "Pending",
  delayed: "Delayed",
  priority: "Priority collection (full)",
  scheduled: "Scheduled (near full or scheduled pickup)",
  open: "Open for disposal (empty)",
};

function phToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthDate(value: string): Date {
  const [year, month] = value.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, 1)
  );
}

function monthString(date: Date): string {
  return (
    `${date.getUTCFullYear()}-` +
    `${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`
  );
}

function shiftMonth(
  value: string,
  change: number
): string {
  const date = monthDate(value);

  date.setUTCMonth(
    date.getUTCMonth() + change
  );

  return monthString(date);
}

export default function MiniCalendar({
  onDateSelect,
  onMonthChange,
  markers = {},
  role = "resident",
}: MiniCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(
    () => `${phToday().slice(0, 7)}-01`
  );

  const [selectedDate, setSelectedDate] =
    useState<string | null>(null);

  const today = phToday();

  useEffect(() => {
    onMonthChange?.(visibleMonth);
  }, [visibleMonth, onMonthChange]);

  const month = useMemo(
    () => monthDate(visibleMonth),
    [visibleMonth]
  );

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(month);

  const firstWeekday = month.getUTCDay();

  const totalDays = new Date(
    Date.UTC(
      month.getUTCFullYear(),
      month.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();

  const cells = useMemo(() => {
    const result: (string | null)[] =
      Array(firstWeekday).fill(null);

    for (let day = 1; day <= totalDays; day++) {
      result.push(
        `${visibleMonth.slice(0, 7)}-` +
        String(day).padStart(2, "0")
      );
    }

    while (result.length % 7 !== 0) {
      result.push(null);
    }

    return result;
  }, [firstWeekday, totalDays, visibleMonth]);

  const validDots: CalendarDot[] =
    role === "collector"
      ? ["collected", "pending", "delayed"]
      : ["priority", "scheduled", "open"];

  return (
    <section
      aria-label="Collection calendar"
      className="
        w-full rounded-t-xl bg-white
        px-2 pb-3 pt-2
        min-[360px]:px-3
        sm:px-4
      "
    >
      {/* MONTH NAVIGATION */}

      <div
        className="
          mb-2 flex items-center
          justify-between gap-2
          px-0.5 py-1
          sm:mb-3
        "
      >
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => {
            setSelectedDate(null);

            setVisibleMonth((current) =>
              shiftMonth(current, -1)
            );
          }}
          className="
            grid h-11 w-11 shrink-0
            place-items-center rounded-lg
            text-[#292929]
            hover:bg-[#F7F0E4]
            focus-visible:outline
            focus-visible:outline-2
            focus-visible:outline-[#A81B1E]
          "
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </button>

        <h2
          aria-live="polite"
          className="
            min-w-0 text-center
            text-[16px] font-extrabold
            leading-snug text-black
            sm:text-[18px]
          "
        >
          {monthLabel}
        </h2>

        <button
          type="button"
          aria-label="Next month"
          onClick={() => {
            setSelectedDate(null);

            setVisibleMonth((current) =>
              shiftMonth(current, 1)
            );
          }}
          className="
            grid h-11 w-11 shrink-0
            place-items-center rounded-lg
            text-[#292929]
            hover:bg-[#F7F0E4]
            focus-visible:outline
            focus-visible:outline-2
            focus-visible:outline-[#A81B1E]
          "
        >
          <ChevronRight size={22} strokeWidth={2} />
        </button>
      </div>

      {/* CALENDAR GRID */}

      <div
        role="grid"
        aria-label={monthLabel}
        className="
          grid grid-cols-7 gap-x-0.5
          sm:gap-x-1
        "
      >
        {/* WEEKDAYS */}

        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            role="columnheader"
            className="
              pb-2 text-center
              text-[11px] font-semibold
              text-[#333]
              min-[360px]:text-[12px]
              sm:text-[13px]
            "
          >
            {weekday}
          </div>
        ))}

        {/* DAY CELLS */}

        {cells.map((date, index) => {
          if (!date) {
            return (
              <div
                key={`empty-${index}`}
                role="gridcell"
                className="h-[54px] sm:h-[60px]"
              />
            );
          }

          const dots = validDots.filter(
            (dot) =>
              (markers[date] ?? []).includes(dot)
          );

          const isToday = today === date;
          const isSelected = selectedDate === date;

          const label = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }).format(
            new Date(`${date}T00:00:00Z`)
          );

          return (
            <div
              key={date}
              role="gridcell"
              className="flex items-center justify-center"
            >
              <button
                type="button"
                aria-label={
                  `${label}` +
                  (dots.length
                    ? `: ${dots
                        .map((dot) => DOT_LABELS[dot])
                        .join(", ")}`
                    : ": no recorded status")
                }
                aria-current={
                  isToday ? "date" : undefined
                }
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedDate(date);
                  onDateSelect?.(date);
                }}
                className={`
                  flex h-[54px] w-full min-w-0
                  flex-col items-center
                  justify-start
                  rounded-lg pt-1.5
                  text-[15px] font-semibold
                  transition-colors
                  hover:bg-[#F8F1E6]
                  focus-visible:outline
                  focus-visible:outline-2
                  focus-visible:outline-[#A81B1E]
                  sm:h-[60px] sm:text-[16px]
                  ${
                    isSelected
                      ? "bg-[#FFF0E5]"
                      : ""
                  }
                `}
              >
                {/* DAY NUMBER */}

                <span
                  className={`
                    leading-6
                    ${
                      isSelected
                        ? "font-extrabold text-[#A81B1E]"
                        : isToday
                          ? "font-extrabold text-[#253FFF]"
                          : "text-[#222]"
                    }
                  `}
                >
                  {Number(date.slice(-2))}
                </span>

                {/* DOTS DIRECTLY BELOW DATE */}

                <span
                  aria-hidden="true"
                  className="
                    mt-1 flex h-[10px]
                    items-center justify-center
                    gap-[3px]
                  "
                >
                  {dots.map((dot) => (
                    <span
                      key={dot}
                      className={`
                        h-[7px] w-[7px]
                        rounded-full
                        ring-1 ring-black/10
                        ${DOT_COLORS[dot]}
                        sm:h-[8px] sm:w-[8px]
                      `}
                    />
                  ))}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
