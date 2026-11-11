
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  CircleAlert,
  MapPin,
  Trash2,
  UserRound,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

type Role = "resident" | "collector";

type CollectionStatus =
  | "Pending"
  | "In Progress"
  | "Collected"
  | "Delayed"
  | "Cancelled";

type CollectionType =
  | "Priority Collection"
  | "Scheduled"
  | "Open for Disposal";

type Level = "FULL" | "NEAR FULL" | "EMPTY" | null;

type Dot =
  | "collected"
  | "pending"
  | "delayed"
  | "priority"
  | "scheduled"
  | "open";

type Props = {
  role?: Role;
};

export type Schedule = {
  id: string;
  siteId: string;
  assignedCollectorId: string | null;
  date: string;
  name: string;
  address: string;
  image: string;
  time: string;
  completedTime?: string;
  status: CollectionStatus;
  type: CollectionType;
  level: Level;
  confidence: string;
  analyzedAt: string | null;
  collector: string;
  qrCode: string;
  latitude: number;
  longitude: number;
  remarks: string;
};

type ScheduleRow = {
  schedule_id: string;
  site_id: string | null;
  assigned_collector_id: string | null;
  source_report_id: string | null;
  date: string;
  collection_time: string | null;
  collection_type: string | null;
  status: string | null;
  date_completed: string | null;
  remarks: string | null;
};

type SiteRow = {
  site_id: string;
  site_name: string;
  location: string | null;
  site_image: string | null;
  qr_code: string | null;
  latitude: number | null;
  longitude: number | null;
};

type CollectorRow = {
  user_id: string;
  full_name: string | null;
};

type ReportRow = {
  report_id: string;
  cnn_detection_level: string | null;
  analyzed_at: string | null;
};

type CollectionRow = {
  collection_id: string;
  schedule_id: string | null;
  collector_id: string | null;
  collection_status: string | null;
  completed_at: string | null;
};

type DatedReportRow = {
  date_uploaded: string;
  cnn_detection_level: string | null;
};

// ========================================
// CONSTANTS
// ========================================

const PAGE_SIZE = 500;

const COLUMNS = [
  "schedule_id",
  "site_id",
  "assigned_collector_id",
  "source_report_id",
  "date",
  "collection_time",
  "collection_type",
  "status",
  "date_completed",
  "remarks",
].join(",");

const DOT_COLORS: Record<Dot, string> = {
  collected: "bg-green-600",
  pending: "bg-amber-500",
  delayed: "bg-red-600",
  priority: "bg-red-600",
  scheduled: "bg-amber-400",
  open: "bg-[#9db77a]",
};

// ========================================
// HELPERS
// ========================================

const norm = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

const isCollected = (value?: string | null) =>
  ["collected", "completed", "done"].includes(norm(value));

const isDelayed = (value?: string | null) =>
  ["delayed", "late"].includes(norm(value));

const isCancelled = (value?: string | null) =>
  ["cancelled", "canceled"].includes(norm(value));

export function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function parseDate(value?: string): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");

  if (match) {
    const result = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    if (dateKey(result) === value) {
      return result;
    }
  }

  return new Date();
}

// ========================================
// STATUS BADGE COLORS
// ========================================

export function badgeColor(
  type: Schedule["type"]
): string {
  if (type === "Priority Collection") {
    return "bg-[#ed0015]";
  }

  if (type === "Scheduled") {
    return "bg-[#ffbf42]";
  }

  return "bg-[#9db77a]";
}

export function collectionStatusColor(
  status: Schedule["status"]
): string {
  if (status === "Collected") return "bg-green-600";
  if (status === "Delayed") return "bg-red-600";
  if (status === "In Progress") return "bg-blue-600";
  if (status === "Cancelled") return "bg-neutral-500";

  return "bg-amber-500";
}

// ========================================
// FORMAT COLLECTION TIME
// ========================================

function formatTime(value: string | null): string {
  if (!value) return "—";

  const match = /^(\d{1,2}):(\d{2})/.exec(value);

  if (!match || Number(match[1]) > 23) {
    return value;
  }

  const hour = Number(match[1]);

  return `${hour % 12 || 12}:${match[2]} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

function formatCompletedTime(
  value: string | null
): string | undefined {
  if (
    !value ||
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return undefined;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  return date.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ========================================
// CNN WASTE LEVEL MAPPING
// ========================================

function levelOf(value?: string | null): Level {
  if (["high", "full"].includes(norm(value))) {
    return "FULL";
  }

  if (
    [
      "medium",
      "near full",
      "near-full",
      "half-full",
      "half full",
    ].includes(norm(value))
  ) {
    return "NEAR FULL";
  }

  if (["low", "empty"].includes(norm(value))) {
    return "EMPTY";
  }

  return null;
}

// ========================================
// COLLECTION TYPE
// ========================================

function collectionType(
  value: string | null,
  level: Level
): CollectionType {
  if (norm(value) === "priority collection") {
    return "Priority Collection";
  }

  if (norm(value) === "open for disposal") {
    return "Open for Disposal";
  }

  if (norm(value) === "scheduled") {
    return "Scheduled";
  }

  if (level === "FULL") {
    return "Priority Collection";
  }

  if (level === "EMPTY") {
    return "Open for Disposal";
  }

  return "Scheduled";
}

// ========================================
// COLLECTION STATUS
// ========================================

function mappedStatus(
  schedule: ScheduleRow,
  collections: CollectionRow[]
): CollectionStatus {
  const applicable = collections.filter(
    (record) =>
      !record.collector_id ||
      record.collector_id === schedule.assigned_collector_id
  );

  if (
    applicable.some((item) =>
      isCollected(item.collection_status)
    )
  ) {
    return "Collected";
  }

  if (
    applicable.some((item) =>
      isDelayed(item.collection_status)
    )
  ) {
    return "Delayed";
  }

  if (applicable.length) {
    if (
      applicable.some(
        (item) =>
          norm(item.collection_status) === "in progress"
      )
    ) {
      return "In Progress";
    }

    return "Pending";
  }

  if (isCollected(schedule.status)) return "Collected";
  if (isDelayed(schedule.status)) return "Delayed";
  if (isCancelled(schedule.status)) return "Cancelled";

  if (
    ["in progress", "in_progress", "ongoing"].includes(
      norm(schedule.status)
    )
  ) {
    return "In Progress";
  }

  return "Pending";
}

// ========================================
// CALENDAR DOTS
// ========================================

function addDot(
  markers: Record<string, Dot[]>,
  date: string,
  dot: Dot
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  if (!markers[date]) {
    markers[date] = [];
  }

  if (!markers[date].includes(dot)) {
    markers[date].push(dot);
  }
}

// ========================================
// PHILIPPINE DATE HELPERS
// ========================================

function phDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function phStartOfDay(date: string): string {
  return new Date(
    `${date}T00:00:00+08:00`
  ).toISOString();
}

function nextDate(
  date: string,
  days: number
): string {
  const value = new Date(
    `${date}T00:00:00.000Z`
  );

  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function supabaseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return String(
      (error as { message: unknown }).message
    );
  }

  return "Unable to load schedules.";
}

// ========================================
// FETCH RELATED SUPABASE DATA
// ========================================

async function byIds<T>(
  table:
    | "disposal_sites"
    | "users"
    | "waste_reports"
    | "collections",
  columns: string,
  key: string,
  ids: string[]
): Promise<T[]> {
  const result: T[] = [];

  for (let i = 0; i < ids.length; i += 50) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in(key, ids.slice(i, i + 50))
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`${table}: ${error.message}`);
      }

      const page = (data ?? []) as unknown as T[];

      result.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }
    }
  }

  return result;
}

// ========================================
// CONNECT SCHEDULES TO SUPABASE
// ========================================

async function enrichSchedules(
  rows: ScheduleRow[]
): Promise<Schedule[]> {
  if (!rows.length) return [];

  const unique = (ids: Array<string | null>) => [
    ...new Set(
      ids.filter((id): id is string => Boolean(id))
    ),
  ];

  const [
    sites,
    collectors,
    reports,
    collectionRows,
  ] = await Promise.all([
    byIds<SiteRow>(
      "disposal_sites",
      "site_id,site_name,location,site_image,qr_code,latitude,longitude",
      "site_id",
      unique(rows.map((row) => row.site_id))
    ),

    byIds<CollectorRow>(
      "users",
      "user_id,full_name",
      "user_id",
      unique(
        rows.map((row) => row.assigned_collector_id)
      )
    ),

    byIds<ReportRow>(
      "waste_reports",
      "report_id,cnn_detection_level,analyzed_at",
      "report_id",
      unique(
        rows.map((row) => row.source_report_id)
      )
    ),

    byIds<CollectionRow>(
      "collections",
      "collection_id,schedule_id,collector_id,collection_status,completed_at",
      "schedule_id",
      rows.map((row) => row.schedule_id)
    ),
  ]);

  const siteMap = new Map(
    sites.map((item) => [item.site_id, item])
  );

  const userMap = new Map(
    collectors.map((item) => [item.user_id, item])
  );

  const reportMap = new Map(
    reports.map((item) => [item.report_id, item])
  );

  const collectionMap = new Map<
    string,
    CollectionRow[]
  >();

  for (const record of collectionRows) {
    if (!record.schedule_id) continue;

    collectionMap.set(record.schedule_id, [
      ...(collectionMap.get(record.schedule_id) ?? []),
      record,
    ]);
  }

  return rows.map((row) => {
    const site = row.site_id
      ? siteMap.get(row.site_id)
      : undefined;

    const report = row.source_report_id
      ? reportMap.get(row.source_report_id)
      : undefined;

    const records =
      collectionMap.get(row.schedule_id) ?? [];

    const status = mappedStatus(row, records);

    const level = levelOf(
      report?.cnn_detection_level
    );

    const completed = records.find(
      (record) =>
        isCollected(record.collection_status) &&
        (
          !record.collector_id ||
          record.collector_id ===
            row.assigned_collector_id
        )
    );

    return {
      id: row.schedule_id,
      siteId: row.site_id ?? "",
      assignedCollectorId: row.assigned_collector_id,
      date: row.date,

      name:
        site?.site_name || "Waste Disposal Site",

      address:
        site?.location || "Location not available",

      // Preserve site image for ScheduleDetails.tsx
      image: site?.site_image || "",

      time: formatTime(row.collection_time),

      completedTime: formatCompletedTime(
        completed?.completed_at ??
          row.date_completed
      ),

      status,
      type: collectionType(row.collection_type, level),
      level,

      confidence: "Unavailable",
      analyzedAt: report?.analyzed_at ?? null,

      collector: row.assigned_collector_id
        ? userMap.get(row.assigned_collector_id)
            ?.full_name || "Assigned collector"
        : "Unassigned",

      qrCode: site?.qr_code || "",
      latitude: site?.latitude ?? 0,
      longitude: site?.longitude ?? 0,
      remarks: row.remarks || "",
    };
  });
}

// ========================================
// GET SINGLE SCHEDULE
// ========================================

export async function getScheduleById(
  scheduleId: string,
  collectorId?: string
): Promise<Schedule | null> {
  let query = supabase
    .from("schedules")
    .select(COLUMNS)
    .eq("schedule_id", scheduleId);

  if (collectorId) {
    query = query.eq(
      "assigned_collector_id",
      collectorId
    );
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const result = await enrichSchedules([
    data as unknown as ScheduleRow,
  ]);

  return result[0] ?? null;
}

// ========================================
// FETCH SCHEDULES
// ========================================

async function getScheduledRows(
  start: string,
  endExclusive: string,
  collectorId?: string
): Promise<ScheduleRow[]> {
  const result: ScheduleRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("schedules")
      .select(COLUMNS)
      .gte("date", start)
      .lt("date", endExclusive);

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
      throw new Error(
        `schedules: ${error.message}`
      );
    }

    const page =
      (data ?? []) as unknown as ScheduleRow[];

    result.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return result.filter(
    (item) => !isCancelled(item.status)
  );
}

// ========================================
// RESIDENT CNN REPORT DOTS
// ========================================

async function getReportsForWeek(
  start: string,
  endExclusive: string
): Promise<DatedReportRow[]> {
  const result: DatedReportRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("waste_reports")
      .select("date_uploaded,cnn_detection_level")
      .gte("date_uploaded", phStartOfDay(start))
      .lt("date_uploaded", phStartOfDay(endExclusive))
      .order("date_uploaded", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `waste_reports: ${error.message}`
      );
    }

    const page =
      (data ?? []) as unknown as DatedReportRow[];

    result.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return result;
}

// ========================================
// MAIN CALENDAR LIST COMPONENT
// ========================================

export default function CalendarList({
  role,
}: Props) {
  const { date } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // ========================================
  // DETECT RESIDENT OR COLLECTOR
  // ========================================

  const currentRole: Role =
    role ||
    (
      location.pathname.startsWith("/collector")
        ? "collector"
        : "resident"
    );

  const resident = currentRole === "resident";

  // ========================================
  // SELECTED DATE
  // ========================================

  const selected = parseDate(date);
  const selectedKey = dateKey(selected);

  const today = phDate(
    new Date().toISOString()
  );

  // ========================================
  // STATES
  // ========================================

  const [items, setItems] =
    useState<Schedule[]>([]);

  const [dateDots, setDateDots] =
    useState<Record<string, Dot[]>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0);

  // ========================================
  // WEEK AND MONTH
  // ========================================

  const weekStart = new Date(
    selected.getFullYear(),
    selected.getMonth(),
    selected.getDate() - selected.getDay()
  );

  const weekStartKey = dateKey(weekStart);
  const weekEndKey = nextDate(weekStartKey, 7);

  const monthStart = dateKey(
    new Date(
      selected.getFullYear(),
      selected.getMonth(),
      1
    )
  );

  const monthEnd = dateKey(
    new Date(
      selected.getFullYear(),
      selected.getMonth() + 1,
      1
    )
  );

  const week = useMemo(
    () =>
      Array.from(
        { length: 7 },
        (_, index) =>
          new Date(
            weekStart.getFullYear(),
            weekStart.getMonth(),
            weekStart.getDate() + index
          )
      ),
    [weekStartKey]
  );

  // Residents see the month's schedules.
  // Collectors see selected-date assignments.

  const visibleItems = resident
    ? items
    : items.filter(
        (item) => item.date === selectedKey
      );

  // ========================================
  // AUTH CHANGE LISTENER
  // ========================================

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event) => {
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT" ||
          event === "USER_UPDATED"
        ) {
          setRefreshKey(
            (value) => value + 1
          );
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ========================================
  // LOAD SUPABASE DATA
  // ========================================

  const load = useCallback(async () => {
    const id = ++requestRef.current;

    setLoading(true);
    setError("");

    try {
      const {
        data: auth,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!auth.user) {
        throw new Error("Please sign in.");
      }

      // Verify authenticated user's role.

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("users")
        .select("role,is_active")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (
        !profile ||
        norm(profile.role) !== currentRole ||
        profile.is_active === false
      ) {
        throw new Error(
          `An active ${currentRole} account is required.`
        );
      }

      // Fetch schedules based on role.

      const raw = await getScheduledRows(
        resident ? monthStart : weekStartKey,
        resident ? monthEnd : weekEndKey,
        resident ? undefined : auth.user.id
      );

      // Join Supabase records.

      const records = await enrichSchedules(raw);

      const markers: Record<string, Dot[]> = {};

      // ========================================
      // CALENDAR STATUS DOTS
      // ========================================

      for (const item of records) {
        if (
          item.date < weekStartKey ||
          item.date >= weekEndKey
        ) {
          continue;
        }

        if (resident) {
          addDot(
            markers,
            item.date,
            item.type === "Priority Collection"
              ? "priority"
              : item.type === "Open for Disposal"
                ? "open"
                : "scheduled"
          );
        } else {
          addDot(
            markers,
            item.date,
            item.status === "Collected"
              ? "collected"
              : item.status === "Delayed"
                ? "delayed"
                : "pending"
          );
        }
      }

      // ========================================
      // RESIDENT CNN REPORT DOTS
      // ========================================

      if (resident) {
        const datedReports =
          await getReportsForWeek(
            weekStartKey,
            weekEndKey
          );

        for (const report of datedReports) {
          const level = levelOf(
            report.cnn_detection_level
          );

          if (!level) continue;

          addDot(
            markers,
            phDate(report.date_uploaded),
            level === "FULL"
              ? "priority"
              : level === "NEAR FULL"
                ? "scheduled"
                : "open"
          );
        }
      }

      if (id !== requestRef.current) return;

      setItems(records);
      setDateDots(markers);
    } catch (failure) {
      if (id !== requestRef.current) return;

      console.error(
        "[WasteTrack] CalendarList:",
        failure
      );

      setItems([]);
      setDateDots({});
      setError(supabaseError(failure));
    } finally {
      if (id === requestRef.current) {
        setLoading(false);
      }
    }
  }, [
    currentRole,
    resident,
    monthStart,
    monthEnd,
    weekStartKey,
    weekEndKey,
    refreshKey,
  ]);

  // ========================================
  // AUTOMATIC REFRESH
  // ========================================

  useEffect(() => {
    void load();

    const timer = window.setInterval(
      () => void load(),
      60_000
    );

    const onFocus = () => void load();

    window.addEventListener("focus", onFocus);

    return () => {
      requestRef.current += 1;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // ========================================
  // SUPABASE REALTIME
  // ========================================

  useEffect(() => {
    let timer:
      ReturnType<typeof setTimeout> | undefined;

    const changed = () => {
      if (timer) clearTimeout(timer);

      timer = setTimeout(
        () => void load(),
        500
      );
    };

    const channel = supabase.channel(
      `calendar-list-mobile-${currentRole}-${weekStartKey}`
    );

    const tables = [
      "schedules",
      "collections",
      "waste_reports",
      "disposal_sites",
      "users",
    ];

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        changed
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);

      void supabase.removeChannel(channel);
    };
  }, [
    currentRole,
    resident,
    weekStartKey,
    load,
  ]);

  // ========================================
  // DATE NAVIGATION
  // ========================================

  function selectDay(day: Date) {
    const clickedDate = dateKey(day);

    // Clicking the selected date again
    // returns to Calendar.tsx.

    if (clickedDate === selectedKey) {
      navigate(`/${currentRole}/calendar`);
      return;
    }

    // Clicking a different date opens its list.

    navigate(
      `/${currentRole}/calendar/list/${clickedDate}`
    );
  }

  function moveWeek(direction: number) {
    selectDay(
      new Date(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate() + direction * 7
      )
    );
  }

  // ========================================
  // RESPONSIVE CALENDAR UI
  // ========================================

  return (
    <main
      className="
        flex h-[calc(100dvh-5rem)] min-h-[420px]
        w-full flex-col overflow-hidden
        bg-white text-[#222]
      "
    >
      <section
        className="
          mx-auto flex min-h-0 w-full max-w-[460px]
          flex-1 flex-col px-3 pt-3
          pb-[max(10px,env(safe-area-inset-bottom))]
          min-[360px]:px-4
          min-[480px]:pt-6
        "
      >
        {/* ========================================
            RED HEADER
        ======================================== */}

        <header
          className="
            shrink-0 rounded-t-[9px]
            bg-[#c40000] px-2.5
            pb-[27px] pt-2
            min-[360px]:rounded-t-xl
            min-[360px]:px-4
            min-[360px]:pb-8
            min-[360px]:pt-3
          "
        >
          <h1
            className="
              text-[12px] font-extrabold leading-[16px]
              text-white
              min-[360px]:text-[18px]
              min-[360px]:leading-6
            "
          >
            Collection Schedule
          </h1>
        </header>

        {/* ========================================
            WHITE CONTENT PANEL
        ======================================== */}

        <div
          className="
            relative -mt-[16px] flex min-h-0
            flex-1 flex-col rounded-t-[11px]
            bg-white px-2 pt-3
            min-[360px]:-mt-4
            min-[360px]:rounded-t-2xl
            min-[360px]:px-3
            min-[360px]:pt-4
          "
        >
          {/* ========================================
              WEEKLY CALENDAR
          ======================================== */}

          <section
            aria-label="Weekly collection calendar"
            className="
              shrink-0 rounded-[11px]
              border border-[#cecece] bg-white
              px-[3px] pb-[5px]
              shadow-[0_2px_3px_rgba(0,0,0,0.13)]
              min-[360px]:rounded-2xl
              min-[360px]:px-2
              min-[360px]:pb-2
            "
          >
            {/* MONTH AND NAVIGATION */}

            <div
              className="
                flex h-[34px] items-center
                justify-between
                min-[360px]:h-[44px]
              "
            >
              <button
                type="button"
                onClick={() => moveWeek(-1)}
                aria-label="Previous week"
                className="
                  grid h-[30px] w-[30px]
                  shrink-0 place-items-center
                  rounded-full hover:bg-red-50
                  focus-visible:outline
                  focus-visible:outline-2
                  focus-visible:outline-red-500
                  min-[360px]:h-10
                  min-[360px]:w-10
                "
              >
                <ChevronLeft
                  className="
                    h-[15px] w-[15px]
                    min-[360px]:h-5
                    min-[360px]:w-5
                  "
                />
              </button>

              <Link
                to={`/${currentRole}/calendar`}
                aria-label="Open full calendar"
                className="
                  min-w-0 text-center
                  text-[11px] font-extrabold
                  leading-tight text-[#191919]
                  hover:underline
                  min-[360px]:text-[17px]
                "
              >
                {selected.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </Link>

              <button
                type="button"
                onClick={() => moveWeek(1)}
                aria-label="Next week"
                className="
                  grid h-[30px] w-[30px]
                  shrink-0 place-items-center
                  rounded-full hover:bg-red-50
                  focus-visible:outline
                  focus-visible:outline-2
                  focus-visible:outline-red-500
                  min-[360px]:h-10
                  min-[360px]:w-10
                "
              >
                <ChevronRight
                  className="
                    h-[15px] w-[15px]
                    min-[360px]:h-5
                    min-[360px]:w-5
                  "
                />
              </button>
            </div>

            {/* ========================================
                WEEKDAYS AND DATES
            ======================================== */}

            <div className="grid grid-cols-7 text-center">
              {week.map((day) => {
                const key = dateKey(day);

                const isSelected = key === selectedKey;
                const isToday = key === today;

                return (
                  <div
                    key={key}
                    className="min-w-0"
                  >
                    {/* WEEKDAY */}

                    <p
                      className="
                        py-0.5 text-[9px]
                        font-normal leading-3 text-[#222]
                        min-[360px]:py-1
                        min-[360px]:text-[12px]
                        min-[360px]:font-medium
                      "
                    >
                      {day.toLocaleDateString("en-US", {
                        weekday: "short",
                      })}
                    </p>

                    {/* DATE BUTTON */}

                    <button
                      type="button"
                      onClick={() => selectDay(day)}
                      aria-pressed={isSelected}
                      aria-current={
                        isToday ? "date" : undefined
                      }
                      aria-label={day.toLocaleDateString(
                        "en-US",
                        { dateStyle: "full" }
                      )}
                      className="
                        flex h-[27px] w-full
                        min-w-0 flex-col
                        items-center justify-center
                        rounded-md hover:bg-red-50
                        focus-visible:outline
                        focus-visible:outline-2
                        focus-visible:outline-red-500
                        min-[360px]:h-[39px]
                      "
                    >
                      {/* SELECTED DAY */}

                      <span
                        className={`
                          grid h-[17px] w-[17px]
                          place-items-center rounded-full
                          text-[9px] leading-none
                          min-[360px]:h-[25px]
                          min-[360px]:w-[25px]
                          min-[360px]:text-[13px]
                          ${
                            isSelected
                              ? "bg-[#ff9ba8] font-semibold"
                              : "font-medium"
                          }
                          ${
                            isToday
                              ? "text-[#225dc8]"
                              : "text-[#111]"
                          }
                        `}
                      >
                        {day.getDate()}
                      </span>

                      {/* STATUS DOTS */}

                      <span
                        aria-hidden="true"
                        className="
                          mt-px flex h-[5px]
                          items-center justify-center
                          gap-[2px]
                          min-[360px]:h-[7px]
                          min-[360px]:gap-[3px]
                        "
                      >
                        {(dateDots[key] ?? [])
                          .slice(0, 3)
                          .map((dot) => (
                            <span
                              key={dot}
                              className={`
                                h-[4px] w-[4px]
                                rounded-full
                                min-[360px]:h-[6px]
                                min-[360px]:w-[6px]
                                ${DOT_COLORS[dot]}
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

          {/* ========================================
              INFORMATION BANNER
          ======================================== */}

          {resident && (
            <div
              className="
                mt-[6px] flex shrink-0
                items-center gap-1 rounded-[3px]
                bg-[#ffe4e9] px-[7px] py-[3px]
                min-[360px]:mt-2
                min-[360px]:gap-2
                min-[360px]:rounded-md
                min-[360px]:px-3
                min-[360px]:py-2
              "
            >
              <CircleAlert
                aria-hidden="true"
                className="
                  h-[11px] w-[11px]
                  shrink-0 text-[#f3264c]
                  min-[360px]:h-[17px]
                  min-[360px]:w-[17px]
                "
              />

              <p
                className="
                  text-[8px] font-medium
                  leading-[11px] text-[#171717]
                  min-[360px]:text-[12px]
                  min-[360px]:leading-4
                "
              >
                Schedules are based on the latest waste
                level reports.
              </p>
            </div>
          )}

          {/* ========================================
              COLLECTION SCHEDULE HEADING
          ======================================== */}

          <div
            className="
              flex shrink-0 items-center
              justify-between gap-2
              pb-[5px] pt-[7px]
              min-[360px]:pb-2
              min-[360px]:pt-3
            "
          >
            <h2
              className="
                min-w-0 text-[11px]
                font-extrabold leading-[14px]
                text-[#222]
                min-[360px]:text-[16px]
                min-[360px]:leading-5
              "
            >
              Collection Schedule
            </h2>

            <span
              className="
                shrink-0 text-[8px]
                leading-tight text-[#696969]
                min-[360px]:text-[12px]
              "
            >
              {loading
                ? "Loading..."
                : `${visibleItems.length} site(s)`}
            </span>
          </div>

          {/* ========================================
              SCROLLABLE SCHEDULE CARDS
          ======================================== */}

          <div
            role="region"
            aria-label="Collection schedules"
            aria-busy={loading}
            tabIndex={0}
            className="
              min-h-0 flex-1
              space-y-[8px] overflow-y-auto
              overscroll-contain px-px pb-4
              [scrollbar-width:none]
              [-ms-overflow-style:none]
              [&::-webkit-scrollbar]:hidden
              min-[360px]:space-y-3
            "
          >
            {/* LOADING */}

            {loading ? (
              <p
                role="status"
                className="
                  py-8 text-center
                  text-[11px] text-neutral-600
                  min-[360px]:text-[14px]
                "
              >
                Loading schedules...
              </p>
            ) : error ? (
              /* ERROR */

              <div
                role="alert"
                className="
                  rounded-lg border border-red-200
                  bg-red-50 p-3
                  text-[11px] leading-relaxed
                  text-red-700
                  min-[360px]:text-[14px]
                "
              >
                <p>{error}</p>

                <button
                  type="button"
                  onClick={() => void load()}
                  className="
                    mt-2 font-bold underline
                    underline-offset-2
                  "
                >
                  Try again
                </button>
              </div>
            ) : visibleItems.length === 0 ? (
              /* EMPTY STATE */

              <p
                className="
                  rounded-lg border
                  border-[#ffb9c1]
                  bg-[#fff7f8] p-3
                  text-center text-[11px]
                  leading-relaxed text-neutral-600
                  min-[360px]:text-[14px]
                "
              >
                No schedules available for this period.
              </p>
            ) : (
              /* ========================================
                  SCHEDULE CARDS
              ======================================== */

              visibleItems.map((item) => {
                const label = resident
                  ? item.type
                  : item.status;

                const color = resident
                  ? badgeColor(item.type)
                  : collectionStatusColor(item.status);

                const badgeTextColor =
                  label === "Priority Collection" ||
                  label === "Delayed" ||
                  label === "Cancelled" ||
                  label === "Collected" ||
                  label === "In Progress"
                    ? "text-white"
                    : "text-[#262626]";

                // ScheduleDetails.tsx navigation

                const detailsPath =
                  `/${currentRole}/schedule-details/${item.id}`;

                const site = {
                  id: item.siteId,
                  scheduleId: item.id,
                  name: item.name,
                  image: item.image,
                  address: item.address,
                  latitude: item.latitude,
                  longitude: item.longitude,
                  qrCode: item.qrCode,
                  wasteLevel: item.level,
                  collectionDate: item.date,
                  collectionTime: item.time,
                };

                return (
                  <article
                    key={item.id}
                    className="
                      relative overflow-hidden
                      rounded-[9px] border
                      border-[#f3aab4]
                      bg-[#fff6f7]
                      shadow-[0_2px_2px_rgba(0,0,0,0.15)]
                      min-[360px]:rounded-xl
                    "
                  >
                    {/* ========================================
                        TOP RIGHT STATUS BADGE
                    ======================================== */}

                    <span
                      className={`
                        absolute right-[5px] top-[3px]
                        max-w-[calc(100%-12px)]
                        truncate rounded-full
                        px-[5px] py-[1px]
                        text-[8px] font-semibold
                        leading-[11px]
                        min-[360px]:right-2
                        min-[360px]:top-1.5
                        min-[360px]:px-2
                        min-[360px]:py-0.5
                        min-[360px]:text-[11px]
                        min-[360px]:leading-[15px]
                        ${color}
                        ${badgeTextColor}
                      `}
                    >
                      {label}
                    </span>

                    {/* ========================================
                        CARD BODY
                    ======================================== */}

                    <div
                      className="
                        flex min-w-0 items-start
                        gap-[6px] px-[5px]
                        pb-[5px] pt-[18px]
                        min-[360px]:gap-3
                        min-[360px]:px-3
                        min-[360px]:pb-3
                        min-[360px]:pt-[30px]
                      "
                    >
                      {/* RED BIN ICON */}

                      <div
                        className="
                          grid h-[32px] w-[32px]
                          shrink-0 place-items-center
                          rounded-[5px]
                          bg-[#ffa6b0]
                          text-[#f51d29]
                          min-[360px]:h-[48px]
                          min-[360px]:w-[48px]
                          min-[360px]:rounded-lg
                        "
                      >
                        <Trash2
                          aria-hidden="true"
                          strokeWidth={2.7}
                          className="
                            h-[24px] w-[24px]
                            min-[360px]:h-[34px]
                            min-[360px]:w-[34px]
                          "
                        />
                      </div>

                      {/* SITE INFORMATION */}

                      <div className="min-w-0 flex-1">
                        {/* SITE NAME */}

                        <h3
                          className="
                            break-words text-[11px]
                            font-extrabold leading-[13px]
                            text-[#161616]
                            min-[360px]:text-[15px]
                            min-[360px]:leading-[19px]
                          "
                        >
                          {item.name}
                        </h3>

                        {/* ADDRESS */}

                        <p
                          className="
                            mt-[2px] flex min-w-0
                            items-start gap-[2px]
                            text-[8px] leading-[11px]
                            text-[#444]
                            min-[360px]:mt-1
                            min-[360px]:gap-1
                            min-[360px]:text-[12px]
                            min-[360px]:leading-4
                          "
                        >
                          <MapPin
                            aria-hidden="true"
                            className="
                              mt-px h-[9px] w-[9px]
                              shrink-0
                              min-[360px]:h-[14px]
                              min-[360px]:w-[14px]
                            "
                          />

                          <span className="min-w-0 break-words">
                            {item.address}
                          </span>
                        </p>

                        {/* COLLECTION TIME */}

                        <p
                          className="
                            mt-[2px] flex items-center
                            gap-[2px] text-[8px]
                            leading-[11px] text-[#444]
                            min-[360px]:mt-1
                            min-[360px]:gap-1
                            min-[360px]:text-[12px]
                            min-[360px]:leading-4
                          "
                        >
                          <Clock3
                            aria-hidden="true"
                            className="
                              h-[9px] w-[9px]
                              shrink-0
                              min-[360px]:h-[14px]
                              min-[360px]:w-[14px]
                            "
                          />

                          <span>{item.time}</span>
                        </p>
                      </div>
                    </div>

                    {/* ========================================
                        CARD FOOTER
                    ======================================== */}

                    <div
                      className="
                        flex min-h-[20px]
                        items-center justify-between
                        gap-1 border-t
                        border-[#f8d6db]
                        px-[6px]
                        min-[360px]:min-h-[34px]
                        min-[360px]:gap-2
                        min-[360px]:px-3
                      "
                    >
                      {/* COLLECTOR NAME */}

                      {resident ? (
                        <p
                          className="
                            flex min-w-0 flex-1
                            items-center gap-[3px]
                            text-[8px] leading-tight
                            text-[#363636]
                            min-[360px]:gap-1.5
                            min-[360px]:text-[11px]
                          "
                        >
                          <UserRound
                            aria-hidden="true"
                            className="
                              h-[9px] w-[9px]
                              shrink-0
                              min-[360px]:h-[14px]
                              min-[360px]:w-[14px]
                            "
                          />

                          <span className="min-w-0 truncate">
                            Collector: {item.collector}
                          </span>
                        </p>
                      ) : (
                        <span
                          className="
                            min-w-0 flex-1
                            text-[8px] text-[#555]
                            min-[360px]:text-[11px]
                          "
                        >
                          {item.status}
                        </span>
                      )}

                      {/* ========================================
                          VIEW DETAILS BUTTON
                      ======================================== */}

                      <Link
                        to={detailsPath}
                        state={{
                          schedule: item,
                          site,
                          collection: site,
                        }}
                        className="
                          flex min-h-[20px]
                          shrink-0 items-center
                          gap-px whitespace-nowrap
                          text-[8px] font-medium
                          leading-tight text-[#b91c2d]
                          hover:underline
                          focus-visible:underline
                          min-[360px]:min-h-[34px]
                          min-[360px]:gap-1
                          min-[360px]:text-[12px]
                          min-[360px]:font-semibold
                        "
                      >
                        View details

                        <ChevronRight
                          aria-hidden="true"
                          className="
                            h-[10px] w-[10px]
                            min-[360px]:h-[15px]
                            min-[360px]:w-[15px]
                          "
                        />
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
