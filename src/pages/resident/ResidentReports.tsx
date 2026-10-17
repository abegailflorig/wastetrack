import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ImageOff,
  MapPin,
} from "lucide-react";
import { Link } from "react-router";

import { supabase } from "../../lib/supabase";

type ReportStatus =
  | "Under Review"
  | "Accepted"
  | "Rejected"
  | "Scheduled"
  | "Resolved";

export type ResidentReport = {
  id: string;
  name: string;
  address: string;
  image: string;
  level: "FULL" | "NEAR FULL" | "EMPTY" | null;
  status: ReportStatus;
  date: string;
  time: string;
  wasteType: string;
  confidence: number | null;
  reportId: string;
  reportedBy: string;
  description: string;
};

type ReportRow = {
  report_id: string;
  address: string | null;
  site_description: string | null;
  waste_type: string;
  cnn_detection_level: ResidentReport["level"];
  confidence_level: number | string | null;
  date_uploaded: string;

  disposal_sites: {
    site_name: string;
    location: string;
    site_image: string | null;
  } | null;

  waste_images: {
    image_id: string;
    src: string | null;
    storage_bucket: string;
    storage_path: string | null;
    created_at: string;
  }[];

  status: {
    status_id: string;
    status: string;
    created_at: string;
  }[];
};

const filters = [
  "All",
  "Under Review",
  "Scheduled",
  "Resolved",
  "Accepted",
  "Rejected",
] as const;

type Filter = (typeof filters)[number];

const levelColors = {
  FULL: "bg-[#ffe0e6] text-[#ed0015]",
  "NEAR FULL": "bg-[#ffe8d5] text-[#ee873c]",
  EMPTY: "bg-[#e6efd7] text-[#6d8745]",
};

const statusColors: Record<ReportStatus, string> = {
  "Under Review": "bg-[#f3e4cf] text-[#b90000]",
  Scheduled: "bg-[#ffc344] text-[#694000]",
  Resolved: "bg-[#00bd72] text-white",
  Accepted: "bg-blue-100 text-blue-700",
  Rejected: "bg-red-100 text-red-700",
};

function mapStatus(value?: string): ReportStatus {
  switch (value) {
    case "Accepted":
      return "Accepted";
    case "Rejected":
      return "Rejected";
    case "Scheduled":
      return "Scheduled";
    case "Resolved":
      return "Resolved";
    default:
      return "Under Review";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "Date unavailable",
      time: "",
    };
  }

  return {
    date: date.toLocaleDateString("en-US", {
      timeZone: "Asia/Manila",
      month: "numeric",
      day: "numeric",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-US", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

const reportSelect = `
  report_id,
  address,
  site_description,
  waste_type,
  cnn_detection_level,
  confidence_level,
  date_uploaded,
  disposal_sites (
    site_name,
    location,
    site_image
  ),
  waste_images (
    image_id,
    src,
    storage_bucket,
    storage_path,
    created_at
  ),
  status (
    status_id,
    status,
    created_at
  )
`;

export default function ResidentReports() {
  const [activeFilter, setActiveFilter] =
    useState<Filter>("All");

  const [reports, setReports] =
    useState<ResidentReport[]>([]);

  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh when the account changes.
  // No Supabase requests run inside the auth callback.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED"
      ) {
        setRefreshKey((value) => value + 1);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      setLoading(true);
      setError("");
      setNotice("");
      setReports([]);

      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (!active) return;

        const user = authData.user;

        if (!user) {
          setSignedIn(false);

          if (authError) {
            setError(authError.message);
          }

          return;
        }

        if (authError) {
          throw new Error(authError.message);
        }

        setSignedIn(true);

        const profileResult = await supabase
          .from("users")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!active) return;

        const warnings: string[] = [];

        if (profileResult.error) {
          warnings.push("Your profile name could not load.");
        }

        const reportedBy =
          profileResult.data?.full_name?.trim() ||
          "Your account";

        // Fetch in pages instead of silently limiting
        // the report list to one database response.
        const rows: ReportRow[] = [];
        const pageSize = 200;
        let offset = 0;

        while (active) {
          const { data, error: reportsError } =
            await supabase
              .from("waste_reports")
              .select(reportSelect)
              .eq("user_id", user.id)
              .order("date_uploaded", {
                ascending: false,
              })
              .order("report_id", {
                ascending: false,
              })
              .range(offset, offset + pageSize - 1);

          if (reportsError) {
            throw new Error(reportsError.message);
          }

          const page = (data ?? []) as unknown as ReportRow[];

          rows.push(...page);

          if (page.length < pageSize) break;

          offset += pageSize;
        }

        if (!active) return;

        let unavailablePhotos = 0;

        const mappedReports: ResidentReport[] = [];

        // Resolve photos in small batches.
        for (let index = 0; index < rows.length; index += 10) {
          if (!active) return;

          const batch = await Promise.all(
            rows.slice(index, index + 10).map(
              async (row): Promise<ResidentReport> => {
                const site = row.disposal_sites;

                const latestImage = [...(row.waste_images ?? [])]
                  .sort((a, b) =>
                    b.created_at.localeCompare(a.created_at) ||
                    b.image_id.localeCompare(a.image_id)
                  )[0];

                const latestStatus = [...(row.status ?? [])]
                  .sort((a, b) =>
                    b.created_at.localeCompare(a.created_at) ||
                    b.status_id.localeCompare(a.status_id)
                  )[0];

                let image =
                  latestImage?.src ||
                  site?.site_image ||
                  "";

                if (latestImage?.storage_path) {
                  const { data: signedData, error: signedError } =
                    await supabase.storage
                      .from(
                        latestImage.storage_bucket ||
                          "waste-images"
                      )
                      .createSignedUrl(
                        latestImage.storage_path,
                        3600
                      );

                  if (signedError) {
                    unavailablePhotos += 1;
                  } else {
                    image = signedData.signedUrl;
                  }
                }

                const formatted = formatDateTime(
                  row.date_uploaded
                );

                const parsedConfidence =
                  row.confidence_level === null
                    ? null
                    : Number(row.confidence_level);

                return {
                  id: row.report_id,
                  reportId: row.report_id,

                  name:
                    site?.site_name ||
                    "Unregistered Bin",

                  address:
                    row.address ||
                    site?.location ||
                    "Location under review",

                  image,

                  level: row.cnn_detection_level,

                  status: mapStatus(latestStatus?.status),

                  date: formatted.date,
                  time: formatted.time,

                  wasteType:
                    row.waste_type || "Mixed/Unsorted",

                  confidence:
                    parsedConfidence !== null &&
                    Number.isFinite(parsedConfidence)
                      ? parsedConfidence
                      : null,

                  reportedBy,

                  description:
                    row.site_description || "",
                };
              }
            )
          );

          mappedReports.push(...batch);
        }

        if (!active) return;

        if (unavailablePhotos > 0) {
          warnings.push(
            "Some photos could not load. Check your Storage read policies."
          );
        }

        setReports(mappedReports);
        setNotice(warnings.join(" "));
      } catch (failure) {
        if (!active) return;

        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to load your reports."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadReports();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const filteredReports =
    activeFilter === "All"
      ? reports
      : reports.filter(
          (report) => report.status === activeFilter
        );

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col overflow-hidden bg-white">
      {/* Fixed header */}
      <header className="shrink-0 border-b border-[#cecece]">
        <div className="mx-auto flex w-full max-w-[430px] items-center gap-3 px-5 pb-3 pt-10">
          <Link
            to="/resident/dashboard"
            aria-label="Back to dashboard"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-neutral-100"
          >
            <ArrowLeft size={23} strokeWidth={1.7} />
          </Link>

          <h1 className="flex-1 text-base font-bold">
            My Reports
          </h1>

          
        </div>
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-4">
        {/* Horizontally scrollable filters */}
        <div
          role="group"
          aria-label="Filter reports"
          className="flex shrink-0 gap-3 overflow-x-auto overscroll-x-contain pb-3 pt-7"
        >
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
              className={`min-h-9 shrink-0 whitespace-nowrap rounded-lg px-4 py-1 text-sm font-semibold ${
                activeFilter === filter
                  ? "bg-[#c90000] text-white"
                  : "bg-[#f5e7d2] text-[#c90000]"
              }`}
            >
              {filter === "All"
                ? `All (${reports.length})`
                : filter}
            </button>
          ))}
        </div>

        {/* Vertically scrollable reports */}
        <div
          role="region"
          aria-label="Your waste reports"
          aria-busy={loading}
          tabIndex={0}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5 pb-5"
        >
          {loading ? (
            <p
              role="status"
              className="py-12 text-center text-sm text-neutral-500"
            >
              Loading your reports...
            </p>
          ) : !signedIn ? (
            <div className="rounded-xl border p-5 text-center">
              <h2 className="text-sm font-semibold">
                Sign in to view your reports
              </h2>

              {error && (
                <p className="mt-2 break-words text-xs text-red-700">
                  {error}
                </p>
              )}

              <Link
                to="/login"
                className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-[#c90000] px-4 text-xs font-semibold text-white"
              >
                Sign In
              </Link>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4"
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
                  setRefreshKey((value) => value + 1)
                }
                className="mt-3 min-h-10 text-xs font-bold text-red-700"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {notice && (
                <p
                  role="status"
                  className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800"
                >
                  {notice}
                </p>
              )}

              {filteredReports.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-neutral-500">
                    {reports.length === 0
                      ? "You have not submitted any reports yet."
                      : "No reports with this status."}
                  </p>

                  {reports.length === 0 && (
                    <Link
                      to="/resident/report-waste"
                      className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-[#c90000] px-4 text-xs font-semibold text-white"
                    >
                      Report Waste
                    </Link>
                  )}
                </div>
              ) : (
                filteredReports.map((report) => (
                  <Link
                    key={report.id}
                    to="/resident/reports/review"
                    state={{
                      reportId: report.id,
                      report,
                    }}
                    aria-label={`Review report for ${report.name}`}
                    className="flex items-center gap-2 rounded-[18px] border border-[#ff5465] bg-[#f6f6f6] p-3 shadow-[0_3px_3px_rgba(0,0,0,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 sm:gap-3"
                  >
                    <ReportPhoto report={report} />

                    <div className="min-w-0 flex-1">
                      <h2 className="break-words text-[15px] font-bold leading-tight">
                        {report.name}
                      </h2>

                      <p className="mt-1 flex items-start gap-1 text-[10px] text-neutral-700">
                        <MapPin
                          size={11}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="break-words">
                          {report.address}
                        </span>
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-medium ${
                            report.level
                              ? levelColors[report.level]
                              : "bg-[#ffe0e6] text-neutral-500"
                          }`}
                        >
                          {report.level ?? "Awaiting Analysis"}
                        </span>

                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-medium ${
                            statusColors[report.status]
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>

                      <p className="mt-2 flex items-start gap-1 text-[9px] text-neutral-700">
                        <CalendarDays
                          size={12}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="break-words">
                          {report.date}
                          {report.time
                            ? ` · ${report.time}`
                            : ""}
                        </span>
                      </p>
                    </div>

                    <ChevronRight
                      size={25}
                      strokeWidth={3}
                      className="shrink-0 text-[#777]"
                    />
                  </Link>
                ))
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ReportPhoto({
  report,
}: {
  report: ResidentReport;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [report.image]);

  const size =
    "h-[86px] w-[64px] shrink-0 rounded-lg sm:w-[74px]";

  if (!report.image || failed) {
    return (
      <div
        role="img"
        aria-label="Report photo unavailable"
        className={`${size} grid place-items-center bg-neutral-200 text-neutral-500`}
      >
        <ImageOff size={24} />
      </div>
    );
  }

  return (
    <img
      src={report.image}
      alt={report.name}
      onError={() => setFailed(true)}
      className={`${size} object-cover`}
    />
  );
}