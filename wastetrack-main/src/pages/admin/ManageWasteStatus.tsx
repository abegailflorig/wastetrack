
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

import {
  AlertCircle,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  ClipboardList,
  Inbox,
  LoaderCircle,
  MapPin,
  Search,
  X,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

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
  lastUpdated: string | null;
  status: FillStatus;
}

interface DisposalSiteRow {
  site_id: string;
  site_name: string;
  location: string | null;
  is_active: boolean;
}

interface WasteReportRow {
  report_id: string;
  site_id: string | null;
  cnn_detection_level: string | null;
  date_uploaded: string;
}

interface ScheduleRow {
  schedule_id: string;
  site_id: string | null;
  status: string | null;
  date_completed: string | null;
}

interface CollectionRow {
  collection_id: string;
  schedule_id: string | null;
  collection_status: string | null;
  completed_at: string | null;
}

type TableName =
  | "disposal_sites"
  | "waste_reports"
  | "schedules"
  | "collections";

// ========================================
// CONSTANTS
// ========================================

const PAGE_SIZE = 500;

const FILTERS: Filter[] = [
  "All",
  "Empty",
  "Near Full",
  "Full",
  "No report",
];

// ========================================
// NORMALIZE CNN WASTE LEVEL
// ========================================

function normalizeStatus(
  value: string | null
): FillStatus {
  const level = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[_-]/g, " ");

  if (
    level === "FULL" ||
    level === "HIGH"
  ) {
    return "Full";
  }

  if (
    level === "NEAR FULL" ||
    level === "HALF FULL" ||
    level === "MEDIUM"
  ) {
    return "Near Full";
  }

  if (
    level === "EMPTY" ||
    level === "LOW"
  ) {
    return "Empty";
  }

  return "No report";
}

// ========================================
// CNN CLASSIFICATION INDICATOR
// ========================================

// These numbers represent the three CNN
// categories, not exact sensor readings.

function getFillPercent(
  status: FillStatus
): number | null {
  if (status === "Full") return 100;

  if (status === "Near Full") return 50;

  if (status === "Empty") return 0;

  return null;
}

// ========================================
// COLLECTION STATUS
// ========================================

function isCollected(
  status: string | null
): boolean {
  return [
    "collected",
    "completed",
    "done",
  ].includes(
    (status ?? "")
      .trim()
      .toLowerCase()
  );
}

// ========================================
// FORMAT LAST UPDATED
// ========================================

function timeAgo(
  dateValue: string | null,
  now: number
): string {
  if (!dateValue) {
    return "No updates yet";
  }

  const timestamp =
    new Date(dateValue).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const minutes = Math.max(
    0,
    Math.floor(
      (now - timestamp) / 60000
    )
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  if (hours < 24) {
    return `${hours} hr${
      hours > 1 ? "s" : ""
    } ago`;
  }

  const days = Math.floor(
    hours / 24
  );

  if (days < 7) {
    return `${days} day${
      days > 1 ? "s" : ""
    } ago`;
  }

  return new Date(
    timestamp
  ).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ========================================
// STATUS COLORS
// ========================================

function getStatusStyle(
  status: FillStatus
) {
  switch (status) {
    case "Full":
      return {
        badge:
          "border-[#F2C9CE] bg-[#FFF0F1] text-[#B82030]",
        dot:
          "bg-[#D0102B]",
        bar:
          "bg-[#D0102B]",
      };

    case "Near Full":
      return {
        badge:
          "border-[#F0DCAD] bg-[#FFF6DF] text-[#9A6A08]",
        dot:
          "bg-[#E2AC2D]",
        bar:
          "bg-[#E2AC2D]",
      };

    case "Empty":
      return {
        badge:
          "border-[#D4E4BE] bg-[#F1F8E8] text-[#597B31]",
        dot:
          "bg-[#7B9E4A]",
        bar:
          "bg-[#7B9E4A]",
      };

    default:
      return {
        badge:
          "border-[#E5E5E5] bg-[#F4F4F4] text-[#777]",
        dot:
          "bg-[#999]",
        bar:
          "bg-[#999]",
      };
  }
}

// ========================================
// STATUS BADGE COMPONENT
// ========================================

function StatusBadge({
  status,
}: {
  status: FillStatus;
}) {
  const style =
    getStatusStyle(status);

  return (
    <span
      className={`
        inline-flex
        items-center
        gap-2
        whitespace-nowrap
        rounded-full
        border
        px-3 py-1.5
        text-[11px]
        font-bold
        ${style.badge}
      `}
    >
      <span
        className={`
          h-2 w-2
          rounded-full
          ${style.dot}
        `}
      />

      {status}
    </span>
  );
}

// ========================================
// FILL LEVEL INDICATOR
// ========================================

function FillIndicator({
  site,
}: {
  site: Site;
}) {
  const style =
    getStatusStyle(site.status);

  if (site.fillPercent === null) {
    return (
      <span
        className="
          text-[11px]
          text-[#999]
        "
      >
        Not available
      </span>
    );
  }

  return (
    <div
      className="
        flex min-w-0
        items-center gap-3
      "
    >
      <div
        className="
          h-2.5
          w-full
          max-w-[160px]
          overflow-hidden
          rounded-full
          bg-[#EEE9E1]
        "
        role="progressbar"
        aria-label={`${site.name} CNN waste classification: ${site.status}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          site.fillPercent
        }
      >
        <div
          className={`
            h-full
            rounded-full
            transition-all
            duration-500
            ${style.bar}
          `}
          style={{
            width:
              `${site.fillPercent}%`,
          }}
        />
      </div>
    </div>
  );
}

// ========================================
// FETCH ALL ROWS FROM SUPABASE
// ========================================

async function fetchAllRows<T>(
  table: TableName,
  columns: string,
  orderColumn: string,
  idColumn: string
): Promise<T[]> {
  const rows: T[] = [];

  let offset = 0;

  while (true) {
    let request = supabase
      .from(table)
      .select(columns)
      .order(
        orderColumn,
        {
          ascending: false,
        }
      );

    if (
      idColumn !== orderColumn
    ) {
      request = request.order(
        idColumn,
        {
          ascending: false,
        }
      );
    }

    const {
      data,
      error,
    } = await request.range(
      offset,
      offset + PAGE_SIZE - 1
    );

    if (error) {
      throw new Error(
        `Unable to load ${table}: ${error.message}`
      );
    }

    const page =
      (data ?? []) as unknown as T[];

    rows.push(...page);

    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return rows;
}

// ========================================
// BUILD CURRENT WASTE STATUS
// ========================================

function buildWasteStatus(
  disposalSites: DisposalSiteRow[],
  reports: WasteReportRow[],
  schedules: ScheduleRow[],
  collections: CollectionRow[]
): Site[] {
  // ====================================
  // ACTIVE DISPOSAL SITES
  // ====================================

  const activeSites =
    disposalSites.filter(
      (site) =>
        site.is_active === true
    );

  // ====================================
  // LATEST REPORT PER SITE
  // ====================================

  const latestReports =
    new Map<
      string,
      WasteReportRow
    >();

  for (
    const report of reports
  ) {
    if (!report.site_id) {
      continue;
    }

    const previous =
      latestReports.get(
        report.site_id
      );

    if (
      !previous ||
      report.date_uploaded >
        previous.date_uploaded ||
      (
        report.date_uploaded ===
          previous.date_uploaded &&
        report.report_id >
          previous.report_id
      )
    ) {
      latestReports.set(
        report.site_id,
        report
      );
    }
  }

  // ====================================
  // MAP COLLECTION SCHEDULES
  // ====================================

  const scheduleMap = new Map(
    schedules.map(
      (schedule) => [
        schedule.schedule_id,
        schedule,
      ]
    )
  );

  // ====================================
  // LATEST COMPLETED COLLECTION
  // ====================================

  const latestCollections =
    new Map<string, number>();

  function rememberCollection(
    siteId: string | null,
    completedAt: string | null
  ) {
    if (
      !siteId ||
      !completedAt
    ) {
      return;
    }

    const completedTime =
      new Date(
        completedAt
      ).getTime();

    if (
      !Number.isFinite(
        completedTime
      )
    ) {
      return;
    }

    const previous =
      latestCollections.get(
        siteId
      ) ?? 0;

    if (
      completedTime > previous
    ) {
      latestCollections.set(
        siteId,
        completedTime
      );
    }
  }

  // ====================================
  // COLLECTIONS TABLE
  // ====================================

  for (
    const collection of collections
  ) {
    if (
      !collection.schedule_id ||
      !isCollected(
        collection.collection_status
      )
    ) {
      continue;
    }

    const schedule =
      scheduleMap.get(
        collection.schedule_id
      );

    rememberCollection(
      schedule?.site_id ?? null,
      collection.completed_at
    );
  }

  // ====================================
  // SCHEDULES TABLE
  // ====================================

  for (
    const schedule of schedules
  ) {
    if (
      !isCollected(
        schedule.status
      )
    ) {
      continue;
    }

    rememberCollection(
      schedule.site_id,
      schedule.date_completed
    );
  }

  // ====================================
  // BUILD DISPOSAL SITE ROWS
  // ====================================

  return activeSites
    .map(
      (site): Site => {
        const report =
          latestReports.get(
            site.site_id
          );

        const reportTime = report
          ? new Date(
              report.date_uploaded
            ).getTime()
          : 0;

        const collectionTime =
          latestCollections.get(
            site.site_id
          ) ?? 0;

        let status: FillStatus =
          report
            ? normalizeStatus(
                report.cnn_detection_level
              )
            : "No report";

        let lastUpdated:
          string | null =
          report?.date_uploaded ??
          null;

        // If a collection was completed
        // after the last report, treat
        // the bin as emptied.

        if (
          collectionTime > 0 &&
          collectionTime > reportTime
        ) {
          status = "Empty";

          lastUpdated =
            new Date(
              collectionTime
            ).toISOString();
        }

        return {
          id:
            site.site_id,

          reportId:
            report?.report_id ??
            null,

          name:
            site.site_name,

          location:
            site.location ?? "",

          fillPercent:
            getFillPercent(
              status
            ),

          lastUpdated,

          status,
        };
      }
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function ManageWasteStatus() {
  const navigate =
    useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();

  // ========================================
  // FILTER FROM URL
  // ========================================

  const requestedFilter =
    searchParams.get(
      "filter"
    );

  const filter: Filter =
    FILTERS.includes(
      requestedFilter as Filter
    )
      ? (
          requestedFilter as Filter
        )
      : "All";

  // ========================================
  // STATES
  // ========================================

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    allSites,
    setAllSites,
  ] = useState<Site[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    now,
    setNow,
  ] = useState(
    Date.now()
  );

  const requestRef =
    useRef(0);

  // ========================================
  // LOAD WASTE STATUS FROM SUPABASE
  // ========================================

  const loadWasteStatus =
    useCallback(
      async (
        showLoading = false
      ) => {
        const requestId =
          ++requestRef.current;

        if (showLoading) {
          setLoading(true);
        }

        setError("");

        try {
          // ==================================
          // AUTHENTICATION
          // ==================================

          const {
            data: authData,
            error: authError,
          } =
            await supabase.auth.getUser();

          if (authError) {
            throw authError;
          }

          if (
            !authData.user
          ) {
            throw new Error(
              "Please sign in to view waste status."
            );
          }

          // ==================================
          // VERIFY ADMIN ACCOUNT
          // ==================================

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
              authData.user.id
            )
            .maybeSingle();

          if (
            profileError
          ) {
            throw profileError;
          }

          if (
            !profile ||
            String(
              profile.role
            ).toLowerCase() !==
              "admin" ||
            profile.is_active !==
              true
          ) {
            throw new Error(
              "Administrator access is required."
            );
          }

          // ==================================
          // FETCH REQUIRED SUPABASE TABLES
          // ==================================

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
              "report_id,site_id,cnn_detection_level,date_uploaded",
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

          if (
            requestId !==
            requestRef.current
          ) {
            return;
          }

          // ==================================
          // PROCESS SUPABASE DATA
          // ==================================

          const preparedSites =
            buildWasteStatus(
              disposalSites,
              wasteReports,
              schedules,
              collections
            );

          setAllSites(
            preparedSites
          );

          setNow(
            Date.now()
          );
        } catch (err) {
          if (
            requestId !==
            requestRef.current
          ) {
            return;
          }

          console.error(
            "[WasteTrack] Waste status error:",
            err
          );

          setError(
            err instanceof Error
              ? err.message
              : "Failed to load waste status."
          );
        } finally {
          if (
            requestId ===
            requestRef.current
          ) {
            setLoading(false);
          }
        }
      },
      []
    );

  // ========================================
  // AUTO REFRESH + SUPABASE REALTIME
  // ========================================

  useEffect(() => {
    void loadWasteStatus(true);

    // Refresh every 60 seconds.

    const interval =
      window.setInterval(
        () => {
          void loadWasteStatus(
            false
          );
        },
        60000
      );

    // Refresh when returning to this tab.

    const onFocus = () => {
      void loadWasteStatus(
        false
      );
    };

    window.addEventListener(
      "focus",
      onFocus
    );

    // ==================================
    // SUPABASE REALTIME
    // ==================================

    let refreshTimer:
      ReturnType<
        typeof setTimeout
      > | null = null;

    const onDatabaseChange = () => {
      if (
        refreshTimer
      ) {
        clearTimeout(
          refreshTimer
        );
      }

      refreshTimer =
        setTimeout(
          () => {
            void loadWasteStatus(
              false
            );
          },
          500
        );
    };

    const channel =
      supabase.channel(
        "wastetrack-manage-waste-status"
      );

    const realtimeTables = [
      "disposal_sites",
      "waste_reports",
      "schedules",
      "collections",
    ];

    for (
      const table of realtimeTables
    ) {
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

      window.clearInterval(
        interval
      );

      window.removeEventListener(
        "focus",
        onFocus
      );

      if (
        refreshTimer
      ) {
        clearTimeout(
          refreshTimer
        );
      }

      void supabase.removeChannel(
        channel
      );
    };
  }, [
    loadWasteStatus,
  ]);

  // ========================================
  // FILTER COUNTS
  // ========================================

  const fullCount =
    allSites.filter(
      (site) =>
        site.status ===
        "Full"
    ).length;

  const nearFullCount =
    allSites.filter(
      (site) =>
        site.status ===
        "Near Full"
    ).length;

  const emptyCount =
    allSites.filter(
      (site) =>
        site.status ===
        "Empty"
    ).length;

  const noReportCount =
    allSites.filter(
      (site) =>
        site.status ===
        "No report"
    ).length;

  const counts: Record<
    Filter,
    number
  > = {
    All:
      allSites.length,

    Empty:
      emptyCount,

    "Near Full":
      nearFullCount,

    Full:
      fullCount,

    "No report":
      noReportCount,
  };

  // ========================================
  // CHANGE FILTER IN URL
  // ========================================

  function changeFilter(
    nextFilter: Filter
  ) {
    const nextParams =
      new URLSearchParams(
        searchParams
      );

    if (
      nextFilter === "All"
    ) {
      nextParams.delete(
        "filter"
      );
    } else {
      nextParams.set(
        "filter",
        nextFilter
      );
    }

    setSearchParams(
      nextParams,
      {
        replace: true,
      }
    );
  }

  // ========================================
  // SEARCH + FILTER SITES
  // ========================================

  const sites =
    useMemo(() => {
      const q =
        query
          .trim()
          .toLowerCase();

      return allSites.filter(
        (site) => {
          const matchesFilter =
            filter === "All" ||
            site.status ===
              filter;

          const matchesQuery =
            !q ||
            site.name
              .toLowerCase()
              .includes(q) ||
            site.location
              .toLowerCase()
              .includes(q);

          return (
            matchesFilter &&
            matchesQuery
          );
        }
      );
    }, [
      allSites,
      filter,
      query,
    ]);

  // ========================================
  // NAVIGATE TO REPORT DETAILS
  // ========================================

  function openSite(
    site: Site
  ) {
    if (
      !site.reportId
    ) {
      return;
    }

    navigate(
      `/admin/waste-status/${site.reportId}`
    );
  }

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
          mx-auto
          w-full
          max-w-[1600px]
          px-4 py-6
          sm:px-6
          lg:px-8
          lg:py-8
        "
      >
        {/* ====================================
            ERROR MESSAGE
        ==================================== */}

        {error && (
          <div
            role="alert"
            className="
              mb-5
              flex items-start
              gap-3
              rounded-2xl
              border border-red-200
              bg-red-50
              p-4
            "
          >
            <AlertCircle
              size={20}
              className="
                mt-0.5
                shrink-0
                text-[#B5202A]
              "
            />

            <div
              className="
                min-w-0 flex-1
              "
            >
              <p
                className="
                  text-sm
                  font-bold
                  text-[#A81B1E]
                "
              >
                Unable to load waste status
              </p>

              <p
                className="
                  mt-1
                  break-words
                  text-xs
                  leading-relaxed
                  text-red-700
                "
              >
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadWasteStatus(
                    true
                  )
                }
                className="
                  mt-3
                  rounded-lg
                  bg-[#A81B1E]
                  px-4 py-2
                  text-xs
                  font-bold
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
            DISPOSAL SITES PANEL
            NO SUMMARY CARDS
        ==================================== */}

        <section
          className="
            min-w-0
            overflow-hidden
            rounded-2xl
            border
            border-[#EAE2D7]
            bg-white
            shadow-sm
          "
        >
          {/* ==================================
              PANEL HEADER
          ================================== */}

          <div
            className="
              border-b
              border-[#F0E9E0]
              px-4 py-5
              sm:px-5
            "
          >
            <div
              className="
                flex
                flex-wrap
                items-center
                justify-between
                gap-4
              "
            >
              {/* SECTION TITLE */}

              <div
                className="
                  flex
                  items-center
                  gap-3
                "
              >
                <div
                  className="
                    flex
                    h-10 w-10
                    items-center
                    justify-center
                    rounded-xl
                    bg-[#F7F0E4]
                    text-[#A81B1E]
                  "
                >
                  <ClipboardList
                    size={20}
                  />
                </div>

                <h2
                  className="
                    text-[16px]
                    font-extrabold
                    sm:text-[18px]
                  "
                >
                  Disposal sites
                </h2>
              </div>

              {/* ==================================
                  SEARCH BAR
              ================================== */}

              <div
                className="
                  relative
                  w-full
                  sm:max-w-[320px]
                "
              >
                <Search
                  size={17}
                  className="
                    absolute
                    left-3.5
                    top-1/2
                    -translate-y-1/2
                    text-[#A09A91]
                  "
                />

                <input
                  type="search"
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value
                    )
                  }
                  placeholder="Search disposal sites..."
                  aria-label="Search disposal sites"
                  className="
                    h-11 w-full
                    rounded-xl
                    border
                    border-[#E4DCD0]
                    bg-[#FFFCF8]
                    pl-10 pr-10
                    text-[12px]
                    outline-none
                    transition
                    placeholder:text-[#AAA]
                    focus:border-[#A5B26B]
                    focus:ring-2
                    focus:ring-[#A5B26B]/20
                  "
                />

                {query && (
                  <button
                    type="button"
                    onClick={() =>
                      setQuery("")
                    }
                    aria-label="Clear search"
                    className="
                      absolute
                      right-3
                      top-1/2
                      -translate-y-1/2
                      text-[#999]
                      hover:text-[#555]
                    "
                  >
                    <X
                      size={17}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* ==================================
                FILTER TABS
            ================================== */}

            <div
              className="
                mt-5
                flex
                flex-wrap
                gap-2
              "
              aria-label="Filter disposal sites by waste level"
            >
              {FILTERS.map(
                (item) => {
                  const selected =
                    filter ===
                    item;

                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={
                        selected
                      }
                      onClick={() =>
                        changeFilter(
                          item
                        )
                      }
                      className={`
                        inline-flex
                        items-center
                        gap-2
                        rounded-xl
                        px-3.5 py-2.5
                        text-[12px]
                        font-bold
                        transition
                        ${
                          selected
                            ? "bg-[#A81B1E] text-white shadow-sm"
                            : "border border-[#E7DDD0] bg-[#FFFCF8] text-[#666] hover:bg-[#F7F0E4]"
                        }
                      `}
                    >
                      {item ===
                      "Near Full"
                        ? "Half-full"
                        : item}

                      <span
                        className={`
                          rounded-md
                          px-1.5 py-0.5
                          text-[10px]
                          ${
                            selected
                              ? "bg-white/20 text-white"
                              : "bg-[#F2EDE5] text-[#777]"
                          }
                        `}
                      >
                        {
                          counts[
                            item
                          ]
                        }
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* ====================================
              LOADING STATE
          ==================================== */}

          {loading &&
          allSites.length === 0 ? (
            <div
              role="status"
              className="
                flex
                min-h-[220px]
                flex-col
                items-center
                justify-center
                gap-3
                text-center
              "
            >
              <LoaderCircle
                size={30}
                className="
                  animate-spin
                  text-[#A5B26B]
                "
              />

              <p
                className="
                  text-[12px]
                  text-[#777]
                "
              >
                Loading disposal sites...
              </p>
            </div>
          ) : sites.length === 0 ? (
            // ==================================
            // EMPTY STATE
            // ==================================

            <div
              className="
                flex
                min-h-[230px]
                flex-col
                items-center
                justify-center
                p-6
                text-center
              "
            >
              <div
                className="
                  flex
                  h-14 w-14
                  items-center
                  justify-center
                  rounded-2xl
                  bg-[#F7F0E4]
                  text-[#A5B26B]
                "
              >
                <Inbox
                  size={27}
                />
              </div>

              <p
                className="
                  mt-4
                  text-[13px]
                  font-bold
                  text-[#333]
                "
              >
                No sites found
              </p>

              <p
                className="
                  mt-1
                  text-[11px]
                  text-[#999]
                "
              >
                {error
                  ? "Waste status data is unavailable."
                  : "No sites match your search or filter."}
              </p>
            </div>
          ) : (
            <>
              {/* ==================================
                  DESKTOP / TABLET TABLE
              ================================== */}

              <div
                className="
                  hidden
                  overflow-x-auto
                  md:block
                "
              >
                <table
                  className="
                    w-full
                    min-w-[670px]
                    border-collapse
                    text-left
                  "
                >
                  <thead>
                    <tr
                      className="
                        bg-[#FFFCF8]
                        text-[11px]
                        text-[#888]
                      "
                    >
                      <th
                        className="
                          px-5 py-4
                          font-semibold
                        "
                      >
                        Disposal site
                      </th>

                      <th
                        className="
                          px-4 py-4
                          font-semibold
                        "
                      >
                        Fill level
                      </th>

                      <th
                        className="
                          px-4 py-4
                          font-semibold
                        "
                      >
                        Last updated
                      </th>

                      <th
                        className="
                          px-4 py-4
                          font-semibold
                        "
                      >
                        Status
                      </th>

                      <th
                        className="
                          px-4 py-4
                          text-right
                          font-semibold
                        "
                      >
                        Details
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {sites.map(
                      (site) => (
                        <tr
                          key={
                            site.id
                          }
                          className="
                            border-t
                            border-[#F1EAE2]
                            transition
                            hover:bg-[#FFFCF8]
                          "
                        >
                          {/* ==================================
                              SITE NAME AND LOCATION
                          ================================== */}

                          <td
                            className="
                              max-w-[280px]
                              px-5 py-4
                            "
                          >
                            <div
                              className="
                                flex
                                items-start
                                gap-2
                              "
                            >
                              <MapPin
                                size={17}
                                className="
                                  mt-0.5
                                  shrink-0
                                  text-[#A81B1E]
                                "
                              />

                              <div className="min-w-0">
                                <button
                                  type="button"
                                  disabled={
                                    !site.reportId
                                  }
                                  onClick={() =>
                                    openSite(
                                      site
                                    )
                                  }
                                  className="
                                    break-words
                                    text-left
                                    text-[12px]
                                    font-bold
                                    text-[#343434]
                                    hover:text-[#A81B1E]
                                    hover:underline
                                    disabled:cursor-default
                                    disabled:hover:text-[#343434]
                                    disabled:hover:no-underline
                                  "
                                >
                                  {
                                    site.name
                                  }
                                </button>

                                {site.location && (
                                  <p
                                    className="
                                      mt-1
                                      break-words
                                      text-[10px]
                                      text-[#999]
                                    "
                                  >
                                    {
                                      site.location
                                    }
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* ==================================
                              FILL LEVEL
                          ================================== */}

                          <td
                            className="
                              px-4 py-4
                            "
                          >
                            <FillIndicator
                              site={
                                site
                              }
                            />
                          </td>

                          {/* ==================================
                              LAST UPDATED
                          ================================== */}

                          <td
                            className="
                              px-4 py-4
                              text-[11px]
                              text-[#888]
                            "
                          >
                            <span
                              className="
                                inline-flex
                                items-center
                                gap-1.5
                              "
                            >
                              <Clock3
                                size={13}
                              />

                              {timeAgo(
                                site.lastUpdated,
                                now
                              )}
                            </span>
                          </td>

                          {/* ==================================
                              WASTE STATUS
                          ================================== */}

                          <td
                            className="
                              px-4 py-4
                            "
                          >
                            <StatusBadge
                              status={
                                site.status
                              }
                            />
                          </td>

                          {/* ==================================
                              DETAILS BUTTON
                          ================================== */}

                          <td
                            className="
                              px-4 py-4
                              text-right
                            "
                          >
                            <button
                              type="button"
                              onClick={() =>
                                openSite(
                                  site
                                )
                              }
                              disabled={
                                !site.reportId
                              }
                              aria-label={`View reports for ${site.name}`}
                              className="
                                inline-flex
                                h-9 w-9
                                items-center
                                justify-center
                                rounded-lg
                                border
                                border-[#E7DDD0]
                                bg-white
                                text-[#A81B1E]
                                transition
                                hover:bg-[#FFF0EC]
                                disabled:cursor-not-allowed
                                disabled:opacity-30
                              "
                            >
                              <ArrowUpRight
                                size={17}
                              />
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* ==================================
                  MOBILE SITE CARDS
              ================================== */}

              <div
                className="
                  divide-y
                  divide-[#F1EAE2]
                  md:hidden
                "
              >
                {sites.map(
                  (site) => (
                    <article
                      key={
                        site.id
                      }
                      className="
                        px-4 py-5
                        sm:px-5
                      "
                    >
                      {/* ==================================
                          SITE NAME AND STATUS
                      ================================== */}

                      <div
                        className="
                          flex
                          flex-wrap
                          items-start
                          justify-between
                          gap-3
                        "
                      >
                        <div
                          className="
                            flex
                            min-w-0
                            flex-1
                            items-start
                            gap-2
                          "
                        >
                          <MapPin
                            size={18}
                            className="
                              mt-0.5
                              shrink-0
                              text-[#A81B1E]
                            "
                          />

                          <div className="min-w-0">
                            <h3
                              className="
                                break-words
                                text-[13px]
                                font-extrabold
                              "
                            >
                              {
                                site.name
                              }
                            </h3>

                            {site.location && (
                              <p
                                className="
                                  mt-1
                                  break-words
                                  text-[11px]
                                  leading-relaxed
                                  text-[#999]
                                "
                              >
                                {
                                  site.location
                                }
                              </p>
                            )}
                          </div>
                        </div>

                        <StatusBadge
                          status={
                            site.status
                          }
                        />
                      </div>

                      {/* ==================================
                          FILL LEVEL
                      ================================== */}

                      <div
                        className="
                          mt-4
                          rounded-xl
                          bg-[#FFFCF8]
                          p-3.5
                        "
                      >
                        <p
                          className="
                            text-[10px]
                            font-semibold
                            uppercase
                            tracking-wide
                            text-[#999]
                          "
                        >
                          Fill level
                        </p>

                        <div
                          className="
                            mt-2
                          "
                        >
                          <FillIndicator
                            site={
                              site
                            }
                          />
                        </div>
                      </div>

                      {/* ==================================
                          LAST UPDATED + LINK
                      ================================== */}

                      <div
                        className="
                          mt-4
                          flex
                          flex-wrap
                          items-center
                          justify-between
                          gap-3
                        "
                      >
                        <span
                          className="
                            inline-flex
                            items-center
                            gap-1.5
                            text-[11px]
                            text-[#999]
                          "
                        >
                          <Clock3
                            size={14}
                          />

                          {timeAgo(
                            site.lastUpdated,
                            now
                          )}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            openSite(
                              site
                            )
                          }
                          disabled={
                            !site.reportId
                          }
                          className="
                            inline-flex
                            items-center
                            gap-1
                            text-[11px]
                            font-bold
                            text-[#A81B1E]
                            hover:underline
                            disabled:cursor-not-allowed
                            disabled:opacity-40
                            disabled:no-underline
                          "
                        >
                          View details

                          <ChevronRight
                            size={15}
                          />
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            </>
          )}

          {/* ====================================
              FOOTER
          ==================================== */}

          <div
            className="
              flex
              flex-wrap
              items-center
              justify-between
              gap-2
              border-t
              border-[#F0E9E0]
              bg-[#FFFCF8]
              px-4 py-3
              sm:px-5
            "
          >
            <p
              className="
                text-[11px]
                text-[#999]
              "
            >
              Showing {sites.length} of{" "}
              {allSites.length} sites
            </p>

            <p
              className="
                text-[10px]
                text-[#AAA]
              "
            >
              Latest waste levels
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
