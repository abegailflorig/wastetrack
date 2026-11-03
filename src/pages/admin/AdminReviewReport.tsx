
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase";

// ==========================================
// TYPES
// ==========================================

type ReportType =
  | "Weekly waste collection summary"
  | "Waste overflow summary"
  | "Collection response summary";

const reportTypes: ReportType[] = [
  "Weekly waste collection summary",
  "Waste overflow summary",
  "Collection response summary",
];

type SiteRow = {
  site_id: string;
  site_name: string;
  location: string | null;
  is_active: boolean;
};

type WasteReportRow = {
  report_id: string;
  site_id: string | null;
  address: string | null;
  date_uploaded: string;
  cnn_detection_level: string | null;
};

type ScheduleRow = {
  schedule_id: string;
  site_id: string | null;
  source_report_id: string | null;
};

type CollectionRow = {
  collection_id: string;
  schedule_id: string | null;
  collection_status: string | null;
  completed_at: string | null;
};

type SourceData = {
  sites: SiteRow[];
  reports: WasteReportRow[];
  linkedReports: WasteReportRow[];
  schedules: ScheduleRow[];
  collections: CollectionRow[];
  adminName: string;
};

type Summary = {
  collected: number;
  totalSites: number;
  overflowReports: number;
  averageResponseHours: number | null;
  responseCount: number;
  headers: string[];
  rows: (string | number)[][];
};

// ==========================================
// DATE HELPERS
// ==========================================

function todayInPhilippines(): string {
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

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateBounds(start: string, end: string) {
  return {
    from: new Date(
      `${start}T00:00:00+08:00`
    ).toISOString(),

    until: new Date(
      `${addDays(end, 1)}T00:00:00+08:00`
    ).toISOString(),
  };
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day)
  ).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "AD";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}

// ==========================================
// STATUS HELPERS
// ==========================================

function isCollected(value: string | null): boolean {
  return ["collected", "completed", "done"].includes(
    (value ?? "").trim().toLowerCase()
  );
}

function isOverflow(value: string | null): boolean {
  return ["FULL", "HIGH"].includes(
    (value ?? "").trim().toUpperCase()
  );
}

// ==========================================
// CSV HELPER
// ==========================================

function csvCell(value: string | number): string {
  const text = String(value);

  // Prevent spreadsheet formula injection.
  const safe = /^[=+@\-\t\r]/.test(text)
    ? `'${text}`
    : text;

  return `"${safe.replace(/"/g, '""')}"`;
}

// ==========================================
// SUPABASE PAGINATED FETCH
// ==========================================

const PAGE_SIZE = 500;

type TableName =
  | "disposal_sites"
  | "waste_reports"
  | "schedules"
  | "collections";

async function fetchAll<T>(
  table: TableName,
  columns: string,
  orderColumn: string,
  dateFilter?: {
    column: string;
    from: string;
    until: string;
  }
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;

  while (true) {
    let query = supabase.from(table).select(columns);

    if (dateFilter) {
      query = query
        .gte(dateFilter.column, dateFilter.from)
        .lt(dateFilter.column, dateFilter.until);
    }

    const { data, error } = await query
      .order(orderColumn, { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Unable to load ${table}: ${error.message}`
      );
    }

    const rows = (data ?? []) as unknown as T[];

    results.push(...rows);

    if (rows.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
  }

  return results;
}

// ==========================================
// LOAD DATA FROM SUPABASE
// ==========================================

async function loadReportData(
  startDate: string,
  endDate: string
): Promise<SourceData> {
  // Check authenticated user.
  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!authData.user) {
    throw new Error(
      "Please sign in to generate reports."
    );
  }

  // Check administrator profile.
  const {
    data: profile,
    error: profileError,
  } = await supabase
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

  const bounds = dateBounds(startDate, endDate);

  // Load database records concurrently.
  const [
    sites,
    reports,
    schedules,
    collections,
  ] = await Promise.all([
    fetchAll<SiteRow>(
      "disposal_sites",
      "site_id,site_name,location,is_active",
      "site_id"
    ),

    fetchAll<WasteReportRow>(
      "waste_reports",
      "report_id,site_id,address,date_uploaded,cnn_detection_level",
      "date_uploaded",
      {
        column: "date_uploaded",
        ...bounds,
      }
    ),

    fetchAll<ScheduleRow>(
      "schedules",
      "schedule_id,site_id,source_report_id",
      "schedule_id"
    ),

    fetchAll<CollectionRow>(
      "collections",
      "collection_id,schedule_id,collection_status,completed_at",
      "completed_at",
      {
        column: "completed_at",
        ...bounds,
      }
    ),
  ]);

  // A collection might respond to a report submitted
  // BEFORE the selected date range.
  // Fetch those source reports too.
  const scheduleMap = new Map(
    schedules.map((schedule) => [
      schedule.schedule_id,
      schedule,
    ])
  );

  const existingIds = new Set(
    reports.map((report) => report.report_id)
  );

  const missingReportIds = Array.from(
    new Set(
      collections
        .filter(
          (collection) =>
            isCollected(collection.collection_status) &&
            Boolean(collection.schedule_id)
        )
        .map((collection) => {
          const schedule = collection.schedule_id
            ? scheduleMap.get(collection.schedule_id)
            : undefined;

          return schedule?.source_report_id ?? null;
        })
        .filter(
          (id): id is string =>
            Boolean(id) && !existingIds.has(id!)
        )
    )
  );

  const linkedReports: WasteReportRow[] = [];

  // Batch queries to avoid very large IN filters.
  for (
    let index = 0;
    index < missingReportIds.length;
    index += 100
  ) {
    const ids = missingReportIds.slice(
      index,
      index + 100
    );

    const { data, error } = await supabase
      .from("waste_reports")
      .select(
        "report_id,site_id,address,date_uploaded,cnn_detection_level"
      )
      .in("report_id", ids);

    if (error) throw error;

    linkedReports.push(
      ...((data ?? []) as WasteReportRow[])
    );
  }

  return {
    sites,
    reports,
    linkedReports,
    schedules,
    collections,
    adminName:
      profile.full_name?.trim() || "Administrator",
  };
}

// ==========================================
// CALCULATE REPORT SUMMARY
// ==========================================

function calculateSummary(
  data: SourceData,
  zone: string,
  reportType: ReportType
): Summary {
  const activeSites = data.sites.filter(
    (site) => site.is_active === true
  );

  const selectedSites = activeSites.filter(
    (site) =>
      zone === "All zones" ||
      site.location?.trim() === zone
  );

  const selectedSiteIds = new Set(
    selectedSites.map((site) => site.site_id)
  );

  const siteMap = new Map(
    data.sites.map((site) => [
      site.site_id,
      site,
    ])
  );

  const scheduleMap = new Map(
    data.schedules.map((schedule) => [
      schedule.schedule_id,
      schedule,
    ])
  );

  const reportMap = new Map(
    [...data.linkedReports, ...data.reports].map(
      (report) => [report.report_id, report]
    )
  );

  // Filter reports by street / zone.
  const selectedReports = data.reports.filter(
    (report) => {
      if (zone === "All zones") return true;

      if (report.site_id) {
        return selectedSiteIds.has(report.site_id);
      }

      return (report.address ?? "")
        .toLowerCase()
        .includes(zone.toLowerCase());
    }
  );

  // CNN level FULL means an overflow report.
  const overflowReports = selectedReports.filter(
    (report) => isOverflow(report.cnn_detection_level)
  );

  // Completed collection records, with their schedules.
  const completedCollections: {
    collection: CollectionRow;
    schedule: ScheduleRow;
  }[] = [];

  for (const collection of data.collections) {
    if (
      !isCollected(collection.collection_status) ||
      !collection.completed_at ||
      !collection.schedule_id
    ) {
      continue;
    }

    const schedule = scheduleMap.get(
      collection.schedule_id
    );

    if (!schedule?.site_id) continue;

    // Count active disposal sites only.
    if (!selectedSiteIds.has(schedule.site_id)) {
      continue;
    }

    completedCollections.push({
      collection,
      schedule,
    });
  }

  // Count unique sites collected.
  const collectedSiteIds = new Set(
    completedCollections
      .map((item) => item.schedule.site_id)
      .filter((id): id is string => Boolean(id))
  );

  // ========================================
  // AVERAGE RESPONSE TIME
  // ========================================

  type ResponseItem = {
    reportId: string;
    siteName: string;
    completedAt: string;
    responseHours: number;
  };

  const responseMap = new Map<string, ResponseItem>();

  for (const {
    collection,
    schedule,
  } of completedCollections) {
    if (
      !schedule.source_report_id ||
      !collection.completed_at
    ) {
      continue;
    }

    const report = reportMap.get(
      schedule.source_report_id
    );

    if (!report) continue;

    const reportedTime = new Date(
      report.date_uploaded
    ).getTime();

    const collectedTime = new Date(
      collection.completed_at
    ).getTime();

    const duration = collectedTime - reportedTime;

    if (
      !Number.isFinite(duration) ||
      duration < 0
    ) {
      continue;
    }

    const responseHours =
      duration / (1000 * 60 * 60);

    const previous = responseMap.get(
      report.report_id
    );

    // Use the earliest completed collection
    // for each source report.
    if (
      !previous ||
      collectedTime <
        new Date(previous.completedAt).getTime()
    ) {
      responseMap.set(report.report_id, {
        reportId: report.report_id,
        siteName:
          (schedule.site_id
            ? siteMap.get(schedule.site_id)?.site_name
            : undefined) || "Unknown site",
        completedAt: collection.completed_at,
        responseHours,
      });
    }
  }

  const responses = Array.from(
    responseMap.values()
  );

  const averageResponseHours =
    responses.length > 0
      ? responses.reduce(
          (sum, item) => sum + item.responseHours,
          0
        ) / responses.length
      : null;

  // ========================================
  // DETAIL TABLE FOR EACH REPORT TYPE
  // ========================================

  let headers: string[] = [];
  let rows: (string | number)[][] = [];

  if (
    reportType ===
    "Weekly waste collection summary"
  ) {
    headers = [
      "Disposal Site",
      "Street / Zone",
      "Collections",
      "Status",
    ];

    const collectionCounts = new Map<string, number>();

    for (const { schedule } of completedCollections) {
      if (!schedule.site_id) continue;

      collectionCounts.set(
        schedule.site_id,
        (collectionCounts.get(schedule.site_id) ?? 0) + 1
      );
    }

    rows = selectedSites
      .map((site) => [
        site.site_name,
        site.location || "Not specified",
        collectionCounts.get(site.site_id) ?? 0,
        collectedSiteIds.has(site.site_id)
          ? "Collected"
          : "Not collected",
      ])
      .sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]))
      );
  }

  if (
    reportType ===
    "Waste overflow summary"
  ) {
    headers = [
      "Disposal Site",
      "Street / Zone",
      "Date Reported",
      "Waste Level",
    ];

    rows = [...overflowReports]
      .sort((a, b) =>
        b.date_uploaded.localeCompare(a.date_uploaded)
      )
      .map((report) => {
        const site = report.site_id
          ? siteMap.get(report.site_id)
          : undefined;

        return [
          site?.site_name ||
            report.address ||
            "Unregistered site",
          site?.location ||
            report.address ||
            "Not specified",
          formatDateTime(report.date_uploaded),
          "Full",
        ];
      });
  }

  if (
    reportType ===
    "Collection response summary"
  ) {
    headers = [
      "Disposal Site",
      "Report ID",
      "Collection Date",
      "Response Time (hrs)",
    ];

    rows = responses
      .sort((a, b) =>
        b.completedAt.localeCompare(a.completedAt)
      )
      .map((response) => [
        response.siteName,
        response.reportId,
        formatDateTime(response.completedAt),
        Number(response.responseHours.toFixed(2)),
      ]);
  }

  return {
    collected: collectedSiteIds.size,
    totalSites: selectedSites.length,
    overflowReports: overflowReports.length,
    averageResponseHours,
    responseCount: responses.length,
    headers,
    rows,
  };
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function ReviewReports() {
  const today = useMemo(
    () => todayInPhilippines(),
    []
  );

  const [reportType, setReportType] =
    useState<ReportType>(
      "Weekly waste collection summary"
    );

  const [startDate, setStartDate] = useState(
    () => addDays(today, -6)
  );

  const [endDate, setEndDate] = useState(today);

  const [zone, setZone] = useState("All zones");

  const [source, setSource] =
    useState<SourceData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  // ========================================
  // DATE VALIDATION
  // ========================================

  const validDateRange =
    Boolean(startDate && endDate) &&
    startDate <= endDate;

  const dateRange = validDateRange
    ? `${formatDate(startDate)} – ${formatDate(endDate)}`
    : "Select a valid date range";

  // ========================================
  // AUTO REFRESH
  // ========================================

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshKey((value) => value + 1);
    }, 60000);

    const handleFocus = () => {
      setRefreshKey((value) => value + 1);
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(
        "focus",
        handleFocus
      );
    };
  }, []);

  // ========================================
  // FETCH SUPABASE DATA
  // ========================================

  useEffect(() => {
    let active = true;

    if (!validDateRange) {
      setSource(null);
      setLoading(false);

      return () => {
        active = false;
      };
    }

    async function fetchData() {
      setLoading(true);
      setError("");
      setSource(null);

      try {
        const result = await loadReportData(
          startDate,
          endDate
        );

        if (!active) return;

        setSource(result);
      } catch (err) {
        if (!active) return;

        console.error(
          "[WasteTrack] Generate Reports:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to retrieve report data."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchData();

    return () => {
      active = false;
    };
  }, [
    startDate,
    endDate,
    validDateRange,
    refreshKey,
  ]);

  // ========================================
  // DYNAMIC STREET / ZONE OPTIONS
  // ========================================

  const zones = useMemo(() => {
    const locations = (source?.sites ?? [])
      .filter(
        (site) =>
          site.is_active &&
          Boolean(site.location?.trim())
      )
      .map((site) => site.location!.trim());

    return Array.from(
      new Set(locations)
    ).sort((a, b) => a.localeCompare(b));
  }, [source]);

  useEffect(() => {
    if (
      source &&
      zone !== "All zones" &&
      !zones.includes(zone)
    ) {
      setZone("All zones");
    }
  }, [source, zone, zones]);

  // ========================================
  // CALCULATE PREVIEW
  // ========================================

  const preview = useMemo(() => {
    if (!source) return null;

    return calculateSummary(
      source,
      zone,
      reportType
    );
  }, [source, zone, reportType]);

  const canExport =
    validDateRange &&
    !loading &&
    preview !== null;

  // ========================================
  // EXPORT CSV
  // ========================================

  function exportCSV() {
    if (!canExport || !preview) return;

    const rows: (string | number)[][] = [
      ["Report type", reportType],
      ["Date range", dateRange],
      ["Timezone", "Asia/Manila"],
      ["Street / zone", zone],
      [],
      ["Metric", "Value"],
      [
        "Sites collected",
        `${preview.collected} / ${preview.totalSites}`,
      ],
      [
        "Overflow reports",
        preview.overflowReports,
      ],
      [
        "Average response time",
        preview.averageResponseHours === null
          ? "N/A"
          : `${preview.averageResponseHours.toFixed(2)} hrs`,
      ],
      [
        "Reports with measured response",
        preview.responseCount,
      ],
      [],
      preview.headers,
      ...preview.rows,
    ];

    const csv = rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob(
      ["\uFEFF", csv],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `wastetrack-${startDate}-${endDate}.csv`;

    document.body.appendChild(link);

    link.click();
    link.remove();

    window.setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );

    setMessage("CSV downloaded successfully.");
  }

  // ========================================
  // EXPORT PDF
  // ========================================

  function exportPDF() {
    if (!canExport) return;

    setMessage(
      "Choose Save as PDF in the print dialog."
    );

    window.print();
  }

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="min-h-[100dvh] bg-white text-black">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }

          body * {
            visibility: hidden;
          }

          #waste-report-print,
          #waste-report-print * {
            visibility: visible;
          }

          #waste-report-print {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            padding: 0;
            color: black;
            background: white;
            box-shadow: none;
            border-radius: 0;
          }

          .waste-print-only {
            display: block !important;
          }

          .waste-screen-only {
            display: none !important;
          }

          .waste-report-table {
            font-size: 10px;
          }
        }
      `}</style>

      {/* ================================= */}
      {/* PAGE HEADER */}
      {/* ================================= */}

      <header className="
        waste-screen-only
        flex items-center justify-between
        gap-4 border-b-[6px] border-[#a5b57c]
        px-4 pb-2 pt-5
        sm:px-5
      ">
        <div>
          <h1 className="text-xl font-bold">
            Generate reports
          </h1>

          <p className="mt-1 text-xs text-neutral-500">
            Supabase collection, overflow, and
            response analytics
          </p>
        </div>

        <div
          aria-label={
            source?.adminName || "Administrator"
          }
          className="
            grid h-10 w-10 shrink-0
            place-items-center rounded-xl
            bg-[#ffd0d8] text-lg
            font-semibold text-[#e00000]
          "
        >
          {getInitials(
            source?.adminName || "Administrator"
          )}
        </div>
      </header>

      {/* ================================= */}
      {/* MAIN LAYOUT */}
      {/* ================================= */}

      <div className="
        grid grid-cols-1 gap-4
        p-4 sm:p-5
        lg:grid-cols-[1fr_0.96fr]
      ">

        {/* ================================= */}
        {/* REPORT SETTINGS */}
        {/* ================================= */}

        <section
          aria-label="Report settings"
          className="
            waste-screen-only
            rounded-2xl bg-[#faf3e7] p-4
          "
        >
          <div className="space-y-3">

            {/* REPORT TYPE */}

            <div>
              <label
                htmlFor="report-type"
                className="
                  mb-1 block text-[11px]
                  text-neutral-600
                "
              >
                Report type
              </label>

              <select
                id="report-type"
                value={reportType}
                onChange={(event) => {
                  setReportType(
                    event.target.value as ReportType
                  );
                  setMessage("");
                }}
                className="
                  h-9 w-full rounded-lg
                  border border-neutral-300
                  bg-white px-2 text-xs
                  outline-none focus:border-red-500
                "
              >
                {reportTypes.map((type) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* DATE RANGE */}

            <fieldset>
              <legend className="
                mb-1 text-[11px] text-neutral-600
              ">
                Date range
              </legend>

              <div className="
                grid grid-cols-1 gap-2
                min-[380px]:grid-cols-2
              ">
                <input
                  type="date"
                  aria-label="Start date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(
                      event.target.value
                    );
                    setMessage("");
                  }}
                  className="
                    h-9 min-w-0 w-full
                    rounded-lg border
                    border-neutral-300
                    bg-white px-2 text-xs
                    outline-none
                    focus:border-red-500
                  "
                />

                <input
                  type="date"
                  aria-label="End date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(
                      event.target.value
                    );
                    setMessage("");
                  }}
                  className="
                    h-9 min-w-0 w-full
                    rounded-lg border
                    border-neutral-300
                    bg-white px-2 text-xs
                    outline-none
                    focus:border-red-500
                  "
                />
              </div>

              {!validDateRange && (
                <p
                  role="alert"
                  className="mt-1 text-xs text-red-600"
                >
                  Choose an end date on or after
                  the start date.
                </p>
              )}
            </fieldset>

            {/* STREET / ZONE */}

            <div>
              <label
                htmlFor="report-zone"
                className="
                  mb-1 block text-[11px]
                  text-neutral-600
                "
              >
                Street / zone
              </label>

              <select
                id="report-zone"
                value={zone}
                onChange={(event) => {
                  setZone(event.target.value);
                  setMessage("");
                }}
                className="
                  h-9 w-full rounded-lg
                  border border-neutral-300
                  bg-white px-2 text-xs
                  outline-none
                  focus:border-red-500
                "
              >
                <option value="All zones">
                  All zones
                </option>

                {zones.map((location) => (
                  <option
                    key={location}
                    value={location}
                  >
                    {location}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ================================= */}
          {/* EXPORT BUTTONS */}
          {/* ================================= */}

          <div className="
            mt-4 flex flex-wrap gap-3
          ">
            <button
              type="button"
              onClick={exportCSV}
              disabled={!canExport}
              className="
                rounded-lg border
                border-[#ff0019] bg-white
                px-3 py-2 text-xs font-medium
                text-[#ed0015]
                hover:bg-red-50
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              Export CSV
            </button>

            <button
              type="button"
              onClick={exportPDF}
              disabled={!canExport}
              className="
                rounded-lg bg-[#ed0015]
                px-3 py-2 text-xs
                font-medium text-white
                hover:bg-red-700
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              Export PDF
            </button>

            <button
              type="button"
              onClick={() =>
                setRefreshKey((n) => n + 1)
              }
              disabled={loading}
              className="
                rounded-lg border
                border-neutral-300
                bg-white px-3 py-2
                text-xs font-medium
                text-neutral-700
                hover:bg-neutral-50
                disabled:opacity-50
              "
            >
              Refresh
            </button>
          </div>

          {/* ================================= */}
          {/* LOADING / ERROR MESSAGES */}
          {/* ================================= */}

          {loading && (
            <p
              role="status"
              className="
                mt-3 text-xs text-neutral-600
              "
            >
              Loading Supabase records...
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 text-xs text-red-700"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              className="
                mt-3 text-xs text-green-700
              "
            >
              {message}
            </p>
          )}
        </section>

        {/* ================================= */}
        {/* PREVIEW SUMMARY */}
        {/* ================================= */}

        <section
          id="waste-report-print"
          aria-labelledby="preview-title"
          className="
            min-w-0 rounded-2xl
            bg-[#faf3e7] p-4
          "
        >
          {/* PRINT-ONLY HEADER */}

          <div className="
            waste-print-only mb-6 hidden
          ">
            <h1 className="
              text-xl font-bold
            ">
              WasteTrack
            </h1>

            <h2 className="
              mt-2 text-lg font-semibold
            ">
              {reportType}
            </h2>

            <p className="mt-2 text-sm">
              {dateRange}
            </p>

            <p className="text-sm">
              Street / zone: {zone}
            </p>
          </div>

          <h2
            id="preview-title"
            className="
              text-sm font-bold uppercase
              text-[#656161]
            "
          >
            Preview Summary
          </h2>

          {/* SUMMARY VALUES */}

          <dl className="mt-5 space-y-6">
            <SummaryRow
              label="Sites collected"
              value={
                loading || !preview
                  ? "—"
                  : `${preview.collected} / ${preview.totalSites}`
              }
            />

            <SummaryRow
              label="Overflow reports"
              value={
                loading || !preview
                  ? "—"
                  : String(
                      preview.overflowReports
                    )
              }
            />

            <SummaryRow
              label="Avg. response time"
              value={
                loading || !preview
                  ? "—"
                  : preview.averageResponseHours === null
                    ? "N/A"
                    : `${preview.averageResponseHours.toFixed(2)} hrs`
              }
            />
          </dl>

          {/* ================================= */}
          {/* REPORT DETAILS */}
          {/* ================================= */}

          {preview && !loading && (
            <>
              <p className="
                mt-6 text-[11px]
                text-neutral-600
              ">
                {reportType ===
                "Collection response summary"
                  ? `${preview.responseCount} reports with a linked completed collection`
                  : "Showing records for the selected date range and street / zone."}
              </p>

              <div className="
                mt-3 w-full overflow-x-auto
              ">
                <table className="
                  waste-report-table
                  w-full min-w-[380px]
                  border-collapse text-left
                  text-[11px]
                ">
                  <thead>
                    <tr>
                      {preview.headers.map(
                        (heading) => (
                          <th
                            key={heading}
                            className="
                              border-b
                              border-neutral-300
                              px-2 py-2
                              font-semibold
                            "
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {preview.rows.map(
                      (row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map(
                            (cell, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="
                                  border-b
                                  border-neutral-200
                                  px-2 py-2
                                  align-top
                                  break-words
                                "
                              >
                                {cell}
                              </td>
                            )
                          )}
                        </tr>
                      )
                    )}

                    {preview.rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={
                            preview.headers.length
                          }
                          className="
                            py-4 text-center
                            text-neutral-500
                          "
                        >
                          No matching records
                          found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && !preview && (
            <p
              role="alert"
              className="
                mt-4 text-xs text-red-700
              "
            >
              Report data is unavailable.
              {" "}
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

// ==========================================
// REUSABLE SUMMARY ROW
// ==========================================

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="
      grid grid-cols-[1fr_auto]
      items-center gap-4
    ">
      <dt className="text-sm">
        {label}
      </dt>

      <dd className="
        min-w-[60px]
        text-left text-sm font-bold
      ">
        {value}
      </dd>
    </div>
  );
}
