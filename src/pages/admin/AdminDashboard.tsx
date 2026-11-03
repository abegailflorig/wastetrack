
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";

// ==========================================
// DATABASE TYPES
// ==========================================

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

type ReportLevel = "Full" | "Near Full" | "Empty" | "Unknown";

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
  collectedToday: number;
  totalSites: number;
  progress: number;
  recentReports: DashboardReport[];
  adminName: string;
};

interface Stat {
  value: string;
  label: string;
  color: string;
  to?: string;
}

// ==========================================
// HELPERS
// ==========================================

const PAGE_SIZE = 500;

type SourceTable =
  | "disposal_sites"
  | "waste_reports"
  | "status"
  | "users"
  | "schedules"
  | "collections";

// Fetch all pages to avoid Supabase's
// default maximum rows per request.
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
      .order(orderColumn, { ascending: false });

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
      throw new Error(`${table}: ${error.message}`);
    }

    const page = (data ?? []) as unknown as T[];
    allRows.push(...page);

    if (page.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
  }

  return allRows;
}

function getLevel(value: string | null): ReportLevel {
  const normalized = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ");

  if (normalized === "FULL" || normalized === "HIGH") {
    return "Full";
  }

  if (
    normalized === "NEAR FULL" ||
    normalized === "HALF FULL" ||
    normalized === "MEDIUM"
  ) {
    return "Near Full";
  }

  if (normalized === "EMPTY" || normalized === "LOW") {
    return "Empty";
  }

  return "Unknown";
}

function isCompleted(value: string | null): boolean {
  return ["collected", "completed", "done"].includes(
    (value ?? "").trim().toLowerCase()
  );
}

function getManilaDayStart(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T00:00:00+08:00`
  ).getTime();
}

function timeAgo(value: string, now: number): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "Unknown";

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

  return new Date(timestamp).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "AD";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words[0][0] + words[words.length - 1][0]
  ).toUpperCase();
}

// ==========================================
// CALCULATE DASHBOARD DATA
// ==========================================

function buildDashboard(
  sites: SiteRow[],
  reports: ReportRow[],
  statuses: StatusRow[],
  users: UserRow[],
  schedules: ScheduleRow[],
  collections: CollectionRow[],
  adminName: string
): DashboardData {
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

  // Latest status per report.
  const latestStatus = new Map<string, StatusRow>();

  for (const row of statuses) {
    const previous = latestStatus.get(row.report_id);

    if (
      !previous ||
      row.created_at > previous.created_at ||
      (row.created_at === previous.created_at &&
        row.status_id > previous.status_id)
    ) {
      latestStatus.set(row.report_id, row);
    }
  }

  const pendingReports = reports.filter((report) => {
    const latest = latestStatus.get(report.report_id);

    return latest?.status.trim().toLowerCase() === "pending";
  }).length;

  // Map the latest completed collection to each site.
  const lastCollectionBySite = new Map<string, number>();
  const collectedTodaySites = new Set<string>();

  const startToday = getManilaDayStart();
  const endToday = startToday + 24 * 60 * 60 * 1000;

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

    if (!siteId || !siteMap.has(siteId)) continue;

    const completedTime = new Date(
      collection.completed_at
    ).getTime();

    if (!Number.isFinite(completedTime)) continue;

    const previous = lastCollectionBySite.get(siteId) ?? 0;

    if (completedTime > previous) {
      lastCollectionBySite.set(siteId, completedTime);
    }

    if (
      completedTime >= startToday &&
      completedTime < endToday
    ) {
      collectedTodaySites.add(siteId);
    }
  }

  // One latest report per registered active site.
  const latestReportBySite = new Map<string, ReportRow>();

  for (const report of reports) {
    if (!report.site_id || !siteMap.has(report.site_id)) {
      continue;
    }

    const previous = latestReportBySite.get(report.site_id);

    if (
      !previous ||
      new Date(report.date_uploaded).getTime() >
        new Date(previous.date_uploaded).getTime()
    ) {
      latestReportBySite.set(report.site_id, report);
    }
  }

  let fullBins = 0;
  let nearFullBins = 0;

  for (const [siteId, report] of latestReportBySite) {
    const reportTime = new Date(
      report.date_uploaded
    ).getTime();

    const latestCollection =
      lastCollectionBySite.get(siteId) ?? 0;

    // A completed collection after the report
    // clears the earlier reported level.
    if (latestCollection >= reportTime) {
      continue;
    }

    const level = getLevel(
      report.cnn_detection_level
    );

    if (level === "Full") fullBins++;

    if (level === "Near Full") nearFullBins++;
  }

  const collectedToday = collectedTodaySites.size;
  const totalSites = activeSites.length;

  const progress =
    totalSites > 0
      ? Math.min(
          100,
          Math.round((collectedToday / totalSites) * 100)
        )
      : 0;

  // Most recent reports first.
  const recentReports: DashboardReport[] = [...reports]
    .sort(
      (a, b) =>
        new Date(b.date_uploaded).getTime() -
          new Date(a.date_uploaded).getTime() ||
        b.report_id.localeCompare(a.report_id)
    )
    .map((report) => ({
      id: report.report_id,
      site:
        (report.site_id
          ? siteMap.get(report.site_id)
          : undefined) ||
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
    collectedToday,
    totalSites,
    progress,
    recentReports,
    adminName,
  };
}

// ==========================================
// ORIGINAL DASHBOARD CSS
// ==========================================

const css = `
.ad-root, .ad-root * { box-sizing: border-box; }

.ad-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --search: #efe4d0;
  --ink: #1b1b1b;
  --muted: #555;

  min-height: 100dvh;
  background: #fff;
  color: var(--ink);
  padding: 22px 20px 28px;
  font-family: "Fira Sans", "Segoe UI", Roboto, Arial, sans-serif;
}

.ad-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.ad-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.ad-avatar {
  width: 46px;
  height: 34px;
  border-radius: 10px;
  background: #f8ced4;
  color: var(--red-bright);
  font-size: 18px;
  font-weight: 700;
  display: grid;
  place-items: center;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}

.ad-avatar:hover { background: #f3b9c3; }

.ad-avatar:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}

.ad-search-row {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 8px;
}

.ad-overview {
  font-size: 11.5px;
  line-height: 1.3;
  flex-shrink: 0;
}

.ad-search {
  flex: 1;
  min-width: 0;
  max-width: 450px;
  height: 36px;
  padding: 0 14px;
  background: var(--search);
  border: 1px solid var(--cream-line);
  border-radius: 6px;
  font: inherit;
  font-size: 15px;
  color: var(--ink);
}

.ad-search::placeholder { color: #a9a08f; }

.ad-search:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 1px;
}

.ad-stats {
  margin-top: 18px;
  background: var(--cream);
  border-radius: 6px;
  padding: 8px 16px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 26px;
}

.ad-stat {
  background: #fff;
  color: var(--ink);
  border: 1px solid var(--cream-line);
  border-radius: 8px;
  box-shadow: 0 2px 0 #cfc7a8;
  padding: 10px 16px 12px;
  text-align: left;
  font-family: inherit;
  cursor: default;
  min-width: 0;
}

.ad-stat.clickable { cursor: pointer; }

.ad-stat.clickable:hover {
  background: #fdfbf6;
  box-shadow: 0 2px 0 #b9b191;
}

.ad-stat.clickable:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}

.ad-stat-value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.ad-stat-label {
  margin-top: 6px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--muted);
}

.ad-panels {
  margin-top: 18px;
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.ad-panel {
  background: var(--cream);
  border: 1px solid var(--cream-line);
  border-radius: 6px;
  padding: 10px 10px 14px;
  min-width: 0;
}

.ad-panel-title {
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: #4a4a4a;
}

.ad-table-wrap {
  overflow-x: auto;
  width: 100%;
}

.ad-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 14px;
  font-size: 11px;
  min-width: 420px;
}

.ad-table th {
  text-align: left;
  font-weight: 500;
  color: #555;
  padding: 4px 8px 6px;
  border-bottom: 1px solid #b9b2a3;
}

.ad-table td {
  padding: 12px 8px 8px;
  border-bottom: 1px solid #b9b2a3;
  font-weight: 500;
}

.ad-table td:first-child {
  max-width: 170px;
  overflow-wrap: anywhere;
}

.ad-table tr.filler td { height: 46px; }

.ad-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0,0,0,.15);
}

.ad-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.ad-badge.near {
  background: #fbe2b0;
  border: 1px solid #efc77c;
  color: #222;
}

.ad-badge.near .dot { background: #f0b93a; }

.ad-badge.full {
  background: #fff;
  border: 1px solid var(--red-bright);
  color: #222;
}

.ad-badge.full .dot { background: var(--red-bright); }

.ad-badge.empty {
  background: #e5efd5;
  border: 1px solid #a9bb78;
  color: #314920;
}

.ad-badge.empty .dot { background: #799d46; }

.ad-badge.unknown {
  background: #eee;
  border: 1px solid #ccc;
  color: #555;
}

.ad-badge.unknown .dot { background: #999; }

.ad-progress-text {
  margin-top: 14px;
  font-size: 11.5px;
  font-weight: 500;
}

.ad-bar {
  margin-top: 8px;
  height: 5px;
  background: #d9d9d9;
  border-radius: 3px;
  overflow: hidden;
}

.ad-bar > span {
  display: block;
  height: 100%;
  background: var(--red-bright);
  transition: width .3s ease;
}

.ad-message {
  margin-top: 14px;
  padding: 12px;
  border-radius: 6px;
  background: #fff0f0;
  color: #a81b1e;
  border: 1px solid #e6b0b0;
  font-size: 12px;
}

.ad-empty {
  padding: 20px 8px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.ad-updated {
  margin-top: 7px;
  color: #777;
  font-size: 10px;
}

@media (max-width: 900px) {
  .ad-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .ad-panels {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .ad-root {
    padding: 16px 12px 24px;
  }

  .ad-search-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .ad-search { max-width: none; }

  .ad-stats {
    padding: 10px;
    gap: 10px;
  }

  .ad-stat { padding: 12px 10px; }

  .ad-stat-value { font-size: 24px; }

  .ad-stat-label { font-size: 11px; }

  .ad-panel { padding: 12px 10px; }
}

@media (max-width: 350px) {
  .ad-stat-value { font-size: 21px; }
}
`;

// ==========================================
// ADMIN DASHBOARD
// ==========================================

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
  // FETCH DATA FROM SUPABASE
  // ========================================

  const loadDashboard = useCallback(async () => {
    const currentRequest = ++requestId.current;

    try {
      setError("");

      // Verify signed-in administrator.
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error(
          "Please sign in to access the admin dashboard."
        );
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("users")
          .select("full_name, role, is_active")
          .eq("user_id", authData.user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      if (
        !profile ||
        String(profile.role).toLowerCase() !== "admin" ||
        profile.is_active === false
      ) {
        throw new Error(
          "Administrator access is required."
        );
      }

      // Fetch actual database records.
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

      if (currentRequest !== requestId.current) return;

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
      if (currentRequest !== requestId.current) return;

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
  // INITIAL LOAD + AUTO REFRESH
  // ========================================

  useEffect(() => {
    void loadDashboard();

    // Refresh every minute.
    const interval = window.setInterval(() => {
      void loadDashboard();
    }, 60000);

    // Refresh when returning to this tab.
    const handleFocus = () => {
      void loadDashboard();
    };

    window.addEventListener("focus", handleFocus);

    // Supabase Realtime changes.
    let refreshTimer: ReturnType<
      typeof setTimeout
    > | null = null;

    const onDatabaseChange = () => {
      if (refreshTimer) clearTimeout(refreshTimer);

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

      window.clearInterval(interval);
      window.removeEventListener(
        "focus",
        handleFocus
      );

      if (refreshTimer) clearTimeout(refreshTimer);

      void supabase.removeChannel(channel);
    };
  }, [loadDashboard]);

  // ========================================
  // DASHBOARD STATISTICS
  // ========================================

  const stats: Stat[] = [
    {
      value: loading && !dashboard
        ? "—"
        : String(dashboard?.fullBins ?? 0),
      label: "Bins Full",
      color: "#d0102b",
      to: "/admin/waste-status?filter=Full",
    },
    {
      value: loading && !dashboard
        ? "—"
        : String(dashboard?.nearFullBins ?? 0),
      label: "Bins Half Full",
      color: "#f0b93a",
      to: "/admin/waste-status?filter=Near%20Full",
    },
    {
      value: loading && !dashboard
        ? "—"
        : String(dashboard?.pendingReports ?? 0),
      label: "Pending reports",
      color: "#d0102b",
      to: "/admin/reports",
    },
    {
      value: loading && !dashboard
        ? "—"
        : `${dashboard?.progress ?? 0}%`,
      label: "Today's collection progress",
      color: "#111111",
    },
  ];

  // ========================================
  // SEARCH RECENT REPORTS
  // ========================================

  const q = query.trim().toLowerCase();

  const reports = (
    dashboard?.recentReports ?? []
  )
    .filter(
      (report) =>
        !q ||
        report.site.toLowerCase().includes(q) ||
        report.by.toLowerCase().includes(q)
    )
    .slice(0, 8);

  const progress = dashboard?.progress ?? 0;
  const collected = dashboard?.collectedToday ?? 0;
  const totalSites = dashboard?.totalSites ?? 0;

  // ========================================
  // RENDER DASHBOARD
  // ========================================

  return (
    <div className="ad-root">
      <style>{css}</style>

      {/* HEADER */}
      <div className="ad-head">
        <h1 className="ad-title">Dashboard</h1>

        <button
          type="button"
          className="ad-avatar"
          aria-label="Manage admin account"
          title={dashboard?.adminName || "Admin account"}
          onClick={() => navigate("/admin/account")}
        >
          {getInitials(
            dashboard?.adminName || "Administrator"
          )}
        </button>
      </div>

      {/* SEARCH */}
      <div className="ad-search-row">
        <div className="ad-overview">
          Overview for
          <br />
          Brgy. San Miguel
        </div>

        <input
          className="ad-search"
          type="search"
          placeholder="Search sites or reporters..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sites or reporters"
        />
      </div>

      {/* DATABASE ERROR */}
      {error && (
        <div className="ad-message" role="alert">
          <strong>Failed to load dashboard.</strong>
          <div style={{ marginTop: 4 }}>{error}</div>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            style={{
              marginTop: 10,
              padding: "6px 12px",
              borderRadius: 5,
              border: "1px solid #a81b1e",
              color: "#a81b1e",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* STATISTICS */}
      <section
        className="ad-stats"
        aria-label="Summary"
        aria-busy={loading}
      >
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            className={`ad-stat${
              stat.to ? " clickable" : ""
            }`}
            onClick={
              stat.to
                ? () => navigate(stat.to!)
                : undefined
            }
            disabled={!stat.to}
          >
            <div
              className="ad-stat-value"
              style={{ color: stat.color }}
            >
              {stat.value}
            </div>

            <div className="ad-stat-label">
              {stat.label}
            </div>
          </button>
        ))}
      </section>

      {/* PANELS */}
      <div className="ad-panels">

        {/* RECENT REPORTS */}
        <section className="ad-panel">
          <h2 className="ad-panel-title">
            RECENT REPORTS
          </h2>

          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Reported by</th>
                  <th>Time</th>
                  <th>Level</th>
                </tr>
              </thead>

              <tbody>
                {reports.map((report) => {
                  const badgeClass =
                    report.level === "Full"
                      ? "full"
                      : report.level === "Near Full"
                        ? "near"
                        : report.level === "Empty"
                          ? "empty"
                          : "unknown";

                  return (
                    <tr key={report.id}>
                      <td>{report.site}</td>

                      <td>{report.by}</td>

                      <td>
                        {timeAgo(report.date, now)}
                      </td>

                      <td>
                        <span
                          className={`ad-badge ${badgeClass}`}
                        >
                          <span className="dot" />
                          {report.level}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {reports.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="ad-empty"
                    >
                      {loading
                        ? "Loading recent reports..."
                        : q
                          ? "No matching reports found."
                          : "No reports available."}
                    </td>
                  </tr>
                )}

                {reports.length > 0 && (
                  <tr className="filler">
                    <td colSpan={4} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* COLLECTION PROGRESS */}
        <section className="ad-panel">
          <h2 className="ad-panel-title">
            COLLECTION PROGRESS
          </h2>

          <p className="ad-progress-text">
            {loading && !dashboard
              ? "Loading collection progress..."
              : `${collected} of ${totalSites} sites collected today`}
          </p>

          <div
            className="ad-bar"
            role="progressbar"
            aria-label="Today's collection progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <p className="ad-updated">
            {loading && !dashboard
              ? "Connecting to Supabase..."
              : "Based on today's completed collections"}
          </p>
        </section>
      </div>
    </div>
  );
}
