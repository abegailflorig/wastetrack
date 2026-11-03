
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";

import { supabase } from "../../lib/supabase";

// ==========================================
// TYPES
// ==========================================

type WasteLevel =
  | "Full"
  | "Near Full"
  | "Empty"
  | "Not analyzed";

type WasteReport = {
  report_id: string;
  user_id: string;
  site_id: string | null;
  date_uploaded: string;
  cnn_detection_level: string | null;
  waste_type: string | null;
  address: string | null;
  site_description: string | null;
};

type DisposalSite = {
  site_id: string;
  site_name: string;
  location: string | null;
};

type WasteImage = {
  image_id: string;
  src: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string;
};

type Collector = {
  user_id: string;
  full_name: string | null;
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

type Details = {
  report: WasteReport;
  siteName: string;
  locationName: string;
  reporter: string;
  reportPhotoUrl: string;
  currentStatus: string;
  activeSchedule: Schedule | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WASTE_IMAGE_BUCKET = "waste-images";

const DAYS = [
  "Su",
  "Mo",
  "Tu",
  "We",
  "Th",
  "Fr",
  "Sa",
];

// ==========================================
// DATE HELPERS
// ==========================================

function phDateTime(offsetMinutes = 60) {
  const date = new Date(
    Date.now() + offsetMinutes * 60000
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
  ).formatToParts(date);

  const getPart = (type: string) =>
    parts.find(
      (part) => part.type === type
    )?.value ?? "";

  return {
    date: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
    time: `${getPart("hour")}:${getPart("minute")}`,
  };
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
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const minutes = Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) / 60000
    )
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);

  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function monthFromDate(value: string) {
  const [year, month] = value.split("-").map(Number);

  return new Date(year, month - 1, 1);
}

// ==========================================
// FORMATTERS
// ==========================================

function levelOf(
  value: string | null
): WasteLevel {
  const level = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ");

  if (
    level === "FULL" ||
    level === "HIGH"
  ) {
    return "Full";
  }

  if (
    level === "NEAR FULL" ||
    level === "MEDIUM" ||
    level === "HALF FULL"
  ) {
    return "Near Full";
  }

  if (
    level === "EMPTY" ||
    level === "LOW"
  ) {
    return "Empty";
  }

  return "Not analyzed";
}

function formatWasteTypes(value: string | null) {
  if (!value?.trim()) {
    return ["Not specified"];
  }

  return value
    .split(/[,;]/)
    .map((type) => type.trim())
    .filter(Boolean);
}

function getInitials(value: string) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "AD";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}

// ==========================================
// LOAD REPORT WASTE PHOTO
// ==========================================

// Source: public.waste_images
// Only uses the photo submitted by the resident.

async function getReportWastePhoto(
  image: WasteImage | null
): Promise<string> {
  if (!image) {
    return "";
  }

  const bucket =
    image.storage_bucket ||
    WASTE_IMAGE_BUCKET;

  // If the photo is already a full URL.
  if (
    image.src &&
    /^https?:\/\//i.test(image.src)
  ) {
    return image.src;
  }

  const rawPath =
    image.storage_path ||
    image.src;

  if (!rawPath?.trim()) {
    return "";
  }

  const path = rawPath.startsWith(
    `${bucket}/`
  )
    ? rawPath.slice(bucket.length + 1)
    : rawPath;

  const {
    data,
    error,
  } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);

  if (error) {
    throw new Error(
      `Unable to load Report Waste photo: ${error.message}`
    );
  }

  return data?.signedUrl ?? "";
}

// ==========================================
// CALENDAR
// ==========================================

function MiniCalendar({
  date,
  month,
  setMonth,
  onSelect,
  disabled,
}: {
  date: string;
  month: Date;
  setMonth: (value: Date) => void;
  onSelect: (value: string) => void;
  disabled: boolean;
}) {
  const year = month.getFullYear();
  const monthNumber = month.getMonth();

  const firstDay = new Date(
    year,
    monthNumber,
    1
  ).getDay();

  const totalDays = new Date(
    year,
    monthNumber + 1,
    0
  ).getDate();

  const cells: Array<number | null> = [
    ...Array<number | null>(
      firstDay
    ).fill(null),

    ...Array.from(
      { length: totalDays },
      (_, index) => index + 1
    ),
  ];

  const monthLabel = month.toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric",
    }
  );

  return (
    <div>
      <div className="wd-cal-head">
        <button
          type="button"
          className="wd-cal-nav"
          aria-label="Previous month"
          disabled={disabled}
          onClick={() =>
            setMonth(
              new Date(
                year,
                monthNumber - 1,
                1
              )
            )
          }
        >
          ‹
        </button>

        <span className="wd-cal-month">
          {monthLabel}
        </span>

        <button
          type="button"
          className="wd-cal-nav"
          aria-label="Next month"
          disabled={disabled}
          onClick={() =>
            setMonth(
              new Date(
                year,
                monthNumber + 1,
                1
              )
            )
          }
        >
          ›
        </button>
      </div>

      <div className="wd-cal-grid">
        {DAYS.map((day) => (
          <div
            key={day}
            className="wd-cal-dow"
          >
            {day}
          </div>
        ))}

        {cells.map((day, index) => {
          if (day === null) {
            return (
              <span
                key={`empty-${index}`}
                className="wd-cal-day muted"
              />
            );
          }

          const value =
            `${year}-${String(
              monthNumber + 1
            ).padStart(2, "0")}-${String(
              day
            ).padStart(2, "0")}`;

          return (
            <button
              key={value}
              type="button"
              aria-label={value}
              aria-pressed={date === value}
              disabled={disabled}
              className={`wd-cal-day${
                date === value
                  ? " selected"
                  : ""
              }`}
              onClick={() =>
                onSelect(value)
              }
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// RESPONSIVE CSS
// ==========================================

const css = `
.wd-root,
.wd-root * {
  box-sizing: border-box;
}

.wd-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --olive: #a5b26b;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --ink: #1b1b1b;

  min-height: 100dvh;
  width: 100%;
  background: #fff;
  color: var(--ink);

  font-family:
    "Fira Sans",
    "Segoe UI",
    Roboto,
    Arial,
    sans-serif;
}

/* HEADER */

.wd-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;

  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
}

.wd-back {
  padding: 0;
  margin-bottom: 6px;
  border: none;
  background: transparent;
  color: var(--red-bright);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.wd-back:hover {
  text-decoration: underline;
}

.wd-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.wd-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: #666;
}

.wd-avatar {
  width: 38px;
  height: 30px;
  flex-shrink: 0;

  display: grid;
  place-items: center;

  border: none;
  border-radius: 8px;
  background: #f8ced4;
  color: var(--red-bright);

  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

/* MAIN TWO-COLUMN LAYOUT */

.wd-body {
  display: grid;
  grid-template-columns:
    minmax(0, 1.3fr)
    minmax(0, 1fr);

  align-items: start;
  gap: 16px;
  padding: 18px 20px 28px;
}

.wd-left {
  min-width: 0;
  width: 100%;
}

/* ======================================== */
/* REPORT WASTE PHOTO - NO CROPPING */
/* ======================================== */

.wd-photo {
  width: 100%;

  /* Remove fixed sizing */
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  aspect-ratio: auto !important;

  display: block;

  background: var(--cream);
  border: 1px solid var(--cream-line);
  border-radius: 8px;
  overflow: hidden;

  margin-bottom: 14px;
}

/*
  IMPORTANT:
  width: 100% + height: auto allows the
  entire original photo to remain visible.

  Do NOT use object-fit: cover because it
  cuts off the bottom of portrait photos.
*/

.wd-photo img {
  display: block;

  width: 100% !important;
  max-width: 100% !important;

  height: auto !important;
  max-height: none !important;

  aspect-ratio: auto !important;

  object-fit: contain !important;
  object-position: center !important;
}

.wd-photo-placeholder {
  display: block;
  padding: 32px 16px;
  font-size: 12px;
  color: #777;
  text-align: center;
}

/* CNN RESULT */

.wd-result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.wd-result-label {
  font-size: 13px;
  font-weight: 700;
}

.wd-result-badge {
  display: inline-block;
  padding: 5px 13px;
  border-radius: 6px;

  color: white;
  background: var(--red-bright);

  font-size: 11px;
  font-weight: 700;
}

.wd-result-badge.near {
  background: #d89616;
}

.wd-result-badge.empty {
  background: #638b37;
}

.wd-result-badge.unknown {
  background: #777;
}

/* WASTE TYPE / SITE DETAILS */

.wd-block {
  margin-bottom: 18px;
}

.wd-block-title {
  margin: 0 0 8px;

  font-size: 11px;
  font-weight: 700;

  color: #666;
  letter-spacing: 0.02em;
}

.wd-chip {
  display: inline-block;

  padding: 4px 12px;
  margin: 0 6px 6px 0;

  border-radius: 6px;
  border: 1px solid #efc77c;

  background: #fbe2b0;
  color: #333;

  font-size: 11px;
  font-weight: 700;
}

.wd-fact {
  display: flex;
  gap: 8px;
  margin-bottom: 9px;
  font-size: 13px;
}

.wd-fact-label {
  min-width: 130px;
  color: #666;
}

.wd-fact-value {
  font-weight: 600;
  overflow-wrap: anywhere;
}

/* RIGHT PANEL */

.wd-side-panel {
  min-width: 0;
  padding: 14px;

  background: var(--cream);
  border: 1px solid var(--cream-line);
  border-radius: 8px;
}

/* CALENDAR */

.wd-cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.wd-cal-nav {
  padding: 2px 8px;
  border: none;
  background: transparent;
  font-size: 21px;
  cursor: pointer;
}

.wd-cal-nav:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.wd-cal-month {
  font-size: 13px;
  font-weight: 700;
}

.wd-cal-grid {
  display: grid;
  grid-template-columns:
    repeat(7, minmax(0, 1fr));

  gap: 3px;
  text-align: center;
}

.wd-cal-dow {
  padding-bottom: 4px;
  color: #777;
  font-size: 10px;
  font-weight: 700;
}

.wd-cal-day {
  padding: 7px 0;
  border: none;
  border-radius: 5px;

  background: transparent;
  color: var(--ink);

  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.wd-cal-day.selected {
  background: var(--red-bright);
  color: white;
  font-weight: 700;
}

.wd-cal-day:disabled {
  cursor: default;
}

/* FORM */

.wd-datetime {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.wd-field {
  flex: 1;
  min-width: 0;
}

.wd-field label {
  display: block;
  margin-bottom: 5px;

  color: #666;
  font-size: 11px;
  font-weight: 600;
}

.wd-field input,
.wd-field select {
  display: block;
  width: 100%;
  min-width: 0;

  padding: 8px;
  border: 1px solid var(--cream-line);
  border-radius: 5px;

  background: white;
  font: inherit;
  font-size: 12px;
}

/* APPROVE BUTTON */

.wd-approve {
  width: 100%;
  margin-top: 16px;
  padding: 11px;

  border: none;
  border-radius: 6px;

  background: var(--red);
  color: #fff;

  font: inherit;
  font-size: 12px;
  font-weight: 700;

  cursor: pointer;
}

.wd-approve:hover:not(:disabled) {
  background: #8f1619;
}

.wd-approve:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* MESSAGES */

.wd-error {
  margin: 12px 0;
  color: #a81b1e;
  font-size: 12px;
}

.wd-confirm {
  margin-top: 12px;
  color: #2f6b2f;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
}

.wd-note {
  margin-top: 10px;
  color: #666;
  font-size: 11px;
}

/* TABLET AND MOBILE */

@media (max-width: 760px) {
  .wd-head {
    padding: 14px;
  }

  .wd-body {
    grid-template-columns: minmax(0, 1fr);
    padding: 14px;
  }

  .wd-photo {
    width: 100%;

    /* Keep original photo height */
    height: auto !important;
    aspect-ratio: auto !important;
    min-height: 0 !important;
  }

  .wd-photo img {
    width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
  }
}

@media (max-width: 380px) {
  .wd-title {
    font-size: 18px;
  }

  .wd-datetime {
    flex-direction: column;
  }

  .wd-fact {
    flex-direction: column;
    gap: 2px;
  }
}
`;

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function WasteStatusDetails() {
  const navigate = useNavigate();

  const { siteId } =
    useParams<{ siteId: string }>();

  const [searchParams] = useSearchParams();

  const targetId =
    searchParams.get("reportId") ||
    siteId ||
    "";

  const initial = useMemo(
    () => phDateTime(),
    []
  );

  const [date, setDate] = useState(
    initial.date
  );

  const [time, setTime] = useState(
    initial.time
  );

  const [month, setMonth] = useState(
    () => monthFromDate(initial.date)
  );

  const [
    selectedCollectorId,
    setSelectedCollectorId,
  ] = useState("");

  const [collectors, setCollectors] =
    useState<Collector[]>([]);

  const [adminName, setAdminName] =
    useState("Administrator");

  const [details, setDetails] =
    useState<Details | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [photoError, setPhotoError] =
    useState("");

  const [imageFailed, setImageFailed] =
    useState(false);

  const [saveError, setSaveError] =
    useState("");

  const [confirmation, setConfirmation] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  // ========================================
  // LOAD DATA FROM SUPABASE
  // ========================================

  const fetchDetails = useCallback(
    async (isActive: () => boolean) => {
      setLoading(true);
      setError("");
      setPhotoError("");
      setImageFailed(false);

      try {
        if (!UUID_RE.test(targetId)) {
          throw new Error(
            "A valid report or disposal-site UUID is required."
          );
        }

        // STEP 1: AUTHENTICATE USER
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

        // STEP 2: VERIFY ADMIN
        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("users")
          .select("full_name,role,is_active")
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
          profile.is_active === false
        ) {
          throw new Error(
            "Administrator access is required."
          );
        }

        // STEP 3: FETCH WASTE REPORT
        const reportColumns = `
          report_id,
          user_id,
          site_id,
          date_uploaded,
          cnn_detection_level,
          waste_type,
          address,
          site_description
        `;

        const {
          data: directReport,
          error: directError,
        } = await supabase
          .from("waste_reports")
          .select(reportColumns)
          .eq("report_id", targetId)
          .maybeSingle();

        if (directError) {
          throw directError;
        }

        let foundReport = directReport;

        // If the URL contains a site UUID,
        // retrieve the latest report.
        if (!foundReport) {
          const {
            data: latestReport,
            error: latestError,
          } = await supabase
            .from("waste_reports")
            .select(reportColumns)
            .eq("site_id", targetId)
            .order("date_uploaded", {
              ascending: false,
            })
            .limit(1)
            .maybeSingle();

          if (latestError) {
            throw latestError;
          }

          foundReport = latestReport;
        }

        if (!foundReport) {
          throw new Error(
            "No waste report was found."
          );
        }

        const report =
          foundReport as WasteReport;

        // STEP 4: FETCH RELATED RECORDS
        const [
          siteResult,
          reporterResult,
          imageResult,
          scheduleResult,
          statusResult,
          collectorResult,
        ] = await Promise.all([
          report.site_id
            ? supabase
                .from("disposal_sites")
                .select(
                  "site_id,site_name,location"
                )
                .eq(
                  "site_id",
                  report.site_id
                )
                .maybeSingle()
            : Promise.resolve({
                data: null,
                error: null,
              }),

          supabase
            .from("users")
            .select("full_name")
            .eq(
              "user_id",
              report.user_id
            )
            .maybeSingle(),

          // Only the original Report Waste photo.
          supabase
            .from("waste_images")
            .select(`
              image_id,
              src,
              storage_bucket,
              storage_path,
              created_at
            `)
            .eq(
              "report_id",
              report.report_id
            )
            .order("created_at", {
              ascending: false,
            })
            .limit(1)
            .maybeSingle(),

          supabase
            .from("schedules")
            .select(`
              schedule_id,
              source_report_id,
              assigned_collector_id,
              date,
              collection_time,
              status,
              created_at
            `)
            .eq(
              "source_report_id",
              report.report_id
            )
            .order("created_at", {
              ascending: false,
            }),

          supabase
            .from("status")
            .select("status,created_at")
            .eq(
              "report_id",
              report.report_id
            )
            .order("created_at", {
              ascending: false,
            })
            .limit(1)
            .maybeSingle(),

          supabase
            .from("users")
            .select("user_id,full_name")
            .eq("role", "collector")
            .eq("is_active", true)
            .order("full_name", {
              ascending: true,
            }),
        ]);

        for (const result of [
          siteResult,
          reporterResult,
          imageResult,
          scheduleResult,
          statusResult,
          collectorResult,
        ]) {
          if (result.error) {
            throw result.error;
          }
        }

        const site =
          siteResult.data as DisposalSite | null;

        const schedules =
          (scheduleResult.data ?? []) as Schedule[];

        const activeSchedule =
          schedules.find(
            (schedule) =>
              schedule.status.toLowerCase() !==
              "cancelled"
          ) ?? null;

        // STEP 5: GET ORIGINAL IMAGE
        let reportPhotoUrl = "";
        let imageErrorMessage = "";

        try {
          reportPhotoUrl =
            await getReportWastePhoto(
              imageResult.data as WasteImage | null
            );

          if (!reportPhotoUrl) {
            imageErrorMessage =
              "Report Waste photo unavailable.";
          }
        } catch (cause) {
          imageErrorMessage =
            cause instanceof Error
              ? cause.message
              : "Unable to load the photo.";
        }

        if (!isActive()) {
          return;
        }

        // STEP 6: DISPLAY DATA
        setAdminName(
          profile.full_name ||
          "Administrator"
        );

        setCollectors(
          (collectorResult.data ?? []) as Collector[]
        );

        setDetails({
          report,

          siteName:
            site?.site_name ||
            report.site_description ||
            "Unregistered site",

          locationName:
            site?.location ||
            report.address ||
            "Not provided",

          reporter:
            reporterResult.data?.full_name ||
            "Unknown reporter",

          reportPhotoUrl,

          currentStatus:
            statusResult.data?.status ||
            "Not set",

          activeSchedule,
        });

        setPhotoError(imageErrorMessage);

        if (activeSchedule) {
          setDate(activeSchedule.date);

          setTime(
            activeSchedule.collection_time
              ?.slice(0, 5) ||
              "08:00"
          );

          setSelectedCollectorId(
            activeSchedule.assigned_collector_id ||
              ""
          );

          setMonth(
            monthFromDate(
              activeSchedule.date
            )
          );
        } else {
          setSelectedCollectorId("");
        }
      } catch (cause) {
        if (isActive()) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load report."
          );
        }
      } finally {
        if (isActive()) {
          setLoading(false);
        }
      }
    },
    [targetId]
  );

  // ========================================
  // INITIAL LOAD AND REFRESH
  // ========================================

  useEffect(() => {
    let active = true;

    void fetchDetails(() => active);

    return () => {
      active = false;
    };
  }, [fetchDetails, refreshKey]);

  // ========================================
  // COLLECTOR DETAILS
  // ========================================

  const collectorName = details?.activeSchedule
    ? collectors.find(
        (collector) =>
          collector.user_id ===
          details.activeSchedule?.assigned_collector_id
      )?.full_name || "Assigned collector"
    : "Not yet assigned";

  // ========================================
  // UPDATE CALENDAR DATE
  // ========================================

  function changeDate(value: string) {
    setDate(value);
    setSaveError("");
    setConfirmation("");

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setMonth(monthFromDate(value));
    }
  }

  // ========================================
  // APPROVE / ASSIGN COLLECTOR
  // ========================================

  async function handleApprove() {
    setSaveError("");
    setConfirmation("");

    if (
      !details ||
      details.activeSchedule ||
      saving
    ) {
      return;
    }

    if (!details.report.site_id) {
      setSaveError(
        "This report must be linked to a registered disposal site."
      );
      return;
    }

    if (!selectedCollectorId) {
      setSaveError(
        "Select a collector before approving."
      );
      return;
    }

    if (!date || !time) {
      setSaveError(
        "Choose a collection date and time."
      );
      return;
    }

    const timestamp = new Date(
      `${date}T${time}:00+08:00`
    ).getTime();

    if (
      !Number.isFinite(timestamp) ||
      timestamp <= Date.now()
    ) {
      setSaveError(
        "Choose a future collection date and time."
      );
      return;
    }

    setSaving(true);

    try {
      const {
        error: approvalError,
      } = await supabase.rpc(
        "admin_assign_waste_collector",
        {
          p_report_id:
            details.report.report_id,

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

      setRefreshKey(
        (value) => value + 1
      );
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not save the assignment."
      );
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // CNN RESULT
  // ========================================

  const level = levelOf(
    details?.report.cnn_detection_level ??
      null
  );

  const badgeClass =
    level === "Near Full"
      ? "near"
      : level === "Empty"
        ? "empty"
        : level === "Not analyzed"
          ? "unknown"
          : "";

  const alreadyScheduled = Boolean(
    details?.activeSchedule
  );

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="wd-root">
      <style>{css}</style>

      {/* HEADER */}
      <header className="wd-head">
        <div>
          <button
            type="button"
            className="wd-back"
            onClick={() =>
              navigate("/admin/waste-status")
            }
          >
            ← Back to Waste status
          </button>

          <h1 className="wd-title">
            Report review —{" "}
            {details?.siteName ||
              "Waste status"}
          </h1>

          <p className="wd-sub">
            {details
              ? `Submitted by ${details.reporter} · ${formatDateTime(
                  details.report.date_uploaded
                )}`
              : "Loading report details..."}
          </p>
        </div>

        <button
          type="button"
          className="wd-avatar"
          title={adminName}
          aria-label="Manage account"
          onClick={() =>
            navigate("/admin/account")
          }
        >
          {getInitials(adminName)}
        </button>
      </header>

      {/* LOADING */}
      {loading && (
        <p
          role="status"
          style={{ padding: 20 }}
        >
          Loading report details from Supabase...
        </p>
      )}

      {/* LOAD ERROR */}
      {error && (
        <div
          role="alert"
          style={{ padding: 20 }}
        >
          <p className="wd-error">
            {error}
          </p>

          <button
            className="wd-back"
            type="button"
            onClick={() =>
              setRefreshKey(
                (value) => value + 1
              )
            }
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && details && (
        <div className="wd-body">
          {/* ================================= */}
          {/* LEFT COLUMN */}
          {/* ================================= */}

          <section className="wd-left">
            {/* REPORT WASTE IMAGE - NO CROP */}
            <div className="wd-photo">
              {details.reportPhotoUrl &&
              !imageFailed ? (
                <img
                  key={details.reportPhotoUrl}
                  src={details.reportPhotoUrl}
                  alt={`Waste photo submitted for ${details.siteName}`}
                  loading="eager"
                  onError={() =>
                    setImageFailed(true)
                  }
                />
              ) : (
                <span className="wd-photo-placeholder">
                  Report Waste photo unavailable.
                </span>
              )}
            </div>

            {photoError &&
              !details.reportPhotoUrl && (
                <p
                  className="wd-error"
                  role="status"
                >
                  {photoError}
                </p>
              )}

            {/* CNN RESULT */}
            <div className="wd-result-row">
              <span className="wd-result-label">
                CNN result
              </span>

              <span
                className={`wd-result-badge ${badgeClass}`}
              >
                {level}
              </span>
            </div>

            {/* WASTE TYPE */}
            <div className="wd-block">
              <h2 className="wd-block-title">
                TYPES OF WASTE REPORTED
              </h2>

              {formatWasteTypes(
                details.report.waste_type
              ).map((type) => (
                <span
                  key={type}
                  className="wd-chip"
                >
                  {type}
                </span>
              ))}
            </div>

            {/* SITE DETAILS */}
            <div className="wd-block">
              <h2 className="wd-block-title">
                SITE DETAILS
              </h2>

              <div className="wd-fact">
                <span className="wd-fact-label">
                  Location:
                </span>

                <span className="wd-fact-value">
                  {details.locationName}
                </span>
              </div>

              <div className="wd-fact">
                <span className="wd-fact-label">
                  Assigned Collector:
                </span>

                <span className="wd-fact-value">
                  {collectorName}
                </span>
              </div>

              <div className="wd-fact">
                <span className="wd-fact-label">
                  Reported:
                </span>

                <span className="wd-fact-value">
                  {relativeTime(
                    details.report.date_uploaded
                  )}
                </span>
              </div>

              <div className="wd-fact">
                <span className="wd-fact-label">
                  Report Status:
                </span>

                <span className="wd-fact-value">
                  {details.currentStatus}
                </span>
              </div>
            </div>
          </section>

          {/* ================================= */}
          {/* RIGHT COLUMN */}
          {/* ================================= */}

          <aside className="wd-side-panel">
            {/* CALENDAR */}
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

            {/* DATE AND TIME */}
            <div className="wd-datetime">
              <div className="wd-field">
                <label htmlFor="wd-date">
                  Date:
                </label>

                <input
                  id="wd-date"
                  type="date"
                  value={date}
                  onChange={(event) =>
                    changeDate(
                      event.target.value
                    )
                  }
                  disabled={
                    alreadyScheduled ||
                    saving
                  }
                />
              </div>

              <div className="wd-field">
                <label htmlFor="wd-time">
                  Time (PH):
                </label>

                <input
                  id="wd-time"
                  type="time"
                  value={time}
                  onChange={(event) => {
                    setTime(event.target.value);
                    setSaveError("");
                  }}
                  disabled={
                    alreadyScheduled ||
                    saving
                  }
                />
              </div>
            </div>

            {/* ASSIGNED COLLECTOR */}
            <div
              className="wd-field"
              style={{ marginTop: 14 }}
            >
              <label htmlFor="wd-collector">
                Assigned collector:
              </label>

              <select
                id="wd-collector"
                value={selectedCollectorId}
                onChange={(event) => {
                  setSelectedCollectorId(
                    event.target.value
                  );
                  setSaveError("");
                }}
                disabled={
                  alreadyScheduled ||
                  saving
                }
              >
                <option value="">
                  Select a collector
                </option>

                {collectors.map(
                  (collector) => (
                    <option
                      key={collector.user_id}
                      value={collector.user_id}
                    >
                      {collector.full_name ||
                        "Unnamed collector"}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* APPROVAL BUTTON */}
            <button
              type="button"
              className="wd-approve"
              onClick={() =>
                void handleApprove()
              }
              disabled={
                saving ||
                alreadyScheduled ||
                !selectedCollectorId ||
                !details.report.site_id ||
                collectors.length === 0
              }
            >
              {saving
                ? "Saving assignment..."
                : alreadyScheduled
                  ? "Already assigned"
                  : "Approve & assign collector"}
            </button>

            {/* MESSAGES */}
            {alreadyScheduled && (
              <p
                className="wd-confirm"
                role="status"
              >
                This report already has an active
                schedule (
                {details.activeSchedule?.status}).
              </p>
            )}

            {confirmation && (
              <p
                className="wd-confirm"
                role="status"
              >
                {confirmation}
              </p>
            )}

            {saveError && (
              <p
                className="wd-error"
                role="alert"
              >
                {saveError}
              </p>
            )}

            {!details.report.site_id && (
              <p className="wd-note">
                This report must be linked to a
                registered disposal site before
                scheduling.
              </p>
            )}

            {collectors.length === 0 && (
              <p className="wd-note">
                No active collector accounts
                found in Supabase.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
