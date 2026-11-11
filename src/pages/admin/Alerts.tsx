
import {
  useEffect,
  useMemo,
  useState,
} from "react";

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

// ========================================
// TYPES
// ========================================

type Severity = "critical" | "warning";
type AlertFilter = "all" | "critical" | "warning";

interface AlertItem {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  source: "bin" | "delay";
  siteName: string;
  createdAt: string;
}

interface ReportRow {
  report_id: string;
  user_id: string;
  site_id: string | null;
  address: string | null;
  cnn_detection_level: string | null;
  analyzed_at: string | null;
}

interface ScheduleRow {
  schedule_id: string;
  site_id: string | null;
  source_report_id: string | null;
  assigned_collector_id: string | null;
  date: string | null;
  collection_time: string | null;
  status: string | null;
  created_at: string | null;
}

interface StatusRow {
  report_id: string;
  status: string;
  created_at: string;
}

interface CollectionRow {
  schedule_id: string;
  collection_status: string | null;
  completed_at: string | null;
}

interface SiteRow {
  site_id: string;
  site_name: string;
}

interface CollectorRow {
  user_id: string;
  full_name: string;
}

interface DelayedOption {
  scheduleId: string;
  siteName: string;
  collectorName: string;
  dayTime: string;
}

// ========================================
// HELPERS
// ========================================

function normalize(
  value: string | null | undefined
): string {
  return (value ?? "").trim().toLowerCase();
}

function isCompleted(
  value: string | null | undefined
): boolean {
  return [
    "completed",
    "collected",
    "done",
  ].includes(normalize(value));
}

function isClosed(
  value: string | null | undefined
): boolean {
  return (
    isCompleted(value) ||
    ["cancelled", "canceled"].includes(
      normalize(value)
    )
  );
}

function formatDate(
  dateValue: string | null
): string {
  if (!dateValue) return "Date not set";

  const match = dateValue.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) return dateValue;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(
  timeValue: string | null
): string {
  if (!timeValue) return "Time not set";

  const match = timeValue.match(
    /^(\d{1,2}):(\d{2})/
  );

  if (!match) return timeValue;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return timeValue;
  }

  return `${hour % 12 || 12}:${String(
    minute
  ).padStart(2, "0")} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

function formatTimestamp(
  value: string
): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
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

function createDelayedMessage(
  siteName: string
): string {
  return (
    `Collection at ${siteName} has been delayed. ` +
    "Please wait for an updated collection schedule. " +
    "Thank you for your understanding."
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function Alerts() {
  // ========================================
  // USER / ALERT STATES
  // ========================================

  const [adminId, setAdminId] = useState("");

  const [alerts, setAlerts] =
    useState<AlertItem[]>([]);

  const [readIds, setReadIds] =
    useState<string[]>([]);

  const [filter, setFilter] =
    useState<AlertFilter>("all");

  // ========================================
  // NOTIFICATION STATES
  // ========================================

  const [
    delayedOptions,
    setDelayedOptions,
  ] = useState<DelayedOption[]>([]);

  const [
    selectedSchedule,
    setSelectedSchedule,
  ] = useState("");

  const [reason, setReason] = useState("");

  const [sending, setSending] =
    useState(false);

  const [sent, setSent] = useState(false);

  const [sendError, setSendError] =
    useState("");

  // ========================================
  // LOADING / ERROR
  // ========================================

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  // ========================================
  // FETCH ALERTS
  // ========================================

  useEffect(() => {
    let mounted = true;
    let requestNumber = 0;

    async function loadAlerts() {
      const request = ++requestNumber;

      try {
        setLoading(true);
        setError("");

        // ==================================
        // VERIFY ADMIN
        // ==================================

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        const user = authData.user;

        if (!user) {
          throw new Error(
            "Please sign in as an administrator."
          );
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("users")
          .select("role, is_active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (
          profile?.role !== "admin" ||
          profile?.is_active !== true
        ) {
          throw new Error(
            "Only active administrators can view alerts."
          );
        }

        // ==================================
        // LOAD SUPABASE TABLES
        // ==================================

        const [
          reportsResult,
          schedulesResult,
          statusesResult,
          collectionsResult,
          sitesResult,
          collectorsResult,
        ] = await Promise.all([
          // Uses analyzed_at, not created_at.
          supabase
            .from("waste_reports")
            .select(
              "report_id, user_id, site_id, address, cnn_detection_level, analyzed_at"
            )
            .order("analyzed_at", {
              ascending: false,
              nullsFirst: false,
            })
            .limit(1000),

          supabase
            .from("schedules")
            .select(
              "schedule_id, site_id, source_report_id, assigned_collector_id, date, collection_time, status, created_at"
            )
            .order("created_at", {
              ascending: false,
            })
            .limit(1000),

          supabase
            .from("status")
            .select(
              "report_id, status, created_at"
            )
            .order("created_at", {
              ascending: false,
            })
            .limit(3000),

          supabase
            .from("collections")
            .select(
              "schedule_id, collection_status, completed_at"
            )
            .limit(1000),

          supabase
            .from("disposal_sites")
            .select("site_id, site_name"),

          supabase
            .from("users")
            .select("user_id, full_name")
            .eq("role", "collector"),
        ]);

        const errors = [
          reportsResult.error,
          schedulesResult.error,
          statusesResult.error,
          collectionsResult.error,
          sitesResult.error,
          collectorsResult.error,
        ];

        const firstError = errors.find(
          (item) => item !== null
        );

        if (firstError) {
          throw new Error(firstError.message);
        }

        // ==================================
        // FORMAT DATABASE RESULTS
        // ==================================

        const reports =
          (reportsResult.data ?? []) as unknown as ReportRow[];

        const schedules =
          (schedulesResult.data ?? []) as unknown as ScheduleRow[];

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
          reports.map((item) => [
            item.report_id,
            item,
          ])
        );

        const siteMap = new Map(
          sites.map((item) => [
            item.site_id,
            item.site_name,
          ])
        );

        const collectorMap = new Map(
          collectors.map((item) => [
            item.user_id,
            item.full_name,
          ])
        );

        // ==================================
        // LATEST STATUS PER REPORT
        // ==================================

        const latestStatusMap = new Map<
          string,
          string
        >();

        for (const item of statuses) {
          if (
            !latestStatusMap.has(item.report_id)
          ) {
            latestStatusMap.set(
              item.report_id,
              item.status
            );
          }
        }

        // ==================================
        // COMPLETED COLLECTIONS
        // ==================================

        const completedScheduleIds = new Set(
          collections
            .filter(
              (item) =>
                isCompleted(
                  item.collection_status
                ) ||
                item.completed_at !== null
            )
            .map((item) => item.schedule_id)
        );

        const completedReportIds =
          new Set<string>();

        for (const schedule of schedules) {
          if (
            schedule.source_report_id &&
            (
              isCompleted(schedule.status) ||
              completedScheduleIds.has(
                schedule.schedule_id
              )
            )
          ) {
            completedReportIds.add(
              schedule.source_report_id
            );
          }
        }

        // ==================================
        // CREATE ADMIN ALERTS
        // ==================================

        const nextAlerts: AlertItem[] = [];

        // Get the latest report for every bin.
        const latestSiteReports = new Map<
          string,
          ReportRow
        >();

        for (const report of reports) {
          const key =
            report.site_id ||
            `report:${report.report_id}`;

          if (!latestSiteReports.has(key)) {
            latestSiteReports.set(
              key,
              report
            );
          }
        }

        // ==================================
        // FULL / OVERFLOWING BIN ALERTS
        // ==================================

        for (
          const report of latestSiteReports.values()
        ) {
          const level = normalize(
            report.cnn_detection_level
          );

          const isOverflowing =
            level === "overflowing";

          const isFull =
            level === "full" ||
            level === "high";

          if (!isFull && !isOverflowing) {
            continue;
          }

          const currentStatus =
            latestStatusMap.get(
              report.report_id
            );

          if (
            isCompleted(currentStatus) ||
            completedReportIds.has(
              report.report_id
            )
          ) {
            continue;
          }

          const siteName =
            (
              report.site_id
                ? siteMap.get(report.site_id)
                : null
            ) ||
            report.address ||
            "Unknown disposal site";

          nextAlerts.push({
            id: `bin:${report.report_id}`,
            title: isOverflowing
              ? "Overflowing waste bin"
              : "Full waste bin",
            description: isOverflowing
              ? "This disposal site has an overflowing waste report that requires attention."
              : "This disposal site has a full-bin report that has not yet been resolved.",
            severity: "critical",
            source: "bin",
            siteName,
            createdAt:
              report.analyzed_at ?? "",
          });
        }

        // ==================================
        // DELAYED COLLECTION ALERTS
        // ==================================

        const nextDelayedOptions:
          DelayedOption[] = [];

        for (const schedule of schedules) {
          const reportStatus =
            schedule.source_report_id
              ? latestStatusMap.get(
                  schedule.source_report_id
                )
              : undefined;

          const finished =
            isClosed(schedule.status) ||
            isClosed(reportStatus) ||
            completedScheduleIds.has(
              schedule.schedule_id
            );

          if (finished) continue;

          const delayed =
            normalize(schedule.status) ===
              "delayed" ||
            normalize(reportStatus) ===
              "delayed";

          if (!delayed) continue;

          const report =
            schedule.source_report_id
              ? reportMap.get(
                  schedule.source_report_id
                )
              : undefined;

          const siteName =
            (
              schedule.site_id
                ? siteMap.get(schedule.site_id)
                : null
            ) ||
            report?.address ||
            "Unknown disposal site";

          const collectorName =
            (
              schedule.assigned_collector_id
                ? collectorMap.get(
                    schedule.assigned_collector_id
                  )
                : null
            ) ||
            "Not assigned";

          const dayTime =
            `${formatDate(schedule.date)} · ` +
            formatTime(
              schedule.collection_time
            );

          nextAlerts.push({
            id: `delay:${schedule.schedule_id}`,
            title: "Collection delayed",
            description:
              `Collector: ${collectorName} · ` +
              dayTime,
            severity: "warning",
            source: "delay",
            siteName,
            createdAt:
              schedule.created_at ?? "",
          });

          // Only delayed schedules linked to
          // resident reports can be notified.
          if (
            report?.user_id &&
            schedule.source_report_id
          ) {
            nextDelayedOptions.push({
              scheduleId:
                schedule.schedule_id,
              siteName,
              collectorName,
              dayTime,
            });
          }
        }

        // ==================================
        // SORT ALERTS
        // ==================================

        nextAlerts.sort((a, b) => {
          if (
            a.severity !== b.severity
          ) {
            return a.severity === "critical"
              ? -1
              : 1;
          }

          const aTime =
            Date.parse(a.createdAt) || 0;

          const bTime =
            Date.parse(b.createdAt) || 0;

          return bTime - aTime;
        });

        if (
          !mounted ||
          request !== requestNumber
        ) {
          return;
        }

        // ==================================
        // UPDATE STATES
        // ==================================

        setAdminId(user.id);
        setAlerts(nextAlerts);
        setDelayedOptions(
          nextDelayedOptions
        );

        setSelectedSchedule((previous) => {
          const exists =
            nextDelayedOptions.some(
              (option) =>
                option.scheduleId === previous
            );

          return exists
            ? previous
            : nextDelayedOptions[0]
                ?.scheduleId || "";
        });

        setReason((previous) => {
          if (
            previous.trim() &&
            nextDelayedOptions.length > 0
          ) {
            return previous;
          }

          return nextDelayedOptions.length
            ? createDelayedMessage(
                nextDelayedOptions[0].siteName
              )
            : "";
        });

        // ==================================
        // LOAD READ STATUS
        // ==================================

        try {
          const saved = JSON.parse(
            localStorage.getItem(
              `wastetrack-alert-read:${user.id}`
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
      } catch (err) {
        console.error(
          "[WasteTrack] Alerts error:",
          err
        );

        if (
          mounted &&
          request === requestNumber
        ) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load alerts."
          );
        }
      } finally {
        if (
          mounted &&
          request === requestNumber
        ) {
          setLoading(false);
        }
      }
    }

    void loadAlerts();

    const handleFocus = () => {
      if (mounted) {
        void loadAlerts();
      }
    };

    window.addEventListener(
      "focus",
      handleFocus
    );

    return () => {
      mounted = false;
      requestNumber++;

      window.removeEventListener(
        "focus",
        handleFocus
      );
    };
  }, []);

  // ========================================
  // CALCULATED VALUES
  // ========================================

  const criticalCount = alerts.filter(
    (item) =>
      item.severity === "critical"
  ).length;

  const warningCount = alerts.filter(
    (item) =>
      item.severity === "warning"
  ).length;

  const unreadCount = alerts.filter(
    (item) =>
      !readIds.includes(item.id)
  ).length;

  const filteredAlerts = useMemo(() => {
    if (filter === "all") {
      return alerts;
    }

    return alerts.filter(
      (item) => item.severity === filter
    );
  }, [alerts, filter]);

  const selectedOption = delayedOptions.find(
    (item) =>
      item.scheduleId === selectedSchedule
  );

  // ========================================
  // READ ACTIONS
  // ========================================

  function saveReadIds(nextIds: string[]) {
    setReadIds(nextIds);

    if (!adminId) return;

    try {
      localStorage.setItem(
        `wastetrack-alert-read:${adminId}`,
        JSON.stringify(nextIds)
      );
    } catch {
      // Storage may be unavailable.
    }
  }

  function handleMarkAllRead() {
    const next = Array.from(
      new Set([
        ...readIds,
        ...alerts.map((item) => item.id),
      ])
    );

    saveReadIds(next);
  }

  function handleMarkRead(id: string) {
    if (readIds.includes(id)) return;

    saveReadIds([
      ...readIds,
      id,
    ]);
  }

  // ========================================
  // SELECT DELAYED COLLECTION
  // ========================================

  function handleSelectSchedule(
    scheduleId: string
  ) {
    setSelectedSchedule(scheduleId);
    setSent(false);
    setSendError("");

    const option = delayedOptions.find(
      (item) =>
        item.scheduleId === scheduleId
    );

    setReason(
      option
        ? createDelayedMessage(
            option.siteName
          )
        : ""
    );
  }

  // ========================================
  // SEND RESIDENT NOTIFICATION
  // ========================================

  async function handleSend() {
    if (
      !selectedSchedule ||
      !selectedOption ||
      sending ||
      sent
    ) {
      return;
    }

    const message = reason.trim();

    if (message.length < 10) {
      setSendError(
        "Please enter at least 10 characters."
      );
      return;
    }

    setSending(true);
    setSent(false);
    setSendError("");

    try {
      // Secure Supabase database function.
      // This independently checks the admin
      // and confirms the collection is delayed.

      const {
        data: recipientId,
        error: notificationError,
      } = await supabase.rpc(
        "wt_admin_send_delayed_notice",
        {
          p_schedule_id:
            selectedSchedule,
          p_message: message,
        }
      );

      if (notificationError) {
        throw new Error(
          notificationError.message
        );
      }

      if (!recipientId) {
        throw new Error(
          "The notification was not saved."
        );
      }

      setSent(true);
    } catch (err) {
      console.error(
        "[WasteTrack] Notification error:",
        err
      );

      setSendError(
        err instanceof Error
          ? err.message
          : "Failed to send notification."
      );
    } finally {
      setSending(false);
    }
  }

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <main className="min-h-[100dvh] w-full bg-[#FFFCF8] font-['Fira_Sans',Arial,sans-serif] text-[#242424]">

      {/* ====================================
          HEADER
      ==================================== */}

      <header className="border-b-[5px] border-[#A5B26B] bg-white">
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FCE8E8] text-[#B5202A] sm:h-12 sm:w-12">
              <Bell size={23} />
            </div>

            <div className="min-w-0">
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
            onClick={handleMarkAllRead}
            disabled={
              loading ||
              unreadCount === 0
            }
            className="inline-flex items-center gap-2 rounded-xl border border-[#E7DDD0] bg-white px-3 py-2.5 text-xs font-bold text-[#A81B1E] transition hover:bg-[#FFF0EC] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        </div>
      </header>

      {/* ====================================
          CONTENT
      ==================================== */}

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

        {/* ERROR */}
        {!loading && error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5"
          >
            <AlertCircle
              size={21}
              className="shrink-0 text-[#B5202A]"
            />

            <div>
              <p className="text-sm font-bold text-[#9F1C26]">
                Unable to load alerts
              </p>

              <p className="mt-1 break-words text-xs text-red-700">
                {error}
              </p>
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ====================================
                SUMMARY CARDS
            ==================================== */}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">

              {/* CRITICAL */}
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

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FCE8E8] text-[#B5202A]">
                  <ShieldAlert size={24} />
                </div>
              </div>

              {/* DELAYS */}
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

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF1D2] text-[#B8860B]">
                  <Clock3 size={24} />
                </div>
              </div>

              {/* UNREAD */}
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

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EEF3E2] text-[#718B42]">
                  <Bell size={24} />
                </div>
              </div>
            </div>

            {/* ====================================
                MAIN TWO-COLUMN LAYOUT
            ==================================== */}

            <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">

              {/* ==================================
                  LEFT: ACTIVE ALERTS
              ================================== */}

              <section className="min-w-0">

                {/* SECTION HEADER */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-extrabold text-[#282828]">
                      Active alerts
                    </h2>

                    <p className="mt-1 text-[11px] text-[#888]">
                      {alerts.length} alerts found
                    </p>
                  </div>
                </div>

                {/* FILTER TABS */}
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
                  ).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        setFilter(item.value)
                      }
                      aria-pressed={
                        filter === item.value
                      }
                      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] font-bold transition ${
                        filter === item.value
                          ? "bg-[#A81B1E] text-white shadow-sm"
                          : "border border-[#E7DDD0] bg-white text-[#666] hover:bg-[#F7F0E4]"
                      }`}
                    >
                      {item.label}

                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                          filter === item.value
                            ? "bg-white/20 text-white"
                            : "bg-[#F2EDE5] text-[#777]"
                        }`}
                      >
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* ==================================
                    ALERT LIST
                ================================== */}

                <div className="space-y-3">
                  {filteredAlerts.length === 0 && (
                    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-[#EAE2D7] bg-white p-6 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF3E6] text-[#788E51]">
                        <Inbox size={26} />
                      </div>

                      <p className="mt-4 text-sm font-bold text-[#333]">
                        No alerts to display
                      </p>

                      <p className="mt-1 text-xs text-[#888]">
                        No matching active alerts were found.
                      </p>
                    </div>
                  )}

                  {filteredAlerts.map((alert) => {
                    const isCritical =
                      alert.severity === "critical";

                    const isRead =
                      readIds.includes(alert.id);

                    return (
                      <article
                        key={alert.id}
                        className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
                          isCritical
                            ? "border-[#F1D8D8]"
                            : "border-[#F0E4C9]"
                        } ${
                          isRead
                            ? "opacity-70"
                            : ""
                        }`}
                      >
                        {/* COLORED TOP BAR */}
                        <div
                          className={`h-1.5 w-full ${
                            isCritical
                              ? "bg-[#C42A34]"
                              : "bg-[#E6AE36]"
                          }`}
                        />

                        <div className="p-4 sm:p-5">
                          {/* TOP ROW */}
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                                  isCritical
                                    ? "bg-[#FCE9E9] text-[#C42A34]"
                                    : "bg-[#FFF1D3] text-[#B8860B]"
                                }`}
                              >
                                <AlertTriangle size={22} />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                                      isCritical
                                        ? "bg-[#FCE9E9] text-[#B5202A]"
                                        : "bg-[#FFF1D3] text-[#946A0C]"
                                    }`}
                                  >
                                    {isCritical
                                      ? "Critical"
                                      : "Warning"}
                                  </span>

                                  {!isRead && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#A81B1E]">
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#D0102B]" />
                                      New
                                    </span>
                                  )}
                                </div>

                                <h3 className="mt-2 break-words text-[15px] font-extrabold leading-snug text-[#292929]">
                                  {alert.title}
                                </h3>
                              </div>
                            </div>
                          </div>

                          {/* SITE */}
                          <div className="mt-4 flex items-start gap-2 text-[12px] font-semibold text-[#555]">
                            <MapPin
                              size={15}
                              className="mt-0.5 shrink-0 text-[#A81B1E]"
                            />

                            <span className="break-words">
                              {alert.siteName}
                            </span>
                          </div>

                          {/* DESCRIPTION */}
                          <p className="mt-3 text-[12px] leading-[1.75] text-[#777]">
                            {alert.description}
                          </p>

                          {/* BOTTOM ROW */}
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EAE2] pt-3">
                            <div className="flex items-center gap-1.5 text-[11px] text-[#999]">
                              <CalendarClock size={14} />

                              {formatTimestamp(
                                alert.createdAt
                              ) || "Time unavailable"}
                            </div>

                            {isRead ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#8A9A72]">
                                <Check size={14} />
                                Read
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleMarkRead(
                                    alert.id
                                  )
                                }
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#A81B1E] hover:underline"
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

              {/* ==================================
                  RIGHT: RESIDENT NOTIFICATION
              ================================== */}

              <aside className="min-w-0 lg:sticky lg:top-5">
                <div className="overflow-hidden rounded-2xl border border-[#E9DECD] bg-white shadow-sm">

                  {/* PANEL HEADER */}
                  <div className="bg-[#F7F0E4] px-5 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#A81B1E] text-white">
                        <MessageSquareText size={21} />
                      </div>

                      <div>
                        <h2 className="text-[15px] font-extrabold">
                          Notify resident
                        </h2>

                        <p className="mt-0.5 text-[11px] text-[#777]">
                          Delayed collections only
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* PANEL BODY */}
                  <div className="space-y-5 p-5">

                    {/* INFO */}
                    <div className="flex items-start gap-2 rounded-xl border border-[#F1E2C0] bg-[#FFF8E9] p-3">
                      <AlertCircle
                        size={17}
                        className="mt-0.5 shrink-0 text-[#B8860B]"
                      />

                      <p className="text-[11px] leading-relaxed text-[#8A681E]">
                        Residents can only receive
                        notifications for collections
                        officially marked as delayed.
                      </p>
                    </div>

                    {/* SELECT COLLECTION */}
                    <div>
                      <label
                        htmlFor="al-schedule"
                        className="mb-2 block text-[12px] font-bold text-[#555]"
                      >
                        Delayed collection
                      </label>

                      <select
                        id="al-schedule"
                        value={selectedSchedule}
                        onChange={(event) =>
                          handleSelectSchedule(
                            event.target.value
                          )
                        }
                        disabled={
                          sending ||
                          delayedOptions.length === 0
                        }
                        className="w-full rounded-xl border border-[#DFD6C9] bg-[#FFFCF8] px-3 py-3 text-[12px] text-[#333] outline-none transition focus:border-[#A5B26B] focus:ring-2 focus:ring-[#A5B26B]/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {delayedOptions.length === 0 ? (
                          <option value="">
                            No delayed collections
                          </option>
                        ) : (
                          delayedOptions.map(
                            (option) => (
                              <option
                                key={
                                  option.scheduleId
                                }
                                value={
                                  option.scheduleId
                                }
                              >
                                {option.siteName} —{" "}
                                {option.dayTime}
                              </option>
                            )
                          )
                        )}
                      </select>
                    </div>

                    {/* SELECTED COLLECTION DETAILS */}
                    {selectedOption && (
                      <div className="rounded-xl border border-[#E7EEDB] bg-[#F7FAF1] p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#728653]">
                          Selected collection
                        </p>

                        <p className="mt-2 break-words text-[12px] font-bold text-[#354527]">
                          {selectedOption.siteName}
                        </p>

                        <p className="mt-1 text-[11px] text-[#65745B]">
                          Collector:{" "}
                          {selectedOption.collectorName}
                        </p>

                        <p className="mt-1 text-[11px] text-[#65745B]">
                          {selectedOption.dayTime}
                        </p>
                      </div>
                    )}

                    {/* MESSAGE */}
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label
                          htmlFor="al-message"
                          className="text-[12px] font-bold text-[#555]"
                        >
                          Notification message
                        </label>

                        <span className="text-[10px] text-[#999]">
                          {reason.length}/1000
                        </span>
                      </div>

                      <textarea
                        id="al-message"
                        rows={6}
                        maxLength={1000}
                        value={reason}
                        disabled={
                          sending ||
                          delayedOptions.length === 0
                        }
                        onChange={(event) => {
                          setReason(
                            event.target.value
                          );
                          setSent(false);
                          setSendError("");
                        }}
                        placeholder="Enter the collection delay notice..."
                        className="w-full resize-y rounded-xl border border-[#DFD6C9] bg-[#FFFCF8] px-3 py-3 text-[12px] leading-relaxed text-[#333] outline-none transition focus:border-[#A5B26B] focus:ring-2 focus:ring-[#A5B26B]/20 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    {/* SEND BUTTON */}
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={
                        sending ||
                        sent ||
                        !selectedOption ||
                        reason.trim().length < 10
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#A81B1E] px-4 py-3.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#8F1619] disabled:cursor-not-allowed disabled:opacity-50"
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
                        ? "Saving notification..."
                        : sent
                          ? "Notification saved"
                          : "Send notification"}
                    </button>

                    {/* SUCCESS */}
                    {sent && (
                      <div
                        role="status"
                        className="flex items-start gap-2 rounded-xl border border-[#CDE4CA] bg-[#F1F9EF] p-3 text-[12px] font-semibold text-[#36713B]"
                      >
                        <CheckCircle2
                          size={18}
                          className="shrink-0"
                        />

                        <span>
                          The resident's in-app
                          notification was saved.
                        </span>
                      </div>
                    )}

                    {/* ERROR */}
                    {sendError && (
                      <div
                        role="alert"
                        className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700"
                      >
                        <AlertCircle
                          size={18}
                          className="shrink-0"
                        />

                        <span className="break-words">
                          {sendError}
                        </span>
                      </div>
                    )}

                    {delayedOptions.length === 0 && (
                      <p className="text-center text-[11px] leading-relaxed text-[#999]">
                        The notification form will
                        become available when a
                        delayed collection is linked
                        to a resident's report.
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
