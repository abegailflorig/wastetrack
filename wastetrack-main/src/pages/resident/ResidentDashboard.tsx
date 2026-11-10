import { useEffect, useId, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  ImageOff,
  MapPin,
  UserRound,
} from "lucide-react";
import { Link } from "react-router";

import { supabase } from "../../lib/supabase";
import householdWaste from "../../assets/householdWaste.png";

type ReportRow = {
  report_id: string;
  site_id: string | null;
  address: string | null;
  site_description: string | null;
  cnn_detection_level: "FULL" | "NEAR FULL" | "EMPTY" | null;
  date_uploaded: string;
};

type SiteRow = {
  site_id: string;
  site_name: string;
  location: string;
  site_image: string | null;
};

type ImageRow = {
  report_id: string;
  src: string | null;
  storage_bucket: string;
  storage_path: string | null;
  created_at: string;
};

type StatusRow = {
  report_id: string;
  status: string;
  created_at: string;
};

type Report = {
  id: string;
  name: string;
  image: string | null;
  address: string;
  level: "FULL" | "NEAR FULL" | "EMPTY" | null;
  status: string;
  date: string;
};

function formatReportDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  const datePart = date.toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const timePart = date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });

  return `${datePart} · ${timePart}`;
}

function levelStyle(level: Report["level"]) {
  switch (level) {
    case "FULL":
      return "bg-[#ffd7dd] text-[#d72e45]";
    case "NEAR FULL":
      return "bg-[#ffe1cb] text-[#ec8642]";
    case "EMPTY":
      return "bg-[#d6f5e6] text-[#008a4c]";
    default:
      return "bg-neutral-200 text-neutral-600";
  }
}

function statusStyle(status: string) {
  switch (status) {
    case "Resolved":
      return "bg-[#00be70] text-white";
    case "Accepted":
      return "bg-blue-100 text-blue-700";
    case "Rejected":
      return "bg-red-100 text-red-700";
    case "Scheduled":
      return "bg-[#ffbd45] text-[#694000]";
    default:
      return "bg-neutral-200 text-neutral-700";
  }
}

export default function ResidentDashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  const [userName, setUserName] = useState("Resident");
  const [reports, setReports] = useState<Report[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const id = useId().replace(/:/g, "");
  const filterId = `water-filter-${id}`;
  const patternId = `water-pattern-${id}`;

  // Get the current account and respond to login/logout.
  useEffect(() => {
    let active = true;
    let authChanged = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      authChanged = true;
      setUserId(session?.user.id ?? null);
      setAuthError("");
      setAuthReady(true);
    });

    async function loadUser() {
      const { data, error: userError } =
        await supabase.auth.getUser();

      if (!active || authChanged) return;

      setUserId(data.user?.id ?? null);
      setAuthError(userError?.message ?? "");
      setAuthReady(true);
    }

    void loadUser();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load data belonging to the signed-in resident.
  useEffect(() => {
    if (!authReady) return;

    let active = true;

    setReports([]);
    setUserName("Resident");
    setUnreadCount(0);
    setError("");
    setNotice("");

    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    async function loadDashboard() {
      try {
        const [profileResult, reportsResult, notificationsResult] =
          await Promise.all([
            supabase
              .from("users")
              .select("full_name")
              .eq("user_id", userId)
              .maybeSingle(),

            supabase
              .from("waste_reports")
              .select(
                `
                  report_id,
                  site_id,
                  address,
                  site_description,
                  cnn_detection_level,
                  date_uploaded
                `
              )
              .eq("user_id", userId)
              .order("date_uploaded", { ascending: false })
              .limit(20),

            supabase
              .from("notifications")
              .select("notification_id", {
                count: "exact",
                head: true,
              })
              .eq("user_id", userId)
              .eq("is_read", false),
          ]);

        if (!active) return;

        const warnings: string[] = [];

        if (profileResult.error) {
          warnings.push(
            `Profile could not load: ${profileResult.error.message}`
          );
        } else {
          const fullName = profileResult.data?.full_name?.trim();

          if (fullName) {
            setUserName(fullName);
          } else {
            warnings.push(
              "Your users-table profile has no full_name."
            );
          }
        }

        if (notificationsResult.error) {
          warnings.push("Notification count could not load.");
        } else {
          setUnreadCount(notificationsResult.count ?? 0);
        }

        if (reportsResult.error) {
          throw new Error(reportsResult.error.message);
        }

        const rows = (reportsResult.data ?? []) as ReportRow[];

        if (rows.length === 0) {
          setReports([]);
          setNotice(warnings.join(" "));
          return;
        }

        const reportIds = rows.map((row) => row.report_id);

        const siteIds = Array.from(
          new Set(
            rows
              .map((row) => row.site_id)
              .filter((value): value is string => value !== null)
          )
        );

        const sitesRequest =
          siteIds.length > 0
            ? supabase
                .from("disposal_sites")
                .select("site_id, site_name, location, site_image")
                .in("site_id", siteIds)
            : Promise.resolve({
                data: [] as SiteRow[],
                error: null,
              });

        const [sitesResult, imagesResult, statusesResult] =
          await Promise.all([
            sitesRequest,

            supabase
              .from("waste_images")
              .select(
                `
                  report_id,
                  src,
                  storage_bucket,
                  storage_path,
                  created_at
                `
              )
              .in("report_id", reportIds)
              .order("created_at", { ascending: false }),

            supabase
              .from("status")
              .select("report_id, status, created_at")
              .in("report_id", reportIds)
              .order("created_at", { ascending: false }),
          ]);

        if (!active) return;

        if (sitesResult.error) {
          warnings.push("Some site details could not load.");
        }

        if (imagesResult.error) {
          warnings.push("Report photos could not load.");
        }

        if (statusesResult.error) {
          warnings.push("Report statuses could not load.");
        }

        const sites = new Map<string, SiteRow>(
          ((sitesResult.data ?? []) as SiteRow[]).map(
            (site) => [site.site_id, site]
          )
        );

        // Queries are newest first. Keep the newest image
        // and newest status for each report.
        const images = new Map<string, ImageRow>();
        const statuses = new Map<string, string>();

        for (const image of (imagesResult.data ?? []) as ImageRow[]) {
          if (!images.has(image.report_id)) {
            images.set(image.report_id, image);
          }
        }

        for (const status of (statusesResult.data ?? []) as StatusRow[]) {
          if (!statuses.has(status.report_id)) {
            statuses.set(status.report_id, status.status);
          }
        }

        let photoAccessFailed = false;

        const mappedReports = await Promise.all(
          rows.map(async (row): Promise<Report> => {
            const site = row.site_id
              ? sites.get(row.site_id)
              : undefined;

            const imageRecord = images.get(row.report_id);
            let image: string | null = null;

            if (imageRecord?.storage_path) {
              const signedResult = await supabase.storage
                .from(imageRecord.storage_bucket || "waste-images")
                .createSignedUrl(imageRecord.storage_path, 3600);

              if (signedResult.error) {
                photoAccessFailed = true;
              } else {
                image = signedResult.data.signedUrl;
              }
            }

            image =
              image ||
              imageRecord?.src ||
              site?.site_image ||
              null;

            return {
              id: row.report_id,
              name: site?.site_name || "Manually Pinned Location",
              image,
              address:
                site?.location ||
                row.address ||
                "Address unavailable",
              level: row.cnn_detection_level,
              status: statusesResult.error
                ? "Unavailable"
                : statuses.get(row.report_id) || "Pending",
              date: formatReportDate(row.date_uploaded),
            };
          })
        );

        if (!active) return;

        if (photoAccessFailed) {
          warnings.push(
            "Some photos are unavailable. Check Storage read policies."
          );
        }

        setReports(mappedReports);
        setNotice(warnings.join(" "));
      } catch (failure) {
        if (!active) return;

        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to load your dashboard."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [authReady, userId, refreshKey]);

  return (
    <div className="flex h-[calc(100dvh-5rem)] w-full flex-col overflow-hidden bg-white">
      {/* Fixed responsive header */}
      <header className="dashboard-header relative isolate shrink-0 overflow-hidden rounded-b-[28px] bg-[#A61B1B] px-4 pb-6 pt-4 text-white sm:rounded-b-[40px] sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
        {/* Water-caustic background */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter
              id={filterId}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018 0.025"
                numOctaves="2"
                seed="8"
                result="waterNoise"
              />

              <feDisplacementMap
                in="SourceGraphic"
                in2="waterNoise"
                scale="42"
                xChannelSelector="R"
                yChannelSelector="G"
              />

              <feGaussianBlur stdDeviation="1.2" />
            </filter>

            <pattern
              id={patternId}
              width="160"
              height="140"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="
                  M-20 35 Q20 5 60 30 T140 25 T200 40
                  M-20 100 Q25 65 65 95 T145 90 T200 110
                  M30 -20 Q5 30 35 70 T30 160
                  M110 -20 Q80 30 115 65 T110 160
                "
                fill="none"
                stroke="#FF383C"
                strokeWidth="12"
                strokeOpacity="0.25"
              />

              <path
                d="
                  M-20 35 Q20 5 60 30 T140 25 T200 40
                  M-20 100 Q25 65 65 95 T145 90 T200 110
                  M30 -20 Q5 30 35 70 T30 160
                  M110 -20 Q80 30 115 65 T110 160
                "
                fill="none"
                stroke="#FF383C"
                strokeWidth="3"
                strokeOpacity="0.5"
              />
            </pattern>
          </defs>

          <rect width="100%" height="100%" fill="#A61B1B" />

          <rect
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            fill={`url(#${patternId})`}
            filter={`url(#${filterId})`}
          />
        </svg>

        <div className="mx-auto w-full max-w-6xl">
          {/* Greeting */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ffe1bd] text-[#9e262b] sm:h-12 sm:w-12">
                <UserRound
                  strokeWidth={1.8}
                  className="h-6 w-6 sm:h-7 sm:w-7"
                />
              </div>

              <div className="min-w-0">
                <p className="text-xs sm:text-sm">Hello,</p>

                <h1 className="break-words text-sm font-bold sm:text-base lg:text-lg">
                  {userName}
                </h1>
              </div>
            </div>

            <Link
              to="/resident/notifications"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              className="relative inline-flex shrink-0 p-2"
            >
              <Bell
                fill="white"
                strokeWidth={1.8}
                className="h-6 w-6 sm:h-7 sm:w-7"
              />

              {unreadCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full border border-white bg-[#b7d58e] px-1 text-[9px] font-bold text-[#285d48]"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          </div>

          {/* Waste preparation banner */}
          <section className="dashboard-banner relative mx-auto mt-4 w-full max-w-[380px] overflow-hidden rounded-xl bg-white text-black shadow-md sm:mt-5 md:max-w-[520px]">
            <div className="dashboard-banner-top relative px-3 py-3 sm:px-5">
              <h2 className="relative z-10 w-[62%] text-base font-extrabold leading-tight sm:text-xl md:text-2xl">
                Guidelines on
                <br />
                Preparing
              </h2>
            </div>

            <img
              src={householdWaste}
              alt="Gloved hand holding a household waste bag"
              className="dashboard-waste-image pointer-events-none absolute right-0 top-1 z-20 h-[110px] w-[38%] object-contain object-right sm:h-[128px] md:h-[140px]"
              draggable={false}
            />

            <div className="bg-gradient-to-b from-[#c3e8d2] to-[#68ae8b] px-3 pb-3 pt-2 sm:px-5">
              <p className="relative z-10 w-[62%] text-sm font-extrabold leading-tight text-[#14634f] sm:text-base md:text-lg">
                Household Waste
              </p>

              <div
                aria-hidden="true"
                className="mt-3 flex items-center gap-1.5"
              >
                <span className="h-2 w-2 rounded-full bg-white" />
                <span className="h-2 w-2 rounded-full bg-white/65" />
                <span className="h-2 w-2 rounded-full bg-white/65" />
              </div>
            </div>
          </section>
        </div>
      </header>

      {/* Fixed heading and scrollable report list */}
      <section className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-3 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#252525] sm:text-base lg:text-lg">
            Recent Reports
          </h2>
        </div>

        <div
          role="region"
          aria-label="Recent reports"
          aria-busy={loading}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-5"
        >
          {!authReady || loading ? (
            <p role="status" className="py-8 text-center text-sm text-neutral-500">
              Loading your dashboard...
            </p>
          ) : !userId ? (
            <div className="rounded-xl border p-5 text-center">
              <p className="text-sm font-semibold">
                Sign in to view your reports
              </p>

              {authError && (
                <p className="mt-2 text-xs text-red-700">
                  {authError}
                </p>
              )}

              <Link
                to="/login"
                className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-[#A61B1B] px-4 text-xs font-semibold text-white"
              >
                Sign In
              </Link>
            </div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">
                Unable to load reports
              </p>
              <p className="mt-2 break-words text-xs text-red-700">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                className="mt-3 min-h-10 text-xs font-bold text-red-700"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {notice && (
                <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  {notice}
                </p>
              )}

              {reports.length === 0 ? (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center">
                  <p className="text-sm font-semibold">
                    No reports yet
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Your submitted waste reports will appear here.
                  </p>
                  <Link
                    to="/resident/report-waste"
                    className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-[#A61B1B] px-4 text-xs font-semibold text-white"
                  >
                    Report Waste
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:gap-4">
                  {reports.map((report) => (
                    <Link
                      key={report.id}
                      to="/resident/reports/review"
                      state={{
                        reportId: report.id,
                        report,
                      }}
                      aria-label={`Review report for ${report.name}`}
                      className="flex min-w-0 items-center gap-2 rounded-[18px] border border-[#f16b74] bg-[#f7f7f7] p-2.5 shadow-[0_3px_4px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#fff1f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:gap-3 sm:p-3"
                    >
                      <ReportPhoto report={report} />

                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-bold leading-tight text-black sm:text-base">
                          {report.name}
                        </h3>

                        <p className="mt-1 flex items-start gap-1 text-[10px] leading-snug text-[#555] sm:text-xs">
                          <MapPin size={12} className="mt-0.5 shrink-0" />
                          <span className="break-words">
                            {report.address}
                          </span>
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span
                            className={`rounded px-2 py-0.5 text-[9px] font-bold sm:text-[10px] ${levelStyle(report.level)}`}
                          >
                            {report.level ?? "Awaiting Analysis"}
                          </span>

                          <span
                            className={`rounded px-2 py-0.5 text-[9px] font-semibold sm:text-[10px] ${statusStyle(report.status)}`}
                          >
                            {report.status}
                          </span>
                        </div>

                        <p className="mt-2 flex items-start gap-1 text-[9px] leading-snug text-[#555] sm:text-[10px]">
                          <CalendarDays size={12} className="mt-0.5 shrink-0" />
                          <span className="break-words">
                            {report.date}
                          </span>
                        </p>
                      </div>

                      <ChevronRight
                        aria-hidden="true"
                        strokeWidth={2.5}
                        className="h-5 w-5 shrink-0 text-[#777] sm:h-6 sm:w-6"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <style>{`
        .dashboard-banner-top {
          min-height: 78px;
        }

        @media (min-width: 640px) {
          .dashboard-banner-top {
            min-height: 88px;
          }
        }

        @media (max-height: 600px) {
          .dashboard-header {
            padding-top: 10px;
            padding-bottom: 12px;
          }

          .dashboard-banner {
            margin-top: 10px;
          }

          .dashboard-banner-top {
            min-height: 56px;
            padding-top: 8px;
            padding-bottom: 8px;
          }

          .dashboard-banner-top h2 {
            font-size: 16px;
          }

          .dashboard-waste-image {
            height: 94px;
          }
        }

        @media (max-height: 420px) {
          .dashboard-banner {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

function ReportPhoto({ report }: { report: Report }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [report.image]);

  const className =
    "h-[72px] w-[58px] shrink-0 rounded-lg sm:h-[88px] sm:w-[74px]";

  if (!report.image || failed) {
    return (
      <div
        role="img"
        aria-label="Report photo unavailable"
        className={`${className} grid place-items-center bg-neutral-200 text-neutral-500`}
      >
        <ImageOff size={22} />
      </div>
    );
  }

  return (
    <img
      src={report.image}
      alt={report.name}
      onError={() => setFailed(true)}
      className={`${className} object-cover`}
    />
  );
}