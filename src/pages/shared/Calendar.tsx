
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useLocation, useNavigate } from "react-router";
import { AlertCircle } from "lucide-react";

import MiniCalendar, {
  type CalendarDot,
  type CalendarMarkers,
} from "../../components/MiniCalendar";

import { supabase } from "../../lib/supabase";

type Role = "resident" | "collector";
type Props = { role?: Role };

type ScheduleRow = {
  schedule_id: string;
  date: string;
  assigned_collector_id: string | null;
  status: string | null;
};

type CollectionRow = {
  collection_id: string;
  schedule_id: string | null;
  collector_id: string | null;
  collection_status: string | null;
};

type WasteReportRow = {
  report_id: string;
  date_uploaded: string;
  cnn_detection_level: string | null;
};

const PAGE_SIZE = 500;

function monthAfter(start: string): string {
  const [year, month] = start.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));

  return (
    `${next.getUTCFullYear()}-` +
    `${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`
  );
}

function phDayOf(timestamp: string): string {
  const date = new Date(timestamp);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function phTimestamp(isoDate: string): string {
  return new Date(
    `${isoDate}T00:00:00+08:00`
  ).toISOString();
}

function normalized(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function isCollected(value: string | null): boolean {
  return ["collected", "completed", "done"].includes(
    normalized(value)
  );
}

function isDelayed(value: string | null): boolean {
  return ["delayed", "late"].includes(normalized(value));
}

function reportMarker(
  level: string | null
): CalendarDot | null {
  switch (normalized(level)) {
    case "high":
    case "full":
      return "priority";

    case "medium":
    case "half-full":
    case "near-full":
    case "near full":
      return "scheduled";

    case "low":
    case "empty":
      return "open";

    default:
      return null;
  }
}

function addDot(
  markers: CalendarMarkers,
  date: string,
  dot: CalendarDot
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  if (!markers[date]) markers[date] = [];

  if (!markers[date].includes(dot)) {
    markers[date].push(dot);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return String(
      (error as { message: unknown }).message
    );
  }

  return "Unable to load calendar status from Supabase.";
}

// ========================================
// FETCH SCHEDULES
// ========================================

async function loadSchedules(
  month: string,
  collectorId?: string
): Promise<ScheduleRow[]> {
  const all: ScheduleRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("schedules")
      .select(
        "schedule_id,date,assigned_collector_id,status"
      )
      .gte("date", month)
      .lt("date", monthAfter(month));

    if (collectorId) {
      query = query.eq(
        "assigned_collector_id",
        collectorId
      );
    }

    const { data, error } = await query
      .order("date", { ascending: true })
      .order("schedule_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Schedules: ${error.message}`);
    }

    const page = (data ?? []) as ScheduleRow[];
    all.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return all.filter(
    (schedule) =>
      !["cancelled", "canceled"].includes(
        normalized(schedule.status)
      )
  );
}

// ========================================
// FETCH COLLECTIONS
// ========================================

async function loadCollections(
  scheduleIds: string[]
): Promise<CollectionRow[]> {
  const result: CollectionRow[] = [];

  for (
    let index = 0;
    index < scheduleIds.length;
    index += 100
  ) {
    const ids = scheduleIds.slice(index, index + 100);

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("collections")
        .select(
          "collection_id,schedule_id,collector_id,collection_status"
        )
        .in("schedule_id", ids)
        .order("collection_id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`Collections: ${error.message}`);
      }

      const page = (data ?? []) as CollectionRow[];

      result.push(...page);

      if (page.length < PAGE_SIZE) break;
    }
  }

  return result;
}

// ========================================
// FETCH WASTE REPORTS
// ========================================

async function loadWasteReports(
  month: string
): Promise<WasteReportRow[]> {
  const result: WasteReportRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("waste_reports")
      .select(
        "report_id,date_uploaded,cnn_detection_level"
      )
      .gte("date_uploaded", phTimestamp(month))
      .lt(
        "date_uploaded",
        phTimestamp(monthAfter(month))
      )
      .order("date_uploaded", { ascending: true })
      .order("report_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Waste reports: ${error.message}`);
    }

    const page = (data ?? []) as WasteReportRow[];

    result.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return result;
}

// ========================================
// BUILD DATE MARKERS
// ========================================

async function fetchMonthMarkers(
  role: Role,
  month: string
): Promise<CalendarMarkers> {
  const {
    data: auth,
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!auth.user) {
    throw new Error("Sign in to see collection schedules.");
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("role,is_active")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (userError) throw userError;

  if (
    !user ||
    normalized(user.role) !== role ||
    user.is_active === false
  ) {
    throw new Error(
      `An active ${role} account is required to view this calendar.`
    );
  }

  const markers: CalendarMarkers = {};

  if (role === "collector") {
    // Only the logged-in collector's schedules.
    const schedules = await loadSchedules(
      month,
      auth.user.id
    );

    const collections = await loadCollections(
      schedules.map((schedule) => schedule.schedule_id)
    );

    const ownCollections = collections.filter(
      (row) =>
        !row.collector_id ||
        row.collector_id === auth.user!.id
    );

    const completedIds = new Set(
      ownCollections
        .filter(
          (row) =>
            row.schedule_id &&
            isCollected(row.collection_status)
        )
        .map((row) => row.schedule_id)
    );

    const delayedIds = new Set(
      ownCollections
        .filter(
          (row) =>
            row.schedule_id &&
            isDelayed(row.collection_status)
        )
        .map((row) => row.schedule_id)
    );

    for (const schedule of schedules) {
      const collected =
        completedIds.has(schedule.schedule_id) ||
        isCollected(schedule.status);

      const delayed =
        delayedIds.has(schedule.schedule_id) ||
        isDelayed(schedule.status);

      const dot: CalendarDot = collected
        ? "collected"
        : delayed
          ? "delayed"
          : "pending";

      addDot(markers, schedule.date, dot);
    }
  } else {
    // Resident waste-level and scheduled collection dots.
    const [reports, schedules] = await Promise.all([
      loadWasteReports(month),
      loadSchedules(month),
    ]);

    for (const report of reports) {
      const dot = reportMarker(
        report.cnn_detection_level
      );

      if (dot) {
        addDot(
          markers,
          phDayOf(report.date_uploaded),
          dot
        );
      }
    }

    for (const schedule of schedules) {
      addDot(markers, schedule.date, "scheduled");
    }
  }

  return markers;
}

// ========================================
// RESPONSIVE LEGEND
// ========================================

function Legend({
  color,
  title,
  description,
}: {
  color: string;
  title: string;
  description?: string;
}) {
  return (
    <div
      className="
        flex min-w-0 items-start gap-2
        text-left
        min-[360px]:justify-center
        min-[360px]:gap-1.5
      "
    >
      <span
        aria-hidden="true"
        className={`
          mt-1 h-[10px] w-[10px] shrink-0
          rounded-full ring-1 ring-black/10
          ${color}
        `}
      />

      <div className="min-w-0">
        <p
          className="
            break-words text-[12px]
            font-bold leading-[1.3]
            text-[#1F1F1F]
            min-[360px]:text-[11px]
            sm:text-[12px]
          "
        >
          {title}
        </p>

        {description && (
          <p
            className="
              mt-1 break-words
              text-[11px] leading-[1.3]
              text-[#555]
              min-[360px]:text-[10px]
              sm:text-[11px]
            "
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

// ========================================
// MAIN CALENDAR PAGE
// ========================================

export default function Calendar({ role }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  const currentRole: Role =
    role ??
    (location.pathname.startsWith("/collector")
      ? "collector"
      : "resident");

  const [visibleMonth, setVisibleMonth] = useState("");
  const [markers, setMarkers] =
    useState<CalendarMarkers>({});
  const [error, setError] = useState("");

  const requestRef = useRef(0);

  const handleMonthChange = useCallback(
    (month: string) => {
      setVisibleMonth(month);
    },
    []
  );

  const loadMarkers = useCallback(async () => {
    if (!visibleMonth) return;

    const requestId = ++requestRef.current;

    setError("");

    try {
      const next = await fetchMonthMarkers(
        currentRole,
        visibleMonth
      );

      if (requestId === requestRef.current) {
        setMarkers(next);
      }
    } catch (cause) {
      if (requestId === requestRef.current) {
        setMarkers({});
        setError(errorMessage(cause));
      }
    }
  }, [currentRole, visibleMonth]);

  // Silent automatic refresh.
  useEffect(() => {
    void loadMarkers();

    const interval = window.setInterval(
      () => void loadMarkers(),
      60_000
    );

    const onFocus = () => void loadMarkers();

    window.addEventListener("focus", onFocus);

    return () => {
      requestRef.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadMarkers]);

  // Supabase Realtime.
  useEffect(() => {
    if (!visibleMonth) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReload = () => {
      if (timer) clearTimeout(timer);

      timer = setTimeout(
        () => void loadMarkers(),
        500
      );
    };

    const channel = supabase.channel(
      `collection-calendar-${currentRole}-${visibleMonth}`
    );

    const tables = currentRole === "collector"
      ? ["schedules", "collections", "users"]
      : ["waste_reports", "schedules"];

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        scheduleReload
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [currentRole, visibleMonth, loadMarkers]);

  const legend = useMemo(
    () =>
      currentRole === "collector"
        ? [
            {
              color: "bg-[#26A966]",
              title: "Collected",
              description: "Completed",
            },
            {
              color: "bg-[#F3B23E]",
              title: "Pending",
              description: "Awaiting pickup",
            },
            {
              color: "bg-[#D52222]",
              title: "Delayed",
              description: "Delayed pickup",
            },
          ]
        : [
            {
              color: "bg-[#D52222]",
              title: "Priority Collection",
              description: "(FULL)",
            },
            {
              color: "bg-[#F3B23E]",
              title: "Scheduled",
              description: "(NEAR FULL)",
            },
            {
              color: "bg-[#9DB77A]",
              title: "Open for Disposal",
              description: "(EMPTY LEVEL)",
            },
          ],
    [currentRole]
  );

  return (
    <main
      className="
        h-[calc(100dvh-5rem)]
        min-h-0
        overflow-y-auto overflow-x-hidden
        bg-white
        [scrollbar-width:none]
        [-ms-overflow-style:none]
        [&::-webkit-scrollbar]:hidden
      "
    >
      <section
        className="
          mx-auto w-full max-w-[500px]
          px-3 pb-6 pt-5
          min-[420px]:px-4 sm:pt-7
        "
      >
        <div
          className="
            overflow-hidden rounded-xl bg-white
            shadow-[0_3px_10px_rgba(0,0,0,0.16)]
          "
        >
          <header
            className="
              bg-[#C90000]
              px-4 pb-5 pt-4 sm:px-5
            "
          >
            <h1
              className="
                text-[17px] font-extrabold
                leading-snug text-white
                sm:text-[19px]
              "
            >
              Collection Schedule
            </h1>
          </header>

          <div className="relative -mt-2 rounded-t-xl bg-white">
            <MiniCalendar
              role={currentRole}
              markers={markers}
              onMonthChange={handleMonthChange}
              onDateSelect={(date) =>
                navigate(
                  `/${currentRole}/calendar/list/${date}`
                )
              }
            />
          </div>

          <div
            className="
              grid grid-cols-1 gap-3
              border-t border-[#E9D9BF]
              bg-[#F5E7D2] px-4 py-4
              min-[360px]:grid-cols-3
              min-[360px]:gap-2
              min-[360px]:px-2
              sm:px-4
            "
          >
            {legend.map((item) => (
              <Legend key={item.title} {...item} />
            ))}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="
              mt-3 flex items-start gap-2
              rounded-lg border border-red-200
              bg-red-50 px-3 py-3
              text-[12px] leading-relaxed
              text-red-700
            "
          >
            <AlertCircle
              size={15}
              className="mt-0.5 shrink-0"
            />

            <div className="min-w-0 flex-1">
              <p className="font-bold">
                Calendar status could not be loaded.
              </p>

              <p className="mt-1 break-words">
                {error}
              </p>

              <button
                type="button"
                className="mt-1.5 font-bold underline"
                onClick={() => void loadMarkers()}
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
