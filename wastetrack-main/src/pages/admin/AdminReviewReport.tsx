
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  MapPin,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

type ReportType =
  | "Weekly waste collection summary"
  | "Waste overflow summary"
  | "Collection response summary";

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

type TableName =
  | "disposal_sites"
  | "waste_reports"
  | "schedules"
  | "collections";

const REPORT_TYPES: ReportType[] = [
  "Weekly waste collection summary",
  "Waste overflow summary",
  "Collection response summary",
];

const PAGE_SIZE = 500;

// ========================================
// DATE HELPERS
// ========================================

function todayInPhilippines(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  return (
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function dateBounds(start: string, end: string) {
  return {
    from: new Date(`${start}T00:00:00+08:00`).toISOString(),
    until: new Date(`${addDays(end, 1)}T00:00:00+08:00`).toISOString(),
  };
}

function formatDate(value: string): string {
  if (!validDate(value)) return value;

  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ========================================
// STATUS HELPERS
// ========================================

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

function csvCell(value: string | number): string {
  const raw = String(value).replace(/\r\n?/g, "\n");
  const safe = /^\s*[=+@\ -]/.test(raw)
    ? `'${raw}`
    : raw;

  return `"${safe.replace(/"/g, '""')}"`;
}

// ========================================
// SUPABASE PAGINATED FETCH
// ========================================

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

  for (let offset = 0; ; offset += PAGE_SIZE) {
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
      throw new Error(`Unable to load ${table}: ${error.message}`);
    }

    const page = (data ?? []) as unknown as T[];
    results.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return results;
}

async function fetchByIds<T>(
  table: "schedules" | "waste_reports",
  columns: string,
  idColumn: string,
  ids: string[]
): Promise<T[]> {
  const results: T[] = [];

  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(idColumn, ids.slice(index, index + 100));

    if (error) {
      throw new Error(`Unable to load ${table}: ${error.message}`);
    }

    results.push(...((data ?? []) as unknown as T[]));
  }

  return results;
}

// ========================================
// LOAD REPORT DATA FROM SUPABASE
// ========================================

async function loadReportData(
  startDate: string,
  endDate: string
): Promise<SourceData> {
  // Verify signed-in user.
  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!authData.user) {
    throw new Error("Please sign in to generate reports.");
  }

  // Verify admin role.
  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("users")
    .select("role,is_active")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (
    !profile ||
    String(profile.role).toLowerCase() !== "admin" ||
    profile.is_active === false
  ) {
    throw new Error("Administrator access is required.");
  }

  const bounds = dateBounds(startDate, endDate);

  // Fetch site information, reports, and collections.
  const [sites, reports, collections] = await Promise.all([
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

  // Fetch schedules linked to completed collections.
  const scheduleIds = [
    ...new Set(
      collections
        .filter(
          (item) =>
            isCollected(item.collection_status) &&
            item.completed_at
        )
        .map((item) => item.schedule_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const schedules = await fetchByIds<ScheduleRow>(
    "schedules",
    "schedule_id,site_id,source_report_id",
    "schedule_id",
    scheduleIds
  );

  // Fetch older reports when a completed collection
  // references a report outside the selected date range.
  const existingIds = new Set(
    reports.map((item) => item.report_id)
  );

  const linkedIds = [
    ...new Set(
      schedules
        .map((item) => item.source_report_id)
        .filter(
          (id): id is string =>
            Boolean(id) && !existingIds.has(id!)
        )
    ),
  ];

  const linkedReports = await fetchByIds<WasteReportRow>(
    "waste_reports",
    "report_id,site_id,address,date_uploaded,cnn_detection_level",
    "report_id",
    linkedIds
  );

  return {
    sites,
    reports,
    linkedReports,
    schedules,
    collections,
  };
}

// ========================================
// CALCULATE REPORT SUMMARY
// ========================================

function calculateSummary(
  data: SourceData,
  zone: string,
  reportType: ReportType
): Summary {
  const activeSites = data.sites.filter(
    (site) => site.is_active
  );

  const selectedSites = activeSites.filter(
    (site) =>
      zone === "All zones" ||
      site.location?.trim() === zone
  );

  const selectedIds = new Set(
    selectedSites.map((site) => site.site_id)
  );

  const siteMap = new Map(
    data.sites.map((site) => [
      site.site_id,
      site,
    ])
  );

  const scheduleMap = new Map(
    data.schedules.map((row) => [
      row.schedule_id,
      row,
    ])
  );

  const reportMap = new Map(
    [...data.linkedReports, ...data.reports].map(
      (report) => [
        report.report_id,
        report,
      ]
    )
  );

  // Filter submitted reports based on street / zone.
  const selectedReports = data.reports.filter((report) => {
    if (zone === "All zones") return true;

    if (report.site_id) {
      return selectedIds.has(report.site_id);
    }

    return (report.address ?? "")
      .toLowerCase()
      .includes(zone.toLowerCase());
  });

  // CNN High/Full indicates a full-level report.
  const overflowReports = selectedReports.filter(
    (report) => isOverflow(report.cnn_detection_level)
  );

  // Group confirmed collections by disposal site.
  const completedCollections: {
    collection: CollectionRow;
    schedule: ScheduleRow;
    siteId: string;
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

    if (!schedule) continue;

    const siteId =
      schedule.site_id ||
      (schedule.source_report_id
        ? reportMap.get(schedule.source_report_id)?.site_id
        : null);

    if (!siteId || !selectedIds.has(siteId)) continue;

    completedCollections.push({
      collection,
      schedule,
      siteId,
    });
  }

  const collectedSiteIds = new Set(
    completedCollections.map((item) => item.siteId)
  );

  // Calculate response time using the first completed
  // collection associated with each source report.
  const responseMap = new Map<
    string,
    {
      reportId: string;
      siteName: string;
      completedAt: string;
      responseHours: number;
    }
  >();

  for (const { collection, schedule, siteId } of completedCollections) {
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

    const duration =
      new Date(collection.completed_at).getTime() -
      new Date(report.date_uploaded).getTime();

    if (!Number.isFinite(duration) || duration < 0) {
      continue;
    }

    const previous = responseMap.get(report.report_id);

    if (
      !previous ||
      new Date(collection.completed_at).getTime() <
        new Date(previous.completedAt).getTime()
    ) {
      responseMap.set(report.report_id, {
        reportId: report.report_id,
        siteName:
          siteMap.get(siteId)?.site_name ||
          "Unknown site",
        completedAt: collection.completed_at,
        responseHours: duration / 3_600_000,
      });
    }
  }

  const responses = [...responseMap.values()];

  const averageResponseHours = responses.length
    ? responses.reduce(
        (total, item) => total + item.responseHours,
        0
      ) / responses.length
    : null;

  let headers: string[] = [];
  let rows: (string | number)[][] = [];

  // ====================================
  // WEEKLY COLLECTION SUMMARY
  // ====================================

  if (reportType === "Weekly waste collection summary") {
    const counts = new Map<string, number>();

    for (const item of completedCollections) {
      counts.set(
        item.siteId,
        (counts.get(item.siteId) ?? 0) + 1
      );
    }

    headers = [
      "Disposal site",
      "Street / zone",
      "Collections",
      "Status",
    ];

    rows = [...selectedSites]
      .sort((a, b) =>
        a.site_name.localeCompare(b.site_name)
      )
      .map((site) => [
        site.site_name,
        site.location || "Not specified",
        counts.get(site.site_id) ?? 0,
        collectedSiteIds.has(site.site_id)
          ? "Collected"
          : "Not collected",
      ]);
  }

  // ====================================
  // WASTE OVERFLOW SUMMARY
  // ====================================

  else if (reportType === "Waste overflow summary") {
    headers = [
      "Disposal site",
      "Street / zone",
      "Date reported",
      "Waste level",
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

  // ====================================
  // COLLECTION RESPONSE SUMMARY
  // ====================================

  else {
    headers = [
      "Disposal site",
      "Report ID",
      "Collection date",
      "Response time (hrs)",
    ];

    rows = responses
      .sort((a, b) =>
        b.completedAt.localeCompare(a.completedAt)
      )
      .map((item) => [
        item.siteName,
        item.reportId,
        formatDateTime(item.completedAt),
        Number(item.responseHours.toFixed(2)),
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

// ========================================
// SHARED FORM INPUT STYLE
// ========================================

const inputClass = `
  w-full min-w-0 rounded-xl
  border border-[#DDD5C8]
  bg-[#FFFCF8]
  px-3 py-3
  text-[12px] text-[#333]
  outline-none transition
  focus:border-[#A5B26B]
  focus:ring-2 focus:ring-[#A5B26B]/20
  disabled:opacity-50
`;

// ========================================
// SUMMARY ROW COMPONENT
// ========================================

function SummaryRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div
      className="
        flex flex-wrap items-center
        justify-between gap-3
        border-b border-[#F0E9E0]
        py-4 last:border-b-0
      "
    >
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-[#555]">
          {label}
        </p>

        {note && (
          <p className="mt-1 text-[10px] text-[#999]">
            {note}
          </p>
        )}
      </div>

      <strong
        className="
          text-[19px] font-extrabold
          tabular-nums text-[#A81B1E]
        "
      >
        {value}
      </strong>
    </div>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function AdminReviewReport() {
  const today = useMemo(todayInPhilippines, []);

  const [reportType, setReportType] =
    useState<ReportType>(REPORT_TYPES[0]);

  const [startDate, setStartDate] =
    useState(() => addDays(today, -6));

  const [endDate, setEndDate] = useState(today);

  const [zone, setZone] = useState("All zones");

  const [source, setSource] =
    useState<SourceData | null>(null);

  const [loadedDates, setLoadedDates] = useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  const requestRef = useRef(0);

  // ========================================
  // DATE VALIDATION
  // ========================================

  const validRange =
    validDate(startDate) &&
    validDate(endDate) &&
    startDate <= endDate;

  const dateKey = `${startDate}|${endDate}`;

  const dateRange = validRange
    ? `${formatDate(startDate)} – ${formatDate(endDate)}`
    : "Select a valid date range";

  // ========================================
  // LOAD SUPABASE DATA
  // ========================================

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;

    if (!validRange) {
      setError(
        "Select a valid start date and an end date on or after it."
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await loadReportData(
        startDate,
        endDate
      );

      if (requestId !== requestRef.current) return;

      setSource(result);
      setLoadedDates(`${startDate}|${endDate}`);
    } catch (cause) {
      if (requestId !== requestRef.current) return;

      console.error(
        "[WasteTrack] Admin report generator:",
        cause
      );

      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load report data."
      );
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [startDate, endDate, validRange]);

  // ========================================
  // AUTO REFRESH + SUPABASE REALTIME
  // ========================================

  useEffect(() => {
    void refresh();

    const interval = window.setInterval(
      () => void refresh(),
      60_000
    );

    const onFocus = () => void refresh();

    window.addEventListener("focus", onFocus);

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onChange = () => {
      if (timer) clearTimeout(timer);

      timer = setTimeout(
        () => void refresh(),
        600
      );
    };

    const channel = supabase.channel(
      "wastetrack-admin-report-review"
    );

    for (const table of [
      "disposal_sites",
      "waste_reports",
      "schedules",
      "collections",
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
      window.removeEventListener("focus", onFocus);

      if (timer) clearTimeout(timer);

      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // ========================================
  // DYNAMIC STREET / ZONE OPTIONS
  // ========================================

  const zones = useMemo(
    () =>
      [
        ...new Set(
          (source?.sites ?? [])
            .filter(
              (site) =>
                site.is_active &&
                site.location?.trim()
            )
            .map((site) => site.location!.trim())
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [source]
  );

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

  const isCurrent = loadedDates === dateKey;

  const preview = useMemo(
    () =>
      source && isCurrent
        ? calculateSummary(source, zone, reportType)
        : null,
    [source, isCurrent, zone, reportType]
  );

  const canExport = Boolean(
    preview &&
      validRange &&
      !loading &&
      !error
  );

  // ========================================
  // EXPORT CSV
  // ========================================

  function exportCSV() {
    if (!preview || !canExport) return;

    const metrics: (string | number)[][] = [
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
      ["Full-level reports", preview.overflowReports],
      [
        "Average report-to-collection time",
        preview.averageResponseHours === null
          ? "N/A"
          : `${preview.averageResponseHours.toFixed(2)} hrs`,
      ],
      ["Reports with measured response", preview.responseCount],
      [],
      preview.headers,
      ...preview.rows,
    ];

    const csv =
      "\uFEFF" +
      metrics
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n");

    const url = URL.createObjectURL(
      new Blob([csv], {
        type: "text/csv;charset=utf-8",
      })
    );

    const a = document.createElement("a");

    a.href = url;

    a.download =
      `wastetrack-${startDate}-${endDate}-` +
      `${reportType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

    document.body.appendChild(a);

    a.click();
    a.remove();

    window.setTimeout(
      () => URL.revokeObjectURL(url),
      2000
    );

    setMessage("CSV download started.");
  }

  // ========================================
  // EXPORT PDF USING BROWSER PRINT
  // ========================================

  function exportPDF() {
    if (!canExport) return;

    setMessage(
      "In the print dialog, choose Save as PDF to save your report."
    );

    window.print();
  }

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <main
      className="
        min-h-[100dvh] w-full
        bg-[#FFFCF8]
        font-['Fira_Sans','Segoe_UI',Arial,sans-serif]
        text-[#242424]
      "
    >
      {/* ====================================
          PDF PRINT STYLING
      ==================================== */}

      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 12mm;
          }

          body * {
            visibility: hidden !important;
          }

          #admin-report-print,
          #admin-report-print * {
            visibility: visible !important;
          }

          #admin-report-print {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: white;
            color: black;
            padding: 0;
            margin: 0;
          }

          #admin-report-print table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9pt;
          }

          #admin-report-print th,
          #admin-report-print td {
            text-align: left;
            vertical-align: top;
            padding: 6px;
            border-bottom: 1px solid #ddd;
            overflow-wrap: anywhere;
          }

          #admin-report-print thead {
            display: table-header-group;
          }

          #admin-report-print tr {
            break-inside: avoid;
          }
        }
      `}</style>

      <div
        className="
          mx-auto w-full max-w-[1600px]
          px-4 py-6 sm:px-6
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
              rounded-2xl border border-red-200
              bg-red-50 p-4
            "
          >
            <AlertCircle
              size={20}
              className="mt-0.5 shrink-0 text-[#A81B1E]"
            />

            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold text-[#A81B1E]">
                Unable to load report data
              </p>

              <p className="mt-1 break-words text-[12px] text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() => void refresh()}
                className="
                  mt-3 rounded-lg bg-[#A81B1E]
                  px-4 py-2 text-xs font-bold
                  text-white hover:bg-[#8F1619]
                "
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <div
          className="
            grid grid-cols-1 items-start gap-5
            lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]
          "
        >
          {/* ==================================
              REPORT SETTINGS PANEL
          ================================== */}

          <section
            className="
              min-w-0 overflow-hidden rounded-2xl
              border border-[#EAE2D7] bg-white shadow-sm
            "
          >
            <div
              className="
                flex items-center gap-3
                border-b border-[#F0E9E0]
                px-4 py-5 sm:px-5
              "
            >
              <div
                className="
                  grid h-11 w-11 shrink-0 place-items-center
                  rounded-xl bg-[#F7F0E4] text-[#A81B1E]
                "
              >
                <FileText size={22} />
              </div>

              <div>
                <h1 className="text-[17px] font-extrabold sm:text-[19px]">
                  Generate reports
                </h1>

                <p className="mt-0.5 text-[11px] text-[#999]">
                  Actual waste reports and collection data
                </p>
              </div>
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              {/* REPORT TYPE */}

              <div>
                <label
                  htmlFor="report-type"
                  className="mb-2 block text-[12px] font-bold text-[#555]"
                >
                  Report type
                </label>

                <div className="relative">
                  <select
                    id="report-type"
                    value={reportType}
                    onChange={(event) => {
                      setReportType(
                        event.target.value as ReportType
                      );
                      setMessage("");
                    }}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    {REPORT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={17}
                    className="
                      pointer-events-none absolute right-3
                      top-1/2 -translate-y-1/2 text-[#999]
                    "
                  />
                </div>
              </div>

              {/* DATE RANGE */}

              <fieldset>
                <legend
                  className="
                    mb-2 flex items-center gap-2
                    text-[12px] font-bold text-[#555]
                  "
                >
                  <CalendarDays
                    size={15}
                    className="text-[#A81B1E]"
                  />
                  Date range (Philippine time)
                </legend>

                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div>
                    <label
                      htmlFor="report-start"
                      className="mb-1.5 block text-[11px] text-[#888]"
                    >
                      From
                    </label>

                    <input
                      id="report-start"
                      type="date"
                      value={startDate}
                      max={endDate || undefined}
                      onChange={(event) => {
                        setStartDate(event.target.value);
                        setMessage("");
                      }}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="report-end"
                      className="mb-1.5 block text-[11px] text-[#888]"
                    >
                      To
                    </label>

                    <input
                      id="report-end"
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(event) => {
                        setEndDate(event.target.value);
                        setMessage("");
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>

                {!validRange && (
                  <p
                    role="alert"
                    className="mt-2 text-[11px] text-[#A81B1E]"
                  >
                    Choose valid dates with the end on or after the start.
                  </p>
                )}
              </fieldset>

              {/* STREET / ZONE */}

              <div>
                <label
                  htmlFor="report-zone"
                  className="
                    mb-2 flex items-center gap-2
                    text-[12px] font-bold text-[#555]
                  "
                >
                  <MapPin size={15} className="text-[#A81B1E]" />
                  Street / zone
                </label>

                <div className="relative">
                  <select
                    id="report-zone"
                    value={zone}
                    onChange={(event) => {
                      setZone(event.target.value);
                      setMessage("");
                    }}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    <option value="All zones">All zones</option>

                    {zones.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={17}
                    className="
                      pointer-events-none absolute right-3
                      top-1/2 -translate-y-1/2 text-[#999]
                    "
                  />
                </div>

                <p className="mt-1.5 text-[11px] text-[#999]">
                  Streets are loaded from your disposal_sites table.
                </p>
              </div>

              {/* EXPORT BUTTONS */}

              <div
                className="
                  flex flex-col gap-3
                  border-t border-[#F0E9E0] pt-5
                  min-[420px]:flex-row
                "
              >
                <button
                  type="button"
                  disabled={!canExport}
                  onClick={exportCSV}
                  className="
                    inline-flex flex-1 items-center
                    justify-center gap-2 rounded-xl
                    border border-[#A81B1E] bg-white
                    px-4 py-3 text-[12px] font-bold
                    text-[#A81B1E] hover:bg-[#FFF2F0]
                    disabled:cursor-not-allowed disabled:opacity-50
                  "
                >
                  <FileSpreadsheet size={17} />
                  Export CSV
                </button>

                <button
                  type="button"
                  disabled={!canExport}
                  onClick={exportPDF}
                  className="
                    inline-flex flex-1 items-center
                    justify-center gap-2 rounded-xl
                    bg-[#A81B1E] px-4 py-3
                    text-[12px] font-bold text-white
                    hover:bg-[#8F1619]
                    disabled:cursor-not-allowed disabled:opacity-50
                  "
                >
                  <Download size={17} />
                  Export PDF
                </button>
              </div>

              {loading && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-[11px] text-[#777]"
                >
                  <LoaderCircle
                    size={15}
                    className="animate-spin text-[#A5B26B]"
                  />
                  Loading Supabase records...
                </p>
              )}

              {message && (
                <p
                  role="status"
                  className="flex items-start gap-2 text-[12px] text-[#557836]"
                >
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0"
                  />
                  {message}
                </p>
              )}
            </div>
          </section>

          {/* ==================================
              PREVIEW SUMMARY PANEL
          ================================== */}

          <section
            aria-busy={loading}
            className="
              min-w-0 overflow-hidden rounded-2xl
              border border-[#EAE2D7] bg-white shadow-sm
            "
          >
            <div
              className="
                flex items-center justify-between gap-3
                border-b border-[#F0E9E0]
                px-4 py-5 sm:px-5
              "
            >
              <div className="flex items-center gap-3">
                <div
                  className="
                    grid h-11 w-11 shrink-0 place-items-center
                    rounded-xl bg-[#EEF4E5] text-[#6F8D47]
                  "
                >
                  <BarChart3 size={21} />
                </div>

                <div>
                  <h2 className="text-[16px] font-extrabold sm:text-[18px]">
                    Preview summary
                  </h2>

                  <p className="mt-0.5 text-[11px] text-[#999]">
                    Calculated using Supabase records
                  </p>
                </div>
              </div>

              {loading && (
                <LoaderCircle
                  size={18}
                  className="shrink-0 animate-spin text-[#A5B26B]"
                />
              )}
            </div>

            <div className="p-4 sm:p-5">
              <div
                className="
                  rounded-xl border border-[#EBE4D9]
                  bg-[#FFFCF8] p-3
                "
              >
                <p className="break-words text-[12px] font-bold text-[#555]">
                  {reportType}
                </p>

                <p className="mt-1 break-words text-[11px] text-[#999]">
                  {dateRange} · {zone}
                </p>
              </div>

              <div className="mt-2">
                <SummaryRow
                  label="Sites collected"
                  value={
                    !loading && preview
                      ? `${preview.collected} / ${preview.totalSites}`
                      : "—"
                  }
                  note="Unique active sites with a completed collection"
                />

                <SummaryRow
                  label="Full-level reports"
                  value={
                    !loading && preview
                      ? String(preview.overflowReports)
                      : "—"
                  }
                  note="CNN High / Full classification"
                />

                <SummaryRow
                  label="Avg. response time"
                  value={
                    !loading && preview
                      ? preview.averageResponseHours === null
                        ? "N/A"
                        : `${preview.averageResponseHours.toFixed(2)} hrs`
                      : "—"
                  }
                  note="Report submission to first completed collection"
                />

                <SummaryRow
                  label="Measured responses"
                  value={
                    !loading && preview
                      ? String(preview.responseCount)
                      : "—"
                  }
                  note="Reports with a linked completed collection"
                />
              </div>
            </div>
          </section>
        </div>

        {/* ====================================
            DETAILED RECORDS
        ==================================== */}

        <section
          className="
            mt-5 min-w-0 overflow-hidden rounded-2xl
            border border-[#EAE2D7] bg-white shadow-sm
          "
        >
          <div
            className="
              flex flex-wrap items-center justify-between gap-3
              border-b border-[#F0E9E0]
              px-4 py-5 sm:px-5
            "
          >
            <div className="flex items-center gap-3">
              <div
                className="
                  grid h-10 w-10 place-items-center
                  rounded-xl bg-[#F7F0E4] text-[#A81B1E]
                "
              >
                <ClipboardList size={19} />
              </div>

              <h2 className="text-[15px] font-extrabold">
                Detailed records
              </h2>
            </div>

            <span className="text-[11px] text-[#999]">
              {loading
                ? "Updating..."
                : `${preview?.rows.length ?? 0} records`}
            </span>
          </div>

          {loading ? (
            <div
              role="status"
              className="
                flex min-h-[180px] items-center
                justify-center gap-2 text-[12px] text-[#777]
              "
            >
              <LoaderCircle
                size={19}
                className="animate-spin text-[#A5B26B]"
              />
              Loading report details...
            </div>
          ) : !preview || preview.rows.length === 0 ? (
            <div
              className="
                flex min-h-[180px] flex-col items-center
                justify-center gap-2 p-6 text-center
              "
            >
              <ClipboardList
                size={28}
                className="text-[#A5B26B]"
              />

              <p className="text-[13px] font-semibold text-[#555]">
                No matching records
              </p>

              <p className="text-[11px] text-[#999]">
                Try another date range or street / zone.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE */}

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[700px] border-collapse text-left">
                  <thead className="bg-[#FFFCF8]">
                    <tr>
                      {preview.headers.map((header) => (
                        <th
                          key={header}
                          className="px-5 py-4 text-[11px] font-bold text-[#777]"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {preview.rows.map((row, index) => (
                      <tr
                        key={index}
                        className="
                          border-t border-[#F0E9E0]
                          hover:bg-[#FFFCF8]
                        "
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="
                              max-w-[300px] break-words
                              px-5 py-4 text-[12px] text-[#555]
                            "
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS */}

              <div className="divide-y divide-[#F0E9E0] md:hidden">
                {preview.rows.map((row, index) => (
                  <article
                    key={index}
                    className="p-4 sm:p-5"
                  >
                    <p className="mb-3 text-[11px] font-bold text-[#A81B1E]">
                      Record {index + 1}
                    </p>

                    <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
                      {row.map((cell, cellIndex) => (
                        <div
                          key={cellIndex}
                          className="min-w-0"
                        >
                          <p className="text-[10px] font-semibold text-[#999]">
                            {preview.headers[cellIndex]}
                          </p>

                          <p
                            className="
                              mt-1 break-words text-[12px]
                              font-semibold text-[#444]
                            "
                          >
                            {cell}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ====================================
          PRINT-ONLY PDF CONTENT
      ==================================== */}

      <section
        id="admin-report-print"
        className="hidden"
        aria-label="Printable WasteTrack report"
      >
        <h1
          style={{
            fontSize: "19pt",
            fontWeight: "bold",
            marginBottom: 6,
          }}
        >
          WasteTrack
        </h1>

        <h2
          style={{
            fontSize: "14pt",
            fontWeight: "bold",
            marginBottom: 5,
          }}
        >
          {reportType}
        </h2>

        <p style={{ fontSize: "10pt", marginBottom: 3 }}>
          Period: {dateRange} (Asia/Manila)
        </p>

        <p style={{ fontSize: "10pt", marginBottom: 16 }}>
          Street / zone: {zone}
        </p>

        <h3
          style={{
            fontSize: "12pt",
            fontWeight: "bold",
            marginBottom: 8,
          }}
        >
          Summary
        </h3>

        <table style={{ marginBottom: 18 }}>
          <tbody>
            <tr>
              <th>Sites collected</th>
              <td>
                {preview
                  ? `${preview.collected} / ${preview.totalSites}`
                  : "N/A"}
              </td>
            </tr>

            <tr>
              <th>Full-level reports (CNN)</th>
              <td>{preview?.overflowReports ?? "N/A"}</td>
            </tr>

            <tr>
              <th>Avg. response time</th>
              <td>
                {preview
                  ? preview.averageResponseHours === null
                    ? "N/A"
                    : `${preview.averageResponseHours.toFixed(2)} hrs`
                  : "N/A"}
              </td>
            </tr>

            <tr>
              <th>Measured responses</th>
              <td>{preview?.responseCount ?? "N/A"}</td>
            </tr>
          </tbody>
        </table>

        <h3
          style={{
            fontSize: "12pt",
            fontWeight: "bold",
            marginBottom: 8,
          }}
        >
          Detailed records
        </h3>

        <table>
          <thead>
            <tr>
              {preview?.headers.map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {preview?.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}

            {preview && preview.rows.length === 0 && (
              <tr>
                <td colSpan={preview.headers.length}>
                  No matching records.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <p
          style={{
            fontSize: "8pt",
            color: "#555",
            marginTop: 15,
          }}
        >
          Full-level reports reflect CNN High / Full classifications,
          not independently verified overflow. Response time is
          calculated only where a source report is linked to a
          completed collection.
        </p>
      </section>
    </main>
  );
}
