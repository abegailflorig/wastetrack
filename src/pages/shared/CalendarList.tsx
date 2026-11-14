
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
  CircleAlert,
  Clock3,
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
  reportImage: string;
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
  site_id: string;
  assigned_collector_id: string | null;
  source_report_id: string | null;
  date: string;
  collection_time: string | null;
  collection_type: string;
  status: string;
  date_completed: string | null;
};

type SiteRow = {
  site_id: string;
  site_name: string;
  location: string;
  site_image: string | null;
  qr_code: string | null;
  latitude: number;
  longitude: number;
  assigned_collector: string | null;
};

type UserRow = {
  user_id: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

type ReportRow = {
  report_id: string;
  site_id: string | null;
  date_uploaded: string;
  cnn_detection_level: string | null;
  analyzed_at: string | null;
};

type CollectionRow = {
  schedule_id: string;
  collector_id: string;
  collection_status: "Collected" | "Not Collected";
  completed_at: string;
  remarks: string | null;
};

type StatusRow = {
  report_id: string;
  remarks: string | null;
  created_at: string;
};

type LookupTable =
  | "disposal_sites"
  | "users"
  | "waste_reports"
  | "collections"
  | "status";

// ========================================
// CONSTANTS
// ========================================

const PAGE_SIZE = 500;

const SCHEDULE_COLUMNS = [
  "schedule_id",
  "site_id",
  "assigned_collector_id",
  "source_report_id",
  "date",
  "collection_time",
  "collection_type",
  "status",
  "date_completed",
].join(",");

// schedules.remarks is deliberately omitted.
// That column does not exist in your schema.

const DOT_COLORS: Record<Dot, string> = {
  collected: "bg-green-600",
  pending: "bg-amber-400",
  delayed: "bg-red-600",
  priority: "bg-red-600",
  scheduled: "bg-amber-400",
  open: "bg-[#9db77a]",
};

const norm = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

// ========================================
// DATE HELPERS
// ========================================

export function dateKey(day: Date): string {
  return [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, "0"),
    String(day.getDate()).padStart(2, "0"),
  ].join("-");
}

export function parseDate(value?: string): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");

  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    if (dateKey(date) === value) {
      return date;
    }
  }

  return new Date();
}

function nextDate(
  value: string,
  days: number
): string {
  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date.toISOString().slice(0, 10);
}

function philippineDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const part = (key: string) =>
    parts.find((p) => p.type === key)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function phStart(value: string): string {
  return new Date(
    `${value}T00:00:00+08:00`
  ).toISOString();
}

function timeLabel(value: string | null): string {
  const match = value?.match(
    /^(\d{1,2}):(\d{2})/
  );

  if (!match || Number(match[1]) > 23) {
    return value || "—";
  }

  const hour = Number(match[1]);

  return `${hour % 12 || 12}:${match[2]} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

function completedLabel(
  value: string | null
): string | undefined {
  if (!value) return undefined;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ========================================
// CNN LEVEL MAPPING
// ========================================

function wasteLevel(
  value?: string | null
): Level {
  const level = norm(value);

  if (
    ["full", "high", "overflowing"].includes(level)
  ) {
    return "FULL";
  }

  if (
    [
      "near full",
      "near-full",
      "half full",
      "half-full",
      "medium",
    ].includes(level)
  ) {
    return "NEAR FULL";
  }

  if (["empty", "low"].includes(level)) {
    return "EMPTY";
  }

  return null;
}

// ========================================
// BADGE COLORS
// ========================================

export function badgeColor(
  value: CollectionType
): string {
  if (value === "Priority Collection") {
    return "bg-[#ed0015]";
  }

  if (value === "Scheduled") {
    return "bg-[#ffbf42]";
  }

  return "bg-[#9db77a]";
}

export function collectionStatusColor(
  value: CollectionStatus
): string {
  if (value === "Collected") {
    return "bg-green-600";
  }

  if (value === "Delayed") {
    return "bg-red-600";
  }

  if (value === "In Progress") {
    return "bg-blue-600";
  }

  if (value === "Cancelled") {
    return "bg-neutral-500";
  }

  return "bg-[#ffbf42]";
}

// ========================================
// STATUS MAPPING
// ========================================

function actualStatus(
  schedule: ScheduleRow,
  collection?: CollectionRow
): CollectionStatus {
  // collections.collection_status supports:
  // "Collected" and "Not Collected".

  if (collection?.collection_status === "Collected") {
    return "Collected";
  }

  if (
    collection?.collection_status === "Not Collected"
  ) {
    return "Delayed";
  }

  if (schedule.status === "Collected") {
    return "Collected";
  }

  if (schedule.status === "In Progress") {
    return "In Progress";
  }

  if (schedule.status === "Cancelled") {
    return "Cancelled";
  }

  return "Pending";
}

function addDot(
  map: Record<string, Dot[]>,
  date: string,
  dot: Dot
): void {
  if (!map[date]) {
    map[date] = [];
  }

  if (!map[date].includes(dot)) {
    map[date].push(dot);
  }
}

function messageOf(error: unknown): string {
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

  return "Unable to load collection schedules.";
}

// ========================================
// GENERIC SUPABASE QUERY
// ========================================

async function byIds<T>(
  table: LookupTable,
  columns: string,
  key: string,
  values: string[]
): Promise<T[]> {
  const ids = [
    ...new Set(values.filter(Boolean)),
  ];

  const all: T[] = [];

  for (let i = 0; i < ids.length; i += 50) {
    for (
      let offset = 0;
      ;
      offset += PAGE_SIZE
    ) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in(
          key,
          ids.slice(i, i + 50)
        )
        .range(
          offset,
          offset + PAGE_SIZE - 1
        );

      if (error) {
        throw new Error(
          `${table}: ${error.message}`
        );
      }

      const page =
        (data ?? []) as unknown as T[];

      all.push(...page);

      if (page.length < PAGE_SIZE) {
        break;
      }
    }
  }

  return all;
}

// ========================================
// GET SCHEDULES
// ========================================

async function scheduleRows(
  start: string,
  endExclusive: string
): Promise<ScheduleRow[]> {
  const all: ScheduleRow[] = [];

  for (
    let offset = 0;
    ;
    offset += PAGE_SIZE
  ) {
    const { data, error } = await supabase
      .from("schedules")
      .select(SCHEDULE_COLUMNS)
      .gte("date", start)
      .lt("date", endExclusive)
      .order("date", {
        ascending: true,
      })
      .order("schedule_id", {
        ascending: true,
      })
      .range(
        offset,
        offset + PAGE_SIZE - 1
      );

    if (error) {
      throw new Error(
        `schedules: ${error.message}`
      );
    }

    const page =
      (data ?? []) as unknown as ScheduleRow[];

    all.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return all.filter(
    (row) => row.status !== "Cancelled"
  );
}

// ========================================
// GET LATEST REPORT PER SITE
// ========================================

async function latestReports(
  siteIds: string[]
): Promise<Map<string, ReportRow>> {
  const reports = await Promise.all(
    siteIds.map(async (siteId) => {
      const { data, error } = await supabase
        .from("waste_reports")
        .select(
          "report_id,site_id,date_uploaded,cnn_detection_level,analyzed_at"
        )
        .eq("site_id", siteId)
        .order("date_uploaded", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(
          `waste_reports: ${error.message}`
        );
      }

      return data as ReportRow | null;
    })
  );

  return new Map(
    reports
      .filter(
        (report): report is ReportRow =>
          Boolean(report)
      )
      .map((report) => [
        report.site_id as string,
        report,
      ])
  );
}

// ========================================
// ENRICH SCHEDULES WITH RELATED TABLES
// ========================================

async function enrichSchedules(
  rows: ScheduleRow[]
): Promise<Schedule[]> {
  if (!rows.length) {
    return [];
  }

  const unique = (
    items: Array<string | null>
  ): string[] =>
    [
      ...new Set(
        items.filter(
          (value): value is string =>
            Boolean(value)
        )
      ),
    ];

  const [
    sites,
    directReports,
    collections,
  ] = await Promise.all([
    byIds<SiteRow>(
      "disposal_sites",
      "site_id,site_name,location,site_image,qr_code,latitude,longitude,assigned_collector",
      "site_id",
      unique(rows.map((row) => row.site_id))
    ),

    byIds<ReportRow>(
      "waste_reports",
      "report_id,site_id,date_uploaded,cnn_detection_level,analyzed_at",
      "report_id",
      unique(
        rows.map(
          (row) => row.source_report_id
        )
      )
    ),

    byIds<CollectionRow>(
      "collections",
      "schedule_id,collector_id,collection_status,completed_at,remarks",
      "schedule_id",
      rows.map(
        (row) => row.schedule_id
      )
    ),
  ]);

  const siteMap = new Map(
    sites.map((site) => [
      site.site_id,
      site,
    ])
  );

  // Collector IDs may come from schedules
  // or disposal_sites.assigned_collector.

  const users = await byIds<UserRow>(
    "users",
    "user_id,full_name,role,is_active",
    "user_id",
    unique([
      ...rows.map(
        (row) => row.assigned_collector_id
      ),
      ...sites.map(
        (site) => site.assigned_collector
      ),
    ])
  );

  const userMap = new Map(
    users.map((user) => [
      user.user_id,
      user,
    ])
  );

  const directMap = new Map(
    directReports.map((report) => [
      report.report_id,
      report,
    ])
  );

  const recentMap = await latestReports(
    unique(
      rows
        .filter(
          (row) => !row.source_report_id
        )
        .map((row) => row.site_id)
    )
  );

  const collectionMap = new Map(
    collections.map((collection) => [
      collection.schedule_id,
      collection,
    ])
  );

  const relevantReports = rows.flatMap(
    (row) => {
      const report = row.source_report_id
        ? directMap.get(row.source_report_id)
        : recentMap.get(row.site_id);

      return report ? [report] : [];
    }
  );

  const statuses = await byIds<StatusRow>(
    "status",
    "report_id,remarks,created_at",
    "report_id",
    unique(
      relevantReports.map(
        (report) => report.report_id
      )
    )
  ).catch((error) => {
    console.warn(
      "[WasteTrack] Report remarks unavailable:",
      messageOf(error)
    );

    return [] as StatusRow[];
  });

  const statusMap = new Map<
    string,
    StatusRow
  >();

  for (
    const item of [...statuses].sort(
      (a, b) =>
        b.created_at.localeCompare(
          a.created_at
        )
    )
  ) {
    if (!statusMap.has(item.report_id)) {
      statusMap.set(
        item.report_id,
        item
      );
    }
  }

  return rows.map((row) => {
    const site = siteMap.get(
      row.site_id
    );

    const report = row.source_report_id
      ? directMap.get(
          row.source_report_id
        )
      : recentMap.get(
          row.site_id
        );

    const collection = collectionMap.get(
      row.schedule_id
    );

    const assignedId =
      row.assigned_collector_id ??
      site?.assigned_collector ??
      null;

    const collector = assignedId
      ? userMap.get(assignedId)
      : undefined;

    const collectorName =
      collector?.role === "collector" &&
      collector.is_active
        ? collector.full_name
        : assignedId
          ? "Assigned collector"
          : "Unassigned";

    const completed =
      collection?.collection_status === "Collected"
        ? collection.completed_at
        : row.status === "Collected"
          ? row.date_completed
          : null;

    const collectionType: CollectionType =
      row.collection_type === "Priority Collection" ||
      row.collection_type === "Open for Disposal"
        ? row.collection_type
        : "Scheduled";

    return {
      id: row.schedule_id,

      siteId: row.site_id,

      assignedCollectorId: assignedId,

      date: row.date,

      name:
        site?.site_name ??
        "Waste Disposal Site",

      address:
        site?.location ??
        "Location unavailable",

      image:
        site?.site_image ?? "",

      // Actual before-collection photo
      // is loaded in WasteCollection.tsx.
      reportImage: "",

      time: timeLabel(
        row.collection_time
      ),

      completedTime:
        completedLabel(completed),

      status:
        actualStatus(
          row,
          collection
        ),

      type: collectionType,

      level: wasteLevel(
        report?.cnn_detection_level
      ),

      confidence: "Unavailable",

      analyzedAt:
        report?.analyzed_at ?? null,

      collector: collectorName,

      qrCode:
        site?.qr_code ?? "",

      latitude:
        site?.latitude ?? 0,

      longitude:
        site?.longitude ?? 0,

      remarks:
        collection?.remarks ??
        (
          report
            ? statusMap.get(
                report.report_id
              )?.remarks
            : null
        ) ??
        "",
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
  const { data, error } = await supabase
    .from("schedules")
    .select(SCHEDULE_COLUMNS)
    .eq(
      "schedule_id",
      scheduleId
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `schedules: ${error.message}`
    );
  }

  if (!data) {
    return null;
  }

  const [schedule] = await enrichSchedules([
    data as unknown as ScheduleRow,
  ]);

  if (!schedule) {
    return null;
  }

  if (
    collectorId &&
    schedule.assignedCollectorId !== collectorId
  ) {
    return null;
  }

  return schedule;
}

// ========================================
// REPORT DOTS FOR THE WEEK
// ========================================

async function reportsForWeek(
  start: string,
  end: string
): Promise<
  {
    date_uploaded: string;
    cnn_detection_level: string | null;
  }[]
> {
  const all: {
    date_uploaded: string;
    cnn_detection_level: string | null;
  }[] = [];

  for (
    let offset = 0;
    ;
    offset += PAGE_SIZE
  ) {
    const { data, error } = await supabase
      .from("waste_reports")
      .select(
        "date_uploaded,cnn_detection_level"
      )
      .gte(
        "date_uploaded",
        phStart(start)
      )
      .lt(
        "date_uploaded",
        phStart(end)
      )
      .order("date_uploaded", {
        ascending: true,
      })
      .range(
        offset,
        offset + PAGE_SIZE - 1
      );

    if (error) {
      throw new Error(
        `waste_reports: ${error.message}`
      );
    }

    const page = (data ?? []) as {
      date_uploaded: string;
      cnn_detection_level: string | null;
    }[];

    all.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return all;
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function CalendarList({
  role,
}: Props) {
  const { date } = useParams();

  const location = useLocation();

  const navigate = useNavigate();

  const currentRole: Role =
    role ??
    (
      location.pathname.startsWith("/collector")
        ? "collector"
        : "resident"
    );

  const resident =
    currentRole === "resident";

  const selected = parseDate(date);

  const selectedKey =
    dateKey(selected);

  const today = philippineDate(
    new Date().toISOString()
  );

  const [items, setItems] =
    useState<Schedule[]>([]);

  const [dots, setDots] =
    useState<Record<string, Dot[]>>({});

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [refresh, setRefresh] =
    useState(0);

  const requestId = useRef(0);

  // ========================================
  // SELECTED WEEK / MONTH
  // ========================================

  const weekStart = dateKey(
    new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate() -
        selected.getDay()
    )
  );

  const weekEnd =
    nextDate(weekStart, 7);

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

  const weekDays = useMemo(() => {
    const first =
      parseDate(weekStart);

    return Array.from(
      { length: 7 },
      (_, index) =>
        new Date(
          first.getFullYear(),
          first.getMonth(),
          first.getDate() + index
        )
    );
  }, [weekStart]);

  const visible = resident
    ? items
    : items.filter(
        (item) =>
          item.date === selectedKey
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
          [
            "SIGNED_IN",
            "SIGNED_OUT",
            "USER_UPDATED",
          ].includes(event)
        ) {
          setRefresh(
            (value) => value + 1
          );
        }
      }
    );

    return () =>
      subscription.unsubscribe();
  }, []);

  // ========================================
  // LOAD SUPABASE RECORDS
  // ========================================

  const load = useCallback(async () => {
    const myRequest =
      ++requestId.current;

    setLoading(true);
    setError("");

    try {
      const {
        data: auth,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!auth.user) {
        throw new Error(
          "Please sign in."
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("users")
        .select(
          "role,is_active"
        )
        .eq(
          "user_id",
          auth.user.id
        )
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (
        !profile ||
        profile.role !== currentRole ||
        profile.is_active === false
      ) {
        throw new Error(
          `An active ${currentRole} account is required.`
        );
      }

      const rows = await scheduleRows(
        resident
          ? monthStart
          : weekStart,

        resident
          ? monthEnd
          : weekEnd
      );

      const all =
        await enrichSchedules(rows);

      // Collector only sees their own schedules.

      const records = resident
        ? all
        : all.filter(
            (item) =>
              item.assignedCollectorId ===
              auth.user!.id
          );

      const markers: Record<
        string,
        Dot[]
      > = {};

      for (const item of records) {
        if (
          item.date < weekStart ||
          item.date >= weekEnd
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

      if (resident) {
        const reports =
          await reportsForWeek(
            weekStart,
            weekEnd
          );

        for (const report of reports) {
          const level = wasteLevel(
            report.cnn_detection_level
          );

          if (level) {
            addDot(
              markers,
              philippineDate(
                report.date_uploaded
              ),
              level === "FULL"
                ? "priority"
                : level === "NEAR FULL"
                  ? "scheduled"
                  : "open"
            );
          }
        }
      }

      if (
        myRequest !== requestId.current
      ) {
        return;
      }

      setItems(records);
      setDots(markers);
    } catch (failure) {
      if (
        myRequest !== requestId.current
      ) {
        return;
      }

      console.error(
        "[WasteTrack] CalendarList:",
        failure
      );

      setItems([]);
      setDots({});
      setError(
        messageOf(failure)
      );
    } finally {
      if (
        myRequest === requestId.current
      ) {
        setLoading(false);
      }
    }
  }, [
    currentRole,
    resident,
    monthStart,
    monthEnd,
    weekStart,
    weekEnd,
    refresh,
  ]);

  // ========================================
  // AUTOMATIC REFRESH
  // ========================================

  useEffect(() => {
    void load();

    const interval =
      window.setInterval(
        () => void load(),
        60_000
      );

    const focus = () =>
      void load();

    window.addEventListener(
      "focus",
      focus
    );

    return () => {
      requestId.current += 1;

      window.clearInterval(
        interval
      );

      window.removeEventListener(
        "focus",
        focus
      );
    };
  }, [load]);

  // ========================================
  // SUPABASE REALTIME
  // ========================================

  useEffect(() => {
    let debounce:
      | ReturnType<typeof setTimeout>
      | undefined;

    const changed = () => {
      if (debounce) {
        clearTimeout(debounce);
      }

      debounce = setTimeout(
        () => void load(),
        500
      );
    };

    const channel = supabase.channel(
      `calendar-list-${currentRole}-${weekStart}`
    );

    const tables = [
      "schedules",
      "disposal_sites",
      "users",
      "waste_reports",
      "status",
      "collections",
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
      if (debounce) {
        clearTimeout(debounce);
      }

      void supabase.removeChannel(
        channel
      );
    };
  }, [
    currentRole,
    weekStart,
    load,
  ]);

  // ========================================
  // DATE NAVIGATION
  // ========================================

  function selectDay(day: Date) {
    const dateToOpen =
      dateKey(day);

    if (dateToOpen === selectedKey) {
      navigate(
        `/${currentRole}/calendar`
      );

      return;
    }

    navigate(
      `/${currentRole}/calendar/list/${dateToOpen}`
    );
  }

  function moveWeek(direction: number) {
    selectDay(
      new Date(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate() +
          7 * direction
      )
    );
  }

  // ========================================
  // UI
  // ========================================

  return (
    <main
      className="
        flex h-[calc(100dvh-5rem)]
        min-h-[420px] w-full
        flex-col overflow-hidden
        bg-white text-[#222]
      "
    >
      <section
        className="
          mx-auto flex min-h-0 w-full
          max-w-[460px] flex-1 flex-col
          px-3 pt-3
          pb-[max(10px,env(safe-area-inset-bottom))]
          sm:px-4 sm:pt-6
        "
      >
        {/* RED HEADER */}

        <header
          className="
            shrink-0 rounded-t-lg
            bg-[#c40000] px-2
            pb-7 pt-2
            sm:rounded-t-xl
            sm:px-4 sm:pb-8 sm:pt-3
          "
        >
          <h1
            className="
              text-[13px] font-extrabold
              text-white sm:text-lg
            "
          >
            Collection Schedule
          </h1>
        </header>

        <div
          className="
            relative -mt-3 flex min-h-0
            flex-1 flex-col rounded-t-xl
            bg-white px-2 pt-3
            sm:-mt-4 sm:rounded-t-2xl
            sm:px-3 sm:pt-4
          "
        >
          {/* WEEKLY CALENDAR */}

          <section
            aria-label="Weekly collection calendar"
            className="
              shrink-0 rounded-xl
              border border-[#cecece]
              bg-white px-1 pb-1.5
              shadow-[0_2px_3px_rgba(0,0,0,0.15)]
              sm:px-2 sm:pb-2
            "
          >
            <div
              className="
                flex h-9 items-center
                justify-between sm:h-11
              "
            >
              <button
                type="button"
                onClick={() => moveWeek(-1)}
                aria-label="Previous week"
                className="
                  grid h-9 w-9 place-items-center
                  rounded-full hover:bg-red-50
                "
              >
                <ChevronLeft size={18} />
              </button>

              <Link
                to={`/${currentRole}/calendar`}
                className="
                  text-[12px] font-extrabold
                  text-[#191919] sm:text-base
                "
              >
                {selected.toLocaleDateString(
                  "en-US",
                  {
                    month: "long",
                    year: "numeric",
                  }
                )}
              </Link>

              <button
                type="button"
                onClick={() => moveWeek(1)}
                aria-label="Next week"
                className="
                  grid h-9 w-9 place-items-center
                  rounded-full hover:bg-red-50
                "
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div
              className="
                grid grid-cols-7 text-center
              "
            >
              {weekDays.map((day) => {
                const key =
                  dateKey(day);

                return (
                  <div
                    key={key}
                    className="min-w-0"
                  >
                    <p
                      className="
                        py-1 text-[10px] leading-3
                        sm:text-xs
                      "
                    >
                      {day.toLocaleDateString(
                        "en-US",
                        {
                          weekday: "short",
                        }
                      )}
                    </p>

                    <button
                      type="button"
                      aria-pressed={
                        key === selectedKey
                      }
                      aria-current={
                        key === today
                          ? "date"
                          : undefined
                      }
                      aria-label={day.toLocaleDateString(
                        "en-US",
                        {
                          dateStyle: "full",
                        }
                      )}
                      onClick={() => selectDay(day)}
                      className="
                        flex h-9 w-full
                        flex-col items-center
                        justify-center rounded-md
                        hover:bg-red-50
                        focus-visible:outline
                        focus-visible:outline-2
                        focus-visible:outline-red-600
                        sm:h-10
                      "
                    >
                      <span
                        className={`
                          grid h-5 w-5
                          place-items-center
                          rounded-full
                          text-[11px]
                          sm:h-6 sm:w-6
                          sm:text-[13px]
                          ${
                            key === selectedKey
                              ? "bg-[#ff9ba8] font-bold"
                              : ""
                          }
                          ${
                            key === today
                              ? "text-blue-700"
                              : "text-black"
                          }
                        `}
                      >
                        {day.getDate()}
                      </span>

                      <span
                        aria-hidden="true"
                        className="
                          mt-0.5 flex h-1.5
                          items-center justify-center
                          gap-0.5
                        "
                      >
                        {(dots[key] ?? [])
                          .slice(0, 3)
                          .map((dot) => (
                            <span
                              key={dot}
                              className={`
                                h-[5px] w-[5px]
                                rounded-full
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

          {/* RESIDENT BANNER */}

          {resident && (
            <div
              className="
                mt-2 flex shrink-0
                items-center gap-1.5
                rounded bg-[#ffe4e9]
                px-2 py-1.5
              "
            >
              <CircleAlert
                size={14}
                className="
                  shrink-0 text-[#f3264c]
                "
              />

              <p
                className="
                  text-[11px] leading-4
                "
              >
                Schedules are based on the latest
                waste level reports.
              </p>
            </div>
          )}

          {/* SECTION HEADING */}

          <div
            className="
              flex shrink-0 items-center
              justify-between gap-2 py-2
            "
          >
            <h2
              className="
                text-[12px] font-extrabold
                sm:text-base
              "
            >
              Collection Schedule
            </h2>

            <span
              className="
                text-[10px] text-neutral-600
                sm:text-xs
              "
            >
              {loading
                ? "Loading..."
                : `${visible.length} site(s)`}
            </span>
          </div>

          {/* COLLECTION CARDS */}

          <div
            role="region"
            aria-label="Collection schedules"
            aria-busy={loading}
            tabIndex={0}
            className="
              min-h-0 flex-1 space-y-2
              overflow-y-auto
              overscroll-contain px-px pb-4
              [scrollbar-width:none]
              [&::-webkit-scrollbar]:hidden
              sm:space-y-2.5
            "
          >
            {loading ? (
              <p
                role="status"
                className="
                  py-8 text-center
                  text-xs text-neutral-600
                  sm:text-sm
                "
              >
                Loading schedules...
              </p>
            ) : error ? (
              <div
                role="alert"
                className="
                  rounded-lg border
                  border-red-200 bg-red-50
                  p-3 text-xs text-red-700
                  sm:text-sm
                "
              >
                {error}

                <button
                  type="button"
                  onClick={() => void load()}
                  className="
                    mt-2 block
                    font-semibold underline
                  "
                >
                  Try again
                </button>
              </div>
            ) : visible.length === 0 ? (
              <p
                className="
                  rounded-lg border
                  border-[#f5b4bc]
                  bg-[#fff7f8] p-3
                  text-center text-xs
                  text-neutral-600
                "
              >
                No schedules available for this period.
              </p>
            ) : (
              visible.map((item) => {
                const label = resident
                  ? item.type
                  : item.status;

                const background = resident
                  ? badgeColor(item.type)
                  : collectionStatusColor(
                      item.status
                    );

                const whiteText = [
                  "Priority Collection",
                  "Delayed",
                  "Collected",
                  "In Progress",
                  "Cancelled",
                ].includes(label);

                // =====================================
                // STATUS-BASED NAVIGATION
                // =====================================

                // Collector Pending/In Progress/Delayed:
                // WasteCollection.tsx
                //
                // Collector Collected/Completed:
                // ScheduleDetails.tsx
                //
                // Resident:
                // ScheduleDetails.tsx

                const detailsPath =
                  !resident &&
                  item.status !== "Collected" &&
                  item.status !== "Cancelled"
                    ? `/collector/waste-collection/${item.id}`
                    : `/${currentRole}/schedule-details/${item.id}`;

                // Information passed to destination.
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
                  <Link
                    key={item.id}
                    to={detailsPath}
                    state={{
                      scheduleId: item.id,
                      siteId: item.siteId,
                      schedule: item,
                      site,
                      collection: site,
                    }}
                    aria-label={`${item.name}, ${item.status}. View schedule`}
                    className="
                      group relative block
                      overflow-hidden rounded-[10px]
                      border border-[#f3aab4]
                      bg-[#fff6f7]
                      shadow-[0_2px_2px_rgba(0,0,0,0.16)]
                      focus-visible:outline
                      focus-visible:outline-2
                      focus-visible:outline-red-600
                    "
                  >
                    {/* STATUS BADGE */}

                    <span
                      className={`
                        absolute right-1.5 top-1
                        max-w-[calc(100%-12px)]
                        truncate rounded-full
                        px-2 py-0.5 text-[9px]
                        font-semibold leading-tight
                        sm:text-[11px]
                        ${background}
                        ${
                          whiteText
                            ? "text-white"
                            : "text-[#222]"
                        }
                      `}
                    >
                      {label}
                    </span>

                    {/* CARD BODY */}

                    <div
                      className="
                        flex min-w-0 items-start
                        gap-2 px-2 pb-1.5 pt-5
                        sm:gap-2.5 sm:px-3
                        sm:pb-2 sm:pt-7
                      "
                    >
                      <span
                        aria-hidden="true"
                        className="
                          grid h-9 w-9 shrink-0
                          place-items-center
                          rounded-md bg-[#ffa7b1]
                          text-[#ff1938]
                          sm:h-12 sm:w-12
                        "
                      >
                        <Trash2
                          size={26}
                          strokeWidth={2.6}
                          className="
                            sm:h-8 sm:w-8
                          "
                        />
                      </span>

                      <div className="min-w-0 flex-1">
                        <h3
                          className="
                            break-words text-[12px]
                            font-extrabold leading-4
                            text-[#161616]
                            sm:text-[15px]
                          "
                        >
                          {item.name}
                        </h3>

                        <p
                          className="
                            mt-0.5 flex items-start
                            gap-1 text-[10px]
                            leading-4 text-neutral-700
                            sm:text-xs
                          "
                        >
                          <MapPin
                            className="
                              mt-0.5 h-3 w-3 shrink-0
                            "
                            aria-hidden="true"
                          />

                          <span
                            className="
                              min-w-0 break-words
                            "
                          >
                            {item.address}
                          </span>
                        </p>

                        <p
                          className="
                            mt-0.5 flex items-center
                            gap-1 text-[10px]
                            leading-4 text-neutral-700
                            sm:text-xs
                          "
                        >
                          <Clock3
                            className="
                              h-3 w-3 shrink-0
                            "
                            aria-hidden="true"
                          />

                          <span>
                            {item.time}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* CARD FOOTER */}

                    <div
                      className="
                        flex min-h-[20px]
                        items-center justify-between
                        gap-2 border-t
                        border-[#f8d6db]
                        px-2 sm:min-h-[30px]
                        sm:px-3
                      "
                    >
                      {resident ? (
                        <p
                          className="
                            flex min-w-0 flex-1
                            items-center gap-1
                            text-[10px]
                            text-neutral-700
                            sm:text-xs
                          "
                        >
                          <UserRound
                            className="
                              h-3 w-3 shrink-0
                            "
                            aria-hidden="true"
                          />

                          <span
                            className="
                              min-w-0 truncate
                            "
                          >
                            Collector: {item.collector}
                          </span>
                        </p>
                      ) : (
                        <span className="flex-1" />
                      )}

                      <span
                        className="
                          flex min-h-[24px]
                          items-center gap-0.5
                          whitespace-nowrap
                          text-[10px] font-medium
                          text-[#b91c2d]
                          group-hover:underline
                          sm:min-h-9 sm:text-xs
                        "
                      >
                        View details

                        <ChevronRight
                          size={13}
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
