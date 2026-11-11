
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router";

import {
  AlertCircle,
  ArrowUpRight,
  ClipboardList,
  Clock3,
  FileText,
  LoaderCircle,
  MapPin,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ========================================
// DATABASE TYPES
// ========================================

type SiteRow = {
  site_id: string;
  site_name: string;
  is_active: boolean;
};

type ReportRow = {
  report_id: string;
  user_id: string;
  site_id: string | null;
  date_uploaded: string;
  cnn_detection_level: string | null;
  site_description: string | null;
  address: string | null;
};

type StatusRow = {
  status_id: string;
  report_id: string;
  status: string;
  created_at: string;
};

type UserRow = {
  user_id: string;
  full_name: string | null;
};

type ScheduleRow = {
  schedule_id: string;
  site_id: string | null;
};

type CollectionRow = {
  collection_id: string;
  schedule_id: string | null;
  collection_status: string | null;
  completed_at: string | null;
};

type ReportLevel =
  | "Full"
  | "Near Full"
  | "Empty"
  | "Unknown";

type DashboardReport = {
  id: string;
  site: string;
  by: string;
  date: string;
  level: ReportLevel;
};

type DashboardData = {
  fullBins: number;
  nearFullBins: number;
  pendingReports: number;
  recentReports: DashboardReport[];
  adminName: string;
};

type SourceTable =
  | "disposal_sites"
  | "waste_reports"
  | "status"
  | "users"
  | "schedules"
  | "collections";

// ========================================
// SUPABASE PAGINATION
// ========================================

const PAGE_SIZE = 500;

async function fetchAllRows<T>(
  table: SourceTable,
  columns: string,
  orderColumn: string,
  idColumn: string
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    let request = supabase
      .from(table)
      .select(columns)
      .order(orderColumn, {
        ascending: false,
      });

    if (orderColumn !== idColumn) {
      request = request.order(idColumn, {
        ascending: false,
      });
    }

    const { data, error } = await request.range(
      offset,
      offset + PAGE_SIZE - 1
    );

    if (error) {
      throw new Error(
        `${table}: ${error.message}`
      );
    }

    const rows = (data ?? []) as unknown as T[];

    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return allRows;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function getLevel(
  value: string | null
): ReportLevel {
  const normalized = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ");

  if (
    normalized === "FULL" ||
    normalized === "HIGH"
  ) {
    return "Full";
  }

  if (
    normalized === "NEAR FULL" ||
    normalized === "HALF FULL" ||
    normalized === "MEDIUM"
  ) {
    return "Near Full";
  }

  if (
    normalized === "EMPTY" ||
    normalized === "LOW"
  ) {
    return "Empty";
  }

  return "Unknown";
}

function isCompleted(
  value: string | null
): boolean {
  return [
    "collected",
    "completed",
    "done",
  ].includes(
    (value ?? "").trim().toLowerCase()
  );
}

function timeAgo(
  value: string,
  now: number
): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const minutes = Math.max(
    0,
    Math.floor((now - timestamp) / 60000)
  );

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  return new Date(timestamp).toLocaleDateString(
    "en-PH",
    {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

// ========================================
// BUILD DASHBOARD DATA
// ========================================

function buildDashboard(
  sites: SiteRow[],
  reports: ReportRow[],
  statuses: StatusRow[],
  users: UserRow[],
  schedules: ScheduleRow[],
  collections: CollectionRow[],
  adminName: string
): DashboardData {
  // ====================================
  // ACTIVE SITES
  // ====================================

  const activeSites = sites.filter(
    (site) => site.is_active === true
  );

  const siteMap = new Map(
    activeSites.map((site) => [
      site.site_id,
      site.site_name,
    ])
  );

  const userMap = new Map(
    users.map((user) => [
      user.user_id,
      user.full_name || "Unknown reporter",
    ])
  );

  const scheduleMap = new Map(
    schedules.map((schedule) => [
      schedule.schedule_id,
      schedule.site_id,
    ])
  );

  // ====================================
  // LATEST REPORT STATUS
  // ====================================

  const latestStatus = new Map<
    string,
    StatusRow
  >();

  for (const row of statuses) {
    const previous = latestStatus.get(
      row.report_id
    );

    if (
      !previous ||
      row.created_at > previous.created_at ||
      (
        row.created_at === previous.created_at &&
        row.status_id > previous.status_id
      )
    ) {
      latestStatus.set(row.report_id, row);
    }
  }

  // ====================================
  // PENDING REPORTS
  // ====================================

  const pendingReports = reports.filter(
    (report) => {
      const latest = latestStatus.get(
        report.report_id
      );

      return (
        latest?.status
          .trim()
          .toLowerCase() === "pending"
      );
    }
  ).length;

  // ====================================
  // COMPLETED COLLECTIONS BY SITE
  // ====================================

  const lastCollectionBySite = new Map<
    string,
    number
  >();

  for (const collection of collections) {
    if (
      !collection.schedule_id ||
      !collection.completed_at ||
      !isCompleted(collection.collection_status)
    ) {
      continue;
    }

    const siteId = scheduleMap.get(
      collection.schedule_id
    );

    if (!siteId || !siteMap.has(siteId)) {
      continue;
    }

    const completedTime = new Date(
      collection.completed_at
    ).getTime();

    if (!Number.isFinite(completedTime)) {
      continue;
    }

    const previous =
      lastCollectionBySite.get(siteId) ?? 0;

    if (completedTime > previous) {
      lastCollectionBySite.set(
        siteId,
        completedTime
      );
    }
  }

  // ====================================
  // LATEST REPORT PER SITE
  // ====================================

  const latestReportBySite = new Map<
    string,
    ReportRow
  >();

  for (const report of reports) {
    if (
      !report.site_id ||
      !siteMap.has(report.site_id)
    ) {
      continue;
    }

    const previous = latestReportBySite.get(
      report.site_id
    );

    if (
      !previous ||
      new Date(report.date_uploaded).getTime() >
        new Date(previous.date_uploaded).getTime()
    ) {
      latestReportBySite.set(
        report.site_id,
        report
      );
    }
  }

  // ====================================
  // CURRENT BIN LEVEL COUNTS
  // ====================================

  let fullBins = 0;
  let nearFullBins = 0;

  for (const [siteId, report] of latestReportBySite) {
    const reportTime = new Date(
      report.date_uploaded
    ).getTime();

    const lastCollection =
      lastCollectionBySite.get(siteId) ?? 0;

    if (
      Number.isFinite(reportTime) &&
      lastCollection >= reportTime
    ) {
      continue;
    }

    const level = getLevel(
      report.cnn_detection_level
    );

    if (level === "Full") {
      fullBins++;
    }

    if (level === "Near Full") {
      nearFullBins++;
    }
  }

  // ====================================
  // RECENT REPORTS
  // ====================================

  const recentReports: DashboardReport[] =
    [...reports]
      .sort(
        (a, b) =>
          new Date(b.date_uploaded).getTime() -
            new Date(a.date_uploaded).getTime() ||
          b.report_id.localeCompare(a.report_id)
      )
      .map((report) => ({
        id: report.report_id,

        site:
          (
            report.site_id
              ? siteMap.get(report.site_id)
              : undefined
          ) ||
          report.site_description ||
          report.address ||
          "Unknown site",

        by:
          userMap.get(report.user_id) ||
          "Unknown reporter",

        date: report.date_uploaded,

        level: getLevel(
          report.cnn_detection_level
        ),
      }));

  return {
    fullBins,
    nearFullBins,
    pendingReports,
    recentReports,
    adminName,
  };
}

// ========================================
// WASTE LEVEL BADGE
// ========================================

function WasteBadge({
  level,
}: {
  level: ReportLevel;
}) {
  const styles: Record<ReportLevel, string> = {
    Full:
      "border-[#F2C9CE] bg-[#FFF0F1] text-[#B82030]",
    "Near Full":
      "border-[#F0DCAD] bg-[#FFF6DF] text-[#9A6A08]",
    Empty:
      "border-[#D4E4BE] bg-[#F1F8E8] text-[#597B31]",
    Unknown:
      "border-[#E5E5E5] bg-[#F4F4F4] text-[#777]",
  };

  const dots: Record<ReportLevel, string> = {
    Full: "bg-[#D0102B]",
    "Near Full": "bg-[#E2AC2D]",
    Empty: "bg-[#7B9E4A]",
    Unknown: "bg-[#999]",
  };

  return (
    <span
      className={`
        inline-flex items-center gap-2
        whitespace-nowrap rounded-full
        border px-3 py-1.5
        text-[11px] font-bold
        ${styles[level]}
      `}
    >
      <span
        className={`h-2 w-2 rounded-full ${dots[level]}`}
      />
      {level}
    </span>
  );
}

// ========================================
// MAIN ADMIN DASHBOARD
// ========================================

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [query, setQuery] = useState("");

  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const requestId = useRef(0);

  // ========================================
  // LOAD DATA FROM SUPABASE
  // ========================================

  const loadDashboard = useCallback(async () => {
    const currentRequest = ++requestId.current;

    try {
      setError("");

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error(
          "Please sign in to access the admin dashboard."
        );
      }

      // VERIFY ADMIN
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("users")
        .select("full_name, role, is_active")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (
        !profile ||
        String(profile.role).toLowerCase() !== "admin" ||
        profile.is_active !== true
      ) {
        throw new Error(
          "Administrator access is required."
        );
      }

      // FETCH SUPABASE TABLES
      const [
        sites,
        reports,
        statuses,
        users,
        schedules,
        collections,
      ] = await Promise.all([
        fetchAllRows<SiteRow>(
          "disposal_sites",
          "site_id,site_name,is_active",
          "site_id",
          "site_id"
        ),

        fetchAllRows<ReportRow>(
          "waste_reports",
          "report_id,user_id,site_id,date_uploaded,cnn_detection_level,site_description,address",
          "date_uploaded",
          "report_id"
        ),

        fetchAllRows<StatusRow>(
          "status",
          "status_id,report_id,status,created_at",
          "created_at",
          "status_id"
        ),

        fetchAllRows<UserRow>(
          "users",
          "user_id,full_name",
          "user_id",
          "user_id"
        ),

        fetchAllRows<ScheduleRow>(
          "schedules",
          "schedule_id,site_id",
          "schedule_id",
          "schedule_id"
        ),

        fetchAllRows<CollectionRow>(
          "collections",
          "collection_id,schedule_id,collection_status,completed_at",
          "collection_id",
          "collection_id"
        ),
      ]);

      if (currentRequest !== requestId.current) {
        return;
      }

      const nextDashboard = buildDashboard(
        sites,
        reports,
        statuses,
        users,
        schedules,
        collections,
        profile.full_name || "Administrator"
      );

      setDashboard(nextDashboard);
      setNow(Date.now());
    } catch (err) {
      if (currentRequest !== requestId.current) {
        return;
      }

      console.error(
        "[WasteTrack] Admin dashboard error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard data."
      );
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }, []);

  // ========================================
  // INITIAL LOAD + AUTOMATIC UPDATES
  // ========================================

  useEffect(() => {
    void loadDashboard();

    // Reload every minute.
    const interval = window.setInterval(() => {
      void loadDashboard();
    }, 60000);

    // Reload when browser tab receives focus.
    const handleFocus = () => {
      void loadDashboard();
    };

    window.addEventListener("focus", handleFocus);

    // SUPABASE REALTIME
    let refreshTimer: ReturnType<typeof setTimeout> | null =
      null;

    const onDatabaseChange = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void loadDashboard();
      }, 500);
    };

    const channel = supabase.channel(
      "wastetrack-admin-dashboard"
    );

    const tables = [
      "waste_reports",
      "status",
      "disposal_sites",
      "collections",
      "schedules",
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
        onDatabaseChange
      );
    }

    channel.subscribe();

    return () => {
      requestId.current += 1;

      clearInterval(interval);

      window.removeEventListener(
        "focus",
        handleFocus
      );

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      void supabase.removeChannel(channel);
    };
  }, [loadDashboard]);

  // ========================================
  // STATISTICS
  // ========================================

  const fullBins = dashboard?.fullBins ?? 0;
  const nearFullBins = dashboard?.nearFullBins ?? 0;
  const pendingReports = dashboard?.pendingReports ?? 0;

  const displayValue = (value: number) =>
    loading && !dashboard ? "—" : String(value);

  const metrics = [
    {
      label: "Full bins",
      value: displayValue(fullBins),
      detail: "Needs attention",
      icon: Trash2,
      tone: "red",
      route: "/admin/waste-status?filter=Full",
    },
    {
      label: "Half-full bins",
      value: displayValue(nearFullBins),
      detail: "Monitor waste levels",
      icon: TrendingUp,
      tone: "amber",
      route:
        "/admin/waste-status?filter=Near%20Full",
    },
    {
      label: "Pending reports",
      value: displayValue(pendingReports),
      detail: "Awaiting review",
      icon: FileText,
      tone: "blue",
      route: "/admin/reports",
    },
  ] as const;

  // ========================================
  // SEARCH RECENT REPORTS
  // ========================================

  const q = query.trim().toLowerCase();

  const allReports = dashboard?.recentReports ?? [];

  const filteredReports = allReports.filter(
    (report) =>
      !q ||
      report.site.toLowerCase().includes(q) ||
      report.by.toLowerCase().includes(q)
  );

  const reports = filteredReports.slice(0, 8);

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <main
      className="
        min-h-[100dvh] w-full
        bg-[#FFFCF8] text-[#242424]
        font-['Fira_Sans',Arial,sans-serif]
      "
    >
      <div
        className="
          mx-auto w-full max-w-[1600px]
          px-4 py-6 sm:px-6
          lg:px-8 lg:py-8
        "
      >
        {/* ====================================
            WELCOME SECTION
        ==================================== */}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#A81B1E]">
              Overview
            </p>

            <h1 className="mt-1 text-[20px] font-extrabold text-[#2C2C2C] sm:text-[24px]">
              Welcome back,{" "}
              <span className="text-[#A81B1E]">
                {dashboard?.adminName || "Administrator"}
              </span>
            </h1>

            <p className="mt-1 text-xs text-[#888]">
              Monitor waste levels and resident reports.
            </p>
          </div>

          {/* CONNECTION STATUS */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E0E9D5] bg-white px-3 py-2 text-[11px] text-[#617B3E]">
            <span
              className={`h-2 w-2 rounded-full ${
                error
                  ? "bg-[#D0102B]"
                  : loading
                    ? "animate-pulse bg-[#D8AD45]"
                    : "bg-[#84A44E]"
              }`}
            />

            {error
              ? "Connection issue"
              : loading && !dashboard
                ? "Loading data"
                : "Dashboard connected"}
          </div>
        </div>

        {/* ====================================
            ERROR MESSAGE
        ==================================== */}

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4"
          >
            <AlertCircle
              size={20}
              className="mt-0.5 shrink-0 text-[#B5202A]"
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#A81B1E]">
                Failed to load dashboard
              </p>

              <p className="mt-1 break-words text-xs leading-relaxed text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="mt-3 rounded-lg bg-[#A81B1E] px-4 py-2 text-xs font-bold text-white hover:bg-[#8F1619]"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ====================================
            THREE STATISTICS CARDS
        ==================================== */}

        <section
          aria-label="Waste monitoring statistics"
          aria-busy={loading}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          {metrics.map((metric) => {
            const Icon = metric.icon;

            const tone =
              metric.tone === "red"
                ? {
                    icon:
                      "bg-[#FCE7E9] text-[#C42A34]",
                    value: "text-[#B5202A]",
                    accent: "bg-[#D0102B]",
                  }
                : metric.tone === "amber"
                  ? {
                      icon:
                        "bg-[#FFF1D3] text-[#AE801C]",
                      value: "text-[#A77716]",
                      accent: "bg-[#E2AC2D]",
                    }
                  : {
                      icon:
                        "bg-[#EAF0F8] text-[#4F749E]",
                      value: "text-[#47698E]",
                      accent: "bg-[#6689B2]",
                    };

            return (
              <button
                key={metric.label}
                type="button"
                onClick={() =>
                  navigate(metric.route)
                }
                className="
                  group relative min-w-0
                  overflow-hidden rounded-2xl
                  border border-[#EAE2D7]
                  bg-white p-5 text-left
                  shadow-sm transition
                  hover:-translate-y-0.5
                  hover:border-[#D9C5B4]
                  hover:shadow-md
                "
              >
                {/* TOP ACCENT */}
                <div
                  className={`absolute left-0 top-0 h-1 w-full ${tone.accent}`}
                />

                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`
                      flex h-11 w-11
                      shrink-0 items-center
                      justify-center rounded-xl
                      ${tone.icon}
                    `}
                  >
                    <Icon size={21} />
                  </div>

                  <ArrowUpRight
                    size={17}
                    className="text-[#AAA] transition group-hover:text-[#A81B1E]"
                  />
                </div>

                <p
                  className={`mt-5 text-[36px] font-extrabold leading-none tracking-tight ${tone.value}`}
                >
                  {metric.value}
                </p>

                <p className="mt-3 text-[13px] font-bold text-[#2C2C2C]">
                  {metric.label}
                </p>

                <p className="mt-1 text-[11px] text-[#999]">
                  {metric.detail}
                </p>
              </button>
            );
          })}
        </section>

        {/* ====================================
            RECENT REPORTS
        ==================================== */}

        <section
          className="
            mt-6 min-w-0 overflow-hidden
            rounded-2xl border
            border-[#EAE2D7]
            bg-white shadow-sm
          "
        >
          {/* PANEL HEADER */}
          <div className="border-b border-[#F0E9E0] px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F7F0E4] text-[#A81B1E]">
                  <ClipboardList size={20} />
                </div>

                <div>
                  <h2 className="text-[16px] font-extrabold sm:text-[18px]">
                    Recent reports
                  </h2>

                  <p className="mt-0.5 text-[11px] text-[#999]">
                    Latest waste reports
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/admin/reports")}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#A81B1E] hover:underline"
              >
                View all
                <ArrowUpRight size={15} />
              </button>
            </div>

            {/* SEARCH BAR */}
            <div className="relative mt-5">
              <Search
                size={17}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A09A91]"
              />

              <input
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search site or reporter..."
                aria-label="Search recent reports"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#555]"
                >
                  <X size={17} />
                </button>
              )}
            </div>
          </div>

          {/* ====================================
              DESKTOP / TABLET TABLE
          ==================================== */}

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[570px] border-collapse text-left">
              <thead>
                <tr className="bg-[#FFFCF8] text-[11px] text-[#888]">
                  <th className="px-5 py-3 font-semibold">
                    Site
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Reported by
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Time
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    Waste level
                  </th>
                </tr>
              </thead>

              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-t border-[#F1EAE2] transition hover:bg-[#FFFCF8]"
                  >
                    <td className="max-w-[240px] px-5 py-4">
                      <div className="flex items-start gap-2">
                        <MapPin
                          size={15}
                          className="mt-0.5 shrink-0 text-[#A81B1E]"
                        />

                        <span className="break-words text-[12px] font-bold text-[#343434]">
                          {report.site}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-[12px] text-[#666]">
                      {report.by}
                    </td>

                    <td className="px-4 py-4 text-[11px] text-[#888]">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={13} />
                        {timeAgo(report.date, now)}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <WasteBadge level={report.level} />
                    </td>
                  </tr>
                ))}

                {reports.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-xs text-[#999]"
                    >
                      {loading && !dashboard ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle
                            size={15}
                            className="animate-spin"
                          />
                          Loading reports...
                        </span>
                      ) : q ? (
                        "No matching reports found."
                      ) : (
                        "No reports available."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ====================================
              MOBILE REPORT CARDS
          ==================================== */}

          <div className="divide-y divide-[#F1EAE2] md:hidden">
            {reports.map((report) => (
              <article
                key={report.id}
                className="px-4 py-4 sm:px-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <MapPin
                      size={17}
                      className="mt-0.5 shrink-0 text-[#A81B1E]"
                    />

                    <p className="break-words text-[13px] font-bold">
                      {report.site}
                    </p>
                  </div>

                  <WasteBadge level={report.level} />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-6 text-[11px] text-[#777]">
                  <span>By {report.by}</span>

                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={13} />
                    {timeAgo(report.date, now)}
                  </span>
                </div>
              </article>
            ))}

            {reports.length === 0 && (
              <div className="px-4 py-12 text-center text-xs text-[#999]">
                {loading && !dashboard
                  ? "Loading reports..."
                  : q
                    ? "No matching reports found."
                    : "No reports available."}
              </div>
            )}
          </div>

          {/* ====================================
              REPORTS FOOTER
          ==================================== */}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0E9E0] bg-[#FFFCF8] px-5 py-3">
            <p className="text-[11px] text-[#999]">
              Showing {reports.length} of{" "}
              {filteredReports.length} matching reports
            </p>

            <p className="text-[10px] text-[#AAA]">
              Latest first
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
