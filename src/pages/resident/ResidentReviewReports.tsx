import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ClipboardList,
  ImageOff,
  Map,
  MapPin,
} from "lucide-react";
import {
  Link,
  useLocation,
  useSearchParams,
} from "react-router";

import { supabase } from "../../lib/supabase";
import mapImage from "../../assets/map.jpg";

export type ResidentReport = {
  id: string;
  name: string;
  address: string;
  image: string;
  level: "FULL" | "NEAR FULL" | "EMPTY" | null;
  status:
    | "Under Review"
    | "Accepted"
    | "Rejected"
    | "Scheduled"
    | "Resolved";
  date: string;
  time: string;
  wasteType: string;
  confidence: number | null;
  reportId: string;
  reportedBy: string;
  description: string;
};

type ReportDetails = ResidentReport & {
  latitude: number;
  longitude: number;
};

type ReportRow = {
  report_id: string;
  user_id: string;
  address: string | null;
  site_description: string | null;
  waste_type: string;
  latitude: number;
  longitude: number;
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

type NavigationState = {
  reportId?: unknown;
  report?: {
    id?: unknown;
    reportId?: unknown;
  };
};

const levelColors = {
  FULL: "bg-[#f00000]",
  "NEAR FULL": "bg-[#ffb93c]",
  EMPTY: "bg-[#a4b875]",
};

const statusColors: Record<
  ResidentReport["status"],
  string
> = {
  "Under Review": "bg-[#e9cf9e] text-[#923d00]",
  Accepted: "bg-blue-100 text-blue-700",
  Rejected: "bg-red-100 text-red-700",
  Scheduled: "bg-[#ffc344] text-[#694000]",
  Resolved: "bg-[#00bd72] text-white",
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function getStatus(
  value?: string
): ResidentReport["status"] {
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

export default function ReviewReports() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const state =
    location.state as NavigationState | null;

  const reportId =
    [
      searchParams.get("reportId"),
      state?.reportId,
      state?.report?.id,
      state?.report?.reportId,
    ].find(isUuid) ?? null;

  const [report, setReport] =
    useState<ReportDetails | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

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

    async function loadReport() {
      setLoading(true);
      setError("");
      setNotice("");
      setReport(null);

      try {
        if (!reportId) {
          throw new Error(
            "No report selected. Open a report from My Reports."
          );
        }

        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (!active) return;

        if (!authData.user) {
          throw new Error(
            "Please sign in to view your report."
          );
        }

        if (authError) {
          throw new Error(authError.message);
        }

        const user = authData.user;

        const [reportResult, profileResult] =
          await Promise.all([
            supabase
              .from("waste_reports")
              .select(`
                report_id,
                user_id,
                address,
                site_description,
                waste_type,
                latitude,
                longitude,
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
              `)
              .eq("report_id", reportId)
              .eq("user_id", user.id)
              .maybeSingle(),

            supabase
              .from("users")
              .select("full_name")
              .eq("user_id", user.id)
              .maybeSingle(),
          ]);

        if (!active) return;

        if (reportResult.error) {
          throw new Error(reportResult.error.message);
        }

        if (!reportResult.data) {
          throw new Error(
            "Report not found or you do not have access."
          );
        }

        const row =
          reportResult.data as unknown as ReportRow;

        const warnings: string[] = [];

        if (profileResult.error) {
          warnings.push(
            "The reporter's name could not load."
          );
        }

        const latestImage = [
          ...(row.waste_images ?? []),
        ].sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.image_id.localeCompare(a.image_id)
        )[0];

        const latestStatus = [
          ...(row.status ?? []),
        ].sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.status_id.localeCompare(a.status_id)
        )[0];

        let image =
          latestImage?.src ||
          row.disposal_sites?.site_image ||
          "";

        if (latestImage?.storage_path) {
          const {
            data: signedData,
            error: signedError,
          } = await supabase.storage
            .from(
              latestImage.storage_bucket ||
                "waste-images"
            )
            .createSignedUrl(
              latestImage.storage_path,
              3600
            );

          if (signedError) {
            warnings.push(
              "The report photo could not load. Check Storage permissions."
            );
          } else {
            image = signedData.signedUrl;
          }
        }

        if (!active) return;

        const formatted = formatDateTime(
          row.date_uploaded
        );

        const confidence =
          row.confidence_level === null
            ? null
            : Number(row.confidence_level);

        setReport({
          id: row.report_id,
          reportId: row.report_id,

          name:
            row.disposal_sites?.site_name ||
            "Unregistered Bin",

          address:
            row.address ||
            row.disposal_sites?.location ||
            "Location under review",

          image,
          level: row.cnn_detection_level,
          status: getStatus(latestStatus?.status),

          date: formatted.date,
          time: formatted.time,

          wasteType:
            row.waste_type || "Mixed/Unsorted",

          confidence:
            confidence !== null &&
            Number.isFinite(confidence)
              ? confidence
              : null,

          reportedBy:
            profileResult.data?.full_name?.trim() ||
            "Your account",

          description:
            row.site_description || "",

          latitude: row.latitude,
          longitude: row.longitude,
        });

        setNotice(warnings.join(" "));
      } catch (failure) {
        if (!active) return;

        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to load report."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadReport();

    return () => {
      active = false;
    };
  }, [reportId, refreshKey]);

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col">
        {/* Fixed heading */}
        <header className="flex shrink-0 items-center gap-3 px-6 pb-4 pt-10">
          <Link
            to="/resident/reports"
            aria-label="Back to My Reports"
            className="grid h-8 w-8 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
          >
            <ArrowLeft size={24} strokeWidth={1.7} />
          </Link>

          <h1 className="text-lg font-medium text-black">
            Review Report
          </h1>
        </header>

        {/* Scrollable report content */}
        <div
          aria-busy={loading}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-6"
        >
          {loading ? (
            <p
              role="status"
              className="py-12 text-center text-sm text-neutral-500"
            >
              Loading report...
            </p>
          ) : error ? (
            <section
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4"
            >
              <p className="break-words text-sm text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  setRefreshKey((value) => value + 1)
                }
                className="mt-3 min-h-10 text-xs font-semibold text-red-700"
              >
                Try Again
              </button>
            </section>
          ) : report ? (
            <>
              {notice && (
                <p
                  role="status"
                  className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800"
                >
                  {notice}
                </p>
              )}

              {/* Main report image */}
              <section className="rounded-[14px] bg-[#a7b77a] px-7 py-3">
                <ReportPhoto
                  src={report.image}
                  alt={`Waste reported at ${report.name}`}
                  className="h-[155px] w-full rounded-lg object-cover"
                />
              </section>

              {/* Location card */}
              <section className="rounded-[18px] border border-neutral-200 bg-white px-3 pb-3 pt-2 shadow-[0_3px_3px_rgba(0,0,0,0.1)]">
                <h2 className="flex items-center gap-1 text-sm font-semibold">
                  <MapPin size={16} />
                  Location
                </h2>

                <div className="ml-4 mt-2">
                  <h3 className="break-words text-base font-bold leading-tight">
                    {report.name}
                  </h3>

                  <p className="break-words text-[11px] text-neutral-600">
                    {report.address}
                  </p>
                </div>

                <div className="mt-2 grid grid-cols-[1fr_1.4fr] items-end gap-5">
                  <ReportPhoto
                    src={report.image}
                    alt={`Disposal site at ${report.name}`}
                    className="h-[65px] w-full rounded-lg object-cover"
                  />

                  <div className="min-w-0">
                    <Link
                      to="/resident/report-waste/map"
                      state={{
                        report,
                        selectedLocation: {
                          latitude: report.latitude,
                          longitude: report.longitude,
                          address: report.address,
                          description: report.description,
                        },
                      }}
                      className="mb-1 ml-auto flex w-fit items-center gap-1 rounded border border-[#ed0015] px-2 py-1 text-[9px] font-semibold text-[#ed0015]"
                    >
                      <Map size={13} />
                      View on Map
                    </Link>

                    <div className="relative overflow-hidden rounded-lg">
                      <img
                        src={mapImage}
                        alt="Illustrative map preview"
                        className="h-[48px] w-full object-cover"
                      />

                      <MapPin
                        size={19}
                        fill="#008753"
                        stroke="white"
                        aria-hidden="true"
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Details card */}
              <section className="rounded-[18px] border border-neutral-200 bg-[#f4f4f4] p-2">
                <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
                  <ClipboardList size={17} />
                  Details
                </h2>

                <div className="overflow-hidden rounded-lg border border-neutral-300 bg-white px-2">
                  <DetailRow label="Type of Waste">
                    <span className="text-sm">
                      {report.wasteType}
                    </span>
                  </DetailRow>

                  <DetailRow label="Waste Level (CNN Result)">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold text-white ${
                        report.level
                          ? levelColors[report.level]
                          : "bg-neutral-400"
                      }`}
                    >
                      {report.level ?? "Pending"}
                    </span>
                  </DetailRow>

                  <DetailRow label="Confidence Level">
                    {report.confidence === null
                      ? "Pending"
                      : `${report.confidence}%`}
                  </DetailRow>

                  <DetailRow label="Report ID">
                    {report.reportId}
                  </DetailRow>

                  <DetailRow label="Status">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        statusColors[report.status]
                      }`}
                    >
                      {report.status}
                    </span>
                  </DetailRow>

                  <DetailRow label="Reported by">
                    <span className="text-neutral-500">
                      {report.reportedBy}
                    </span>
                  </DetailRow>

                  <DetailRow label="Reported on">
                    <strong>{report.date}</strong>
                    {report.time && (
                      <span className="text-[10px]">
                        {" "}· {report.time}
                      </span>
                    )}
                  </DetailRow>

                  <div className="pb-2 pt-1">
                    <p className="text-[11px] text-neutral-500">
                      Site description (optional):
                    </p>

                    <div className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-neutral-300 bg-white px-2 py-2 text-xs shadow-sm">
                      {report.description ||
                        "No description provided."}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-2 border-b border-dotted border-neutral-400 py-1.5">
      <span className="text-[10px] text-neutral-500">
        {label}
      </span>

      <span className="min-w-0 break-words text-right text-[11px] text-neutral-800">
        {children}
      </span>
    </div>
  );
}

function ReportPhoto({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label="Report photo unavailable"
        className={`${className} grid place-items-center bg-neutral-200 text-neutral-500`}
      >
        <ImageOff size={24} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}