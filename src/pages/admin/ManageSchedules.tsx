
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Inbox,
  LoaderCircle,
  MapPin,
  Search,
  UserRound,
  X,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

type ScheduleStatus =
  | "Sent to collector"
  | "Pending — collector on leave"
  | "Unassigned"
  | "Collector unavailable"
  | "Completed"
  | "Cancelled";

type ScheduleFilter =
  | "All"
  | "Assigned"
  | "Unassigned";

type ScheduleRow = {
  schedule_id: string;
  site_id: string | null;
  assigned_collector_id: string | null;
  date: string | null;
  collection_time: string | null;
  status: string | null;
};

type SiteRow = {
  site_id: string;
  site_name: string;
};

type CollectorRow = {
  user_id: string;
  full_name: string | null;
  is_active: boolean;
  collector_status: string | null;
};

type Schedule = {
  id: string;
  site: string;
  collector: string;
  date: string;
  time: string;
  status: ScheduleStatus;
  databaseStatus: string;
  isAssigned: boolean;
};

const PAGE_SIZE = 500;

// ========================================
// ONLY THREE FILTER BUTTONS
// ========================================

const FILTERS: ScheduleFilter[] = [
  "All",
  "Assigned",
  "Unassigned",
];

// ========================================
// FORMAT DATE
// ========================================

function formatScheduleDate(
  value: string | null
): string {
  if (!value) return "Date not set";

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    year,
    month - 1,
    day
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// ========================================
// FORMAT TIME
// ========================================

function formatScheduleTime(
  value: string | null
): string {
  if (!value) return "Time not set";

  const match = value.match(
    /^(\d{1,2}):(\d{2})/
  );

  if (!match) return value;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value;
  }

  const formattedHour = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";

  return `${formattedHour}:${String(
    minute
  ).padStart(2, "0")} ${period}`;
}

// ========================================
// SCHEDULE STATUS
// ========================================

function getScheduleStatus(
  schedule: ScheduleRow,
  collector: CollectorRow | undefined
): ScheduleStatus {
  const databaseStatus = (
    schedule.status ?? ""
  )
    .trim()
    .toLowerCase();

  if (
    ["completed", "collected", "done"].includes(
      databaseStatus
    )
  ) {
    return "Completed";
  }

  if (
    ["cancelled", "canceled"].includes(
      databaseStatus
    )
  ) {
    return "Cancelled";
  }

  if (!schedule.assigned_collector_id) {
    return "Unassigned";
  }

  if (!collector) {
    return "Collector unavailable";
  }

  const onLeave =
    !collector.is_active ||
    (
      collector.collector_status ?? ""
    )
      .trim()
      .toLowerCase() === "on leave";

  if (onLeave) {
    return "Pending — collector on leave";
  }

  return "Sent to collector";
}

// ========================================
// STATUS COLORS
// ========================================

function statusStyle(
  status: ScheduleStatus
) {
  switch (status) {
    case "Sent to collector":
      return {
        badge:
          "border-[#D7E8C5] bg-[#F0F7E8] text-[#587A37]",
        dot: "bg-[#7B9E4A]",
      };

    case "Pending — collector on leave":
      return {
        badge:
          "border-[#EFDCAB] bg-[#FFF5DD] text-[#9B6C12]",
        dot: "bg-[#DFAE39]",
      };

    case "Completed":
      return {
        badge:
          "border-[#CDE4D2] bg-[#EAF7ED] text-[#35764B]",
        dot: "bg-[#4C9C65]",
      };

    case "Unassigned":
      return {
        badge:
          "border-[#F0CED0] bg-[#FFF0F1] text-[#B52A35]",
        dot: "bg-[#D0102B]",
      };

    case "Cancelled":
      return {
        badge:
          "border-[#E1E1E1] bg-[#F5F5F5] text-[#777]",
        dot: "bg-[#999]",
      };

    default:
      return {
        badge:
          "border-[#EADBBB] bg-[#FFF7E8] text-[#826522]",
        dot: "bg-[#BA8E36]",
      };
  }
}

// ========================================
// STATUS BADGE COMPONENT
// ========================================

function StatusBadge({
  status,
  databaseStatus,
}: {
  status: ScheduleStatus;
  databaseStatus: string;
}) {
  const colors = statusStyle(status);

  return (
    <span
      title={`Stored schedule status: ${databaseStatus}`}
      className={`
        inline-flex max-w-full
        items-center gap-2
        rounded-full border
        px-3 py-1.5
        text-[11px] font-bold
        leading-snug
        ${colors.badge}
      `}
    >
      <span
        className={`
          h-2 w-2 shrink-0
          rounded-full
          ${colors.dot}
        `}
      />

      <span className="min-w-0 break-words">
        {status}
      </span>
    </span>
  );
}

// ========================================
// FETCH ALL SCHEDULES
// ========================================

async function fetchScheduleRows(): Promise<
  ScheduleRow[]
> {
  const rows: ScheduleRow[] = [];

  for (
    let offset = 0;
    ;
    offset += PAGE_SIZE
  ) {
    const { data, error } = await supabase
      .from("schedules")
      .select(
        "schedule_id,site_id,assigned_collector_id,date,collection_time,status"
      )
      .order("date", {
        ascending: false,
      })
      .order("collection_time", {
        ascending: true,
      })
      .order("schedule_id", {
        ascending: false,
      })
      .range(
        offset,
        offset + PAGE_SIZE - 1
      );

    if (error) {
      throw new Error(
        `Failed to load schedules: ${error.message}`
      );
    }

    const page = (
      data ?? []
    ) as ScheduleRow[];

    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

// ========================================
// FETCH RELATED SUPABASE RECORDS
// ========================================

async function fetchRelatedRows<T>(
  table: "disposal_sites" | "users",
  columns: string,
  idColumn: string,
  ids: string[]
): Promise<T[]> {
  const rows: T[] = [];

  for (
    let index = 0;
    index < ids.length;
    index += 100
  ) {
    let request = supabase
      .from(table)
      .select(columns)
      .in(
        idColumn,
        ids.slice(index, index + 100)
      );

    if (table === "users") {
      request = request.eq(
        "role",
        "collector"
      );
    }

    const { data, error } = await request;

    if (error) {
      throw new Error(
        `Failed to load ${table}: ${error.message}`
      );
    }

    rows.push(
      ...((data ?? []) as unknown as T[])
    );
  }

  return rows;
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function ManageSchedules() {
  const [schedules, setSchedules] =
    useState<Schedule[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [query, setQuery] =
    useState("");

  // ONLY ALL / ASSIGNED / UNASSIGNED
  const [filter, setFilter] =
    useState<ScheduleFilter>("All");

  const requestRef = useRef(0);

  // ========================================
  // LOAD SCHEDULES FROM SUPABASE
  // ========================================

  const loadSchedules = useCallback(
    async (showLoading = false) => {
      const requestId =
        ++requestRef.current;

      if (showLoading) {
        setLoading(true);
      }

      setError("");

      try {
        // FETCH SCHEDULES
        const rows =
          await fetchScheduleRows();

        // GET UNIQUE SITE IDS
        const siteIds = [
          ...new Set(
            rows
              .map((row) => row.site_id)
              .filter(
                (id): id is string =>
                  Boolean(id)
              )
          ),
        ];

        // GET UNIQUE COLLECTOR IDS
        const collectorIds = [
          ...new Set(
            rows
              .map(
                (row) =>
                  row.assigned_collector_id
              )
              .filter(
                (id): id is string =>
                  Boolean(id)
              )
          ),
        ];

        // FETCH SITE AND COLLECTOR DATA
        const [
          siteRows,
          collectorRows,
        ] = await Promise.all([
          fetchRelatedRows<SiteRow>(
            "disposal_sites",
            "site_id,site_name",
            "site_id",
            siteIds
          ),

          fetchRelatedRows<CollectorRow>(
            "users",
            "user_id,full_name,is_active,collector_status",
            "user_id",
            collectorIds
          ),
        ]);

        if (
          requestId !== requestRef.current
        ) {
          return;
        }

        const sitesById = new Map(
          siteRows.map((row) => [
            row.site_id,
            row,
          ])
        );

        const collectorsById = new Map(
          collectorRows.map((row) => [
            row.user_id,
            row,
          ])
        );

        const result: Schedule[] =
          rows.map((row) => {
            const site = row.site_id
              ? sitesById.get(row.site_id)
              : undefined;

            const collector =
              row.assigned_collector_id
                ? collectorsById.get(
                    row.assigned_collector_id
                  )
                : undefined;

            return {
              id: row.schedule_id,

              site:
                site?.site_name ||
                "Unknown disposal site",

              collector:
                collector?.full_name ||
                (
                  row.assigned_collector_id
                    ? "Collector unavailable"
                    : "Not assigned"
                ),

              date: formatScheduleDate(
                row.date
              ),

              time: formatScheduleTime(
                row.collection_time
              ),

              status: getScheduleStatus(
                row,
                collector
              ),

              databaseStatus:
                row.status ||
                "Not specified",

              // ASSIGNED IF A COLLECTOR ID
              // EXISTS IN THE SCHEDULE
              isAssigned: Boolean(
                row.assigned_collector_id
              ),
            };
          });

        setSchedules(result);
      } catch (cause) {
        if (
          requestId !== requestRef.current
        ) {
          return;
        }

        console.error(
          "[WasteTrack] Schedule loading error:",
          cause
        );

        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to load schedules."
        );
      } finally {
        if (
          requestId === requestRef.current
        ) {
          setLoading(false);
        }
      }
    },
    []
  );

  // ========================================
  // INITIAL LOAD + AUTOMATIC REFRESH
  // ========================================

  useEffect(() => {
    void loadSchedules(true);

    const interval = window.setInterval(
      () => {
        void loadSchedules();
      },
      60000
    );

    const onFocus = () => {
      void loadSchedules();
    };

    window.addEventListener(
      "focus",
      onFocus
    );

    // SUPABASE REALTIME
    let debounce:
      ReturnType<typeof setTimeout> | null =
      null;

    const onChange = () => {
      if (debounce) {
        clearTimeout(debounce);
      }

      debounce = setTimeout(() => {
        void loadSchedules();
      }, 500);
    };

    const channel = supabase.channel(
      "wastetrack-admin-manage-schedules"
    );

    for (const table of [
      "schedules",
      "users",
      "disposal_sites",
    ]) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        onChange
      );
    }

    channel.subscribe();

    return () => {
      requestRef.current += 1;

      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        onFocus
      );

      if (debounce) {
        clearTimeout(debounce);
      }

      void supabase.removeChannel(
        channel
      );
    };
  }, [loadSchedules]);

  // ========================================
  // ONLY THREE FILTER COUNTS
  // ========================================

  const counts = useMemo(() => {
    return {
      All: schedules.length,

      Assigned: schedules.filter(
        (schedule) => schedule.isAssigned
      ).length,

      Unassigned: schedules.filter(
        (schedule) => !schedule.isAssigned
      ).length,
    };
  }, [schedules]);

  // ========================================
  // SEARCH + FILTER SCHEDULES
  // ========================================

  const filteredSchedules = useMemo(
    () => {
      const search = query
        .trim()
        .toLowerCase();

      return schedules.filter((item) => {
        const matchesFilter =
          filter === "All" ||
          (
            filter === "Assigned" &&
            item.isAssigned
          ) ||
          (
            filter === "Unassigned" &&
            !item.isAssigned
          );

        const matchesSearch =
          !search ||
          [
            item.site,
            item.collector,
            item.date,
            item.time,
            item.status,
            item.databaseStatus,
          ].some((value) =>
            value
              .toLowerCase()
              .includes(search)
          );

        return (
          matchesFilter &&
          matchesSearch
        );
      });
    },
    [schedules, query, filter]
  );

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <main
      className="
        min-h-[100dvh]
        w-full
        bg-[#FFFCF8]
        font-['Fira_Sans','Segoe_UI',Arial,sans-serif]
        text-[#242424]
      "
    >
      <div
        className="
          mx-auto w-full
          max-w-[1600px]
          px-4 py-6
          sm:px-6
          lg:px-8 lg:py-8
        "
      >
        {/* ====================================
            ERROR MESSAGE
        ==================================== */}

        {error && (
          <div
            role="alert"
            className="
              mb-5 flex items-start gap-3
              rounded-2xl
              border border-red-200
              bg-red-50 p-4
            "
          >
            <AlertCircle
              size={20}
              className="
                mt-0.5 shrink-0
                text-[#A81B1E]
              "
            />

            <div className="min-w-0 flex-1">
              <p
                className="
                  text-sm font-bold
                  text-[#A81B1E]
                "
              >
                Unable to load collection schedules
              </p>

              <p
                className="
                  mt-1 break-words
                  text-xs leading-relaxed
                  text-red-700
                "
              >
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadSchedules(true)
                }
                className="
                  mt-3 rounded-lg
                  bg-[#A81B1E]
                  px-4 py-2
                  text-xs font-bold
                  text-white
                  hover:bg-[#8F1619]
                "
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ====================================
            COLLECTION SCHEDULES PANEL
        ==================================== */}

        <section
          className="
            min-w-0 overflow-hidden
            rounded-2xl
            border border-[#EAE2D7]
            bg-white shadow-sm
          "
          aria-busy={loading}
        >
          {/* ==================================
              HEADER + SEARCH
          ================================== */}

          <div
            className="
              border-b border-[#F0E9E0]
              px-4 py-5 sm:px-5
            "
          >
            <div
              className="
                flex flex-wrap items-center
                justify-between gap-4
              "
            >
              <div
                className="
                  flex min-w-0 items-center gap-3
                "
              >
                <div
                  className="
                    flex h-11 w-11 shrink-0
                    items-center justify-center
                    rounded-xl
                    bg-[#F7F0E4]
                    text-[#A81B1E]
                  "
                >
                  <CalendarDays size={21} />
                </div>

                <div>
                  <h1
                    className="
                      text-[17px] font-extrabold
                      tracking-tight sm:text-[19px]
                    "
                  >
                    Collection schedules
                  </h1>

                  <p
                    className="
                      mt-0.5 text-[11px]
                      text-[#999]
                    "
                  >
                    View assigned collectors and collection times
                  </p>
                </div>
              </div>

              {/* SEARCH BAR */}

              <div
                className="
                  relative w-full
                  sm:max-w-[320px]
                "
              >
                <Search
                  size={17}
                  className="
                    absolute left-3.5 top-1/2
                    -translate-y-1/2
                    text-[#A09A91]
                  "
                />

                <input
                  type="search"
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Search site or collector..."
                  aria-label="Search schedules"
                  className="
                    h-11 w-full rounded-xl
                    border border-[#E4DCD0]
                    bg-[#FFFCF8]
                    pl-10 pr-10 text-[12px]
                    outline-none transition
                    placeholder:text-[#AAA]
                    focus:border-[#A5B26B]
                    focus:ring-2
                    focus:ring-[#A5B26B]/20
                  "
                />

                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="
                      absolute right-3 top-1/2
                      -translate-y-1/2
                      text-[#999]
                      hover:text-[#555]
                    "
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
            </div>

            {/* ==================================
                ONLY THREE FILTER BUTTONS
            ================================== */}

            <div
              className="
                mt-5 flex flex-wrap gap-2
              "
              aria-label="Filter collection schedules"
            >
              {FILTERS.map((option) => {
                const active =
                  filter === option;

                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setFilter(option)
                    }
                    className={`
                      inline-flex items-center gap-2
                      rounded-xl px-4 py-2.5
                      text-[12px] font-bold
                      transition
                      ${
                        active
                          ? "bg-[#A81B1E] text-white shadow-sm"
                          : "border border-[#E7DDD0] bg-[#FFFCF8] text-[#666] hover:bg-[#F7F0E4]"
                      }
                    `}
                  >
                    {option}

                    <span
                      className={`
                        rounded-md px-1.5 py-0.5
                        text-[10px]
                        ${
                          active
                            ? "bg-white/20 text-white"
                            : "bg-[#F2EDE5] text-[#777]"
                        }
                      `}
                    >
                      {counts[option]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ====================================
              LOADING
          ==================================== */}

          {loading &&
          schedules.length === 0 ? (
            <div
              role="status"
              className="
                flex min-h-[240px]
                flex-col items-center
                justify-center
                gap-3 p-6 text-center
              "
            >
              <LoaderCircle
                size={30}
                className="
                  animate-spin
                  text-[#A5B26B]
                "
              />

              <p className="text-[12px] text-[#777]">
                Loading collection schedules...
              </p>
            </div>
          ) : filteredSchedules.length === 0 ? (
            // ==================================
            // EMPTY STATE
            // ==================================

            <div
              className="
                flex min-h-[240px]
                flex-col items-center
                justify-center
                p-6 text-center
              "
            >
              <span
                className="
                  flex h-14 w-14
                  items-center justify-center
                  rounded-2xl
                  bg-[#F7F0E4]
                  text-[#A5B26B]
                "
              >
                <Inbox size={27} />
              </span>

              <p
                className="
                  mt-4 text-[13px]
                  font-bold text-[#333]
                "
              >
                {schedules.length === 0
                  ? "No schedules found"
                  : "No matching schedules"}
              </p>

              <p
                className="
                  mt-1 max-w-sm
                  text-[11px] leading-relaxed
                  text-[#999]
                "
              >
                {schedules.length === 0
                  ? "There are no collection schedules available."
                  : "Try a different search term or filter."}
              </p>
            </div>
          ) : (
            <>
              {/* ==================================
                  DESKTOP TABLE
              ================================== */}

              <div className="hidden overflow-x-auto md:block">
                <table
                  className="
                    w-full min-w-[710px]
                    border-collapse text-left
                  "
                >
                  <thead>
                    <tr
                      className="
                        bg-[#FFFCF8]
                        text-[11px] text-[#888]
                      "
                    >
                      <th className="px-5 py-4 font-semibold">
                        Disposal site
                      </th>

                      <th className="px-4 py-4 font-semibold">
                        Assigned collector
                      </th>

                      <th className="px-4 py-4 font-semibold">
                        Collection date & time
                      </th>

                      <th className="px-4 py-4 font-semibold">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredSchedules.map((schedule) => (
                      <tr
                        key={schedule.id}
                        className="
                          border-t border-[#F1EAE2]
                          transition hover:bg-[#FFFCF8]
                        "
                      >
                        {/* SITE */}

                        <td className="max-w-[260px] px-5 py-4">
                          <div className="flex items-start gap-2">
                            <MapPin
                              size={16}
                              className="
                                mt-0.5 shrink-0
                                text-[#A81B1E]
                              "
                            />

                            <span
                              className="
                                break-words text-[12px]
                                font-bold text-[#343434]
                              "
                            >
                              {schedule.site}
                            </span>
                          </div>
                        </td>

                        {/* COLLECTOR */}

                        <td className="max-w-[220px] px-4 py-4">
                          <div className="flex items-start gap-2">
                            <UserRound
                              size={15}
                              className="
                                mt-0.5 shrink-0
                                text-[#7E9855]
                              "
                            />

                            <span
                              className="
                                break-words text-[12px]
                                text-[#555]
                              "
                            >
                              {schedule.collector}
                            </span>
                          </div>
                        </td>

                        {/* DATE AND TIME */}

                        <td className="px-4 py-4">
                          <div
                            className="
                              flex items-center gap-2
                              text-[12px] font-semibold
                              text-[#444]
                            "
                          >
                            <CalendarDays
                              size={15}
                              className="
                                shrink-0
                                text-[#9B958B]
                              "
                            />

                            {schedule.date}
                          </div>

                          <div
                            className="
                              mt-1.5 flex items-center
                              gap-2 text-[11px] text-[#888]
                            "
                          >
                            <Clock3
                              size={14}
                              className="shrink-0"
                            />

                            {schedule.time}
                          </div>
                        </td>

                        {/* STATUS */}

                        <td className="px-4 py-4">
                          <StatusBadge
                            status={schedule.status}
                            databaseStatus={
                              schedule.databaseStatus
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ==================================
                  MOBILE SCHEDULE CARDS
              ================================== */}

              <div
                className="
                  divide-y divide-[#F1EAE2]
                  md:hidden
                "
              >
                {filteredSchedules.map((schedule) => (
                  <article
                    key={schedule.id}
                    className="px-4 py-5 sm:px-5"
                  >
                    {/* SITE */}

                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className="
                          grid h-10 w-10 shrink-0
                          place-items-center rounded-xl
                          bg-[#F7F0E4]
                          text-[#A81B1E]
                        "
                      >
                        <MapPin size={19} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className="
                            text-[10px] font-semibold
                            uppercase tracking-wide
                            text-[#999]
                          "
                        >
                          Disposal site
                        </p>

                        <h2
                          className="
                            mt-1 break-words
                            text-[13px] font-extrabold
                            text-[#343434]
                          "
                        >
                          {schedule.site}
                        </h2>
                      </div>
                    </div>

                    {/* COLLECTOR AND DATE */}

                    <div
                      className="
                        mt-4 grid grid-cols-1
                        gap-3 rounded-xl
                        bg-[#FFFCF8] p-3.5
                        min-[440px]:grid-cols-2
                      "
                    >
                      <div className="min-w-0">
                        <p
                          className="
                            flex items-center gap-1.5
                            text-[10px] font-semibold
                            uppercase tracking-wide
                            text-[#999]
                          "
                        >
                          <UserRound size={13} />
                          Assigned collector
                        </p>

                        <p
                          className="
                            mt-1.5 break-words
                            text-[12px] font-bold
                            text-[#555]
                          "
                        >
                          {schedule.collector}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p
                          className="
                            flex items-center gap-1.5
                            text-[10px] font-semibold
                            uppercase tracking-wide
                            text-[#999]
                          "
                        >
                          <CalendarDays size={13} />
                          Day & time
                        </p>

                        <p
                          className="
                            mt-1.5 text-[12px]
                            font-bold text-[#555]
                          "
                        >
                          {schedule.date}
                        </p>

                        <p
                          className="
                            mt-1 flex items-center
                            gap-1.5 text-[11px]
                            text-[#888]
                          "
                        >
                          <Clock3 size={12} />
                          {schedule.time}
                        </p>
                      </div>
                    </div>

                    {/* STATUS */}

                    <div
                      className="
                        mt-4 flex flex-wrap
                        items-center justify-between
                        gap-2
                      "
                    >
                      <span
                        className="
                          text-[10px] font-semibold
                          uppercase tracking-wide
                          text-[#999]
                        "
                      >
                        Status
                      </span>

                      <StatusBadge
                        status={schedule.status}
                        databaseStatus={
                          schedule.databaseStatus
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {/* ====================================
              FOOTER
          ==================================== */}

          <footer
            className="
              flex flex-wrap items-center
              justify-between gap-2
              border-t border-[#F0E9E0]
              bg-[#FFFCF8]
              px-4 py-3 sm:px-5
            "
          >
            <p className="text-[11px] text-[#999]">
              Showing {filteredSchedules.length} of{" "}
              {schedules.length} schedules
            </p>

            <span
              className="
                inline-flex items-center gap-1.5
                text-[10px] text-[#AAA]
              "
            >
              {loading ? (
                <LoaderCircle
                  size={12}
                  className="animate-spin"
                />
              ) : (
                <CheckCircle2
                  size={12}
                  className="text-[#7B9E4A]"
                />
              )}

              {loading
                ? "Updating..."
                : "Schedule records"}
            </span>
          </footer>
        </section>
      </div>
    </main>
  );
}
