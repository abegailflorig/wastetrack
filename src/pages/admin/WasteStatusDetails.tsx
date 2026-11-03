
import { useEffect, useMemo, useState } from "react";

import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  ImageOff,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

type WasteLevel =
  | "Empty"
  | "Near Full"
  | "Full"
  | "Not analyzed";

type Report = {
  report_id: string;
  user_id: string;
  site_id: string | null;
  date_uploaded: string;
  cnn_detection_level: string | null;
  address: string | null;
  site_description: string | null;
};

type Site = {
  site_id: string;
  site_name: string;
  location: string | null;
};

type Schedule = {
  schedule_id: string;
  source_report_id: string | null;
  assigned_collector_id: string | null;
  date: string;
  collection_time: string | null;
  status: string;
  created_at: string;
};

type Collector = {
  user_id: string;
  full_name: string | null;
  is_active: boolean;
  collector_status: string | null;
};

type WasteImage = {
  src: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

type ReportSummary = {
  report: Report;
  reporter: string;
  currentStatus: string;
  activeSchedule: Schedule | null;
};

// ========================================
// CONSTANTS
// ========================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WEEKDAYS = [
  "Su",
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
  "Sa",
];

const PAGE_SIZE = 500;

// ========================================
// PHILIPPINE DATE AND TIME
// ========================================

function phDateTime(minutesAhead = 60) {
  const value = new Date(
    Date.now() + minutesAhead * 60_000
  );

  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }
  ).formatToParts(value);

  const get = (type: string) =>
    parts.find(
      (part) => part.type === type
    )?.value ?? "";

  return {
    date:
      `${get("year")}-${get("month")}-${get("day")}`,

    time:
      `${get("hour")}:${get("minute")}`,
  };
}

function monthFromDate(value: string) {
  const [year, month] =
    value.split("-").map(Number);

  return new Date(
    year,
    month - 1,
    1
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeTime(value: string) {
  const timestamp =
    new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const minutes = Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) / 60_000
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
    return `${hours} hr ago`;
  }

  const days = Math.floor(
    hours / 24
  );

  return `${days} day${
    days === 1 ? "" : "s"
  } ago`;
}

// ========================================
// CNN WASTE CLASSIFICATION
// ========================================

function levelOf(
  value: string | null
): WasteLevel {
  const level = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[_-]/g, " ");

  if (
    ["FULL", "HIGH"].includes(level)
  ) {
    return "Full";
  }

  if (
    [
      "MEDIUM",
      "NEAR FULL",
      "HALF FULL",
    ].includes(level)
  ) {
    return "Near Full";
  }

  if (
    ["EMPTY", "LOW"].includes(level)
  ) {
    return "Empty";
  }

  return "Not analyzed";
}

function levelStyle(
  value: WasteLevel
): string {
  if (value === "Full") {
    return (
      "bg-[#FFF0F1] " +
      "text-[#B82030] " +
      "border-[#F2C9CE]"
    );
  }

  if (value === "Near Full") {
    return (
      "bg-[#FFF6DF] " +
      "text-[#9A6A08] " +
      "border-[#F0DCAD]"
    );
  }

  if (value === "Empty") {
    return (
      "bg-[#F1F8E8] " +
      "text-[#597B31] " +
      "border-[#D4E4BE]"
    );
  }

  return (
    "bg-[#F3F3F3] " +
    "text-[#666] " +
    "border-[#DDD]"
  );
}

// ========================================
// LOAD WASTE REPORT PHOTO
// ========================================

async function getReportPhoto(
  image: WasteImage | null
): Promise<string> {
  if (!image) {
    return "";
  }

  if (
    image.src &&
    /^https?:\/\//i.test(image.src)
  ) {
    return image.src;
  }

  const bucket =
    image.storage_bucket ||
    "waste-images";

  let path =
    image.storage_path ||
    image.src ||
    "";

  if (!path) {
    return "";
  }

  if (
    path.startsWith(`${bucket}/`)
  ) {
    path = path.slice(
      bucket.length + 1
    );
  }

  const {
    data,
    error,
  } = await supabase.storage
    .from(bucket)
    .createSignedUrl(
      path,
      3600
    );

  if (error) {
    throw error;
  }

  return data?.signedUrl || "";
}

// ========================================
// CALENDAR COMPONENT
// ========================================

function MiniCalendar({
  date,
  month,
  setMonth,
  onSelect,
  disabled,
}: {
  date: string;
  month: Date;
  setMonth: (date: Date) => void;
  onSelect: (date: string) => void;
  disabled: boolean;
}) {
  const year = month.getFullYear();

  const monthNumber =
    month.getMonth();

  const leading =
    new Date(
      year,
      monthNumber,
      1
    ).getDay();

  const days =
    new Date(
      year,
      monthNumber + 1,
      0
    ).getDate();

  const cells: (number | null)[] = [
    ...Array<number | null>(
      leading
    ).fill(null),

    ...Array.from(
      { length: days },
      (_, index) => index + 1
    ),
  ];

  const today =
    phDateTime(0).date;

  return (
    <div
      className="
        rounded-2xl border
        border-[#EBE4D9]
        bg-[#FFFCF8]
        p-3 sm:p-4
      "
    >
      {/* CALENDAR HEADER */}

      <div
        className="
          mb-4 flex items-center
          justify-between gap-2
        "
      >
        <button
          type="button"
          disabled={disabled}
          aria-label="Previous month"
          onClick={() =>
            setMonth(
              new Date(
                year,
                monthNumber - 1,
                1
              )
            )
          }
          className="
            grid h-9 w-9
            place-items-center
            rounded-lg
            bg-white
            text-[#555]
            hover:bg-[#F0E8DC]
            disabled:opacity-40
          "
        >
          <ChevronLeft size={18} />
        </button>

        <strong
          className="
            text-[13px]
            font-bold
            text-[#343434]
          "
        >
          {month.toLocaleDateString(
            "en-US",
            {
              month: "long",
              year: "numeric",
            }
          )}
        </strong>

        <button
          type="button"
          disabled={disabled}
          aria-label="Next month"
          onClick={() =>
            setMonth(
              new Date(
                year,
                monthNumber + 1,
                1
              )
            )
          }
          className="
            grid h-9 w-9
            place-items-center
            rounded-lg
            bg-white
            text-[#555]
            hover:bg-[#F0E8DC]
            disabled:opacity-40
          "
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* CALENDAR DAYS */}

      <div
        className="
          grid grid-cols-7
          gap-1 text-center
        "
      >
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            className="
              py-1 text-[10px]
              font-bold
              text-[#999]
            "
          >
            {day}
          </span>
        ))}

        {cells.map((day, index) => {
          if (day === null) {
            return (
              <span
                key={`blank-${index}`}
              />
            );
          }

          const value =
            `${year}-${String(
              monthNumber + 1
            ).padStart(2, "0")}-${String(
              day
            ).padStart(2, "0")}`;

          const isSelected =
            date === value;

          return (
            <button
              key={value}
              type="button"
              aria-label={`Select ${value}`}
              aria-pressed={isSelected}
              disabled={
                disabled ||
                value < today
              }
              onClick={() =>
                onSelect(value)
              }
              className={`
                aspect-square
                rounded-lg
                text-[11px]
                font-semibold
                transition
                sm:text-[12px]
                ${
                  isSelected
                    ? "bg-[#A81B1E] text-white shadow-sm"
                    : "text-[#555] hover:bg-[#F4E8E5] disabled:cursor-not-allowed disabled:text-[#C7C0B6] disabled:hover:bg-transparent"
                }
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ========================================
// SHARED INPUT STYLE
// ========================================

const fieldClass = `
  w-full min-w-0
  rounded-xl border
  border-[#DDD5C8]
  bg-white
  px-3 py-3
  text-[12px]
  text-[#333]
  outline-none
  transition
  focus:border-[#A5B26B]
  focus:ring-2
  focus:ring-[#A5B26B]/20
  disabled:cursor-not-allowed
  disabled:bg-[#F5F1EA]
  disabled:text-[#888]
`;

// ========================================
// MAIN COMPONENT
// ========================================

export default function WasteStatusDetails() {
  const navigate = useNavigate();

  const {
    siteId: routeId,
  } = useParams<{
    siteId: string;
  }>();

  const [searchParams] =
    useSearchParams();

  // Supports both site IDs and report IDs.
  const targetId =
    routeId ||
    searchParams.get("siteId") ||
    searchParams.get("reportId") ||
    "";

  const requestedReportId =
    searchParams.get("reportId");

  const initial = useMemo(
    () => phDateTime(),
    []
  );

  // ========================================
  // SCHEDULING STATES
  // ========================================

  const [date, setDate] =
    useState(initial.date);

  const [time, setTime] =
    useState(initial.time);

  const [month, setMonth] =
    useState(
      () =>
        monthFromDate(
          initial.date
        )
    );

  const [
    selectedCollectorId,
    setSelectedCollectorId,
  ] = useState("");

  const [
    collectors,
    setCollectors,
  ] = useState<Collector[]>([]);

  // ========================================
  // SITE AND REPORT STATES
  // ========================================

  const [site, setSite] =
    useState<Site | null>(null);

  const [reports, setReports] =
    useState<ReportSummary[]>([]);

  const [
    selectedReportId,
    setSelectedReportId,
  ] = useState<string | null>(
    null
  );

  const [
    reportSearch,
    setReportSearch,
  ] = useState("");

  // ========================================
  // PHOTO STATES
  // ========================================

  const [
    reportPhotoUrl,
    setReportPhotoUrl,
  ] = useState("");

  const [
    photoError,
    setPhotoError,
  ] = useState("");

  const [
    imageFailed,
    setImageFailed,
  ] = useState(false);

  // ========================================
  // LOADING AND ERRORS
  // ========================================

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    photoLoading,
    setPhotoLoading,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    saveError,
    setSaveError,
  ] = useState("");

  const [
    confirmation,
    setConfirmation,
  ] = useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  // ========================================
  // LOAD SITE + REPORTS + COLLECTORS
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadAllReports() {
      setLoading(true);
      setError("");
      setReports([]);
      setSite(null);

      try {
        // ==================================
        // VALIDATE ID
        // ==================================

        if (!UUID_RE.test(targetId)) {
          throw new Error(
            "A valid disposal site ID or report ID (UUID) is required."
          );
        }

        // ==================================
        // VERIFY SIGNED-IN ADMIN
        // ==================================

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!authData.user) {
          throw new Error(
            "Please sign in as an administrator."
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
            authData.user.id
          )
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (
          !profile ||
          String(profile.role).toLowerCase() !==
            "admin" ||
          profile.is_active !== true
        ) {
          throw new Error(
            "Only an active administrator can review reports."
          );
        }

        // ==================================
        // FIND SITE
        // ==================================

        const {
          data: siteData,
          error: siteError,
        } = await supabase
          .from("disposal_sites")
          .select(
            "site_id,site_name,location"
          )
          .eq(
            "site_id",
            targetId
          )
          .maybeSingle();

        if (siteError) {
          throw siteError;
        }

        let matchedSite =
          (siteData as Site | null) ??
          null;

        let linkedReport:
          Report | null = null;

        // No waste_type field needed.
        const reportColumns = [
          "report_id",
          "user_id",
          "site_id",
          "date_uploaded",
          "cnn_detection_level",
          "address",
          "site_description",
        ].join(",");

        // ==================================
        // SUPPORT REPORT ID LINKS
        // ==================================

        if (!matchedSite) {
          const {
            data,
            error: reportError,
          } = await supabase
            .from("waste_reports")
            .select(reportColumns)
            .eq(
              "report_id",
              targetId
            )
            .maybeSingle();

          if (reportError) {
            throw reportError;
          }

          linkedReport =
            (data as unknown as Report | null) ??
            null;

          if (!linkedReport) {
            throw new Error(
              "No disposal site or report found for the supplied ID."
            );
          }

          if (
            linkedReport.site_id
          ) {
            const {
              data: foundSite,
              error: linkedSiteError,
            } = await supabase
              .from("disposal_sites")
              .select(
                "site_id,site_name,location"
              )
              .eq(
                "site_id",
                linkedReport.site_id
              )
              .maybeSingle();

            if (linkedSiteError) {
              throw linkedSiteError;
            }

            matchedSite =
              (foundSite as Site | null) ??
              null;
          }
        }

        // ==================================
        // LOAD REPORTS FOR SITE
        // ==================================

        const resolvedSiteId =
          matchedSite?.site_id ||
          linkedReport?.site_id ||
          null;

        const allReports:
          Report[] = [];

        if (resolvedSiteId) {
          for (
            let offset = 0;
            ;
            offset += PAGE_SIZE
          ) {
            const {
              data,
              error: pageError,
            } = await supabase
              .from("waste_reports")
              .select(reportColumns)
              .eq(
                "site_id",
                resolvedSiteId
              )
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
                offset + PAGE_SIZE - 1
              );

            if (pageError) {
              throw pageError;
            }

            const page =
              (data ?? []) as unknown as Report[];

            allReports.push(...page);

            if (
              page.length <
              PAGE_SIZE
            ) {
              break;
            }
          }
        } else if (linkedReport) {
          allReports.push(
            linkedReport
          );
        }

        // ==================================
        // GET REPORTER AND REPORT IDS
        // ==================================

        const reporterIds = [
          ...new Set(
            allReports.map(
              (report) =>
                report.user_id
            )
          ),
        ];

        const reportIds =
          allReports.map(
            (report) =>
              report.report_id
          );

        const reporterNames =
          new Map<string, string>();

        const activeSchedules =
          new Map<string, Schedule>();

        const latestStatuses =
          new Map<string, string>();

        // ==================================
        // FETCH REPORTER NAMES
        // ==================================

        for (
          let offset = 0;
          offset < reporterIds.length;
          offset += 100
        ) {
          const {
            data,
            error: namesError,
          } = await supabase
            .from("users")
            .select(
              "user_id,full_name"
            )
            .in(
              "user_id",
              reporterIds.slice(
                offset,
                offset + 100
              )
            );

          if (namesError) {
            throw namesError;
          }

          for (
            const row of data ?? []
          ) {
            reporterNames.set(
              row.user_id,
              row.full_name ||
                "Unknown resident"
            );
          }
        }

        // ==================================
        // FETCH SCHEDULES AND STATUSES
        // ==================================

        for (
          let offset = 0;
          offset < reportIds.length;
          offset += 100
        ) {
          const ids =
            reportIds.slice(
              offset,
              offset + 100
            );

          const [
            scheduleResult,
            statusResult,
          ] = await Promise.all([
            supabase
              .from("schedules")
              .select(
                [
                  "schedule_id",
                  "source_report_id",
                  "assigned_collector_id",
                  "date",
                  "collection_time",
                  "status",
                  "created_at",
                ].join(",")
              )
              .in(
                "source_report_id",
                ids
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
                "report_id,status,created_at"
              )
              .in(
                "report_id",
                ids
              )
              .order(
                "created_at",
                {
                  ascending: false,
                }
              ),
          ]);

          if (scheduleResult.error) {
            throw scheduleResult.error;
          }

          if (statusResult.error) {
            throw statusResult.error;
          }

          // Latest active schedule per report.
          for (
            const row of (
              scheduleResult.data ??
              []
            ) as unknown as Schedule[]
          ) {
            if (
              row.source_report_id &&
              ![
                "cancelled",
                "canceled",
              ].includes(
                row.status?.toLowerCase()
              ) &&
              !activeSchedules.has(
                row.source_report_id
              )
            ) {
              activeSchedules.set(
                row.source_report_id,
                row
              );
            }
          }

          // Latest status per report.
          for (
            const row of
            statusResult.data ?? []
          ) {
            if (
              !latestStatuses.has(
                row.report_id
              )
            ) {
              latestStatuses.set(
                row.report_id,
                row.status
              );
            }
          }
        }

        // ==================================
        // FETCH COLLECTORS
        // ==================================

        const {
          data: collectorData,
          error: collectorError,
        } = await supabase
          .from("users")
          .select(
            "user_id,full_name,is_active,collector_status"
          )
          .eq(
            "role",
            "collector"
          )
          .order(
            "full_name",
            {
              ascending: true,
            }
          );

        if (collectorError) {
          throw collectorError;
        }

        // ==================================
        // BUILD REPORT SUMMARIES
        // ==================================

        const summaries:
          ReportSummary[] =
          allReports.map(
            (report) => ({
              report,

              reporter:
                reporterNames.get(
                  report.user_id
                ) ||
                "Unknown resident",

              currentStatus:
                latestStatuses.get(
                  report.report_id
                ) ||
                "Pending",

              activeSchedule:
                activeSchedules.get(
                  report.report_id
                ) ||
                null,
            })
          );

        if (!active) {
          return;
        }

        // ==================================
        // UPDATE STATES
        // ==================================

        setSite(matchedSite);

        setCollectors(
          (collectorData ??
            []) as Collector[]
        );

        setReports(summaries);

        setSelectedReportId(
          (previous) => {
            if (
              previous &&
              summaries.some(
                (summary) =>
                  summary.report.report_id ===
                  previous
              )
            ) {
              return previous;
            }

            if (
              requestedReportId &&
              summaries.some(
                (summary) =>
                  summary.report.report_id ===
                  requestedReportId
              )
            ) {
              return requestedReportId;
            }

            if (
              linkedReport &&
              summaries.some(
                (summary) =>
                  summary.report.report_id ===
                  linkedReport.report_id
              )
            ) {
              return linkedReport.report_id;
            }

            return (
              summaries[0]
                ?.report.report_id ??
              null
            );
          }
        );
      } catch (cause) {
        console.error(
          "[WasteTrack] Load site reports:",
          cause
        );

        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load site reports."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadAllReports();

    return () => {
      active = false;
    };
  }, [
    targetId,
    requestedReportId,
    refreshKey,
  ]);

  // ========================================
  // SELECTED REPORT
  // ========================================

  const selected =
    reports.find(
      (summary) =>
        summary.report.report_id ===
        selectedReportId
    ) ??
    null;

  const alreadyScheduled =
    Boolean(
      selected?.activeSchedule
    );

  const level = levelOf(
    selected?.report
      .cnn_detection_level ??
      null
  );

  // ========================================
  // AVAILABLE COLLECTORS
  // ========================================

  const availableCollectors =
    collectors.filter(
      (collector) =>
        collector.is_active &&
        collector.collector_status
          ?.trim()
          .toLowerCase() !==
          "on leave"
    );

  const assignedCollectorName =
    selected?.activeSchedule
      ? collectors.find(
          (collector) =>
            collector.user_id ===
            selected.activeSchedule
              ?.assigned_collector_id
        )?.full_name ||
        "Assigned collector"
      : "Not yet assigned";

  const siteName =
    site?.site_name ||
    selected?.report.site_description ||
    "Disposal site";

  const locationName =
    site?.location ||
    selected?.report.address ||
    "Not provided";

  // ========================================
  // SEARCH REPORTS
  // ========================================

  const filteredReports =
    reports.filter(
      (item) => {
        const search =
          reportSearch
            .trim()
            .toLowerCase();

        if (!search) {
          return true;
        }

        return (
          item.reporter
            .toLowerCase()
            .includes(search) ||

          item.report.report_id
            .toLowerCase()
            .includes(search) ||

          levelOf(
            item.report.cnn_detection_level
          )
            .toLowerCase()
            .includes(search)
        );
      }
    );

  // ========================================
  // LOAD SELECTED REPORT PHOTO
  // ========================================

  useEffect(() => {
    let active = true;

    setReportPhotoUrl("");
    setPhotoError("");
    setImageFailed(false);

    if (!selected) {
      return;
    }

    // ==================================
    // SET EXISTING OR DEFAULT SCHEDULE
    // ==================================

    if (
      selected.activeSchedule
    ) {
      setDate(
        selected.activeSchedule.date
      );

      setTime(
        selected.activeSchedule
          .collection_time
          ?.slice(0, 5) ||
        "08:00"
      );

      setMonth(
        monthFromDate(
          selected.activeSchedule.date
        )
      );

      setSelectedCollectorId(
        selected.activeSchedule
          .assigned_collector_id ||
        ""
      );
    } else {
      const suggested =
        phDateTime();

      setDate(suggested.date);
      setTime(suggested.time);

      setMonth(
        monthFromDate(
          suggested.date
        )
      );

      setSelectedCollectorId("");
    }

    const reportId =
      selected.report.report_id;

    // ==================================
    // LOAD PHOTO FROM SUPABASE STORAGE
    // ==================================

    async function loadPhoto() {
      setPhotoLoading(true);

      try {
        const {
          data,
          error: imageError,
        } = await supabase
          .from("waste_images")
          .select(
            "src,storage_bucket,storage_path"
          )
          .eq(
            "report_id",
            reportId
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          )
          .limit(1)
          .maybeSingle();

        if (imageError) {
          throw imageError;
        }

        const url =
          await getReportPhoto(
            (data as WasteImage | null) ??
              null
          );

        if (!active) {
          return;
        }

        setReportPhotoUrl(url);

        if (!url) {
          setPhotoError(
            "No photo uploaded for this report."
          );
        }
      } catch (cause) {
        if (active) {
          setPhotoError(
            cause instanceof Error
              ? cause.message
              : "Unable to load photo."
          );
        }
      } finally {
        if (active) {
          setPhotoLoading(false);
        }
      }
    }

    void loadPhoto();

    return () => {
      active = false;
    };
  }, [
    selectedReportId,
    reports,
  ]);

  // ========================================
  // CHANGE COLLECTION DATE
  // ========================================

  function changeDate(value: string) {
    setDate(value);

    if (
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      setMonth(
        monthFromDate(value)
      );
    }

    setSaveError("");
    setConfirmation("");
  }

  // ========================================
  // APPROVE AND ASSIGN COLLECTOR
  // ========================================

  async function handleApprove() {
    setSaveError("");
    setConfirmation("");

    if (
      !selected ||
      alreadyScheduled ||
      saving
    ) {
      return;
    }

    // ==================================
    // VALIDATE SITE
    // ==================================

    if (
      !selected.report.site_id
    ) {
      setSaveError(
        "This report must be linked to a registered disposal site before scheduling."
      );

      return;
    }

    // ==================================
    // VALIDATE COLLECTOR
    // ==================================

    if (
      !selectedCollectorId
    ) {
      setSaveError(
        "Select a collector before approving."
      );

      return;
    }

    const collectorAvailable =
      availableCollectors.some(
        (collector) =>
          collector.user_id ===
          selectedCollectorId
      );

    if (
      !collectorAvailable
    ) {
      setSaveError(
        "The selected collector is not currently available."
      );

      return;
    }

    // ==================================
    // VALIDATE DATE AND TIME
    // ==================================

    if (!date || !time) {
      setSaveError(
        "Choose a collection date and time."
      );

      return;
    }

    const timestamp =
      new Date(
        `${date}T${time}:00+08:00`
      ).getTime();

    if (
      !Number.isFinite(timestamp) ||
      timestamp <= Date.now()
    ) {
      setSaveError(
        "Choose a future collection date and time (Philippine time)."
      );

      return;
    }

    setSaving(true);

    try {
      // ==================================
      // SUPABASE RPC
      // ==================================

      const {
        error: approvalError,
      } = await supabase.rpc(
        "admin_assign_waste_collector",
        {
          p_report_id:
            selected.report.report_id,

          p_collector_id:
            selectedCollectorId,

          p_date: date,

          p_collection_time:
            `${time}:00`,
        }
      );

      if (approvalError) {
        throw approvalError;
      }

      setConfirmation(
        `Collector assigned for ${date} at ${time}.`
      );

      // Reload reports and schedules.
      setRefreshKey(
        (value) => value + 1
      );
    } catch (cause) {
      console.error(
        "[WasteTrack] Schedule report:",
        cause
      );

      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not save assignment."
      );
    } finally {
      setSaving(false);
    }
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
      {/* ====================================
          HEADER
      ==================================== */}

      <header
        className="
          border-b-[5px]
          border-[#A5B26B]
          bg-white
        "
      >
        <div
          className="
            mx-auto
            max-w-[1540px]
            px-4 py-5
            sm:px-6
            lg:px-8
          "
        >
          {/* BACK BUTTON */}

          <button
            type="button"
            onClick={() =>
              navigate(
                "/admin/waste-status"
              )
            }
            className="
              mb-3 inline-flex
              items-center gap-2
              text-xs font-bold
              text-[#A81B1E]
              hover:underline
            "
          >
            <ArrowLeft size={16} />
            Back to waste status
          </button>

          <div
            className="
              flex flex-wrap
              items-center
              justify-between
              gap-3
            "
          >
            <div className="min-w-0">
              <h1
                className="
                  break-words
                  text-[23px]
                  font-extrabold
                  tracking-tight
                  sm:text-[28px]
                "
              >
                Report review
              </h1>

              <p
                className="
                  mt-1 flex
                  items-start gap-1.5
                  break-words
                  text-[12px]
                  text-[#777]
                "
              >
                <MapPin
                  size={14}
                  className="
                    mt-0.5 shrink-0
                    text-[#A81B1E]
                  "
                />

                {siteName}
              </p>
            </div>

            {!loading && !error && (
              <span
                className="
                  rounded-full
                  border border-[#E3D8CB]
                  bg-[#F7F0E4]
                  px-3 py-2
                  text-xs font-semibold
                  text-[#5D5D5D]
                "
              >
                {reports.length} report
                {reports.length === 1
                  ? ""
                  : "s"}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ====================================
          PAGE CONTENT
      ==================================== */}

      <div
        className="
          mx-auto flex
          max-w-[1540px]
          flex-col gap-5
          px-4 py-6
          sm:px-6
          lg:px-8
        "
      >
        {/* ====================================
            LOADING
        ==================================== */}

        {loading && (
          <div
            role="status"
            className="
              flex min-h-[230px]
              items-center
              justify-center
              gap-3
              rounded-2xl
              border border-[#EAE2D7]
              bg-white
            "
          >
            <LoaderCircle
              size={26}
              className="
                animate-spin
                text-[#A5B26B]
              "
            />

            <span
              className="
                text-[13px]
                text-[#777]
              "
            >
              Loading site reports...
            </span>
          </div>
        )}

        {/* ====================================
            ERROR
        ==================================== */}

        {!loading && error && (
          <div
            role="alert"
            className="
              rounded-2xl
              border border-red-200
              bg-red-50 p-5
            "
          >
            <div
              className="
                flex items-start
                gap-3 text-[#A81B1E]
              "
            >
              <AlertCircle
                size={20}
                className="shrink-0"
              />

              <p
                className="
                  break-words
                  text-sm
                "
              >
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setRefreshKey(
                  (value) => value + 1
                )
              }
              className="
                mt-4 rounded-lg
                bg-[#A81B1E]
                px-4 py-2
                text-xs font-bold
                text-white
                hover:bg-[#8F1619]
              "
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ====================================
                REPORT SELECTION
            ==================================== */}

            <section
              className="
                min-w-0
                rounded-2xl
                border border-[#EAE2D7]
                bg-white
                p-4 shadow-sm
                sm:p-5
              "
            >
              {/* REPORT LIST HEADER */}

              <div
                className="
                  mb-4 flex
                  flex-wrap
                  items-center
                  justify-between
                  gap-3
                "
              >
                <div
                  className="
                    flex items-center
                    gap-3
                  "
                >
                  <div
                    className="
                      grid h-10 w-10
                      place-items-center
                      rounded-xl
                      bg-[#F7F0E4]
                      text-[#A81B1E]
                    "
                  >
                    <ClipboardList
                      size={20}
                    />
                  </div>

                  <div>
                    <h2
                      className="
                        text-[15px]
                        font-extrabold
                      "
                    >
                      Reports for this site
                    </h2>

                    <p
                      className="
                        text-[11px]
                        text-[#999]
                      "
                    >
                      Choose a report to review and schedule
                    </p>
                  </div>
                </div>

                {/* SEARCH REPORTS */}

                {reports.length > 4 && (
                  <input
                    type="search"
                    value={reportSearch}
                    onChange={(event) =>
                      setReportSearch(
                        event.target.value
                      )
                    }
                    aria-label="Search reports"
                    placeholder="Search reports..."
                    className="
                      w-full rounded-xl
                      border border-[#E5DBCD]
                      bg-[#FFFCF8]
                      px-3 py-2
                      text-xs
                      outline-none
                      focus:border-[#A5B26B]
                      sm:w-[230px]
                    "
                  />
                )}
              </div>

              {/* NO REPORTS */}

              {reports.length === 0 ? (
                <p
                  className="
                    rounded-xl
                    bg-[#F7F0E4]
                    px-4 py-7
                    text-center
                    text-xs text-[#777]
                  "
                >
                  No waste reports have been
                  submitted for this site.
                </p>
              ) : filteredReports.length === 0 ? (
                <p
                  className="
                    rounded-xl
                    bg-[#F7F0E4]
                    px-4 py-7
                    text-center
                    text-xs text-[#777]
                  "
                >
                  No matching reports found.
                </p>
              ) : (
                // ==================================
                // REPORT CARDS
                // ==================================

                <div
                  className="
                    grid max-h-[310px]
                    grid-cols-1
                    gap-3
                    overflow-y-auto
                    pr-1
                    sm:grid-cols-2
                    xl:grid-cols-3
                  "
                >
                  {filteredReports.map(
                    ({
                      report,
                      reporter,
                      currentStatus,
                      activeSchedule,
                    }) => {
                      const active =
                        report.report_id ===
                        selectedReportId;

                      const reportLevel =
                        levelOf(
                          report.cnn_detection_level
                        );

                      return (
                        <button
                          key={report.report_id}
                          type="button"
                          disabled={saving}
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedReportId(
                              report.report_id
                            );

                            setSaveError("");
                            setConfirmation("");
                          }}
                          className={`
                            min-w-0
                            rounded-xl
                            border p-3.5
                            text-left
                            transition
                            disabled:cursor-wait
                            ${
                              active
                                ? "border-[#B5202A] bg-[#FFF5F3] shadow-[0_0_0_1px_#B5202A]"
                                : "border-[#E7E0D5] bg-[#FFFCF8] hover:border-[#D3C5B7] hover:bg-white"
                            }
                          `}
                        >
                          {/* REPORT HEADER */}

                          <div
                            className="
                              flex flex-wrap
                              items-center
                              justify-between
                              gap-2
                            "
                          >
                            <span
                              className="
                                text-[11px]
                                font-extrabold
                                text-[#333]
                              "
                            >
                              Report{" "}
                              {report.report_id
                                .slice(0, 8)
                                .toUpperCase()}
                            </span>

                            <span
                              className={`
                                rounded-full
                                px-2 py-1
                                text-[10px]
                                font-bold
                                ${
                                  activeSchedule
                                    ? "bg-[#ECF4E5] text-[#5D7C3E]"
                                    : "bg-[#FFF0CF] text-[#956A13]"
                                }
                              `}
                            >
                              {activeSchedule
                                ? "Scheduled"
                                : "Not scheduled"}
                            </span>
                          </div>

                          {/* REPORTER */}

                          <p
                            className="
                              mt-2 truncate
                              text-[12px]
                              font-semibold
                              text-[#555]
                            "
                          >
                            {reporter}
                          </p>

                          {/* REPORT DATE */}

                          <p
                            className="
                              mt-1
                              text-[11px]
                              text-[#999]
                            "
                          >
                            {formatDateTime(
                              report.date_uploaded
                            )}
                          </p>

                          {/* WASTE LEVEL */}

                          <div
                            className="
                              mt-3 flex
                              flex-wrap
                              items-center
                              gap-2
                            "
                          >
                            <span
                              className={`
                                rounded-full
                                border
                                px-2 py-1
                                text-[10px]
                                font-bold
                                ${levelStyle(reportLevel)}
                              `}
                            >
                              {reportLevel}
                            </span>

                            <span
                              className="
                                text-[10px]
                                text-[#888]
                              "
                            >
                              {currentStatus}
                            </span>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              )}
            </section>

            {/* ====================================
                SELECTED REPORT DETAILS
            ==================================== */}

            {selected && (
              <div
                className="
                  grid min-w-0
                  grid-cols-1
                  items-start
                  gap-5
                  lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]
                "
              >
                {/* ==================================
                    LEFT COLUMN
                ================================== */}

                <div
                  className="
                    flex min-w-0
                    flex-col gap-5
                  "
                >
                  {/* ==================================
                      REPORTED WASTE PHOTO
                  ================================== */}

                  <section
                    className="
                      min-w-0
                      overflow-hidden
                      rounded-2xl
                      border border-[#EAE2D7]
                      bg-white
                      shadow-sm
                    "
                  >
                    {/* PHOTO HEADER */}

                    <div
                      className="
                        flex flex-wrap
                        items-center
                        justify-between
                        gap-2
                        border-b
                        border-[#EFE8DD]
                        px-4 py-4
                        sm:px-5
                      "
                    >
                      <div
                        className="
                          flex items-center
                          gap-2
                        "
                      >
                        <MapPin
                          size={17}
                          className="text-[#A81B1E]"
                        />

                        <h2
                          className="
                            text-[14px]
                            font-extrabold
                          "
                        >
                          Reported waste photo
                        </h2>
                      </div>

                      <span
                        className="
                          text-[11px]
                          text-[#999]
                        "
                      >
                        Original uploaded image
                      </span>
                    </div>

                    {/* ==================================
                        PHOTO DISPLAY
                        NO CROPPING / NO ZOOM
                    ================================== */}

                    <div
                      className="
                        flex min-h-[230px]
                        items-center
                        justify-center
                        bg-[#F7F0E4]
                        p-3 sm:p-4
                      "
                    >
                      {photoLoading ? (
                        <div
                          className="
                            flex flex-col
                            items-center
                            gap-2 py-12
                          "
                        >
                          <LoaderCircle
                            size={28}
                            className="
                              animate-spin
                              text-[#A5B26B]
                            "
                          />

                          <span
                            className="
                              text-xs
                              text-[#777]
                            "
                          >
                            Loading report photo...
                          </span>
                        </div>
                      ) : reportPhotoUrl &&
                        !imageFailed ? (
                        <img
                          src={reportPhotoUrl}
                          alt={`Waste report for ${siteName}`}
                          loading="eager"
                          onError={() =>
                            setImageFailed(true)
                          }
                          className="
                            block h-auto
                            max-h-[65dvh]
                            w-full max-w-full
                            rounded-xl
                            object-contain
                          "
                        />
                      ) : (
                        <div
                          className="
                            flex flex-col
                            items-center
                            gap-3 py-12
                            text-center
                            text-[#888]
                          "
                        >
                          <ImageOff
                            size={30}
                          />

                          <p className="text-xs">
                            Photo unavailable
                          </p>
                        </div>
                      )}
                    </div>

                    {/* PHOTO ERROR */}

                    {photoError && (
                      <p
                        role="status"
                        className="
                          px-4 py-3
                          text-xs
                          text-[#A81B1E]
                          sm:px-5
                        "
                      >
                        {photoError}
                      </p>
                    )}

                    {/* ==================================
                        CNN RESULT
                    ================================== */}

                    <div
                      className="
                        flex flex-wrap
                        items-center
                        justify-between
                        gap-3
                        px-4 py-4
                        sm:px-5
                      "
                    >
                      <div>
                        <p
                          className="
                            text-[10px]
                            font-bold
                            uppercase
                            tracking-wide
                            text-[#999]
                          "
                        >
                          CNN result
                        </p>

                        <p
                          className="
                            mt-1
                            text-[12px]
                            text-[#777]
                          "
                        >
                          Detected waste level
                        </p>
                      </div>

                      <span
                        className={`
                          inline-flex
                          items-center
                          rounded-full
                          border px-4 py-2
                          text-[12px]
                          font-extrabold
                          ${levelStyle(level)}
                        `}
                      >
                        {level}
                      </span>
                    </div>
                  </section>

                  {/* ==================================
                      REPORT INFORMATION
                      WASTE TYPES REMOVED
                  ================================== */}

                  <section
                    className="
                      rounded-2xl
                      border border-[#EAE2D7]
                      bg-white
                      p-4
                      shadow-sm
                      sm:p-5
                    "
                  >
                    {/* INFORMATION HEADER */}

                    <div
                      className="
                        mb-4 flex
                        items-center
                        gap-3
                      "
                    >
                      <div
                        className="
                          grid h-10 w-10
                          place-items-center
                          rounded-xl
                          bg-[#EEF4E5]
                          text-[#6F8D47]
                        "
                      >
                        <ClipboardList
                          size={19}
                        />
                      </div>

                      <h2
                        className="
                          text-[15px]
                          font-extrabold
                        "
                      >
                        Report information
                      </h2>
                    </div>

                    {/* ==================================
                        REPORT DETAILS ONLY
                    ================================== */}

                    <div
                      className="
                        grid grid-cols-1
                        gap-4
                        sm:grid-cols-2
                      "
                    >
                      {[
                        {
                          label: "Location",
                          value: locationName,
                          icon: MapPin,
                        },
                        {
                          label: "Reported by",
                          value: selected.reporter,
                          icon: UserRound,
                        },
                        {
                          label: "Assigned collector",
                          value: assignedCollectorName,
                          icon: UserRound,
                        },
                        {
                          label: "Reported",
                          value: relativeTime(
                            selected.report.date_uploaded
                          ),
                          icon: Clock3,
                        },
                        {
                          label: "Report status",
                          value: selected.currentStatus,
                          icon: ShieldCheck,
                        },
                        {
                          label: "Report ID",
                          value:
                            selected.report.report_id,
                          icon: ClipboardList,
                        },
                      ].map(
                        ({
                          label,
                          value,
                          icon: Icon,
                        }) => (
                          <div
                            key={label}
                            className="min-w-0"
                          >
                            <p
                              className="
                                flex items-center
                                gap-1.5
                                text-[11px]
                                font-semibold
                                text-[#999]
                              "
                            >
                              <Icon
                                size={13}
                              />

                              {label}
                            </p>

                            <p
                              className="
                                mt-1 break-words
                                text-[12px]
                                font-bold
                                text-[#343434]
                              "
                            >
                              {value}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </section>
                </div>

                {/* ==================================
                    RIGHT COLUMN
                    COLLECTION SCHEDULING
                ================================== */}

                <aside
                  className="
                    min-w-0
                    rounded-2xl
                    border border-[#EAE2D7]
                    bg-white
                    shadow-sm
                    lg:sticky
                    lg:top-5
                  "
                >
                  {/* SCHEDULING HEADER */}

                  <div
                    className="
                      flex items-center
                      gap-3
                      rounded-t-2xl
                      bg-[#F7F0E4]
                      px-4 py-5
                      sm:px-5
                    "
                  >
                    <div
                      className="
                        grid h-11 w-11
                        place-items-center
                        rounded-xl
                        bg-[#A81B1E]
                        text-white
                      "
                    >
                      <CalendarDays
                        size={21}
                      />
                    </div>

                    <div>
                      <h2
                        className="
                          text-[15px]
                          font-extrabold
                        "
                      >
                        Collection scheduling
                      </h2>

                      <p
                        className="
                          mt-0.5
                          text-[11px]
                          text-[#777]
                        "
                      >
                        {alreadyScheduled
                          ? "Collector already assigned"
                          : "Schedule the selected waste report"}
                      </p>
                    </div>
                  </div>

                  {/* ==================================
                      SCHEDULING FORM
                  ================================== */}

                  <div
                    className="
                      space-y-4
                      p-4 sm:p-5
                    "
                  >
                    {/* EXISTING SCHEDULE */}

                    {alreadyScheduled && (
                      <div
                        role="status"
                        className="
                          flex items-start
                          gap-2
                          rounded-xl
                          border border-[#D7E9C7]
                          bg-[#F1F8E9]
                          p-3
                          text-[12px]
                          text-[#557836]
                        "
                      >
                        <CheckCircle2
                          size={18}
                          className="shrink-0"
                        />

                        <span>
                          This report already
                          has a schedule (
                          {selected.activeSchedule
                            ?.status}
                          ).
                        </span>
                      </div>
                    )}

                    {/* ==================================
                        CALENDAR
                    ================================== */}

                    <MiniCalendar
                      date={date}
                      month={month}
                      setMonth={setMonth}
                      onSelect={changeDate}
                      disabled={
                        alreadyScheduled ||
                        saving
                      }
                    />

                    {/* ==================================
                        DATE AND TIME INPUTS
                    ================================== */}

                    <div
                      className="
                        grid grid-cols-1
                        gap-3
                        sm:grid-cols-2
                        lg:grid-cols-1
                        xl:grid-cols-2
                      "
                    >
                      {/* DATE */}

                      <div>
                        <label
                          htmlFor="wd-date"
                          className="
                            mb-1.5 block
                            text-[11px]
                            font-bold
                            text-[#666]
                          "
                        >
                          Collection date
                        </label>

                        <input
                          id="wd-date"
                          type="date"
                          value={date}
                          min={
                            phDateTime(0).date
                          }
                          disabled={
                            alreadyScheduled ||
                            saving
                          }
                          onChange={(event) =>
                            changeDate(
                              event.target.value
                            )
                          }
                          className={
                            fieldClass
                          }
                        />
                      </div>

                      {/* TIME */}

                      <div>
                        <label
                          htmlFor="wd-time"
                          className="
                            mb-1.5 block
                            text-[11px]
                            font-bold
                            text-[#666]
                          "
                        >
                          Time (Philippines)
                        </label>

                        <input
                          id="wd-time"
                          type="time"
                          value={time}
                          disabled={
                            alreadyScheduled ||
                            saving
                          }
                          onChange={(event) => {
                            setTime(
                              event.target.value
                            );

                            setSaveError("");
                            setConfirmation("");
                          }}
                          className={
                            fieldClass
                          }
                        />
                      </div>
                    </div>

                    {/* ==================================
                        COLLECTOR SELECTION
                    ================================== */}

                    <div>
                      <label
                        htmlFor="wd-collector"
                        className="
                          mb-1.5 block
                          text-[11px]
                          font-bold
                          text-[#666]
                        "
                      >
                        Assigned collector
                      </label>

                      <select
                        id="wd-collector"
                        value={
                          selectedCollectorId
                        }
                        disabled={
                          alreadyScheduled ||
                          saving
                        }
                        onChange={(event) => {
                          setSelectedCollectorId(
                            event.target.value
                          );

                          setSaveError("");
                          setConfirmation("");
                        }}
                        className={
                          fieldClass
                        }
                      >
                        <option value="">
                          Select a collector
                        </option>

                        {/* KEEP THE EXISTING
                            ASSIGNED COLLECTOR
                            VISIBLE EVEN IF
                            CURRENTLY UNAVAILABLE */}

                        {alreadyScheduled &&
                          selectedCollectorId &&
                          !availableCollectors.some(
                            (collector) =>
                              collector.user_id ===
                              selectedCollectorId
                          ) && (
                            <option
                              value={
                                selectedCollectorId
                              }
                            >
                              {assignedCollectorName}
                            </option>
                          )}

                        {/* AVAILABLE COLLECTORS */}

                        {availableCollectors.map(
                          (collector) => (
                            <option
                              key={
                                collector.user_id
                              }
                              value={
                                collector.user_id
                              }
                            >
                              {collector.full_name ||
                                "Unnamed collector"}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {/* ==================================
                        APPROVE BUTTON
                    ================================== */}

                    <button
                      type="button"
                      onClick={() =>
                        void handleApprove()
                      }
                      disabled={
                        saving ||
                        alreadyScheduled ||
                        !selectedCollectorId ||
                        !selected.report.site_id ||
                        availableCollectors.length === 0
                      }
                      className="
                        flex w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-[#A81B1E]
                        px-4 py-3.5
                        text-[12px]
                        font-bold
                        text-white
                        transition
                        hover:bg-[#8F1619]
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                      "
                    >
                      {saving ? (
                        <LoaderCircle
                          size={17}
                          className="animate-spin"
                        />
                      ) : (
                        <CheckCircle2
                          size={17}
                        />
                      )}

                      {saving
                        ? "Saving assignment..."
                        : alreadyScheduled
                          ? "Already assigned"
                          : "Approve & assign collector"}
                    </button>

                    {/* ==================================
                        SUCCESS MESSAGE
                    ================================== */}

                    {confirmation && (
                      <div
                        role="status"
                        className="
                          flex items-start
                          gap-2
                          rounded-xl
                          border border-[#D7E9C7]
                          bg-[#F1F8E9]
                          p-3
                          text-[12px]
                          text-[#557836]
                        "
                      >
                        <CheckCircle2
                          size={17}
                          className="shrink-0"
                        />

                        <span>
                          {confirmation}
                        </span>
                      </div>
                    )}

                    {/* ==================================
                        ERROR MESSAGE
                    ================================== */}

                    {saveError && (
                      <div
                        role="alert"
                        className="
                          flex items-start
                          gap-2
                          rounded-xl
                          border border-red-200
                          bg-red-50
                          p-3
                          text-[12px]
                          text-[#A81B1E]
                        "
                      >
                        <AlertCircle
                          size={17}
                          className="shrink-0"
                        />

                        <span>
                          {saveError}
                        </span>
                      </div>
                    )}

                    {/* ==================================
                        SITE VALIDATION NOTE
                    ================================== */}

                    {!selected.report.site_id && (
                      <p
                        className="
                          text-[11px]
                          text-[#9A6A08]
                        "
                      >
                        This report must be linked
                        to a registered disposal
                        site before scheduling.
                      </p>
                    )}

                    {/* ==================================
                        COLLECTOR AVAILABILITY NOTE
                    ================================== */}

                    {availableCollectors.length ===
                      0 && (
                      <p
                        className="
                          text-[11px]
                          text-[#9A6A08]
                        "
                      >
                        No available active
                        collector accounts found.
                      </p>
                    )}
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
