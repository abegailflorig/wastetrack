
import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ImageOff,
  MapPin,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ==========================================
// TYPES
// ==========================================

type ReportStatus =
  | "Under Review"
  | "Accepted"
  | "Rejected"
  | "Scheduled"
  | "Resolved";

type WasteLevel =
  | "FULL"
  | "NEAR FULL"
  | "EMPTY"
  | null;

export type ResidentReport = {
  id: string;
  reportId: string;
  name: string;
  address: string;
  image: string;
  level: WasteLevel;
  status: ReportStatus;
  date: string;
  time: string;
  wasteType: string;
  confidence: number | null;
  reportedBy: string;
  description: string;
};

type ReportRow = {
  report_id: string;
  site_id: string | null;
  address: string | null;
  site_description: string | null;
  cnn_detection_level: string | null;
  date_uploaded: string;
};

type SiteRow = {
  site_id: string;
  site_name: string;
  location: string | null;
  site_image: string | null;
};

type ImageRow = {
  image_id: string;
  report_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string;
};

type StatusRow = {
  status_id: string;
  report_id: string;
  status: string;
  created_at: string;
};

// ==========================================
// REPORT FILTERS
// ACCEPTED AND REJECTED REMOVED
// ==========================================

const FILTERS = [
  "All",
  "Under Review",
  "Scheduled",
  "Resolved",
] as const;

type Filter = (typeof FILTERS)[number];

const BUCKET = "waste-images";

// ==========================================
// COLORS
// ==========================================

const levelColors: Record<
  Exclude<WasteLevel, null>,
  string
> = {
  FULL: "bg-[#f8e2e5] text-[#dc1022]",
  "NEAR FULL": "bg-[#fbe9e6] text-[#fa8936]",
  EMPTY: "bg-[#e0efdf] text-[#598447]",
};

const statusColors: Record<
  ReportStatus,
  string
> = {
  "Under Review":
    "bg-[#f3e6d2] text-[#a7181c]",
  Scheduled:
    "bg-[#ffc64c] text-white",
  Resolved:
    "bg-[#09b665] text-white",
  Accepted:
    "bg-[#dceafe] text-[#2256a5]",
  Rejected:
    "bg-[#fce2e4] text-[#c92438]",
};

// ==========================================
// NORMALIZE REPORT STATUS
// ==========================================

function normalizeStatus(
  value: string | null | undefined
): ReportStatus {
  switch (value?.trim().toLowerCase()) {
    case "accepted":
      return "Accepted";

    case "rejected":
      return "Rejected";

    case "scheduled":
      return "Scheduled";

    case "resolved":
    case "collected":
      return "Resolved";

    default:
      return "Under Review";
  }
}

// ==========================================
// NORMALIZE CNN WASTE LEVEL
// ==========================================

function normalizeLevel(
  value: string | null | undefined
): WasteLevel {
  switch (value?.trim().toUpperCase()) {
    case "FULL":
    case "HIGH":
    case "OVERFLOWING":
      return "FULL";

    case "NEAR FULL":
    case "HALF-FULL":
    case "MEDIUM":
      return "NEAR FULL";

    case "EMPTY":
    case "LOW":
      return "EMPTY";

    default:
      return null;
  }
}

// ==========================================
// FORMAT REPORT DATE
// ==========================================

function formatReportDate(
  value: string
): {
  date: string;
  time: string;
} {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return {
      date: "Date unavailable",
      time: "",
    };
  }

  return {
    date: parsed.toLocaleDateString(
      "en-US",
      {
        timeZone: "Asia/Manila",
        month: "long",
        day: "numeric",
        year: "numeric",
      }
    ),

    time: parsed.toLocaleTimeString(
      "en-US",
      {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
      }
    ),
  };
}

// ==========================================
// NORMALIZE SUPABASE STORAGE PATH
// ==========================================

function normalizeStoragePath(
  value: string | null | undefined
): string | null {
  if (!value?.trim()) {
    return null;
  }

  let path = value.trim();

  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);

      const match = url.pathname.match(
        /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i
      );

      if (
        !match ||
        decodeURIComponent(match[1]) !==
          BUCKET
      ) {
        return null;
      }

      path = decodeURIComponent(
        match[2]
      );
    } catch {
      return null;
    }
  }

  path = path
    .replace(/^\/+/, "")
    .split("?")[0];

  path = path.replace(
    /^storage\/v1\/object\/(?:public|sign|authenticated)\/waste-images\//i,
    ""
  );

  while (
    path
      .toLowerCase()
      .startsWith(`${BUCKET}/`)
  ) {
    path = path.slice(
      BUCKET.length + 1
    );
  }

  return path &&
    !path.endsWith("/")
    ? path
    : null;
}

// ==========================================
// GET SIGNED WASTE IMAGE URL
// ==========================================

async function getSignedImage(
  storagePath?: string | null
): Promise<string> {
  const path =
    normalizeStoragePath(storagePath);

  if (!path) {
    return "";
  }

  const {
    data,
    error,
  } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    console.warn(
      "[WasteTrack] Cannot open report image:",
      path,
      error.message
    );

    return "";
  }

  return data.signedUrl;
}

// ==========================================
// FALLBACK SITE IMAGE
// ==========================================

async function getSiteFallbackImage(
  value?: string | null
): Promise<string> {
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return getSignedImage(value);
}

// ==========================================
// RESIDENT REPORTS MAIN COMPONENT
// ==========================================

export default function ResidentReports() {
  // ========================================
  // STATES
  // ========================================

  const [
    activeFilter,
    setActiveFilter,
  ] = useState<Filter>("All");

  const [
    reports,
    setReports,
  ] = useState<ResidentReport[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    signedIn,
    setSignedIn,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  // ========================================
  // LISTEN FOR AUTH CHANGES
  // ========================================

  useEffect(() => {
    const {
      data: {
        subscription,
      },
    } = supabase.auth.onAuthStateChange(
      (event) => {
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT" ||
          event === "USER_UPDATED"
        ) {
          setRefreshKey(
            (previous) => previous + 1
          );
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ========================================
  // FETCH RESIDENT REPORTS
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadReports() {
      setLoading(true);
      setError("");
      setNotice("");
      setReports([]);

      try {
        // ==================================
        // GET AUTHENTICATED USER
        // ==================================

        const {
          data: authData,
          error: authError,
        } =
          await supabase.auth.getUser();

        if (!active) {
          return;
        }

        if (authError) {
          throw new Error(
            authError.message
          );
        }

        if (!authData.user) {
          setSignedIn(false);
          return;
        }

        setSignedIn(true);

        const userId =
          authData.user.id;

        const warnings: string[] = [];

        // ==================================
        // GET RESIDENT PROFILE
        // ==================================

        const profileResult =
          await supabase
            .from("users")
            .select("full_name")
            .eq("user_id", userId)
            .maybeSingle();

        if (!active) {
          return;
        }

        if (profileResult.error) {
          warnings.push(
            "Your profile name could not load."
          );
        }

        const reportedBy =
          profileResult.data?.full_name?.trim() ||
          "Your account";

        // ==================================
        // GET WASTE REPORTS
        // ==================================

        const rows: ReportRow[] = [];

        const pageSize = 200;

        for (
          let offset = 0;
          active;
          offset += pageSize
        ) {
          const {
            data,
            error: fetchError,
          } = await supabase
            .from("waste_reports")
            .select(
              "report_id,site_id,address,site_description,cnn_detection_level,date_uploaded"
            )
            .eq("user_id", userId)
            .order(
              "date_uploaded",
              {
                ascending: false,
              }
            )
            .order(
              "report_id",
              {
                ascending: false,
              }
            )
            .range(
              offset,
              offset + pageSize - 1
            );

          if (fetchError) {
            throw new Error(
              fetchError.message
            );
          }

          const batch =
            (data || []) as ReportRow[];

          rows.push(...batch);

          if (
            batch.length < pageSize
          ) {
            break;
          }
        }

        if (!active) {
          return;
        }

        // ==================================
        // HANDLE NO REPORTS
        // ==================================

        if (!rows.length) {
          setNotice(
            warnings.join(" ")
          );

          return;
        }

        // ==================================
        // RELATED DATA MAPS
        // ==================================

        const images = new Map<
          string,
          ImageRow
        >();

        const statuses = new Map<
          string,
          StatusRow
        >();

        const sites = new Map<
          string,
          SiteRow
        >();

        // ==================================
        // FETCH RELATED TABLES
        // ==================================

        for (
          let start = 0;
          start < rows.length;
          start += 100
        ) {
          const chunk = rows.slice(
            start,
            start + 100
          );

          const reportIds =
            chunk.map(
              (item) =>
                item.report_id
            );

          const siteIds = [
            ...new Set(
              chunk
                .map(
                  (item) =>
                    item.site_id
                )
                .filter(
                  (
                    id
                  ): id is string =>
                    !!id
                )
            ),
          ];

          // ==================================
          // FETCH IMAGES, STATUS, SITES
          // ==================================

          const [
            imageResult,
            statusResult,
            siteResult,
          ] = await Promise.all([
            supabase
              .from("waste_images")
              .select(
                "image_id,report_id,storage_bucket,storage_path,created_at"
              )
              .in(
                "report_id",
                reportIds
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              ),

            supabase
              .from("status")
              .select(
                "status_id,report_id,status,created_at"
              )
              .in(
                "report_id",
                reportIds
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              ),

            siteIds.length
              ? supabase
                  .from("disposal_sites")
                  .select(
                    "site_id,site_name,location,site_image"
                  )
                  .in(
                    "site_id",
                    siteIds
                  )
              : Promise.resolve({
                  data: [] as SiteRow[],
                  error: null,
                }),
          ]);

          if (!active) {
            return;
          }

          // ==================================
          // IMAGE QUERY ERRORS
          // ==================================

          if (imageResult.error) {
            console.error(
              "[WasteTrack] Images:",
              imageResult.error.message
            );

            if (
              !warnings.includes(
                "Some report photos could not load."
              )
            ) {
              warnings.push(
                "Some report photos could not load."
              );
            }
          }

          // ==================================
          // STATUS QUERY ERRORS
          // ==================================

          if (statusResult.error) {
            console.error(
              "[WasteTrack] Statuses:",
              statusResult.error.message
            );

            if (
              !warnings.includes(
                "Some report statuses could not load."
              )
            ) {
              warnings.push(
                "Some report statuses could not load."
              );
            }
          }

          // ==================================
          // DISPOSAL SITE QUERY ERRORS
          // ==================================

          if (siteResult.error) {
            console.error(
              "[WasteTrack] Sites:",
              siteResult.error.message
            );

            if (
              !warnings.includes(
                "Some disposal sites could not load."
              )
            ) {
              warnings.push(
                "Some disposal sites could not load."
              );
            }
          }

          // ==================================
          // SAVE LATEST IMAGE PER REPORT
          // ==================================

          for (
            const image of
              (imageResult.data ||
                []) as ImageRow[]
          ) {
            if (
              !images.has(
                image.report_id
              )
            ) {
              images.set(
                image.report_id,
                image
              );
            }
          }

          // ==================================
          // SAVE LATEST STATUS PER REPORT
          // ==================================

          for (
            const status of
              (statusResult.data ||
                []) as StatusRow[]
          ) {
            if (
              !statuses.has(
                status.report_id
              )
            ) {
              statuses.set(
                status.report_id,
                status
              );
            }
          }

          // ==================================
          // SAVE DISPOSAL SITES
          // ==================================

          for (
            const site of
              (siteResult.data ||
                []) as SiteRow[]
          ) {
            sites.set(
              site.site_id,
              site
            );
          }
        }

        // ==================================
        // MAP REPORT DATA
        // ==================================

        const mapped:
          ResidentReport[] = [];

        for (
          let i = 0;
          i < rows.length;
          i += 10
        ) {
          const batch =
            await Promise.all(
              rows
                .slice(
                  i,
                  i + 10
                )
                .map(
                  async (row) => {
                    const site =
                      row.site_id
                        ? sites.get(
                            row.site_id
                          )
                        : undefined;

                    // ==================================
                    // GET REPORT PHOTO
                    // ==================================

                    const reportImage =
                      await getSignedImage(
                        images.get(
                          row.report_id
                        )?.storage_path
                      );

                    const image =
                      reportImage ||
                      (await getSiteFallbackImage(
                        site?.site_image
                      ));

                    // ==================================
                    // FORMAT DATE
                    // ==================================

                    const formatted =
                      formatReportDate(
                        row.date_uploaded
                      );

                    // ==================================
                    // REPORT OBJECT
                    // ==================================

                    return {
                      id:
                        row.report_id,

                      reportId:
                        row.report_id,

                      name:
                        site?.site_name ||
                        "Unregistered Bin",

                      address:
                        row.address ||
                        site?.location ||
                        "Location under review",

                      image,

                      level:
                        normalizeLevel(
                          row.cnn_detection_level
                        ),

                      status:
                        normalizeStatus(
                          statuses.get(
                            row.report_id
                          )?.status
                        ),

                      date:
                        formatted.date,

                      time:
                        formatted.time,

                      wasteType:
                        "Not specified",

                      confidence:
                        null,

                      reportedBy,

                      description:
                        row.site_description ||
                        "",
                    } satisfies ResidentReport;
                  }
                )
            );

          if (!active) {
            return;
          }

          mapped.push(
            ...batch
          );
        }

        if (!active) {
          return;
        }

        setReports(mapped);

        setNotice(
          warnings.join(" ")
        );
      } catch (failure) {
        if (!active) {
          return;
        }

        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to load your reports."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  // ========================================
  // FILTER REPORTS
  // ========================================

  const filteredReports =
    activeFilter === "All"
      ? reports
      : reports.filter(
          (report) =>
            report.status ===
            activeFilter
        );

  // ========================================
  // MAIN USER INTERFACE
  // ========================================

  return (
    <main
      className="
        flex h-[calc(100dvh-5rem)]
        min-h-0 w-full flex-col
        overflow-hidden bg-white text-black
      "
    >
      {/* ====================================
          HEADER
      ==================================== */}

      <header
        className="
          shrink-0 border-b
          border-[#bdbdbd] bg-white
        "
      >
        <div
          className="
            mx-auto flex w-full
            max-w-[430px] items-center gap-3
            px-5 pb-4 pt-[61px]
            sm:max-w-[720px] sm:pt-10
            lg:max-w-[900px]
          "
        >
          <Link
            to="/resident/dashboard"
            aria-label="Back to dashboard"
            className="
              grid h-9 w-9 shrink-0
              place-items-center rounded-full
              transition-colors
              hover:bg-neutral-100
              focus-visible:outline
              focus-visible:outline-2
              focus-visible:outline-[#aa171a]
            "
          >
            <ArrowLeft
              size={29}
              strokeWidth={2.5}
            />
          </Link>

          <h1
            className="
              min-w-0 flex-1 text-[20px]
              font-extrabold tracking-[-0.45px]
              sm:text-[24px]
            "
          >
            My Reports
          </h1>
        </div>
      </header>

      {/* ====================================
          REPORT LIST
      ==================================== */}

      <section
        className="
          mx-auto flex min-h-0 w-full
          max-w-[430px] flex-1 flex-col
          px-[21px]
          sm:max-w-[720px] sm:px-6
          lg:max-w-[900px] lg:px-8
        "
      >
        {/* ====================================
            FOUR STATUS FILTER BUTTONS
        ==================================== */}

        <div
          role="group"
          aria-label="Filter reports"
          className="
            flex shrink-0 gap-[15px]
            overflow-x-auto overscroll-x-contain
            pb-[19px] pt-[35px]
            [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden
          "
        >
          {FILTERS.map(
            (filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={
                  activeFilter ===
                  filter
                }
                onClick={() =>
                  setActiveFilter(
                    filter
                  )
                }
                className={`
                  min-h-[31px] shrink-0
                  whitespace-nowrap rounded-[11px]
                  px-[18px] py-[5px]
                  text-[15px] font-bold leading-[21px]
                  transition-colors sm:text-[16px]
                  ${
                    activeFilter === filter
                      ? "bg-[#aa171b] text-white"
                      : "bg-[#f3e6d2] text-[#a51d22] hover:bg-[#ebd7b7]"
                  }
                `}
              >
                {filter === "All"
                  ? `All (${reports.length})`
                  : filter}
              </button>
            )
          )}
        </div>

        {/* ====================================
            SCROLLABLE REPORT CARDS
        ==================================== */}

        <div
          role="region"
          aria-label="Your waste reports"
          aria-busy={loading}
          tabIndex={0}
          className="
            min-h-0 flex-1 space-y-[20px]
            overflow-y-auto overscroll-contain
            px-[1px] pb-8
            [scrollbar-width:thin]
          "
        >
          {/* ====================================
              LOADING
          ==================================== */}

          {loading ? (
            <p
              role="status"
              className="
                py-12 text-center text-sm
                text-neutral-500
              "
            >
              Loading your reports...
            </p>
          ) : !signedIn ? (
            // ====================================
            // NOT SIGNED IN
            // ====================================

            <div
              className="
                rounded-[22px] border
                border-neutral-200 p-5 text-center
              "
            >
              <p className="text-sm font-semibold">
                Sign in to view your reports
              </p>

              {error && (
                <p className="mt-2 break-words text-xs text-red-700">
                  {error}
                </p>
              )}

              <Link
                to="/login"
                className="
                  mt-4 inline-flex min-h-10
                  items-center rounded-lg
                  bg-[#aa171b] px-4 text-xs
                  font-semibold text-white
                "
              >
                Sign In
              </Link>
            </div>
          ) : error ? (
            // ====================================
            // REPORT LOADING ERROR
            // ====================================

            <div
              role="alert"
              className="
                rounded-[22px] border
                border-red-200 bg-red-50 p-4
              "
            >
              <h2 className="text-sm font-semibold text-red-700">
                Unable to load reports
              </h2>

              <p className="mt-2 break-words text-xs text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  setRefreshKey(
                    (value) =>
                      value + 1
                  )
                }
                className="
                  mt-3 min-h-10 text-xs
                  font-bold text-red-700
                "
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {/* ====================================
                  WARNING NOTICE
              ==================================== */}

              {notice && (
                <p
                  role="status"
                  className="
                    rounded-lg bg-amber-50 p-3
                    text-xs text-amber-800
                  "
                >
                  {notice}
                </p>
              )}

              {/* ====================================
                  NO REPORTS FOUND
              ==================================== */}

              {filteredReports.length ===
              0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-neutral-500">
                    {reports.length === 0
                      ? "You have not submitted any reports yet."
                      : "No reports with this status."}
                  </p>

                  {reports.length === 0 && (
                    <Link
                      to="/resident/report-waste"
                      className="
                        mt-4 inline-flex min-h-10
                        items-center rounded-lg
                        bg-[#aa171b] px-4 text-xs
                        font-semibold text-white
                      "
                    >
                      Report Waste
                    </Link>
                  )}
                </div>
              ) : (
                // ====================================
                // REPORT CARDS
                // ====================================

                filteredReports.map(
                  (report) => (
                    <Link
                      key={report.id}
                      to="/resident/reports/review"
                      state={{
                        reportId:
                          report.id,
                        report,
                      }}
                      aria-label={`Review report for ${report.name}`}
                      className="
                        flex min-h-[135px] min-w-0
                        items-center gap-3
                        rounded-[22px]
                        border-[1.5px] border-[#b6161c]
                        bg-[#f7f7f7]
                        px-[15px] py-[15px]
                        shadow-[0_4px_2px_rgba(0,0,0,0.19)]
                        transition-colors
                        hover:bg-[#fff5f5]
                        focus-visible:outline
                        focus-visible:outline-2
                        focus-visible:outline-offset-2
                        focus-visible:outline-[#b6161c]
                        min-[390px]:gap-5
                        sm:gap-5
                      "
                    >
                      {/* ====================================
                          REPORT PHOTO
                      ==================================== */}

                      <ReportPhoto
                        report={
                          report
                        }
                      />

                      {/* ====================================
                          REPORT DETAILS
                      ==================================== */}

                      <div className="min-w-0 flex-1 self-center">
                        {/* SITE NAME */}

                        <h2
                          className="
                            break-words text-[15px]
                            font-bold leading-[1.22]
                            text-black
                            min-[390px]:text-[18px]
                            sm:text-[19px]
                          "
                        >
                          {report.name}
                        </h2>

                        {/* ADDRESS */}

                        <p
                          className="
                            mt-[5px] flex items-start
                            gap-[3px] text-[11px]
                            leading-[1.35] text-[#313131]
                            min-[390px]:text-[12px]
                          "
                        >
                          <MapPin
                            size={14}
                            strokeWidth={
                              2.5
                            }
                            className="mt-[1px] shrink-0"
                          />

                          <span className="break-words">
                            {
                              report.address
                            }
                          </span>
                        </p>

                        {/* ====================================
                            CNN AND STATUS
                        ==================================== */}

                        <div
                          className="
                            mt-[9px] flex flex-wrap
                            items-center gap-x-[16px]
                            gap-y-[6px]
                          "
                        >
                          {/* CNN LEVEL */}

                          <span
                            className={`
                              inline-flex min-h-[18px]
                              items-center rounded-[7px]
                              px-[11px] py-[2px]
                              text-[11px] font-bold
                              leading-[16px]
                              shadow-[0_4px_3px_rgba(0,0,0,0.16)]
                              min-[390px]:text-[12px]
                              ${
                                report.level
                                  ? levelColors[
                                      report.level
                                    ]
                                  : "bg-[#f8e2e5] text-[#a56870]"
                              }
                            `}
                          >
                            {report.level ??
                              "Awaiting Analysis"}
                          </span>

                          {/* REPORT STATUS */}

                          <span
                            className={`
                              inline-flex min-h-[18px]
                              items-center rounded-[7px]
                              px-[11px] py-[2px]
                              text-[11px] font-semibold
                              leading-[16px]
                              min-[390px]:text-[12px]
                              ${
                                statusColors[
                                  report.status
                                ]
                              }
                            `}
                          >
                            {
                              report.status
                            }
                          </span>
                        </div>

                        {/* ====================================
                            REPORT DATE AND TIME
                        ==================================== */}

                        <p
                          className="
                            mt-[14px] flex items-start
                            gap-[4px] text-[11px]
                            leading-[1.35] text-[#242424]
                            min-[390px]:text-[12px]
                          "
                        >
                          <CalendarDays
                            size={15}
                            strokeWidth={
                              2
                            }
                            className="shrink-0"
                          />

                          <span className="break-words">
                            {
                              report.date
                            }

                            {report.time
                              ? ` – ${report.time}`
                              : ""}
                          </span>
                        </p>
                      </div>

                      {/* ====================================
                          NAVIGATION ARROW
                      ==================================== */}

                      <ChevronRight
                        size={27}
                        strokeWidth={
                          3.4
                        }
                        aria-hidden="true"
                        className="
                          h-7 w-5 shrink-0
                          text-[#777]
                          min-[390px]:w-6
                        "
                      />
                    </Link>
                  )
                )
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

// ==========================================
// ROUNDED REPORT PHOTO
// ==========================================

function ReportPhoto({
  report,
}: {
  report: ResidentReport;
}) {
  const [
    failed,
    setFailed,
  ] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [report.image]);

  const size = `
    h-[94px] w-[71px]
    shrink-0 overflow-hidden
    rounded-[16px]
    min-[390px]:h-[102px]
    min-[390px]:w-[88px]
  `;

  // ========================================
  // FALLBACK IF IMAGE IS UNAVAILABLE
  // ========================================

  if (!report.image || failed) {
    return (
      <div
        role="img"
        aria-label="Report photo unavailable"
        className={`
          ${size}
          grid place-items-center
          bg-neutral-200 text-neutral-500
        `}
      >
        <ImageOff size={24} />
      </div>
    );
  }

  // ========================================
  // DISPLAY ACTUAL REPORT PHOTO
  // ========================================

  return (
    <div
      className={`${size} bg-neutral-100`}
    >
      <img
        src={report.image}
        alt={`Waste report for ${report.name}`}
        loading="lazy"
        onError={() =>
          setFailed(true)
        }
        className="
          block h-full w-full
          rounded-[16px] object-contain
        "
      />
    </div>
  );
}
