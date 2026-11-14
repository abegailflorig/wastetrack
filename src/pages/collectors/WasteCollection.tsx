
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Footprints,
  ImageOff,
  MapPin,
  RefreshCw,
  Trash2,
  UsersRound,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ========================================
// CONSTANTS
// ========================================

const BUCKET = "waste-images";
const PAGE_SIZE = 100;

// ========================================
// TYPES
// ========================================

type ScheduleRow = {
  schedule_id: string;
  site_id: string;
  assigned_collector_id: string | null;
  source_report_id: string | null;
  date: string;
  collection_time: string | null;
  collection_type: string;
  status: string;
};

type SiteRow = {
  site_id: string;
  site_name: string;
  location: string;
  latitude: number;
  longitude: number;
  site_image: string | null;
  qr_code: string | null;
  assigned_collector: string | null;
};

type ReportRow = {
  report_id: string;
  user_id: string;
  site_id: string | null;
  date_uploaded: string;
  cnn_detection_level: string | null;
};

type ImageRow = {
  image_id: string;
  report_id: string;
  storage_bucket: string;
  storage_path: string | null;
  created_at: string;
};

type Photo = {
  url: string;
  path: string;
  message: string;
};

type Details = {
  schedule: ScheduleRow;
  site: SiteRow;
  report: ReportRow | null;
  photo: Photo;
  residentCount: number | null;
};

type RouteState = {
  scheduleId?: string;
  schedule?: {
    id?: string;
  };
};

type Distance = {
  loading: boolean;
  label: string;
  km: number | null;
  error: boolean;
};

// ========================================
// HELPERS
// ========================================

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return String(
      (error as { message: unknown }).message
    );
  }

  return "Unable to load collection information.";
}

function formatDate(value: string): string {
  const [year, month, day] = value
    .split("-")
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day
  );

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        weekday: "short",
      });
}

function formatTime(value: string | null): string {
  const match = value?.match(
    /^(\d{1,2}):(\d{2})/
  );

  if (
    !match ||
    Number(match[1]) > 23
  ) {
    return value || "Not set";
  }

  const hour = Number(match[1]);

  return `${hour % 12 || 12}:${match[2]} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

// ========================================
// DISTANCE CALCULATION
// ========================================

function kilometersBetween(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const rad = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);

  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) *
      Math.cos(rad(bLat)) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    6371.0088 *
    Math.asin(
      Math.sqrt(Math.min(1, hav))
    )
  );
}

function validCoordinates(
  latitude: number,
  longitude: number
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

// ========================================
// SUPABASE STORAGE PATH
// ========================================

function normalizeStoragePath(
  raw: string | null
): string | null {
  if (!raw?.trim()) {
    return null;
  }

  let path = raw.trim();

  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);

      const match = url.pathname.match(
        /\/storage\/v1\/(?:object\/(?:public|sign|authenticated)|render\/image\/(?:public|authenticated))\/([^/]+)\/(.+)$/i
      );

      if (
        !match ||
        decodeURIComponent(match[1]) !== BUCKET
      ) {
        return null;
      }

      path = decodeURIComponent(match[2]);
    } catch {
      return null;
    }
  }

  path = path.replace(/^\/+/, "");

  path = path.replace(
    /^storage\/v1\/object\/(?:public|sign|authenticated)\/waste-images\//i,
    ""
  );

  while (path.startsWith(`${BUCKET}/`)) {
    path = path.slice(BUCKET.length + 1);
  }

  return path && !path.endsWith("/")
    ? path
    : null;
}

// ========================================
// GET LINKED WASTE REPORT
// ========================================

async function findLinkedReport(
  schedule: ScheduleRow
): Promise<ReportRow | null> {
  const columns =
    "report_id,user_id,site_id,date_uploaded,cnn_detection_level";

  if (schedule.source_report_id) {
    const { data, error } = await supabase
      .from("waste_reports")
      .select(columns)
      .eq(
        "report_id",
        schedule.source_report_id
      )
      .maybeSingle();

    if (error) {
      throw new Error(
        `waste_reports: ${error.message}`
      );
    }

    return data as ReportRow | null;
  }

  // Find the latest report containing an image
  // for the selected disposal site.

  for (
    let offset = 0;
    ;
    offset += PAGE_SIZE
  ) {
    const { data, error } = await supabase
      .from("waste_reports")
      .select(columns)
      .eq("site_id", schedule.site_id)
      .order("date_uploaded", {
        ascending: false,
      })
      .range(
        offset,
        offset + PAGE_SIZE - 1
      );

    if (error) {
      throw new Error(
        `waste_reports: ${error.message}`
      );
    }

    const reports =
      (data ?? []) as ReportRow[];

    if (!reports.length) {
      return null;
    }

    const {
      data: images,
      error: imageError,
    } = await supabase
      .from("waste_images")
      .select("report_id")
      .in(
        "report_id",
        reports.map(
          (report) => report.report_id
        )
      )
      .not("storage_path", "is", null);

    if (imageError) {
      throw new Error(
        `waste_images: ${imageError.message}`
      );
    }

    const withImages = new Set(
      (images ?? []).map(
        (image) => image.report_id
      )
    );

    const found = reports.find(
      (report) =>
        withImages.has(report.report_id)
    );

    if (found) {
      return found;
    }

    if (reports.length < PAGE_SIZE) {
      return null;
    }
  }
}

// ========================================
// FIND ACTUAL STORAGE OBJECT
// ========================================

async function findActualStoragePath(
  storedPath: string
): Promise<string | null> {
  const slash = storedPath.lastIndexOf("/");

  const folder =
    slash >= 0
      ? storedPath.slice(0, slash)
      : "";

  const filename =
    storedPath.slice(slash + 1);

  const stem = filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase();

  if (stem.length < 8) {
    return null;
  }

  for (
    let offset = 0;
    offset < 2000;
    offset += PAGE_SIZE
  ) {
    const { data, error } =
      await supabase.storage
        .from(BUCKET)
        .list(folder, {
          limit: PAGE_SIZE,
          offset,
          sortBy: {
            column: "name",
            order: "asc",
          },
        });

    if (error) {
      console.warn(
        "[WasteTrack] Storage listing failed:",
        error.message
      );

      return null;
    }

    const files = data ?? [];

    const match = files.find(
      (file) =>
        file.id &&
        (
          file.name.toLowerCase() ===
            filename.toLowerCase() ||
          file.name
            .replace(/\.[^.]+$/, "")
            .toLowerCase() === stem
        )
    );

    if (match) {
      return folder
        ? `${folder}/${match.name}`
        : match.name;
    }

    if (files.length < PAGE_SIZE) {
      break;
    }
  }

  return null;
}

// ========================================
// BEFORE COLLECTION IMAGE
// ========================================

async function loadBeforePhoto(
  reportId: string | null
): Promise<Photo> {
  if (!reportId) {
    return {
      url: "",
      path: "",
      message:
        "No waste report image is linked to this schedule.",
    };
  }

  const { data, error } = await supabase
    .from("waste_images")
    .select(
      "image_id,report_id,storage_bucket,storage_path,created_at"
    )
    .eq("report_id", reportId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    return {
      url: "",
      path: "",
      message: `waste_images: ${error.message}`,
    };
  }

  const images =
    (data ?? []) as ImageRow[];

  if (!images.length) {
    return {
      url: "",
      path: "",
      message:
        "No photo is registered for this waste report.",
    };
  }

  let lastPath = "";
  let reason = "No valid image file path.";

  for (const image of images) {
    const path = normalizeStoragePath(
      image.storage_path
    );

    if (!path) {
      continue;
    }

    lastPath = path;

    // Create a signed URL using waste-images.

    const {
      data: signed,
      error: signError,
    } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);

    if (
      !signError &&
      signed?.signedUrl
    ) {
      return {
        url: signed.signedUrl,
        path,
        message: "",
      };
    }

    reason =
      signError?.message ??
      "Could not access photo.";

    // Handle filename or extension differences.

    if (/not found|not exist/i.test(reason)) {
      const foundPath =
        await findActualStoragePath(path);

      if (foundPath && foundPath !== path) {
        const {
          data: corrected,
          error: fixError,
        } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(
            foundPath,
            3600
          );

        if (
          !fixError &&
          corrected?.signedUrl
        ) {
          return {
            url: corrected.signedUrl,
            path: foundPath,
            message: "",
          };
        }

        reason =
          fixError?.message ??
          reason;
      }
    }
  }

  return {
    url: "",
    path: lastPath,
    message:
      `Photo unavailable in ${BUCKET} ` +
      `at "${lastPath}" (${reason}).`,
  };
}

// ========================================
// COUNT RESIDENT REPORTERS
// ========================================

async function countResidents(
  siteId: string
): Promise<number | null> {
  try {
    const unique =
      new Set<string>();

    for (
      let offset = 0;
      ;
      offset += 500
    ) {
      const { data, error } = await supabase
        .from("waste_reports")
        .select("user_id")
        .eq("site_id", siteId)
        .range(
          offset,
          offset + 499
        );

      if (error) {
        throw error;
      }

      const page =
        (data ?? []) as {
          user_id: string;
        }[];

      page.forEach(
        (record) =>
          unique.add(record.user_id)
      );

      if (page.length < 500) {
        break;
      }
    }

    return unique.size;
  } catch (error) {
    console.warn(
      "[WasteTrack] Resident count:",
      errorText(error)
    );

    return null;
  }
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function WasteCollection() {
  const {
    scheduleId: routeId,
  } = useParams<{
    scheduleId: string;
  }>();

  const location = useLocation();
  const navigate = useNavigate();

  const routeState =
    location.state as RouteState | null;

  const scheduleId =
    routeId ||
    routeState?.scheduleId ||
    routeState?.schedule?.id;

  // ========================================
  // STATES
  // ========================================

  const [
    details,
    setDetails,
  ] = useState<Details | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    imageFailed,
    setImageFailed,
  ] = useState(false);

  const [
    refresh,
    setRefresh,
  ] = useState(0);

  const [
    distance,
    setDistance,
  ] = useState<Distance>({
    loading: false,
    label: "Getting location...",
    km: null,
    error: false,
  });

  const geoRequestId = useRef(0);

  const reload = useCallback(
    () => {
      setRefresh(
        (value) => value + 1
      );
    },
    []
  );

  // ========================================
  // AUTOMATIC DISTANCE CALCULATION
  // ========================================

  const calculateDistance = useCallback(
    (
      latitude: number,
      longitude: number
    ) => {
      const requestId =
        ++geoRequestId.current;

      if (
        !validCoordinates(
          latitude,
          longitude
        )
      ) {
        setDistance({
          loading: false,
          label: "Site location unavailable",
          km: null,
          error: true,
        });

        return;
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.geolocation
      ) {
        setDistance({
          loading: false,
          label: "Location not supported",
          km: null,
          error: true,
        });

        return;
      }

      if (!window.isSecureContext) {
        setDistance({
          loading: false,
          label: "Requires HTTPS or localhost",
          km: null,
          error: true,
        });

        return;
      }

      setDistance({
        loading: true,
        label: "Getting location...",
        km: null,
        error: false,
      });

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (
            requestId !== geoRequestId.current
          ) {
            return;
          }

          const km = kilometersBetween(
            position.coords.latitude,
            position.coords.longitude,
            latitude,
            longitude
          );

          const label =
            km < 1
              ? `${Math.round(km * 1000)} m`
              : `${km.toFixed(2)} km`;

          setDistance({
            loading: false,
            label,
            km,
            error: false,
          });
        },

        (geoError) => {
          if (
            requestId !== geoRequestId.current
          ) {
            return;
          }

          const label =
            geoError.code === 1
              ? "Location permission denied"
              : geoError.code === 3
                ? "Location timed out"
                : "Location unavailable";

          setDistance({
            loading: false,
            label,
            km: null,
            error: true,
          });
        },

        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        }
      );
    },
    []
  );

  // ========================================
  // CALCULATE DISTANCE ON PAGE LOAD
  // ========================================

  useEffect(() => {
    if (!details) {
      return;
    }

    calculateDistance(
      details.site.latitude,
      details.site.longitude
    );

    return () => {
      geoRequestId.current += 1;
    };
  }, [
    details,
    calculateDistance,
  ]);

  // ========================================
  // FETCH SUPABASE DATA
  // ========================================

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setDetails(null);
    setImageFailed(false);

    async function load() {
      try {
        if (!scheduleId) {
          throw new Error(
            "No collection schedule selected."
          );
        }

        // Get authenticated collector.

        const {
          data: auth,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!auth.user) {
          throw new Error(
            "Please sign in as a collector."
          );
        }

        // Check collector account.

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
            auth.user.id
          )
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (
          !profile ||
          profile.role !== "collector" ||
          !profile.is_active
        ) {
          throw new Error(
            "An active collector account is required."
          );
        }

        // Load selected schedule.

        const {
          data: scheduleData,
          error: scheduleError,
        } = await supabase
          .from("schedules")
          .select(
            "schedule_id,site_id,assigned_collector_id,source_report_id,date,collection_time,collection_type,status"
          )
          .eq(
            "schedule_id",
            scheduleId
          )
          .maybeSingle();

        if (scheduleError) {
          throw new Error(
            `schedules: ${scheduleError.message}`
          );
        }

        if (!scheduleData) {
          throw new Error(
            "Schedule not found."
          );
        }

        const schedule =
          scheduleData as ScheduleRow;

        // Load disposal site.

        const {
          data: siteData,
          error: siteError,
        } = await supabase
          .from("disposal_sites")
          .select(
            "site_id,site_name,location,latitude,longitude,site_image,qr_code,assigned_collector"
          )
          .eq(
            "site_id",
            schedule.site_id
          )
          .maybeSingle();

        if (siteError) {
          throw new Error(
            `disposal_sites: ${siteError.message}`
          );
        }

        if (!siteData) {
          throw new Error(
            "Disposal site not found."
          );
        }

        const site =
          siteData as SiteRow;

        // Verify assigned collector.

        const assigned =
          schedule.assigned_collector_id ??
          site.assigned_collector;

        if (
          assigned !== auth.user.id
        ) {
          throw new Error(
            "This collection is not assigned to your account."
          );
        }

        // Check collection status.

        const {
          data: collection,
          error: collectionError,
        } = await supabase
          .from("collections")
          .select("collection_status")
          .eq(
            "schedule_id",
            scheduleId
          )
          .maybeSingle();

        if (collectionError) {
          throw new Error(
            `collections: ${collectionError.message}`
          );
        }

        // Completed collections go to ScheduleDetails.

        if (
          collection?.collection_status ===
            "Collected" ||
          schedule.status === "Collected"
        ) {
          if (active) {
            navigate(
              `/collector/schedule-details/${scheduleId}`,
              {
                replace: true,
              }
            );
          }

          return;
        }

        if (
          schedule.status === "Cancelled"
        ) {
          throw new Error(
            "This collection was cancelled."
          );
        }

        // Fetch report, photo and resident count.

        const report =
          await findLinkedReport(
            schedule
          );

        const [
          photo,
          residentCount,
        ] = await Promise.all([
          loadBeforePhoto(
            report?.report_id ?? null
          ),

          countResidents(
            site.site_id
          ),
        ]);

        if (active) {
          setDetails({
            schedule,
            site,
            report,
            photo,
            residentCount,
          });
        }
      } catch (failure) {
        if (active) {
          console.error(
            "[WasteTrack] WasteCollection:",
            failure
          );

          setError(
            errorText(failure)
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [
    scheduleId,
    navigate,
    refresh,
  ]);

  // ========================================
  // NAVIGATION DATA
  // ========================================

  const site = details?.site;
  const schedule = details?.schedule;

  const backPath = schedule
    ? `/collector/calendar/list/${schedule.date}`
    : "/collector/calendar";

  const routeSite =
    site && schedule
      ? {
          id: site.site_id,

          scheduleId:
            schedule.schedule_id,

          name:
            site.site_name,

          image:
            details?.photo.url ?? "",

          reportImage:
            details?.photo.url ?? "",

          address:
            site.location,

          latitude:
            site.latitude,

          longitude:
            site.longitude,

          qrCode:
            site.qr_code ?? "",

          residents:
            details?.residentCount ??
            undefined,

          wasteLevel:
            details?.report
              ?.cnn_detection_level ??
            null,

          collectionDate:
            schedule.date,

          collectionTime:
            formatTime(
              schedule.collection_time
            ),

          distanceKm:
            distance.km,
        }
      : null;

  // ========================================
  // RESPONSIVE UI
  // ========================================

  return (
    <main
      className="
        flex h-[calc(100dvh-5rem)]
        min-h-[360px] w-full
        flex-col overflow-hidden
        bg-white text-neutral-900
      "
    >
      <div
        className="
          mx-auto flex min-h-0
          w-full max-w-[430px]
          flex-1 flex-col
          px-2.5 pb-2 pt-2.5
          min-[360px]:px-3
          min-[360px]:pt-4
          sm:px-4 sm:pt-6
        "
      >
        {/* ========================================
            RED HEADER
        ======================================== */}

        <header className="shrink-0 rounded-t-lg bg-[#c90000] px-4 pb-4 pt-3">
  <h1 className="text-[15px] font-extrabold leading-5 text-white min-[360px]:text-base">
    Waste Collection
  </h1>
</header>

        {/* ========================================
            CONTENT PANEL
        ======================================== */}

        <div
          className="
            relative -mt-2 flex
            min-h-0 flex-1 flex-col
            rounded-t-xl
            border-x border-neutral-200
            bg-white
          "
        >
          {loading ? (
            <p
              role="status"
              className="
                p-5 text-center
                text-sm text-neutral-600
              "
            >
              Loading waste collection...
            </p>
          ) : error ? (
            <div
              role="alert"
              className="
                m-3 rounded-lg
                border border-red-200
                bg-red-50 p-4
                text-[13px] leading-relaxed
                text-red-700
              "
            >
              <p>{error}</p>

              <button
                type="button"
                onClick={reload}
                className="
                  mt-3 min-h-11
                  font-bold underline
                "
              >
                Try again
              </button>
            </div>
          ) : details &&
            site &&
            schedule ? (
            <>
              {/* ========================================
                  SCROLLABLE CONTENT
              ======================================== */}

              <div
                className="
                  min-h-0 flex-1
                  space-y-3 overflow-y-auto
                  overscroll-contain
                  px-2.5 pb-4 pt-3
                  min-[360px]:space-y-4
                  min-[360px]:px-3
                  min-[360px]:pt-4
                "
              >
                {/* ========================================
                    SITE SUMMARY
                ======================================== */}

                <section
                  className="
                    flex items-center gap-2.5
                    rounded-xl border
                    border-[#cfc5c7]
                    bg-[#fff6f7]
                    px-2.5 py-2.5
                    shadow-[0_3px_2px_rgba(0,0,0,0.16)]
                    min-[360px]:gap-3
                    min-[360px]:px-3
                    min-[360px]:py-3
                  "
                >
                  <span
                    aria-hidden="true"
                    className="
                      grid h-11 w-11 shrink-0
                      place-items-center rounded-lg
                      bg-[#ffa7b1]
                      text-[#ff1938]
                      min-[360px]:h-12
                      min-[360px]:w-12
                    "
                  >
                    <Trash2
                      size={29}
                      strokeWidth={2.3}
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    <h2
                      className="
                        break-words text-[14px]
                        font-extrabold
                        leading-5 text-black
                        min-[360px]:text-base
                      "
                    >
                      {site.site_name}
                    </h2>

                    <p
                      className="
                        mt-0.5 flex items-start
                        gap-1 text-[12px]
                        leading-4 text-neutral-800
                        min-[360px]:text-[13px]
                      "
                    >
                      <MapPin
                        size={13}
                        className="
                          mt-0.5 shrink-0
                        "
                      />

                      <span className="break-words">
                        {site.location}
                      </span>
                    </p>

                    <p
                      className="
                        mt-1 break-all pl-[17px]
                        text-[12px] leading-4
                        text-neutral-700
                        min-[360px]:text-[13px]
                      "
                    >
                      {site.qr_code ||
                        "QR code unavailable"}
                    </p>
                  </div>
                </section>

                {/* ========================================
                    SITE INFORMATION
                ======================================== */}

                <section
                  className="
                    overflow-hidden rounded-lg
                    border border-[#d0d0d0]
                    bg-white
                  "
                >
                  <h2
                    className="
                      px-2.5 pb-1 pt-2.5
                      text-[13px] font-bold
                      text-[#c90000]
                      min-[360px]:px-3
                      min-[360px]:text-sm
                    "
                  >
                    Site Information
                  </h2>

                  <div
                    className="
                      px-2 pb-1
                      min-[360px]:px-3
                    "
                  >
                    {/* COLLECTION DATE */}

                    <InformationRow
                      icon={
                        <CalendarDays size={15} />
                      }
                      label="Collection Date"
                      value={formatDate(
                        schedule.date
                      )}
                    />

                    {/* COLLECTION TIME */}

                    <InformationRow
                      icon={
                        <Clock3 size={15} />
                      }
                      label="Time"
                      value={formatTime(
                        schedule.collection_time
                      )}
                    />

                    {/* RESIDENT COUNT */}

                    <InformationRow
                      icon={
                        <UsersRound size={15} />
                      }
                      label="Reported By"
                      value={
                        details.residentCount == null
                          ? "Unavailable"
                          : `${details.residentCount} resident(s)`
                      }
                    />

                    {/* ====================================
                        DISTANCE
                        NO REFRESH LOCATION ICON
                    ==================================== */}

                    <InformationRow
                      icon={
                        <Footprints size={15} />
                      }
                      label="Distance"
                      value={distance.label}
                    />
                  </div>

                  {/* LOCATION PERMISSION ERROR */}

                  {distance.error && (
                    <p
                      className="
                        px-3 pb-2
                        text-[12px] leading-4
                        text-neutral-600
                      "
                    >
                      Allow location access in your
                      browser and reopen this page.
                      Use HTTPS or localhost.
                    </p>
                  )}
                </section>

                {/* ========================================
                    BEFORE COLLECTION IMAGE
                ======================================== */}

                <section
                  className="
                    rounded-lg border
                    border-[#d0d0d0]
                    bg-white
                    px-2.5 pb-3 pt-2.5
                    min-[360px]:px-3
                    min-[360px]:pb-4
                    min-[360px]:pt-3
                  "
                >
                  <div
                    className="
                      flex items-center
                      justify-between gap-2
                    "
                  >
                    <h2
                      className="
                        text-[13px] font-bold
                        text-[#c90000]
                        min-[360px]:text-sm
                      "
                    >
                      Before Collection
                    </h2>

                    {/* RETRY PHOTO IF UNAVAILABLE */}

                    {(
                      !details.photo.url ||
                      imageFailed
                    ) && (
                      <button
                        type="button"
                        onClick={reload}
                        className="
                          flex min-h-9
                          items-center gap-1
                          text-[12px] font-bold
                          text-[#c90000]
                          hover:underline
                        "
                      >
                        <RefreshCw size={14} />
                        Retry photo
                      </button>
                    )}
                  </div>

                  <div
                    className="
                      mt-2.5
                      min-[360px]:mt-3
                    "
                  >
                    {details.photo.url &&
                    !imageFailed ? (
                      <div
                        className="
                          h-[185px] w-full
                          overflow-hidden
                          rounded-lg
                          bg-neutral-100
                          min-[320px]:h-[220px]
                          min-[360px]:h-[250px]
                          sm:h-[270px]
                        "
                      >
                        <img
                          src={details.photo.url}
                          alt={`${site.site_name} before collection`}
                          loading="eager"
                          onError={() =>
                            setImageFailed(true)
                          }
                          className="
                            h-full w-full
                            object-cover
                            object-center
                          "
                        />
                      </div>
                    ) : (
                      <div
                        role="status"
                        className="
                          flex min-h-[185px]
                          w-full flex-col
                          items-center
                          justify-center gap-2
                          rounded-lg bg-neutral-100
                          p-3 text-center
                          text-[12px]
                          leading-relaxed
                          text-neutral-600
                          min-[320px]:min-h-[220px]
                          min-[360px]:min-h-[250px]
                        "
                      >
                        <ImageOff
                          size={25}
                          aria-hidden="true"
                        />

                        <p className="max-w-full break-words">
                          {imageFailed
                            ? "The image could not be displayed. Check the Storage object and permissions."
                            : details.photo.message ||
                              "Before-collection photo unavailable."}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* ========================================
                  START COLLECTION BUTTON
              ======================================== */}

              <footer
                className="
                  shrink-0 border-t
                  border-neutral-100
                  bg-white px-3
                  pb-[max(14px,env(safe-area-inset-bottom))]
                  pt-3
                  min-[360px]:pb-5
                  min-[360px]:pt-4
                "
              >
                <Link
                  to="/collector/route"
                  state={{
                    scheduleId:
                      schedule.schedule_id,

                    siteId:
                      site.site_id,

                    site:
                      routeSite,

                    collection:
                      routeSite,
                  }}
                  className="
                    mx-auto flex min-h-11
                    w-[72%] min-w-[145px]
                    max-w-[260px]
                    items-center justify-center
                    rounded-lg bg-[#c90000]
                    px-3 text-[13px]
                    font-extrabold text-white
                    hover:bg-red-800
                    focus-visible:outline
                    focus-visible:outline-2
                    focus-visible:outline-offset-2
                    focus-visible:outline-red-600
                    min-[360px]:min-h-12
                    min-[360px]:text-sm
                  "
                >
                  Start Collection
                </Link>
              </footer>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

// ========================================
// RESPONSIVE INFORMATION ROW
// ========================================

type InformationRowProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function InformationRow({
  icon,
  label,
  value,
}: InformationRowProps) {
  return (
    <div
      className="
        grid
        grid-cols-[minmax(0,0.92fr)_minmax(0,1.12fr)]
        items-center gap-1.5
        border-b border-[#eee3d8]
        px-0.5 py-2.5
        text-[12px] leading-[17px]
        last:border-b-0
        min-[360px]:gap-2
        min-[360px]:py-3
        min-[360px]:text-[13px]
      "
    >
      <span
        className="
          flex min-w-0
          items-center gap-1.5
          font-medium text-neutral-700
        "
      >
        <span className="shrink-0 text-neutral-700">
          {icon}
        </span>

        <span className="min-w-0 break-words">
          {label}
        </span>
      </span>

      <span
        className="
          flex min-w-0
          items-center justify-end
          gap-0.5
        "
      >
        <span
          className="
            min-w-0 break-words
            text-right font-semibold
            text-neutral-900
          "
        >
          {value}
        </span>
      </span>
    </div>
  );
}
