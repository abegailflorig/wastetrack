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

const BUCKET = "waste-images";

type Status =
  | "Under Review"
  | "Accepted"
  | "Rejected"
  | "Scheduled"
  | "Resolved";

type Level =
  | "FULL"
  | "NEAR FULL"
  | "EMPTY"
  | "OVERFLOWING"
  | "INVALID"
  | null;

export type ResidentReport = {
  id: string;
  reportId: string;
  name: string;
  address: string;
  image: string;
  siteImage: string;
  level: Level;
  status: Status;
  date: string;
  time: string;
  confidence: number | null;
  reportedBy: string;
  description: string;
};

type ReportDetails = ResidentReport & {
  latitude: number | null;
  longitude: number | null;
};

type ReportRow = {
  report_id: string;
  site_id: string | null;
  address: string | null;
  site_description: string | null;
  cnn_detection_level: string | null;
  confidence_level: number | string | null;
  date_uploaded: string;
};

type SiteRow = {
  site_name: string;
  location: string | null;
  site_image: string | null;
  latitude: number | null;
  longitude: number | null;
};

type ImageRow = {
  storage_bucket: string | null;
  storage_path: string | null;
};

type StatusRow = {
  status: string;
};

type NavigationState = {
  reportId?: unknown;
  report?: {
    id?: unknown;
    reportId?: unknown;
  };
};

const LEVEL_COLORS: Record<Exclude<Level, null>, string> = {
  FULL: "bg-[#d30d2e]",
  "NEAR FULL": "bg-[#ffb93c]",
  EMPTY: "bg-[#9caf75]",
  OVERFLOWING: "bg-[#a40f23]",
  INVALID: "bg-neutral-500",
};

const STATUS_COLORS: Record<Status, string> = {
  "Under Review": "bg-[#e9cf9e] text-[#923d00]",
  Accepted: "bg-blue-100 text-blue-700",
  Rejected: "bg-red-100 text-red-700",
  Scheduled: "bg-[#ffc344] text-white",
  Resolved: "bg-[#0ab96e] text-white",
};

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function statusLabel(value?: string | null): Status {
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

function levelLabel(value?: string | null): Level {
  switch (value?.trim().toUpperCase()) {
    case "FULL":
    case "HIGH":
      return "FULL";
    case "HALF-FULL":
    case "NEAR FULL":
    case "MEDIUM":
      return "NEAR FULL";
    case "EMPTY":
    case "LOW":
      return "EMPTY";
    case "OVERFLOWING":
      return "OVERFLOWING";
    case "INVALID":
      return "INVALID";
    default:
      return null;
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

function confidenceLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Not available";
  }

  const percent = value >= 0 && value <= 1 ? value * 100 : value;

  return `${Math.max(0, Math.min(100, percent))
    .toFixed(1)
    .replace(/\.0$/, "")}%`;
}

function storageLocation(
  value: string | null | undefined,
  defaultBucket = BUCKET
): {
  bucket: string;
  path: string;
} | null {
  if (!value?.trim()) {
    return null;
  }

  let text = value.trim();
  let bucket = defaultBucket;

  if (/^https?:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname;
    } catch {
      return null;
    }
  }

  text = text.replace(/^\/+/, "").split("?")[0];

  const storageMatch = text.match(
    /(?:^|\/)storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i
  );

  if (storageMatch) {
    bucket = decodeURIComponent(storageMatch[1]);
    text = storageMatch[2];
  } else {
    const bucketMatch = text.match(/^(waste-images|disposal-sites)\/(.+)$/i);

    if (bucketMatch) {
      bucket = bucketMatch[1];
      text = bucketMatch[2];
    }
  }

  try {
    text = decodeURIComponent(text);
  } catch {
    // keep original path
  }

  if (!text || text.endsWith("/")) {
    return null;
  }

  return {
    bucket,
    path: text,
  };
}

async function photoUrl(
  value: string | null | undefined,
  defaultBucket = BUCKET
): Promise<string> {
  if (!value?.trim()) {
    return "";
  }

  if (/^(data:|blob:)/i.test(value)) {
    return value;
  }

  if (/^https?:\/\//i.test(value) && !/\/storage\/v1\/object\//i.test(value)) {
    return value;
  }

  const source = storageLocation(value, defaultBucket);

  if (!source) {
    return "";
  }

  const { data, error } = await supabase.storage
    .from(source.bucket)
    .createSignedUrl(source.path, 3600);

  if (error) {
    console.warn("[WasteTrack] Cannot load photo:", {
      bucket: source.bucket,
      path: source.path,
      message: error.message,
    });

    return "";
  }

  return data.signedUrl;
}

export default function ReviewReports() {
  const location = useLocation();
  const [params] = useSearchParams();

  const navigation = location.state as NavigationState | null;

  const reportId =
    [
      params.get("reportId"),
      navigation?.reportId,
      navigation?.report?.id,
      navigation?.report?.reportId,
    ].find(validUuid) ?? null;

  const [report, setReport] = useState<ReportDetails | null>(null);
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
        setRefreshKey((count) => count + 1);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
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
          throw new Error("No report selected. Open a report from My Reports.");
        }

        const {
          data: auth,
          error: authError,
        } = await supabase.auth.getUser();

        if (!active) return;

        if (authError) {
          throw new Error(authError.message);
        }

        if (!auth.user) {
          throw new Error("Please sign in to view your report.");
        }

        const [reportResult, profileResult] = await Promise.all([
          supabase
            .from("waste_reports")
            .select(
              "report_id,site_id,address,site_description,cnn_detection_level,confidence_level,date_uploaded"
            )
            .eq("report_id", reportId)
            .eq("user_id", auth.user.id)
            .maybeSingle(),
          supabase
            .from("users")
            .select("full_name")
            .eq("user_id", auth.user.id)
            .maybeSingle(),
        ]);

        if (!active) return;

        if (reportResult.error) {
          throw new Error(reportResult.error.message);
        }

        if (!reportResult.data) {
          throw new Error("Report not found or you do not have access.");
        }

        const row = reportResult.data as ReportRow;
        const warnings: string[] = [];

        if (profileResult.error) {
          warnings.push("Reporter name unavailable.");
        }

        const [imagesResult, statusResult, siteResult] = await Promise.all([
          supabase
            .from("waste_images")
            .select("storage_bucket,storage_path")
            .eq("report_id", row.report_id)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("status")
            .select("status")
            .eq("report_id", row.report_id)
            .order("created_at", { ascending: false })
            .limit(1),
          row.site_id
            ? supabase
                .from("disposal_sites")
                .select("site_name,location,site_image,latitude,longitude")
                .eq("site_id", row.site_id)
                .maybeSingle()
            : Promise.resolve({
                data: null as SiteRow | null,
                error: null,
              }),
        ]);

        if (!active) return;

        if (imagesResult.error) {
          warnings.push(`Photo data: ${imagesResult.error.message}`);
        }

        if (statusResult.error) {
          warnings.push(`Status data: ${statusResult.error.message}`);
        }

        if (siteResult.error) {
          warnings.push(`Site data: ${siteResult.error.message}`);
        }

        const imageRow = (imagesResult.data?.[0] ?? null) as ImageRow | null;
        const statusRow = (statusResult.data?.[0] ?? null) as StatusRow | null;
        const site = (siteResult.data ?? null) as SiteRow | null;

        const [image, siteImage] = await Promise.all([
          photoUrl(imageRow?.storage_path, imageRow?.storage_bucket || BUCKET),
          photoUrl(site?.site_image),
        ]);

        if (!active) return;

        if (imageRow?.storage_path && !image) {
          warnings.push(
            "The report photo is unavailable. Verify its Storage path or read policy."
          );
        }

        if (site?.site_image && !siteImage) {
          warnings.push("The registered site photo is unavailable.");
        }

        const formatted = formatDateTime(row.date_uploaded);
        const parsedConfidence =
          row.confidence_level === null ? null : Number(row.confidence_level);

        setReport({
          id: row.report_id,
          reportId: row.report_id,
          name: site?.site_name || "Unregistered Bin",
          address: row.address || site?.location || "Location under review",
          image,
          siteImage,
          level: levelLabel(row.cnn_detection_level),
          status: statusLabel(statusRow?.status),
          date: formatted.date,
          time: formatted.time,
          confidence:
            parsedConfidence !== null && Number.isFinite(parsedConfidence)
              ? parsedConfidence
              : null,
          reportedBy: profileResult.data?.full_name?.trim() || "Your account",
          description: row.site_description || "",
          latitude: site?.latitude ?? null,
          longitude: site?.longitude ?? null,
        });

        setNotice(warnings.join(" "));
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load report."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      active = false;
    };
  }, [reportId, refreshKey]);

  return (
    <main
      className="
        flex h-[calc(100dvh-5rem)]
        min-h-0 w-full flex-col
        overflow-hidden
        bg-white text-black
      "
    >
      <div
        className="
          mx-auto flex min-h-0
          w-full max-w-[430px]
          flex-1 flex-col
          md:max-w-4xl
        "
      >
        <header
          className="
            flex shrink-0
            items-center gap-3
            px-6 pb-4 pt-10
            md:px-8 md:pt-7
          "
        >
          <Link
            to="/resident/reports"
            aria-label="Back to My Reports"
            className="
              grid h-8 w-8
              shrink-0 place-items-center
              rounded-full
              hover:bg-neutral-100
            "
          >
            <ArrowLeft size={25} strokeWidth={1.8} />
          </Link>

          <h1 className="text-lg font-medium md:text-xl">Review Report</h1>
        </header>

        <div
          aria-busy={loading}
          className="
            min-h-0 flex-1
            space-y-4 overflow-y-auto
            overscroll-contain
            px-6 pb-6
            md:space-y-5 md:px-8
          "
        >
          {loading ? (
            <p
              role="status"
              className="
                py-12 text-center
                text-sm text-neutral-500
              "
            >
              Loading report...
            </p>
          ) : error ? (
            <section
              role="alert"
              className="
                rounded-xl
                border border-red-200
                bg-red-50 p-4
              "
            >
              <p className="break-words text-sm text-red-700">{error}</p>

              <button
                type="button"
                onClick={() => setRefreshKey((key) => key + 1)}
                className="
                  mt-3 min-h-10
                  text-xs font-semibold
                  text-red-700
                "
              >
                Try Again
              </button>
            </section>
          ) : report ? (
            <>
              {notice && (
                <p
                  role="status"
                  className="
                    rounded-lg
                    bg-amber-50 p-3
                    text-xs text-amber-800
                  "
                >
                  {notice}
                </p>
              )}

              <section
                className="
                  rounded-[15px]
                  bg-[#a7b77a]
                  px-7 py-3
                  md:px-10 md:py-5
                "
              >
                <Photo
                  src={report.image}
                  alt={`Waste reported at ${report.name}`}
                  className="
                    mx-auto h-[170px]
                    w-full max-w-[300px]
                    rounded-[10px]
                    object-cover
                    md:h-[260px]
                    md:max-w-2xl
                  "
                />
              </section>

              <section
                className="
                  rounded-[19px]
                  border border-neutral-200
                  bg-white
                  px-3 pb-3 pt-2
                  shadow-[0_3px_3px_rgba(0,0,0,0.13)]
                  md:px-5 md:pb-5 md:pt-4
                "
              >
                <h2
                  className="
                    flex items-center
                    gap-1 text-sm
                    font-semibold
                    md:text-base
                  "
                >
                  <MapPin size={16} />
                  Location
                </h2>

                <div className="ml-4 mt-2">
                  <h3
                    className="
                      break-words
                      text-base font-bold
                      leading-tight
                      md:text-lg
                    "
                  >
                    {report.name}
                  </h3>

                  <p
                    className="
                      break-words
                      text-[11px]
                      text-neutral-600
                      md:text-sm
                    "
                  >
                    {report.address}
                  </p>
                </div>

                <div
                  className="
                    mt-2 grid
                    grid-cols-[1fr_1.4fr]
                    items-end gap-5
                  "
                >
                  <Photo
                    src={report.siteImage}
                    alt={`Disposal site at ${report.name}`}
                    className="
                      h-[68px] w-full
                      rounded-[10px]
                      object-cover
                      md:h-[110px]
                    "
                  />

                  <div className="min-w-0">
                    {report.latitude !== null && report.longitude !== null ? (
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
                        className="
                          mb-1 ml-auto flex
                          w-fit items-center gap-1
                          rounded border
                          border-[#ed0015]
                          px-2 py-1
                          text-[9px] font-semibold
                          text-[#ed0015]
                          hover:bg-red-50
                          md:text-xs
                        "
                      >
                        <Map size={13} />
                        View on Map
                      </Link>
                    ) : (
                      <span
                        className="
                          mb-1 ml-auto block
                          w-fit text-[9px]
                          text-neutral-500
                        "
                      >
                        Map unavailable
                      </span>
                    )}

                    <div
                      className="
                        relative overflow-hidden
                        rounded-[10px]
                      "
                    >
                      <img
                        src={mapImage}
                        alt="Illustrative map preview"
                        className="
                          h-[52px] w-full
                          object-cover
                          md:h-[80px]
                        "
                      />

                      {report.latitude !== null && report.longitude !== null && (
                        <MapPin
                          size={19}
                          fill="#008753"
                          stroke="white"
                          aria-hidden="true"
                          className="
                            absolute left-1/2
                            top-1/2
                            -translate-x-1/2
                            -translate-y-1/2
                          "
                        />
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="
                  rounded-[19px]
                  border border-neutral-200
                  bg-[#f4f4f4] p-2
                  md:p-4
                "
              >
                <h2
                  className="
                    mb-2 flex items-center
                    gap-1 text-sm
                    font-semibold
                    md:mb-3 md:text-base
                  "
                >
                  <ClipboardList size={17} />
                  Details
                </h2>

                <div
                  className="
                    overflow-hidden
                    rounded-[11px]
                    border border-neutral-300
                    bg-white px-2
                    md:px-4
                  "
                >
                  <DetailRow label="Waste Level (CNN Result)">
                    <span
                      className={`
                        inline-block
                        rounded-full
                        px-3 py-0.5
                        text-[9px] font-bold
                        text-white md:text-xs
                        ${report.level ? LEVEL_COLORS[report.level] : "bg-neutral-400"}
                      `}
                    >
                      {report.level || "Pending"}
                    </span>
                  </DetailRow>

                  <DetailRow label="Confidence Level">
                    {confidenceLabel(report.confidence)}
                  </DetailRow>

                  <DetailRow label="Report ID">
                    <span className="break-all">{report.reportId}</span>
                  </DetailRow>

                  <DetailRow label="Status">
                    <span
                      className={`
                        inline-block
                        rounded px-2 py-0.5
                        text-[10px]
                        font-semibold
                        md:text-xs
                        ${STATUS_COLORS[report.status]}
                      `}
                    >
                      {report.status}
                    </span>
                  </DetailRow>

                  <DetailRow label="Reported by">
                    <span className="text-neutral-500">{report.reportedBy}</span>
                  </DetailRow>

                  <DetailRow label="Reported on">
                    <strong>{report.date}</strong>
                    {report.time && (
                      <span className="text-[10px] md:text-xs">
                        {" · "}
                        {report.time}
                      </span>
                    )}
                  </DetailRow>

                  <div className="pb-2 pt-1 md:pb-3">
                    <p className="text-[11px] text-neutral-500 md:text-sm">
                      Site description (optional):
                    </p>

                    <div
                      className="
                        mt-1 min-h-[38px]
                        whitespace-pre-wrap
                        break-words
                        rounded-[10px]
                        border border-neutral-300
                        bg-white
                        px-2 py-2
                        text-xs shadow-sm
                        md:px-3 md:text-sm
                      "
                    >
                      {report.description || "No description provided."}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
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
    <div
      className="
        grid
        grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]
        items-start gap-2
        border-b border-dotted
        border-neutral-400
        py-1.5 md:py-2.5
      "
    >
      <span
        className="
          min-w-0 break-words
          text-[10px]
          text-neutral-500
          md:text-sm
        "
      >
        {label}
      </span>

      <span
        className="
          min-w-0 break-words
          text-right
          text-[11px]
          text-neutral-800
          md:text-sm
        "
      >
        {children}
      </span>
    </div>
  );
}

function Photo({
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
        aria-label={`${alt} unavailable`}
        className={`
          ${className}
          grid place-items-center
          bg-neutral-200
          text-neutral-500
        `}
      >
        <ImageOff size={24} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}