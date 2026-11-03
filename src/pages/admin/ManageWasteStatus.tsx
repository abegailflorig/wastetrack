
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router";
import { supabase } from "../../lib/supabase";

// ==========================================
// TYPES
// ==========================================

type FillStatus =
  | "Empty"
  | "Near Full"
  | "Full"
  | "No report";

type Filter = "All" | FillStatus;

interface Site {
  id: string;
  reportId: string | null;
  name: string;
  location: string;
  fillPercent: number | null;
  type: string;
  lastUpdated: string | null;
  status: FillStatus;
}

type DisposalSiteRow = {
  site_id: string;
  site_name: string;
  location: string | null;
  is_active: boolean;
};

type WasteReportRow = {
  report_id: string;
  site_id: string | null;
  cnn_detection_level: string | null;
  waste_type: string | null;
  date_uploaded: string;
};

type ScheduleRow = {
  schedule_id: string;
  site_id: string | null;
  status: string | null;
  date_completed: string | null;
};

type CollectionRow = {
  collection_id: string;
  schedule_id: string | null;
  collection_status: string | null;
  completed_at: string | null;
};

type TableName =
  | "disposal_sites"
  | "waste_reports"
  | "schedules"
  | "collections";

const FILTERS: Filter[] = [
  "All",
  "Empty",
  "Near Full",
  "Full",
];

// ==========================================
// HELPERS
// ==========================================

function normalizeStatus(
  value: string | null
): FillStatus {
  const level = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ");

  if (level === "FULL" || level === "HIGH") {
    return "Full";
  }

  if (
    level === "NEAR FULL" ||
    level === "HALF FULL" ||
    level === "MEDIUM"
  ) {
    return "Near Full";
  }

  if (level === "EMPTY" || level === "LOW") {
    return "Empty";
  }

  return "No report";
}

function getFillPercent(
  status: FillStatus
): number | null {
  if (status === "Full") return 100;
  if (status === "Near Full") return 50;
  if (status === "Empty") return 0;
  return null;
}

function isCollected(
  status: string | null
): boolean {
  return ["collected", "completed", "done"].includes(
    (status ?? "").trim().toLowerCase()
  );
}

function formatWasteType(
  value: string | null
): string {
  if (!value?.trim()) {
    return "Not specified";
  }

  return value
    .trim()
    .replace(/mixed\s*\/\s*unsorted/i, "Mixed / Unsorted");
}

function timeAgo(
  dateValue: string | null,
  now: number
): string {
  if (!dateValue) {
    return "No updates yet";
  }

  const timestamp = new Date(dateValue).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const minutes = Math.max(
    0,
    Math.floor((now - timestamp) / 60000)
  );

  if (minutes < 1) return "Just now";

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

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

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "AD";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}

function badgeClass(status: FillStatus) {
  if (status === "Full") return "full";
  if (status === "Near Full") return "near";
  if (status === "Empty") return "empty";
  return "unknown";
}

// ==========================================
// PAGINATED SUPABASE FETCH
// ==========================================

const PAGE_SIZE = 500;

async function fetchAllRows<T>(
  table: TableName,
  columns: string,
  orderColumn: string,
  idColumn: string
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(columns)
      .order(orderColumn, {
        ascending: false,
      });

    if (idColumn !== orderColumn) {
      query = query.order(idColumn, {
        ascending: false,
      });
    }

    const { data, error } = await query.range(
      offset,
      offset + PAGE_SIZE - 1
    );

    if (error) {
      throw new Error(
        `Unable to load ${table}: ${error.message}`
      );
    }

    const page = (data ?? []) as unknown as T[];

    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return rows;
}

// ==========================================
// BUILD SITE STATUS FROM DATABASE
// ==========================================

function buildWasteStatus(
  disposalSites: DisposalSiteRow[],
  reports: WasteReportRow[],
  schedules: ScheduleRow[],
  collections: CollectionRow[]
): Site[] {
  const activeSites = disposalSites.filter(
    (site) => site.is_active === true
  );

  // Latest report per disposal site.
  const latestReports = new Map<
    string,
    WasteReportRow
  >();

  for (const report of reports) {
    if (!report.site_id) continue;

    const previous = latestReports.get(
      report.site_id
    );

    if (
      !previous ||
      report.date_uploaded > previous.date_uploaded ||
      (
        report.date_uploaded === previous.date_uploaded &&
        report.report_id > previous.report_id
      )
    ) {
      latestReports.set(
        report.site_id,
        report
      );
    }
  }

  // Link schedule IDs to disposal sites.
  const scheduleMap = new Map(
    schedules.map((schedule) => [
      schedule.schedule_id,
      schedule,
    ])
  );

  // Latest completed collection at each site.
  const latestCollections = new Map<
    string,
    number
  >();

  function rememberCollection(
    siteId: string | null,
    completedAt: string | null
  ) {
    if (!siteId || !completedAt) return;

    const completedTime = new Date(
      completedAt
    ).getTime();

    if (!Number.isFinite(completedTime)) {
      return;
    }

    const previous =
      latestCollections.get(siteId) ?? 0;

    if (completedTime > previous) {
      latestCollections.set(
        siteId,
        completedTime
      );
    }
  }

  // Check actual collections table.
  for (const collection of collections) {
    if (
      !collection.schedule_id ||
      !isCollected(collection.collection_status)
    ) {
      continue;
    }

    const schedule = scheduleMap.get(
      collection.schedule_id
    );

    rememberCollection(
      schedule?.site_id ?? null,
      collection.completed_at
    );
  }

  // Also support collector workflows that
  // mark schedules as Collected.
  for (const schedule of schedules) {
    if (!isCollected(schedule.status)) {
      continue;
    }

    rememberCollection(
      schedule.site_id,
      schedule.date_completed
    );
  }

  // One row for every active disposal site.
  return activeSites
    .map((site): Site => {
      const report = latestReports.get(
        site.site_id
      );

      const reportTime = report
        ? new Date(
            report.date_uploaded
          ).getTime()
        : 0;

      const collectionTime =
        latestCollections.get(site.site_id) ?? 0;

      let status: FillStatus =
        report
          ? normalizeStatus(
              report.cnn_detection_level
            )
          : "No report";

      let lastUpdated: string | null =
        report?.date_uploaded ?? null;

      let wasteType = formatWasteType(
        report?.waste_type ?? null
      );

      // If the bin was collected AFTER
      // the latest report, it is treated as
      // emptied by that collection.
      if (
        collectionTime > 0 &&
        collectionTime > reportTime
      ) {
        status = "Empty";

        lastUpdated = new Date(
          collectionTime
        ).toISOString();

        wasteType = "Not specified";
      }

      return {
        id: site.site_id,
        reportId: report?.report_id ?? null,
        name: site.site_name,
        location: site.location ?? "",
        fillPercent: getFillPercent(status),
        type: wasteType,
        lastUpdated,
        status,
      };
    })
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );
}

// ==========================================
// CSS - ORIGINAL DESIGN
// ==========================================

const css = `
.ws-root, .ws-root * {
  box-sizing: border-box;
}

.ws-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --olive: #a5b26b;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --search: #efe4d0;
  --ink: #1b1b1b;
  --muted: #555;

  min-height: 100dvh;
  background: #fff;
  color: var(--ink);
  font-family:
    "Fira Sans", "Segoe UI",
    Roboto, Arial, sans-serif;
}

.ws-head {
  display: flex;
  align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 20px;
  flex-wrap: wrap;
}

.ws-head-left {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.ws-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.ws-sub {
  margin: 2px 0 0;
  font-size: 13px;
  color: #666;
}

.ws-search {
  width: 260px;
  max-width: 100%;
  height: 36px;
  padding: 0 14px;
  background: var(--search);
  border: 1px solid var(--cream-line);
  border-radius: 6px;
  font: inherit;
  font-size: 14px;
  color: var(--ink);
}

.ws-search::placeholder {
  color: #a9a08f;
}

.ws-search:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 1px;
}

.ws-avatar {
  margin-left: auto;
  width: 38px;
  height: 30px;
  border-radius: 8px;
  background: #f8ced4;
  color: var(--red-bright);
  font-size: 17px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}

.ws-avatar:hover {
  background: #f3b9c3;
}

.ws-avatar:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}

.ws-body {
  padding: 16px 20px 24px;
}

.ws-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.ws-tab {
  padding: 8px 18px;
  border-radius: 8px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  background: #fff;
  color: var(--red);
  border: 1.5px solid var(--red);
}

.ws-tab:hover {
  background: #fbeceb;
}

.ws-tab:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.ws-tab.selected {
  background: var(--red);
  color: #fff;
}

.ws-panel {
  background: var(--cream);
  border: 2px solid #4da3e0;
  border-radius: 12px;
  padding: 14px 16px 20px;
}

.ws-table-wrap {
  overflow-x: auto;
  width: 100%;
}

.ws-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 620px;
}

.ws-table th {
  text-align: left;
  font-weight: 500;
  color: #555;
  padding: 4px 10px 10px;
  border-bottom: 1px solid #b9b2a3;
}

.ws-table td {
  padding: 14px 10px;
  border-bottom: 1px solid #b9b2a3;
  font-weight: 500;
}

.ws-table tbody tr:hover {
  background: rgba(168,27,30,.05);
}

.ws-table tr.filler td {
  height: 40px;
}

.ws-table tr.empty td {
  text-align: center;
  color: #777;
  font-style: italic;
}

.ws-table tr.empty:hover {
  background: transparent;
}

.ws-site-link {
  display: inline-block;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.ws-site-link:hover {
  color: var(--red);
  text-decoration: underline;
}

.ws-site-link:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}

.ws-site-link:disabled {
  cursor: default;
  color: var(--ink);
  text-decoration: none;
}

.ws-bar {
  width: 130px;
  height: 9px;
  background: #d9d9d9;
  border-radius: 5px;
  overflow: hidden;
}

.ws-bar > span {
  display: block;
  height: 100%;
  transition: width .25s ease;
}

.ws-bar.near > span {
  background: #f0b93a;
}

.ws-bar.full > span {
  background: var(--red-bright);
}

.ws-bar.empty > span {
  background: var(--olive);
}

.ws-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0,0,0,.20);
}

.ws-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.ws-badge.near {
  background: #fbe2b0;
  border: 1px solid #efc77c;
  color: #222;
}

.ws-badge.near .dot {
  background: #f0b93a;
}

.ws-badge.full {
  background: #fff;
  border: 1px solid var(--red-bright);
  color: #222;
}

.ws-badge.full .dot {
  background: var(--red-bright);
}

.ws-badge.empty {
  background: #e2ede0;
  border: 1px solid var(--olive);
  color: #222;
}

.ws-badge.empty .dot {
  background: var(--olive);
}

.ws-badge.unknown {
  background: #eee;
  border: 1px solid #aaa;
  color: #555;
}

.ws-badge.unknown .dot {
  background: #999;
}

.ws-message {
  margin-bottom: 14px;
  padding: 12px;
  background: #fff2f2;
  border: 1px solid #eab9b9;
  border-radius: 6px;
  color: #a81b1e;
  font-size: 12px;
}

.ws-message button {
  margin-top: 8px;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid var(--red);
  border-radius: 5px;
  color: var(--red);
  cursor: pointer;
}

.ws-note {
  margin-top: 12px;
  color: #777;
  font-size: 11px;
}

@media (max-width: 900px) {
  .ws-head {
    gap: 12px;
  }

  .ws-head-left {
    gap: 12px;
  }
}

@media (max-width: 640px) {
  .ws-head {
    padding: 14px;
    align-items: flex-start;
  }

  .ws-head-left {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .ws-search {
    width: 100%;
  }

  .ws-body {
    padding: 14px 12px 24px;
  }

  .ws-tabs {
    gap: 8px;
  }

  .ws-tab {
    padding: 8px 12px;
    font-size: 12px;
  }

  .ws-panel {
    padding: 12px;
  }
}
`;

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function ManageWasteStatus() {
  const navigate = useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();

  // Read ?filter=Full or ?filter=Near%20Full
  // from Admin Dashboard navigation.
  const requestedFilter =
    searchParams.get("filter");

  const filter: Filter =
    FILTERS.includes(requestedFilter as Filter)
      ? (requestedFilter as Filter)
      : "All";

  const [query, setQuery] = useState("");

  const [allSites, setAllSites] =
    useState<Site[]>([]);

  const [adminName, setAdminName] =
    useState("Administrator");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [now, setNow] =
    useState(Date.now());

  const requestRef = useRef(0);

  // ========================================
  // LOAD SUPABASE DATA
  // ========================================

  const loadWasteStatus = useCallback(
    async (showLoading = false) => {
      const requestId = ++requestRef.current;

      if (showLoading) {
        setLoading(true);
      }

      setError("");

      try {
        // STEP 1: AUTHENTICATION
        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          throw new Error(
            "Please sign in to view Waste Status."
          );
        }

        // STEP 2: VERIFY ADMIN ACCOUNT
        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("users")
          .select(
            "full_name,role,is_active"
          )
          .eq(
            "user_id",
            authData.user.id
          )
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (
          !profile ||
          String(profile.role).toLowerCase() !== "admin" ||
          profile.is_active === false
        ) {
          throw new Error(
            "Administrator access is required."
          );
        }

        // STEP 3: LOAD ALL REQUIRED TABLES
        const [
          disposalSites,
          wasteReports,
          schedules,
          collections,
        ] = await Promise.all([
          fetchAllRows<DisposalSiteRow>(
            "disposal_sites",
            "site_id,site_name,location,is_active",
            "site_id",
            "site_id"
          ),

          fetchAllRows<WasteReportRow>(
            "waste_reports",
            "report_id,site_id,cnn_detection_level,waste_type,date_uploaded",
            "date_uploaded",
            "report_id"
          ),

          fetchAllRows<ScheduleRow>(
            "schedules",
            "schedule_id,site_id,status,date_completed",
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

        if (requestId !== requestRef.current) {
          return;
        }

        // STEP 4: CALCULATE CURRENT STATUS
        const preparedSites = buildWasteStatus(
          disposalSites,
          wasteReports,
          schedules,
          collections
        );

        // STEP 5: SAVE ACTUAL DATA
        setAllSites(preparedSites);

        setAdminName(
          profile.full_name?.trim() ||
          "Administrator"
        );

        setNow(Date.now());
      } catch (err) {
        if (requestId !== requestRef.current) {
          return;
        }

        console.error(
          "[WasteTrack] Waste Status error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load waste status."
        );
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  // ========================================
  // INITIAL LOAD, REALTIME, AUTO REFRESH
  // ========================================

  useEffect(() => {
    void loadWasteStatus(true);

    // Refresh data every 60 seconds.
    const interval = window.setInterval(() => {
      void loadWasteStatus(false);
    }, 60000);

    // Refresh when the administrator
    // returns to the browser tab.
    const onFocus = () => {
      void loadWasteStatus(false);
    };

    window.addEventListener("focus", onFocus);

    // Realtime database changes.
    let refreshTimer:
      ReturnType<typeof setTimeout> | null = null;

    const onDatabaseChange = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void loadWasteStatus(false);
      }, 500);
    };

    const channel = supabase.channel(
      "wastetrack-manage-waste-status"
    );

    const realtimeTables = [
      "disposal_sites",
      "waste_reports",
      "schedules",
      "collections",
    ];

    for (const table of realtimeTables) {
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
      requestRef.current += 1;

      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        onFocus
      );

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      void supabase.removeChannel(channel);
    };
  }, [loadWasteStatus]);

  // ========================================
  // UPDATE FILTER IN URL
  // ========================================

  function changeFilter(nextFilter: Filter) {
    const nextParams = new URLSearchParams(
      searchParams
    );

    if (nextFilter === "All") {
      nextParams.delete("filter");
    } else {
      nextParams.set("filter", nextFilter);
    }

    setSearchParams(nextParams, {
      replace: true,
    });
  }

  // ========================================
  // FILTER AND SEARCH ACTUAL SITES
  // ========================================

  const sites = useMemo(() => {
    const q = query.trim().toLowerCase();

    return allSites.filter((site) => {
      const matchesFilter =
        filter === "All" ||
        site.status === filter;

      const matchesQuery =
        !q ||
        site.name.toLowerCase().includes(q) ||
        site.location.toLowerCase().includes(q) ||
        site.type.toLowerCase().includes(q);

      return matchesFilter && matchesQuery;
    });
  }, [allSites, filter, query]);

  // ========================================
  // SUMMARY COUNTS
  // ========================================

  const fullCount = allSites.filter(
    (site) => site.status === "Full"
  ).length;

  const nearFullCount = allSites.filter(
    (site) => site.status === "Near Full"
  ).length;

  const emptyCount = allSites.filter(
    (site) => site.status === "Empty"
  ).length;

  // ========================================
  // OPEN SUPABASE REPORT DETAILS
  // ========================================

  function openSite(site: Site) {
    if (!site.reportId) return;

    navigate(
      `/admin/waste-status/${site.reportId}`
    );
  }

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="ws-root">
      <style>{css}</style>

      {/* ================================= */}
      {/* HEADER */}
      {/* ================================= */}

      <header className="ws-head">
        <div className="ws-head-left">
          <div>
            <h1 className="ws-title">
              Waste status
            </h1>

            <p className="ws-sub">
              {loading && allSites.length === 0
                ? "Loading disposal sites..."
                : `${allSites.length} disposal sites · Barangay San Miguel`}
            </p>
          </div>

          <input
            className="ws-search"
            type="search"
            placeholder="Search sites..."
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            aria-label="Search sites"
          />
        </div>

        {/* ADMIN AVATAR */}
        <button
          type="button"
          className="ws-avatar"
          aria-label="Manage account"
          title={adminName}
          onClick={() =>
            navigate("/admin/account")
          }
        >
          {getInitials(adminName)}
        </button>
      </header>

      {/* ================================= */}
      {/* BODY */}
      {/* ================================= */}

      <div className="ws-body">

        {/* ERROR MESSAGE */}
        {error && (
          <div
            className="ws-message"
            role="alert"
          >
            <strong>
              Unable to update Waste Status
            </strong>

            <p style={{ margin: "6px 0" }}>
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadWasteStatus(true)
              }
            >
              Retry
            </button>
          </div>
        )}

        {/* STATUS FILTERS */}
        <div
          className="ws-tabs"
          role="tablist"
          aria-label="Filter by status"
        >
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`ws-tab${
                filter === f
                  ? " selected"
                  : ""
              }`}
              onClick={() =>
                changeFilter(f)
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* ================================= */}
        {/* WASTE STATUS TABLE */}
        {/* ================================= */}

        <section
          className="ws-panel"
          aria-busy={loading}
        >
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Fill level</th>
                  <th>Type</th>
                  <th>Last updated</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {sites.map((site) => {
                  const cls = badgeClass(
                    site.status
                  );

                  return (
                    <tr key={site.id}>
                      {/* SITE NAME */}
                      <td>
                        <button
                          type="button"
                          className="ws-site-link"
                          disabled={!site.reportId}
                          title={
                            site.reportId
                              ? "View report details"
                              : "No submitted report available"
                          }
                          onClick={() =>
                            openSite(site)
                          }
                        >
                          {site.name}
                        </button>
                      </td>

                      {/* FILL LEVEL */}
                      <td>
                        {site.fillPercent !== null ? (
                          <div
                            className={`ws-bar ${cls}`}
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={
                              site.fillPercent
                            }
                            aria-label={`${site.name} estimated fill level`}
                          >
                            <span
                              style={{
                                width: `${site.fillPercent}%`,
                              }}
                            />
                          </div>
                        ) : (
                          <span
                            style={{
                              color: "#777",
                            }}
                          >
                            Not available
                          </span>
                        )}
                      </td>

                      {/* WASTE TYPE */}
                      <td>{site.type}</td>

                      {/* LAST UPDATED */}
                      <td>
                        {timeAgo(
                          site.lastUpdated,
                          now
                        )}
                      </td>

                      {/* STATUS */}
                      <td>
                        <span
                          className={`ws-badge ${cls}`}
                        >
                          <span className="dot" />
                          {site.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* EMPTY / LOADING STATE */}
                {sites.length === 0 && (
                  <tr className="empty">
                    <td colSpan={5}>
                      {loading
                        ? "Loading waste status from Supabase..."
                        : error && allSites.length === 0
                          ? "Waste status is unavailable."
                          : "No sites match this filter."}
                    </td>
                  </tr>
                )}

                {/* ORIGINAL TABLE SPACING */}
                <tr className="filler">
                  <td colSpan={5} />
                </tr>

                <tr className="filler">
                  <td colSpan={5} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* STATUS SUMMARY */}
        <p className="ws-note">
          {fullCount} Full ·{" "}
          {nearFullCount} Near Full ·{" "}
          {emptyCount} Empty
        </p>
      </div>
    </div>
  );
}
