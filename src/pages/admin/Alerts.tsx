
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Inbox,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Send,
  ShieldAlert,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ==========================================
// TYPES
// ==========================================

type Severity = "critical" | "warning";
type AlertFilter = "all" | Severity;

type RejectionReason =
  | "unrelated_image"
  | "duplicate_or_spam"
  | "unverifiable_location";

type ReportRow = {
  report_id: string;
  user_id: string;
  site_id: string | null;
  address: string | null;
  cnn_detection_level: string | null;
  analyzed_at: string | null;
  date_uploaded: string;
};

type ScheduleRow = {
  schedule_id: string;
  site_id: string | null;
  source_report_id: string | null;
  assigned_collector_id: string | null;
  date: string | null;
  collection_time: string | null;
  status: string | null;
  created_at: string | null;
};

type StatusRow = {
  report_id: string;
  status: string;
  created_at: string;
};

type CollectionRow = {
  schedule_id: string;
  collection_status: string | null;
  completed_at: string | null;
};

type SiteRow = {
  site_id: string;
  site_name: string;
};

type CollectorRow = {
  user_id: string;
  full_name: string;
};

type WasteImageRow = {
  storage_bucket: string | null;
  storage_path: string | null;
};

type AlertItem = {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  siteName: string;
  createdAt: string;
};

type ReviewOption = {
  reportId: string;
  siteName: string;
  reportDate: string;
  level: string | null;
  hasLinkedSite: boolean;
};

// ==========================================
// REJECTION REASONS
// ==========================================

const REJECTION_REASONS: {
  value: RejectionReason;
  label: string;
}[] = [
  {
    value: "unrelated_image",
    label: "Unrelated or misleading image",
  },
  {
    value: "duplicate_or_spam",
    label: "Duplicate or spam report",
  },
  {
    value: "unverifiable_location",
    label: "Location cannot be verified",
  },
];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function isCompleted(value?: string | null) {
  return ["completed", "collected", "done"].includes(
    normalize(value)
  );
}

function isClosed(value?: string | null) {
  return (
    isCompleted(value) ||
    ["cancelled", "canceled", "rejected"].includes(
      normalize(value)
    )
  );
}

function isReviewable(value?: string | null) {
  return (
    !normalize(value) ||
    [
      "under review",
      "under_review",
      "pending",
      "submitted",
      "new",
      "awaiting review",
    ].includes(normalize(value))
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "Time unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: string | null) {
  if (!value) return "Date not set";

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return value;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null) {
  const match =
    value && /^(\d{1,2}):(\d{2})/.exec(value);

  if (!match) {
    return value || "Time not set";
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    return value || "Time not set";
  }

  return `${hour % 12 || 12}:${String(
    minute
  ).padStart(2, "0")} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

// ==========================================
// NORMALIZE STORAGE PATH
// ==========================================

function normalizeWasteImagePath(
  input: string | null
) {
  if (!input?.trim()) return null;

  let path = input.trim();

  if (/^https?:\/\//i.test(path)) {
    try {
      const match = new URL(path).pathname.match(
        /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i
      );

      if (
        !match ||
        decodeURIComponent(match[1]) !==
          "waste-images"
      ) {
        return null;
      }

      path = decodeURIComponent(match[2]);
    } catch {
      return null;
    }
  }

  path = path.replace(/^\/+/, "").split("?")[0];

  while (
    path.toLowerCase().startsWith("waste-images/")
  ) {
    path = path.slice("waste-images/".length);
  }

  return path && !path.endsWith("/")
    ? path
    : null;
}

// ==========================================
// SHOW ACTUAL SUPABASE ERROR
// ==========================================

function describeSupabaseError(
  failure: unknown
): string {
  console.error(
    "[WasteTrack] Reject and notify failed:",
    failure
  );

  if (typeof failure === "string") {
    return failure;
  }

  if (
    failure &&
    typeof failure === "object"
  ) {
    const error = failure as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    return [
      error.message || "Failed to reject report.",
      error.details,
      error.hint,
      error.code
        ? `Code: ${error.code}`
        : null,
    ]
      .filter(Boolean)
      .join(" — ");
  }

  return (
    "Failed to reject report. " +
    "Please check the browser console."
  );
}

// ==========================================
// MAIN ADMIN ALERTS COMPONENT
// ==========================================

export default function Alerts() {
  // ========================================
  // ADMIN ALERT STATES
  // ========================================

  const [adminId, setAdminId] =
    useState("");

  const [alerts, setAlerts] =
    useState<AlertItem[]>([]);

  const [readIds, setReadIds] =
    useState<string[]>([]);

  const [filter, setFilter] =
    useState<AlertFilter>("all");

  // ========================================
  // REPORT REVIEW STATES
  // ========================================

  const [reviewOptions, setReviewOptions] =
    useState<ReviewOption[]>([]);

  const [selectedReport, setSelectedReport] =
    useState("");

  const [rejectionReason, setRejectionReason] =
    useState<RejectionReason | "">("");

  const [evidenceDetails, setEvidenceDetails] =
    useState("");

  const [evidenceConfirmed, setEvidenceConfirmed] =
    useState(false);

  const [reportImage, setReportImage] =
    useState<string | null>(null);

  const [imageLoading, setImageLoading] =
    useState(false);

  // ========================================
  // SUBMISSION STATES
  // ========================================

  const [sending, setSending] =
    useState(false);

  const [sent, setSent] =
    useState(false);

  const [sendError, setSendError] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  // ========================================
  // LOAD SUPABASE DATA
  // ========================================

  useEffect(() => {
    let active = true;
    let requestId = 0;

    async function loadAlerts() {
      const request = ++requestId;

      setLoading(true);
      setError("");

      try {
        // ==================================
        // VERIFY ADMIN ACCOUNT
        // ==================================

        const {
          data: auth,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!auth.user) {
          throw new Error(
            "Please sign in as an administrator."
          );
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("users")
          .select("role,is_active")
          .eq("user_id", auth.user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (
          profile?.role !== "admin" ||
          profile.is_active !== true
        ) {
          throw new Error(
            "Only active administrators can view alerts."
          );
        }

        // ==================================
        // FETCH DATABASE TABLES
        // ==================================

        const [
          reportsResult,
          schedulesResult,
          statusesResult,
          collectionsResult,
          sitesResult,
          collectorsResult,
        ] = await Promise.all([
          supabase
            .from("waste_reports")
            .select(
              "report_id,user_id,site_id,address,cnn_detection_level,analyzed_at,date_uploaded"
            )
            .order("date_uploaded", {
              ascending: false,
            })
            .limit(1000),

          supabase
            .from("schedules")
            .select(
              "schedule_id,site_id,source_report_id,assigned_collector_id,date,collection_time,status,created_at"
            )
            .order("created_at", {
              ascending: false,
            })
            .limit(1000),

          supabase
            .from("status")
            .select(
              "report_id,status,created_at"
            )
            .order("created_at", {
              ascending: false,
            })
            .limit(3000),

          supabase
            .from("collections")
            .select(
              "schedule_id,collection_status,completed_at"
            )
            .limit(1000),

          supabase
            .from("disposal_sites")
            .select("site_id,site_name"),

          supabase
            .from("users")
            .select("user_id,full_name")
            .eq("role", "collector"),
        ]);

        const fetchError = [
          reportsResult.error,
          schedulesResult.error,
          statusesResult.error,
          collectionsResult.error,
          sitesResult.error,
          collectorsResult.error,
        ].find(Boolean);

        if (fetchError) {
          throw fetchError;
        }

        if (
          !active ||
          request !== requestId
        ) {
          return;
        }

        // ==================================
        // FORMAT RESULTS
        // ==================================

        const reports =
          (reportsResult.data ?? []) as ReportRow[];

        const schedules =
          (schedulesResult.data ?? []) as ScheduleRow[];

        const statuses =
          (statusesResult.data ?? []) as StatusRow[];

        const collections =
          (collectionsResult.data ?? []) as CollectionRow[];

        const sites =
          (sitesResult.data ?? []) as SiteRow[];

        const collectors =
          (collectorsResult.data ?? []) as CollectorRow[];

        // ==================================
        // LOOKUP MAPS
        // ==================================

        const reportMap = new Map(
          reports.map((row) => [
            row.report_id,
            row,
          ])
        );

        const siteMap = new Map(
          sites.map((row) => [
            row.site_id,
            row.site_name,
          ])
        );

        const collectorMap = new Map(
          collectors.map((row) => [
            row.user_id,
            row.full_name,
          ])
        );

        // ==================================
        // GET LATEST REPORT STATUS
        // ==================================

        const latestStatus =
          new Map<string, string>();

        for (const row of statuses) {
          if (!latestStatus.has(row.report_id)) {
            latestStatus.set(
              row.report_id,
              row.status
            );
          }
        }

        // ==================================
        // FIND REPORTS AWAITING REVIEW
        // ==================================

        const reviewable = reports
          .filter(
            (row) =>
              !!row.user_id &&
              isReviewable(
                latestStatus.get(row.report_id)
              )
          )
          .map(
            (row): ReviewOption => ({
              reportId: row.report_id,

              siteName:
                (row.site_id &&
                  siteMap.get(row.site_id)) ||
                row.address ||
                "Unregistered disposal location",

              reportDate: formatTimestamp(
                row.date_uploaded
              ),

              level: row.cnn_detection_level,

              hasLinkedSite:
                !!row.site_id &&
                siteMap.has(row.site_id),
            })
          );

        // ==================================
        // COMPLETED COLLECTIONS
        // ==================================

        const completedSchedules = new Set(
          collections
            .filter(
              (row) =>
                isCompleted(
                  row.collection_status
                ) ||
                row.completed_at !== null
            )
            .map((row) => row.schedule_id)
        );

        const completedReports =
          new Set<string>();

        for (const row of schedules) {
          if (
            row.source_report_id &&
            (
              isCompleted(row.status) ||
              completedSchedules.has(
                row.schedule_id
              )
            )
          ) {
            completedReports.add(
              row.source_report_id
            );
          }
        }

        // ==================================
        // GET LATEST REPORT PER SITE
        // ==================================

        const latestSiteReports =
          new Map<string, ReportRow>();

        for (const row of reports) {
          const key =
            row.site_id ||
            `report:${row.report_id}`;

          if (!latestSiteReports.has(key)) {
            latestSiteReports.set(key, row);
          }
        }

        const nextAlerts: AlertItem[] = [];

        // ==================================
        // FULL AND OVERFLOWING BIN ALERTS
        // ==================================

        for (
          const row of latestSiteReports.values()
        ) {
          const level = normalize(
            row.cnn_detection_level
          );

          if (
            ![
              "full",
              "high",
              "overflowing",
            ].includes(level)
          ) {
            continue;
          }

          if (
            isClosed(
              latestStatus.get(row.report_id)
            ) ||
            completedReports.has(row.report_id)
          ) {
            continue;
          }

          const overflowing =
            level === "overflowing";

          nextAlerts.push({
            id: `bin:${row.report_id}`,

            title: overflowing
              ? "Overflowing waste bin"
              : "Full waste bin",

            description: overflowing
              ? "This disposal site has an overflowing waste report that requires attention."
              : "This disposal site has a full-bin report that has not yet been resolved.",

            severity: "critical",

            siteName:
              (row.site_id &&
                siteMap.get(row.site_id)) ||
              row.address ||
              "Unknown disposal site",

            createdAt:
              row.analyzed_at ||
              row.date_uploaded,
          });
        }

        // ==================================
        // DELAYED COLLECTION ALERTS
        // ADMIN ONLY
        // ==================================

        for (const row of schedules) {
          const relatedStatus =
            row.source_report_id
              ? latestStatus.get(
                  row.source_report_id
                )
              : null;

          if (
            isClosed(row.status) ||
            isClosed(relatedStatus) ||
            completedSchedules.has(
              row.schedule_id
            )
          ) {
            continue;
          }

          if (
            normalize(row.status) !== "delayed" &&
            normalize(relatedStatus) !== "delayed"
          ) {
            continue;
          }

          const report = row.source_report_id
            ? reportMap.get(row.source_report_id)
            : undefined;

          const collector =
            (
              row.assigned_collector_id &&
              collectorMap.get(
                row.assigned_collector_id
              )
            ) ||
            "Not assigned";

          nextAlerts.push({
            id: `delay:${row.schedule_id}`,

            title: "Collection delayed",

            description:
              `Collector: ${collector} · ` +
              `${formatDate(row.date)} · ` +
              formatTime(row.collection_time),

            severity: "warning",

            siteName:
              (row.site_id &&
                siteMap.get(row.site_id)) ||
              report?.address ||
              "Unknown disposal site",

            createdAt:
              row.created_at || "",
          });
        }

        // ==================================
        // SORT ALERTS
        // ==================================

        nextAlerts.sort((a, b) =>
          a.severity !== b.severity
            ? a.severity === "critical"
              ? -1
              : 1
            : (Date.parse(b.createdAt) || 0) -
              (Date.parse(a.createdAt) || 0)
        );

        // ==================================
        // UPDATE STATES
        // ==================================

        setAdminId(auth.user.id);
        setAlerts(nextAlerts);
        setReviewOptions(reviewable);

        setSelectedReport((old) =>
          reviewable.some(
            (row) => row.reportId === old
          )
            ? old
            : reviewable[0]?.reportId || ""
        );

        // ==================================
        // READ ALERTS
        // ==================================

        try {
          const saved = JSON.parse(
            localStorage.getItem(
              `wastetrack-alert-read:${auth.user.id}`
            ) || "[]"
          );

          setReadIds(
            Array.isArray(saved)
              ? saved.filter(
                  (id): id is string =>
                    typeof id === "string"
                )
              : []
          );
        } catch {
          setReadIds([]);
        }
      } catch (failure) {
        console.error(
          "[WasteTrack] Load admin alerts:",
          failure
        );

        if (
          active &&
          request === requestId
        ) {
          setError(
            describeSupabaseError(failure)
          );
        }
      } finally {
        if (
          active &&
          request === requestId
        ) {
          setLoading(false);
        }
      }
    }

    void loadAlerts();

    const onFocus = () => {
      if (active) {
        void loadAlerts();
      }
    };

    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      requestId++;

      window.removeEventListener(
        "focus",
        onFocus
      );
    };
  }, [refreshKey]);

  // ========================================
  // RESET FORM WHEN REPORT CHANGES
  // ========================================

  useEffect(() => {
    setRejectionReason("");
    setEvidenceDetails("");
    setEvidenceConfirmed(false);
    setSendError("");
  }, [selectedReport]);

  // ========================================
  // LOAD REPORT PHOTO
  // ========================================

  useEffect(() => {
    let active = true;

    setReportImage(null);
    setImageLoading(false);

    if (!selectedReport) return;

    setImageLoading(true);

    async function loadPhoto() {
      try {
        const {
          data,
          error: photoError,
        } = await supabase
          .from("waste_images")
          .select(
            "storage_bucket,storage_path"
          )
          .eq("report_id", selectedReport)
          .order("created_at", {
            ascending: false,
          })
          .limit(1);

        if (photoError) {
          throw photoError;
        }

        const image =
          (data?.[0] || null) as WasteImageRow | null;

        if (
          !image?.storage_path ||
          (
            image.storage_bucket &&
            image.storage_bucket !==
              "waste-images"
          )
        ) {
          return;
        }

        const path = normalizeWasteImagePath(
          image.storage_path
        );

        if (!path) return;

        const {
          data: signed,
          error: storageError,
        } = await supabase.storage
          .from("waste-images")
          .createSignedUrl(path, 3600);

        if (storageError) {
          throw storageError;
        }

        if (active) {
          setReportImage(signed.signedUrl);
        }
      } catch (failure) {
        console.warn(
          "[WasteTrack] Unable to load report photo:",
          failure
        );
      } finally {
        if (active) {
          setImageLoading(false);
        }
      }
    }

    void loadPhoto();

    return () => {
      active = false;
    };
  }, [selectedReport]);

  // ========================================
  // ALERT COUNTS
  // ========================================

  const criticalCount = alerts.filter(
    (row) => row.severity === "critical"
  ).length;

  const warningCount = alerts.filter(
    (row) => row.severity === "warning"
  ).length;

  const unreadCount = alerts.filter(
    (row) => !readIds.includes(row.id)
  ).length;

  const filteredAlerts = useMemo(
    () =>
      filter === "all"
        ? alerts
        : alerts.filter(
            (row) => row.severity === filter
          ),
    [alerts, filter]
  );

  const selectedOption = reviewOptions.find(
    (row) => row.reportId === selectedReport
  );

  // ========================================
  // ADMIN READ STATUS
  // ========================================

  function saveReadIds(ids: string[]) {
    setReadIds(ids);

    if (!adminId) return;

    try {
      localStorage.setItem(
        `wastetrack-alert-read:${adminId}`,
        JSON.stringify(ids)
      );
    } catch {
      // Local storage might be unavailable.
    }
  }

  function markAllRead() {
    saveReadIds(
      Array.from(
        new Set([
          ...readIds,
          ...alerts.map((row) => row.id),
        ])
      )
    );
  }

  function markRead(id: string) {
    if (!readIds.includes(id)) {
      saveReadIds([...readIds, id]);
    }
  }

  // ========================================
  // SELECT REPORT
  // ========================================

  function selectReport(id: string) {
    setSelectedReport(id);
    setRejectionReason("");
    setEvidenceDetails("");
    setEvidenceConfirmed(false);
    setSent(false);
    setSendError("");
  }

  // ========================================
  // REJECT REPORT AND NOTIFY RESIDENT
  // ========================================

  async function rejectAndNotify() {
    if (
      !selectedOption ||
      sending ||
      sent
    ) {
      return;
    }

    // Rejection reason is required.
    if (
      !rejectionReason ||
      !REJECTION_REASONS.some(
        (row) =>
          row.value === rejectionReason
      )
    ) {
      setSendError(
        "Choose one of the three permitted rejection reasons."
      );
      return;
    }

    // Explanation is optional.
    const details = evidenceDetails.trim();

    if (details.length > 1000) {
      setSendError(
        "Optional explanation must be 1000 characters or fewer."
      );
      return;
    }

    // Admin confirmation is required.
    if (!evidenceConfirmed) {
      setSendError(
        "Confirm you reviewed the submission and selected the correct rejection reason."
      );
      return;
    }

    setSending(true);
    setSent(false);
    setSendError("");

    try {
      // ==================================
      // SUPABASE RPC
      // ==================================

      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        "wt_admin_reject_invalid_report",
        {
          p_report_id:
            selectedOption.reportId,

          p_reason:
            rejectionReason,

          p_details:
            details,

          p_confirmed:
            true,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      if (!data) {
        throw new Error(
          "Supabase returned no notification ID after rejection."
        );
      }

      // ==================================
      // SUCCESS
      // ==================================

      setSent(true);

      const rejectedId =
        selectedOption.reportId;

      const remaining =
        reviewOptions.filter(
          (row) =>
            row.reportId !== rejectedId
        );

      setReviewOptions(remaining);

      setSelectedReport(
        remaining[0]?.reportId || ""
      );

      setRejectionReason("");
      setEvidenceDetails("");
      setEvidenceConfirmed(false);
    } catch (failure: unknown) {
      // Displays message, details, hint, and code.
      setSendError(
        describeSupabaseError(failure)
      );
    } finally {
      setSending(false);
    }
  }

  // ========================================
  // USER INTERFACE
  // ========================================

  return (
    <main className="min-h-[100dvh] w-full bg-[#FFFCF8] font-['Fira_Sans',Arial,sans-serif] text-[#242424]">

      {/* HEADER */}

      <header className="border-b-[5px] border-[#A5B26B] bg-white">
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">

          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FCE8E8] text-[#B5202A] sm:h-12 sm:w-12">
              <Bell size={23} />
            </div>

            <div>
              <h1 className="text-[23px] font-extrabold tracking-tight sm:text-[28px]">
                Alerts
              </h1>

              <p className="mt-0.5 text-xs text-[#777]">
                Waste monitoring and collection notices
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={markAllRead}
            disabled={loading || unreadCount === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E7DDD0] bg-white px-3 py-2.5 text-xs font-bold text-[#A81B1E] hover:bg-[#FFF0EC] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}

      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* LOADING */}

        {loading && (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl bg-white">
            <LoaderCircle
              size={36}
              className="animate-spin text-[#A5B26B]"
            />

            <p className="text-sm text-[#777]">
              Loading alerts...
            </p>
          </div>
        )}

        {/* LOAD ERROR */}

        {!loading && error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5"
          >
            <p className="text-sm font-bold text-red-700">
              Unable to load alerts
            </p>

            <p className="mt-2 break-words text-xs text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                setRefreshKey(
                  (key) => key + 1
                )
              }
              className="mt-3 text-xs font-bold text-red-700"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* SUMMARY CARDS */}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">

              {/* CRITICAL ALERTS */}

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#F3D8D8] bg-white p-4 shadow-sm sm:p-5">
                <div>
                  <p className="text-xs font-semibold text-[#777]">
                    Critical alerts
                  </p>

                  <p className="mt-2 text-[30px] font-extrabold leading-none text-[#A81B1E]">
                    {criticalCount}
                  </p>

                  <p className="mt-2 text-[11px] text-[#999]">
                    Full or overflowing bins
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FCE8E8] text-[#B5202A]">
                  <ShieldAlert size={24} />
                </div>
              </div>

              {/* COLLECTION DELAYS */}

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#F0E1BE] bg-white p-4 shadow-sm sm:p-5">
                <div>
                  <p className="text-xs font-semibold text-[#777]">
                    Collection delays
                  </p>

                  <p className="mt-2 text-[30px] font-extrabold leading-none text-[#AF7B16]">
                    {warningCount}
                  </p>

                  <p className="mt-2 text-[11px] text-[#999]">
                    Recorded delayed collections
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF1D2] text-[#B8860B]">
                  <Clock3 size={24} />
                </div>
              </div>

              {/* UNREAD ALERTS */}

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E1E8D2] bg-white p-4 shadow-sm sm:p-5">
                <div>
                  <p className="text-xs font-semibold text-[#777]">
                    Unread alerts
                  </p>

                  <p className="mt-2 text-[30px] font-extrabold leading-none text-[#657D37]">
                    {unreadCount}
                  </p>

                  <p className="mt-2 text-[11px] text-[#999]">
                    Needs your review
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF3E2] text-[#718B42]">
                  <Bell size={24} />
                </div>
              </div>
            </div>

            {/* TWO-COLUMN LAYOUT */}

            <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">

              {/* LEFT: ACTIVE ALERTS */}

              <section className="min-w-0">
                <div className="mb-4">
                  <h2 className="text-[17px] font-extrabold text-[#282828]">
                    Active alerts
                  </h2>

                  <p className="mt-1 text-[11px] text-[#888]">
                    {alerts.length} alerts found
                  </p>
                </div>

                {/* ALERT FILTER BUTTONS */}

                <div className="mb-4 flex flex-wrap gap-2">
                  {(
                    [
                      {
                        value: "all",
                        label: "All alerts",
                        count: alerts.length,
                      },
                      {
                        value: "critical",
                        label: "Critical",
                        count: criticalCount,
                      },
                      {
                        value: "warning",
                        label: "Delays",
                        count: warningCount,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() =>
                        setFilter(tab.value)
                      }
                      aria-pressed={
                        filter === tab.value
                      }
                      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                        filter === tab.value
                          ? "bg-[#A81B1E] text-white"
                          : "border border-[#E7DDD0] bg-white text-[#666] hover:bg-[#F7F0E4]"
                      }`}
                    >
                      {tab.label}

                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                          filter === tab.value
                            ? "bg-white/20 text-white"
                            : "bg-[#F2EDE5] text-[#777]"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* ALERT LIST */}

                <div className="space-y-3">

                  {filteredAlerts.length === 0 && (
                    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-[#EAE2D7] bg-white p-6 text-center">
                      <Inbox
                        size={26}
                        className="text-[#788E51]"
                      />

                      <p className="mt-4 text-sm font-bold">
                        No alerts to display
                      </p>

                      <p className="mt-1 text-xs text-[#888]">
                        No matching active alerts were found.
                      </p>
                    </div>
                  )}

                  {filteredAlerts.map((alert) => {
                    const critical =
                      alert.severity === "critical";

                    const read =
                      readIds.includes(alert.id);

                    return (
                      <article
                        key={alert.id}
                        className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                          critical
                            ? "border-[#F1D8D8]"
                            : "border-[#F0E4C9]"
                        } ${
                          read ? "opacity-70" : ""
                        }`}
                      >
                        {/* ALERT COLOR STRIPE */}

                        <div
                          className={`h-1.5 ${
                            critical
                              ? "bg-[#C42A34]"
                              : "bg-[#E6AE36]"
                          }`}
                        />

                        <div className="p-4 sm:p-5">

                          {/* ALERT ICON AND TITLE */}

                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                                critical
                                  ? "bg-[#FCE9E9] text-[#C42A34]"
                                  : "bg-[#FFF1D3] text-[#B8860B]"
                              }`}
                            >
                              <AlertTriangle size={22} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <span
                                className={`rounded-md px-2.5 py-1 text-[10px] font-extrabold uppercase ${
                                  critical
                                    ? "bg-[#FCE9E9] text-[#B5202A]"
                                    : "bg-[#FFF1D3] text-[#946A0C]"
                                }`}
                              >
                                {critical
                                  ? "Critical"
                                  : "Warning"}
                              </span>

                              {!read && (
                                <span className="ml-2 text-[10px] font-bold text-[#A81B1E]">
                                  New
                                </span>
                              )}

                              <h3 className="mt-2 break-words text-[15px] font-extrabold">
                                {alert.title}
                              </h3>
                            </div>
                          </div>

                          {/* LOCATION */}

                          <p className="mt-4 flex items-start gap-2 text-xs font-semibold text-[#555]">
                            <MapPin
                              size={15}
                              className="mt-0.5 shrink-0 text-[#A81B1E]"
                            />

                            <span className="break-words">
                              {alert.siteName}
                            </span>
                          </p>

                          {/* ALERT DESCRIPTION */}

                          <p className="mt-3 text-xs leading-relaxed text-[#777]">
                            {alert.description}
                          </p>

                          {/* ALERT TIME */}

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EAE2] pt-3">
                            <span className="flex items-center gap-1 text-[11px] text-[#999]">
                              <CalendarClock size={14} />
                              {formatTimestamp(
                                alert.createdAt
                              )}
                            </span>

                            {read ? (
                              <span className="flex items-center gap-1 text-[11px] text-[#8A9A72]">
                                <Check size={14} />
                                Read
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  markRead(alert.id)
                                }
                                className="flex items-center gap-1 text-[11px] font-bold text-[#A81B1E] hover:underline"
                              >
                                <Check size={14} />
                                Mark as read
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              {/* RIGHT: REJECTION FORM */}

              <aside className="min-w-0 lg:sticky lg:top-5">
                <div className="overflow-hidden rounded-2xl border border-[#E9DECD] bg-white shadow-sm">

                  {/* PANEL HEADER */}

                  <div className="bg-[#F7F0E4] px-5 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#A81B1E] text-white">
                        <MessageSquareText size={21} />
                      </div>

                      <div>
                        <h2 className="text-[15px] font-extrabold">
                          Review invalid submissions
                        </h2>

                        <p className="mt-0.5 text-[11px] text-[#777]">
                          Reject invalid reports and notify their residents
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* FORM BODY */}

                  <div className="space-y-5 p-5">

                    {/* REVIEW POLICY */}

                    <div className="flex items-start gap-2 rounded-xl border border-[#F1E2C0] bg-[#FFF8E9] p-3">
                      <AlertCircle
                        size={17}
                        className="mt-0.5 shrink-0 text-[#B8860B]"
                      />

                      <p className="text-[11px] leading-relaxed text-[#8A681E]">
                        Reject only confirmed invalid submissions:
                        unrelated images, duplicate or spam reports,
                        or unverifiable locations. A CNN prediction
                        alone is not proof of invalidity.
                      </p>
                    </div>

                    {/* SELECT REPORT */}

                    <div>
                      <label
                        htmlFor="al-report"
                        className="mb-2 block text-xs font-bold text-[#555]"
                      >
                        Report awaiting review
                      </label>

                      <select
                        id="al-report"
                        value={selectedReport}
                        onChange={(e) =>
                          selectReport(e.target.value)
                        }
                        disabled={
                          sending ||
                          reviewOptions.length === 0
                        }
                        className="w-full rounded-xl border border-[#DFD6C9] bg-[#FFFCF8] px-3 py-3 text-xs outline-none focus:border-[#A5B26B] disabled:opacity-60"
                      >
                        {reviewOptions.length === 0 ? (
                          <option value="">
                            No reports awaiting review
                          </option>
                        ) : (
                          reviewOptions.map((row) => (
                            <option
                              key={row.reportId}
                              value={row.reportId}
                            >
                              {row.siteName} —{" "}
                              {row.reportId.slice(0, 8)}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    {/* SELECTED REPORT DETAILS */}

                    {selectedOption && (
                      <div className="space-y-3 rounded-xl border border-[#E7EEDB] bg-[#F7FAF1] p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#728653]">
                          Submission to review
                        </p>

                        <p className="break-words text-xs font-bold text-[#354527]">
                          {selectedOption.siteName}
                        </p>

                        <p className="break-all text-[11px] text-[#65745B]">
                          Report ID:{" "}
                          {selectedOption.reportId}
                        </p>

                        <p className="text-[11px] text-[#65745B]">
                          {selectedOption.reportDate}
                        </p>

                        <p className="text-[11px] text-[#65745B]">
                          CNN:{" "}
                          {selectedOption.level ||
                            "Not available"}
                          {" · "}
                          Site record:{" "}
                          {selectedOption.hasLinkedSite
                            ? "Linked"
                            : "Not linked"}
                        </p>

                        {/* REPORT PHOTO */}

                        {imageLoading ? (
                          <p className="text-xs text-[#777]">
                            Loading submitted photo...
                          </p>
                        ) : reportImage ? (
                          <img
                            src={reportImage}
                            alt="Resident-submitted waste report"
                            className="max-h-[300px] w-full rounded-xl bg-white object-contain"
                          />
                        ) : (
                          <p className="text-xs text-[#777]">
                            Photo unavailable here.
                            Inspect the original report
                            before rejecting.
                          </p>
                        )}
                      </div>
                    )}

                    {/* REJECTION REASON */}

                    <div>
                      <label
                        htmlFor="al-reason"
                        className="mb-2 block text-xs font-bold text-[#555]"
                      >
                        Invalid submission reason
                      </label>

                      <select
                        id="al-reason"
                        value={rejectionReason}
                        onChange={(e) => {
                          setRejectionReason(
                            e.target.value as
                              RejectionReason | ""
                          );

                          setSent(false);
                          setSendError("");
                        }}
                        disabled={
                          sending ||
                          !selectedOption
                        }
                        className="w-full rounded-xl border border-[#DFD6C9] bg-[#FFFCF8] px-3 py-3 text-xs outline-none focus:border-[#A5B26B] disabled:opacity-60"
                      >
                        <option value="">
                          Choose a reason
                        </option>

                        {REJECTION_REASONS.map((row) => (
                          <option
                            key={row.value}
                            value={row.value}
                          >
                            {row.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* OPTIONAL EXPLANATION */}

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label
                          htmlFor="al-evidence"
                          className="text-xs font-bold text-[#555]"
                        >
                          Evidence / explanation (optional)
                        </label>

                        <span className="text-[10px] text-[#999]">
                          {evidenceDetails.length}/1000
                        </span>
                      </div>

                      <textarea
                        id="al-evidence"
                        rows={5}
                        maxLength={1000}
                        value={evidenceDetails}
                        onChange={(e) => {
                          setEvidenceDetails(e.target.value);
                          setSendError("");
                        }}
                        disabled={
                          sending ||
                          !selectedOption
                        }
                        placeholder="Optional: provide additional explanation if needed."
                        className="w-full resize-y rounded-xl border border-[#DFD6C9] bg-[#FFFCF8] px-3 py-3 text-xs leading-relaxed outline-none focus:border-[#A5B26B] disabled:opacity-60"
                      />
                    </div>

                    {/* CONFIRMATION */}

                    <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-[#555]">
                      <input
                        type="checkbox"
                        checked={evidenceConfirmed}
                        onChange={(e) =>
                          setEvidenceConfirmed(
                            e.target.checked
                          )
                        }
                        disabled={
                          sending ||
                          !selectedOption
                        }
                        className="mt-0.5 h-4 w-4 accent-[#A81B1E]"
                      />

                      <span>
                        I reviewed the submission and confirm
                        the selected rejection reason is accurate.
                        The resident will receive that reason.
                      </span>
                    </label>

                    {/* SUBMIT BUTTON */}

                    <button
                      type="button"
                      onClick={() =>
                        void rejectAndNotify()
                      }
                      disabled={
                        sending ||
                        sent ||
                        !selectedOption ||
                        !rejectionReason ||
                        !evidenceConfirmed
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#A81B1E] px-4 py-3.5 text-[13px] font-bold text-white hover:bg-[#8F1619] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? (
                        <LoaderCircle
                          size={17}
                          className="animate-spin"
                        />
                      ) : sent ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        <Send size={17} />
                      )}

                      {sending
                        ? "Rejecting and notifying..."
                        : sent
                          ? "Rejection recorded"
                          : "Reject report & notify resident"}
                    </button>

                    {/* SUCCESS */}

                    {sent && (
                      <p
                        role="status"
                        className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-semibold text-green-800"
                      >
                        Report rejected and the resident's
                        in-app notification saved.
                      </p>
                    )}

                    {/* ACTUAL SUPABASE ERROR */}

                    {sendError && (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 p-3"
                      >
                        <p className="flex items-center gap-2 text-xs font-semibold text-red-700">
                          <AlertCircle size={16} />
                          Rejection could not be completed
                        </p>

                        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-red-700">
                          {sendError}
                        </p>
                      </div>
                    )}

                    {/* NO REPORTS */}

                    {reviewOptions.length === 0 &&
                      !sent && (
                        <p className="text-center text-[11px] text-[#999]">
                          No reports are currently awaiting
                          invalid-submission review.
                        </p>
                      )}
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}