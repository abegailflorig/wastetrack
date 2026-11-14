
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarClock,
  Check,
  Clock3,
  Truck,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

type Filter = "All" | "Collection" | "Reminders";
type Kind = "assigned" | "urgent" | "soon" | "delayed" | "completed" | "general";
type Tone = "success" | "danger" | "warning" | "info";

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
  created_at: string;
};

type SiteRow = {
  site_id: string;
  site_name: string;
  assigned_collector: string | null;
};

type CollectionRow = {
  schedule_id: string;
  collection_status: string;
  completed_at: string | null;
};

type ReportRow = {
  report_id: string;
  cnn_detection_level: string | null;
};

type SavedNotification = {
  notification_id: string;
  title: string;
  message: string;
  schedule_id: string | null;
  notification_type: "report" | "schedule" | "collection" | "system";
  is_read: boolean;
  created_at: string;
};

type NotificationItem = {
  id: string;
  source: "database" | "automatic";
  title: string;
  message: string;
  createdAt: string;
  kind: Kind;
  tone: Tone;
  category: "Collection" | "Reminders";
  read: boolean;
  scheduleId: string | null;
  destination: string | null;
};

// ========================================
// CONSTANTS
// ========================================

const PAGE_SIZE = 100;
const SOON_MINUTES = 60;
const FILTERS: Filter[] = ["All", "Collection", "Reminders"];

// ========================================
// HELPERS
// ========================================

function textOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to load notifications.";
}

function manilaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function scheduleTime(schedule: ScheduleRow): number | null {
  const match = schedule.collection_time?.match(
    /^(\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (!match || +match[1] > 23 || +match[2] > 59) {
    return null;
  }

  const date = Date.parse(
    `${schedule.date}T${match[1]}:${match[2]}:${match[3] || "00"}+08:00`
  );

  return Number.isFinite(date) ? date : null;
}

function timeLabel(time: string | null): string {
  const match = time?.match(/^(\d{2}):(\d{2})/);

  if (!match) {
    return "time not specified";
  }

  const hour = +match[1];

  return `${hour % 12 || 12}:${match[2]} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString(
    "en-PH",
    {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
    }
  );
}

function relativeTime(iso: string, now: number): string {
  const timestamp = Date.parse(iso);

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const ms = now - timestamp;

  if (ms < 0) return "Upcoming";
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) {
    return `${Math.floor(ms / 60_000)} min ago`;
  }
  if (ms < 86_400_000) {
    return `${Math.floor(ms / 3_600_000)} hr ago`;
  }

  if (ms < 604_800_000) {
    const d = Math.floor(ms / 86_400_000);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }

  return new Date(timestamp).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
  });
}

// ========================================
// AUTOMATIC NOTIFICATION READ STATUS
// ========================================

// Automatically calculated notices are saved
// locally as read. Actual notifications table
// records use Supabase notifications.is_read.

function readKey(userId: string) {
  return `wastetrack:collector-notification-read:${userId}`;
}

function getLocalReads(userId: string): Set<string> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(readKey(userId)) || "[]"
    );

    return new Set(
      Array.isArray(value)
        ? value.filter(
            (v): v is string => typeof v === "string"
          )
        : []
    );
  } catch {
    return new Set();
  }
}

function storeLocalReads(userId: string, ids: string[]) {
  try {
    const reads = getLocalReads(userId);

    ids.forEach((id) => reads.add(id));

    localStorage.setItem(
      readKey(userId),
      JSON.stringify([...reads].slice(-2000))
    );
  } catch {
    // Browser storage may be unavailable.
  }
}

// ========================================
// FETCH ASSIGNED SCHEDULES FROM SUPABASE
// ========================================

async function fetchSchedules(userId: string, today: string) {
  const minDate = addDays(today, -90);
  const maxDate = addDays(today, 90);

  const columns =
    "schedule_id,site_id,assigned_collector_id,source_report_id,date,collection_time,collection_type,status,date_completed,created_at";

  // Get schedules assigned directly to collector.

  const {
    data: direct,
    error: directError,
  } = await supabase
    .from("schedules")
    .select(columns)
    .eq("assigned_collector_id", userId)
    .gte("date", minDate)
    .lte("date", maxDate)
    .order("date", { ascending: false })
    .limit(1000);

  if (directError) {
    throw new Error(`schedules: ${directError.message}`);
  }

  // Get sites assigned to collector.

  const {
    data: assigned,
    error: assignedError,
  } = await supabase
    .from("disposal_sites")
    .select("site_id,site_name,assigned_collector")
    .eq("assigned_collector", userId);

  if (assignedError) {
    throw new Error(
      `disposal_sites: ${assignedError.message}`
    );
  }

  const assignedSites = (assigned ?? []) as SiteRow[];

  // Find schedules whose collector is assigned
  // through disposal_sites rather than schedules.

  const fallback: ScheduleRow[] = [];

  for (let i = 0; i < assignedSites.length; i += 50) {
    const ids = assignedSites
      .slice(i, i + 50)
      .map((site) => site.site_id);

    const { data, error } = await supabase
      .from("schedules")
      .select(columns)
      .is("assigned_collector_id", null)
      .in("site_id", ids)
      .gte("date", minDate)
      .lte("date", maxDate)
      .limit(1000);

    if (error) {
      throw new Error(`schedules: ${error.message}`);
    }

    fallback.push(...((data ?? []) as ScheduleRow[]));
  }

  // Remove duplicate and cancelled schedules.

  const rows = [
    ...new Map(
      [
        ...((direct ?? []) as ScheduleRow[]),
        ...fallback,
      ].map((row) => [
        row.schedule_id,
        row,
      ])
    ).values(),
  ].filter((row) => row.status !== "Cancelled");

  // Get disposal site names.

  const allSiteIds = [
    ...new Set(rows.map((row) => row.site_id)),
  ];

  const sites = new Map(
    assignedSites.map((site) => [
      site.site_id,
      site.site_name,
    ])
  );

  const missingIds = allSiteIds.filter(
    (id) => !sites.has(id)
  );

  for (let i = 0; i < missingIds.length; i += 50) {
    const { data, error } = await supabase
      .from("disposal_sites")
      .select("site_id,site_name,assigned_collector")
      .in("site_id", missingIds.slice(i, i + 50));

    if (error) {
      throw new Error(
        `disposal_sites: ${error.message}`
      );
    }

    ((data ?? []) as SiteRow[]).forEach((site) =>
      sites.set(site.site_id, site.site_name)
    );
  }

  return {
    rows,
    sites,
  };
}

// ========================================
// FETCH COLLECTION RESULTS
// ========================================

async function fetchCollections(
  ids: string[]
): Promise<CollectionRow[]> {
  const result: CollectionRow[] = [];

  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabase
      .from("collections")
      .select(
        "schedule_id,collection_status,completed_at"
      )
      .in("schedule_id", ids.slice(i, i + 50));

    if (error) {
      throw new Error(
        `collections: ${error.message}`
      );
    }

    result.push(...((data ?? []) as CollectionRow[]));
  }

  return result;
}

// ========================================
// FETCH CNN WASTE LEVELS
// ========================================

async function fetchLevels(
  ids: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabase
      .from("waste_reports")
      .select("report_id,cnn_detection_level")
      .in("report_id", ids.slice(i, i + 50));

    if (error) {
      throw new Error(
        `waste_reports: ${error.message}`
      );
    }

    ((data ?? []) as ReportRow[]).forEach((row) =>
      result.set(
        row.report_id,
        row.cnn_detection_level || ""
      )
    );
  }

  return result;
}

// ========================================
// IDENTIFY SAVED NOTIFICATION TYPE
// ========================================

function savedKind(title: string): Kind {
  const t = title.toLowerCase();

  if (/complet|collected|successful/.test(t)) {
    return "completed";
  }

  if (/delay|overdue|not collected/.test(t)) {
    return "delayed";
  }

  if (/urgent|priority|full|overflow/.test(t)) {
    return "urgent";
  }

  if (/soon|remind|approach|almost|due/.test(t)) {
    return "soon";
  }

  if (/assign|scheduled|task/.test(t)) {
    return "assigned";
  }

  return "general";
}

// ========================================
// BUILD NOTIFICATION FEED
// ========================================

function buildFeed(
  saved: SavedNotification[],
  schedules: ScheduleRow[],
  sites: Map<string, string>,
  collections: CollectionRow[],
  levels: Map<string, string>,
  userId: string,
  now: number
): NotificationItem[] {
  const localReads = getLocalReads(userId);

  const results = new Map(
    collections.map((row) => [
      row.schedule_id,
      row,
    ])
  );

  const knownSchedules = new Map(
    schedules.map((row) => [
      row.schedule_id,
      row,
    ])
  );

  // Collection results take priority
  // over schedules.status.

  const completed = (row: ScheduleRow) => {
    const result = results.get(row.schedule_id);

    return result
      ? result.collection_status === "Collected"
      : row.status === "Collected";
  };

  // Prevent duplicate notifications.

  const eventKeys = new Set(
    saved
      .filter((row) => row.schedule_id)
      .map(
        (row) =>
          `${row.schedule_id}:${savedKind(row.title)}`
      )
  );

  // ========================================
  // NOTIFICATIONS ALREADY SAVED IN DATABASE
  // ========================================

  const feed: NotificationItem[] = saved.map(
    (row) => {
      const kind = savedKind(row.title);

      const linked = row.schedule_id
        ? knownSchedules.get(row.schedule_id)
        : undefined;

      const isCompleted = linked
        ? completed(linked)
        : kind === "completed";

      return {
        id: `database:${row.notification_id}`,
        source: "database",
        title: row.title,
        message: row.message,
        createdAt: row.created_at,
        kind,

        tone:
          kind === "completed"
            ? "success"
            : kind === "urgent" ||
                kind === "delayed"
              ? "danger"
              : kind === "soon"
                ? "warning"
                : "info",

        category:
          kind === "soon" ||
          kind === "delayed"
            ? "Reminders"
            : "Collection",

        read: row.is_read,
        scheduleId: row.schedule_id,

        destination: row.schedule_id
          ? isCompleted
            ? `/collector/schedule-details/${row.schedule_id}`
            : `/collector/waste-collection/${row.schedule_id}`
          : null,
      };
    }
  );

  // ========================================
  // ADD AUTOMATIC NOTIFICATION
  // ========================================

  function add(
    row: ScheduleRow,
    kind: Kind,
    title: string,
    message: string,
    createdAt: string,
    tone: Tone,
    category: "Collection" | "Reminders"
  ) {
    if (
      eventKeys.has(`${row.schedule_id}:${kind}`)
    ) {
      return;
    }

    const id =
      `automatic:${row.schedule_id}:${kind}`;

    feed.push({
      id,
      source: "automatic",
      title,
      message,
      createdAt,
      kind,
      tone,
      category,
      read: localReads.has(id),
      scheduleId: row.schedule_id,

      destination: completed(row)
        ? `/collector/schedule-details/${row.schedule_id}`
        : `/collector/waste-collection/${row.schedule_id}`,
    });
  }

  // ========================================
  // AUTOMATIC NOTIFICATIONS
  // ========================================

  for (const row of schedules) {
    const result = results.get(row.schedule_id);

    const name =
      sites.get(row.site_id) || "Disposal site";

    const when =
      `${dateLabel(row.date)} at ` +
      `${timeLabel(row.collection_time)}`;

    const due = scheduleTime(row);

    // ====================================
    // COLLECTION COMPLETED
    // ====================================

    if (completed(row)) {
      add(
        row,
        "completed",
        "Collection Completed",
        `${name} collection completed successfully.`,
        result?.completed_at ||
          row.date_completed ||
          row.created_at,
        "success",
        "Collection"
      );

      continue;
    }

    // ====================================
    // NEW ASSIGNED COLLECTION
    // ====================================

    add(
      row,
      "assigned",
      "Collection Task Assigned",
      `You have been assigned to collect waste at ${name} on ${when}.`,
      row.created_at,
      "info",
      "Collection"
    );

    // ====================================
    // URGENT / FULL WASTE BIN
    // ====================================

    const full =
      row.source_report_id &&
      levels
        .get(row.source_report_id)
        ?.toUpperCase() === "FULL";

    if (
      row.collection_type ===
        "Priority Collection" ||
      full
    ) {
      add(
        row,
        "urgent",

        full
          ? "Waste Bin Overflow"
          : "Urgent Collection Required",

        full
          ? `The bin at ${name} is marked FULL. Collection needed.`
          : `${name} has a priority collection task. Please collect as soon as possible.`,

        row.created_at,
        "danger",
        "Collection"
      );
    }

    // ====================================
    // DELAYED COLLECTION
    // ====================================

    const isOverdue =
      due !== null
        ? due < now
        : row.date < manilaDate(new Date(now));

    const notCollected =
      result?.collection_status ===
      "Not Collected";

    if (notCollected || isOverdue) {
      add(
        row,
        "delayed",
        "Collection Delayed",

        notCollected
          ? `${name} was marked Not Collected. Collection is still needed.`
          : `The collection scheduled for ${when} at ${name} is overdue.`,

        due !== null
          ? new Date(due).toISOString()
          : row.created_at,

        "danger",
        "Reminders"
      );
    } else if (
      due !== null &&
      due - now <= SOON_MINUTES * 60_000
    ) {
      // ====================================
      // COLLECTION TIME APPROACHING
      // ====================================

      const minutes = Math.max(
        0,
        Math.ceil((due - now) / 60_000)
      );

      add(
        row,
        "soon",

        minutes <= 15
          ? "Collection Time Almost Here"
          : "Collection Due Soon",

        `${name}: collection starts ${
          minutes <= 1
            ? "now"
            : `in ${minutes} minutes`
        } (${timeLabel(row.collection_time)}).`,

        new Date(
          due - SOON_MINUTES * 60_000
        ).toISOString(),

        "warning",
        "Reminders"
      );
    }
  }

  // Unread notifications first,
  // newest notifications next.

  return feed.sort((a, b) => {
    if (a.read !== b.read) {
      return Number(a.read) - Number(b.read);
    }

    return (
      Date.parse(b.createdAt) -
      Date.parse(a.createdAt)
    );
  });
}

// ========================================
// NOTIFICATION COLORS
// ========================================

const COLORS: Record<
  Tone,
  {
    stripe: string;
    heading: string;
  }
> = {
  success: {
    stripe: "border-l-[#a3b77b]",
    heading: "text-[#89a35f]",
  },

  danger: {
    stripe: "border-l-[#ff1536]",
    heading: "text-[#ed1028]",
  },

  warning: {
    stripe: "border-l-[#f8b84f]",
    heading: "text-[#b77821]",
  },

  info: {
    stripe: "border-l-[#ec4b59]",
    heading: "text-[#d32233]",
  },
};

// ========================================
// NOTIFICATION ICONS
// ========================================

function NoticeIcon({
  kind,
}: {
  kind: Kind;
}) {
  if (kind === "completed") {
    return (
      <span
        className="
          grid h-8 w-8
          shrink-0 place-items-center
          rounded-full
          bg-[#c8f5e9]
          text-[#00a997]
        "
      >
        <Truck
          size={18}
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </span>
    );
  }

  if (kind === "urgent") {
    return (
      <span
        className="
          grid h-8 w-8
          shrink-0 place-items-center
        "
        aria-hidden="true"
      >
        <span
          className="
            h-[17px] w-[17px]
            rounded-full bg-[#ff1332]
          "
        />
      </span>
    );
  }

  if (kind === "delayed") {
    return (
      <span
        className="
          grid h-8 w-8
          shrink-0 place-items-center
        "
        aria-hidden="true"
      >
        <AlertTriangle
          size={24}
          fill="#ffe273"
          stroke="#ff2338"
          strokeWidth={1.5}
        />
      </span>
    );
  }

  return (
    <span
      className="
        grid h-8 w-8
        shrink-0 place-items-center
        rounded-full bg-[#ffeded]
        text-[#ff2338]
      "
    >
      {kind === "soon" ? (
        <CalendarClock size={18} />
      ) : kind === "assigned" ? (
        <Bell size={19} />
      ) : (
        <Clock3 size={18} />
      )}
    </span>
  );
}

// ========================================
// MAIN COLLECTOR NOTIFICATIONS COMPONENT
// ========================================

export default function CollectorNotifications() {
  const navigate = useNavigate();

  const [filter, setFilter] =
    useState<Filter>("All");

  const [items, setItems] =
    useState<NotificationItem[]>([]);

  const [userId, setUserId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [actionError, setActionError] =
    useState("");

  const [working, setWorking] =
    useState(false);

  const [now, setNow] =
    useState(Date.now());

  const sequence = useRef(0);

  // ========================================
  // LOAD SUPABASE NOTIFICATIONS
  // ========================================

  const load = useCallback(
    async (background = false) => {
      const request = ++sequence.current;

      if (!background) {
        setLoading(true);
      }

      try {
        // ====================================
        // AUTHENTICATED USER
        // ====================================

        const {
          data: auth,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!auth.user) {
          navigate("/login", {
            replace: true,
          });

          return;
        }

        // ====================================
        // VERIFY COLLECTOR ROLE
        // ====================================

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("users")
          .select("role,is_active")
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
          profile.role !== "collector" ||
          !profile.is_active
        ) {
          throw new Error(
            "An active collector account is required."
          );
        }

        // ====================================
        // GET CURRENT PHILIPPINE DATE
        // ====================================

        const snapshot = Date.now();

        // ====================================
        // ASSIGNED COLLECTION SCHEDULES
        // ====================================

        const {
          rows,
          sites,
        } = await fetchSchedules(
          auth.user.id,
          manilaDate(new Date(snapshot))
        );

        const scheduleIds = rows.map(
          (row) => row.schedule_id
        );

        const reportIds = [
          ...new Set(
            rows.flatMap((row) =>
              row.source_report_id
                ? [row.source_report_id]
                : []
            )
          ),
        ];

        // ====================================
        // COLLECTION RESULTS + CNN + NOTIFS
        // ====================================

        const [
          collections,
          levels,
          savedResult,
        ] = await Promise.all([
          fetchCollections(scheduleIds),

          fetchLevels(reportIds),

          supabase
            .from("notifications")
            .select(
              "notification_id,title,message,schedule_id,notification_type,is_read,created_at"
            )
            .eq(
              "user_id",
              auth.user.id
            )
            .order(
              "created_at",
              {
                ascending: false,
              }
            )
            .limit(200),
        ]);

        const saved = savedResult.error
          ? []
          : ((savedResult.data ?? []) as SavedNotification[]);

        if (request !== sequence.current) {
          return;
        }

        // ====================================
        // BUILD NOTIFICATION FEED
        // ====================================

        setUserId(auth.user.id);

        setItems(
          buildFeed(
            saved,
            rows,
            sites,
            collections,
            levels,
            auth.user.id,
            snapshot
          )
        );

        setNow(snapshot);
        setError("");

        setActionError(
          savedResult.error
            ? `Saved notifications are unavailable: ${savedResult.error.message}`
            : ""
        );
      } catch (failure) {
        if (request === sequence.current) {
          console.error(
            "[WasteTrack] CollectorNotifications:",
            failure
          );

          setError(textOf(failure));
        }
      } finally {
        if (request === sequence.current) {
          setLoading(false);
        }
      }
    },
    [navigate]
  );

  // ========================================
  // AUTOMATIC REFRESH + REALTIME
  // ========================================

  useEffect(() => {
    void load();

    // Check for new notifications every 45s
    // while the page is open and visible.

    const interval = window.setInterval(() => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void load(true);
      }
    }, 45_000);

    const onFocus = () => {
      void load(true);
    };

    window.addEventListener(
      "focus",
      onFocus
    );

    // ====================================
    // REALTIME SUPABASE LISTENERS
    // ====================================

    const channel = supabase.channel(
      "collector-notifications-live"
    );

    for (const table of [
      "notifications",
      "schedules",
      "collections",
      "waste_reports",
      "disposal_sites",
    ]) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        () => void load(true)
      );
    }

    channel.subscribe();

    return () => {
      sequence.current += 1;

      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        onFocus
      );

      void supabase.removeChannel(channel);
    };
  }, [load]);

  // ========================================
  // FILTER NOTIFICATIONS
  // ========================================

  const visible = useMemo(
    () =>
      filter === "All"
        ? items
        : items.filter(
            (item) => item.category === filter
          ),
    [filter, items]
  );

  const unread = items.filter(
    (item) => !item.read
  ).length;

  // ========================================
  // MARK ONE NOTIFICATION AS READ
  // ========================================

  async function markOneRead(
    item: NotificationItem
  ): Promise<boolean> {
    if (!userId || item.read) {
      return true;
    }

    if (item.source === "database") {
      const {
        error: updateError,
      } = await supabase
        .from("notifications")
        .update({
          is_read: true,
        })
        .eq(
          "notification_id",
          item.id.replace(
            /^database:/,
            ""
          )
        )
        .eq(
          "user_id",
          userId
        );

      if (updateError) {
        setActionError(
          `Could not mark notification as read: ${updateError.message}`
        );

        return false;
      }
    } else {
      storeLocalReads(
        userId,
        [item.id]
      );
    }

    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              read: true,
            }
          : entry
      )
    );

    return true;
  }

  // ========================================
  // OPEN NOTIFICATION
  // ========================================

  async function openNotice(
    item: NotificationItem
  ) {
    if (!item.read) {
      await markOneRead(item);
    }

    if (item.destination) {
      navigate(
        item.destination,
        {
          state: {
            scheduleId:
              item.scheduleId,
          },
        }
      );
    }
  }

  // ========================================
  // MARK ALL NOTIFICATIONS AS READ
  // ========================================

  async function markAllRead() {
    if (
      !userId ||
      working ||
      !unread
    ) {
      return;
    }

    setWorking(true);
    setActionError("");

    try {
      const automatic = items
        .filter(
          (item) =>
            !item.read &&
            item.source === "automatic"
        )
        .map((item) => item.id);

      storeLocalReads(
        userId,
        automatic
      );

      const hasSavedUnread = items.some(
        (item) =>
          !item.read &&
          item.source === "database"
      );

      let savedSucceeded = true;

      if (hasSavedUnread) {
        const {
          error: updateError,
        } = await supabase
          .from("notifications")
          .update({
            is_read: true,
          })
          .eq(
            "user_id",
            userId
          )
          .eq(
            "is_read",
            false
          );

        if (updateError) {
          savedSucceeded = false;

          setActionError(
            `Could not update saved notifications: ${updateError.message}`
          );
        }
      }

      setItems((current) =>
        current.map((item) =>
          item.source === "automatic" ||
          savedSucceeded
            ? {
                ...item,
                read: true,
              }
            : item
        )
      );
    } finally {
      setWorking(false);
    }
  }

  // ========================================
  // RESPONSIVE UI
  // ========================================

  return (
    <main
      className="
        flex h-[calc(100dvh-5rem)]
        min-h-[350px] w-full
        flex-col overflow-hidden
        bg-white text-neutral-900
      "
    >
      <div
        className="
          mx-auto flex min-h-0
          w-full max-w-[450px]
          flex-1 flex-col
          px-3 pb-3 pt-3
          sm:px-4 sm:pt-6
        "
      >
        {/* ====================================
            NOTIFICATION HEADER
        ==================================== */}

        <header
          className="
            flex shrink-0 items-center
            gap-1 pb-2.5
          "
        >
          <Link
            to="/collector/dashboard"
            aria-label="Back to dashboard"
            className="
              grid h-9 w-9
              shrink-0 place-items-center
              rounded-full
              hover:bg-neutral-100
              focus-visible:outline-2
              focus-visible:outline-red-600
            "
          >
            <ArrowLeft
              size={21}
              strokeWidth={1.9}
            />
          </Link>

          <h1
            className="
              text-[17px] font-extrabold
              text-black sm:text-xl
            "
          >
            Notifications
          </h1>
        </header>

        {/* ====================================
            RED NOTIFICATION BANNER
        ==================================== */}

        <section
          className="
            flex shrink-0 items-center
            gap-2.5 rounded-lg
            bg-gradient-to-r
            from-[#f6172c]
            to-[#b50000]
            px-3 py-2.5
            text-white shadow-sm
          "
        >
          <span
            className="
              grid h-9 w-9
              shrink-0 place-items-center
              rounded-full
              bg-[#ff263d]
            "
          >
            <Bell
              size={23}
              fill="white"
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </span>

          <div className="min-w-0">
            <h2
              className="
                text-[12px] font-extrabold
                leading-[17px] sm:text-sm
              "
            >
              Stay updated, stay informed.
            </h2>

            <p
              className="
                mt-0.5 text-[11px]
                leading-4 text-white/95
                sm:text-xs
              "
            >
              Here are the latest updates, and alerts.
            </p>
          </div>
        </section>

        {/* ====================================
            MARK ALL READ BUTTON
        ==================================== */}

        <div
          className="
            flex shrink-0 justify-end
            py-1.5
          "
        >
          <button
            type="button"
            onClick={() =>
              void markAllRead()
            }
            disabled={
              working ||
              loading ||
              unread === 0
            }
            className="
              min-h-7 rounded px-1
              text-[12px] font-medium
              text-[#ff1633]
              hover:underline
              disabled:opacity-50
              sm:text-[13px]
            "
          >
            Mark all read
          </button>
        </div>

        {/* ====================================
            NOTIFICATION FILTERS
        ==================================== */}

        <div
          role="group"
          aria-label="Notification filters"
          className="
            flex shrink-0
            items-center justify-center
            gap-2 pb-3
            sm:gap-2.5
          "
        >
          {FILTERS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={
                filter === tab
              }
              onClick={() =>
                setFilter(tab)
              }
              className={`
                min-h-8 rounded-full
                border px-2.5
                text-[12px]
                transition-colors
                min-[360px]:px-4
                sm:text-[13px]
                ${
                  filter === tab
                    ? "border-[#a4b77e] bg-[#a4b77e] font-bold text-white"
                    : "border-[#b4c08e] bg-white font-medium text-neutral-600 hover:bg-[#f3f7e8]"
                }
              `}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ====================================
            ERROR MESSAGE
        ==================================== */}

        {(error || actionError) && (
          <div
            role="alert"
            className="
              mb-3 rounded-lg
              border border-red-200
              bg-red-50 p-3
              text-[12px] leading-5
              text-red-700
            "
          >
            <p>
              {error || actionError}
            </p>

            {error && (
              <button
                type="button"
                onClick={() =>
                  void load()
                }
                className="
                  mt-1 font-bold underline
                "
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* ====================================
            NOTIFICATION LIST
        ==================================== */}

        <div
          aria-live="polite"
          aria-busy={loading}
          className="
            min-h-0 flex-1
            space-y-[18px]
            overflow-y-auto
            overscroll-contain
            pb-7
            [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden
          "
        >
          {/* LOADING */}

          {loading ? (
            <p
              role="status"
              className="
                py-8 text-center
                text-[13px]
                text-neutral-500
              "
            >
              Loading notifications...
            </p>
          ) : visible.length === 0 ? (
            /* ====================================
                EMPTY NOTIFICATIONS
            ==================================== */

            <div
              className="
                rounded-xl border
                border-neutral-200
                px-4 py-8 text-center
              "
            >
              <Check
                size={27}
                className="
                  mx-auto text-[#9bad78]
                "
                aria-hidden="true"
              />

              <p
                className="
                  mt-2 text-sm
                  font-semibold
                  text-neutral-700
                "
              >
                No notifications
              </p>

              <p
                className="
                  mt-1 text-xs
                  text-neutral-500
                "
              >
                Assigned tasks and collection updates
                will appear here.
              </p>
            </div>
          ) : (
            /* ====================================
                NOTIFICATION CARDS
            ==================================== */

            visible.map((item) => {
              const color =
                COLORS[item.tone];

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    void openNotice(item)
                  }
                  aria-label={`${item.title}. ${item.message}. ${
                    item.read
                      ? "Read"
                      : "Unread"
                  }`}
                  className={`
                    flex w-full min-w-0
                    items-start gap-2
                    rounded-xl border
                    border-[#d0d0d0]
                    border-l-[9px]
                    bg-white
                    px-2 py-3
                    text-left
                    transition-colors
                    hover:bg-[#fffafa]
                    focus-visible:outline
                    focus-visible:outline-2
                    focus-visible:outline-offset-2
                    focus-visible:outline-red-600
                    sm:gap-2.5
                    sm:px-3
                    ${color.stripe}
                  `}
                >
                  {/* NOTIFICATION ICON */}

                  <NoticeIcon
                    kind={item.kind}
                  />

                  {/* NOTIFICATION CONTENT */}

                  <span
                    className="
                      min-w-0 flex-1
                    "
                  >
                    <span
                      className="
                        flex min-w-0
                        items-start
                        justify-between
                        gap-2
                      "
                    >
                      {/* NOTIFICATION TITLE */}

                      <span
                        className={`
                          min-w-0
                          break-words
                          text-[12px]
                          font-bold
                          leading-[17px]
                          sm:text-[13px]
                          ${color.heading}
                        `}
                      >
                        {item.title}
                      </span>

                      {/* NOTIFICATION TIME */}

                      <span
                        className="
                          shrink-0
                          whitespace-nowrap
                          text-[10px]
                          leading-[17px]
                          text-neutral-400
                          sm:text-[11px]
                        "
                      >
                        {relativeTime(
                          item.createdAt,
                          now
                        )}
                      </span>
                    </span>

                    {/* NOTIFICATION MESSAGE */}

                    <span
                      className="
                        mt-0.5 block
                        break-words
                        text-[12px]
                        leading-[17px]
                        text-neutral-500
                        sm:text-[13px]
                      "
                    >
                      {item.message}
                    </span>

                    {/* UNREAD STATUS */}

                    {!item.read && (
                      <span className="sr-only">
                        Unread notification
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
