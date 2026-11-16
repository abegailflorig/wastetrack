
import { useEffect, useState } from "react";

import {
  Check,
  X,
  ClipboardList,
  LoaderCircle,
  FileText,
} from "lucide-react";

import { Link, useLocation } from "react-router";
import { supabase } from "../../lib/supabase";

// ==========================================
// ROUTES
// ==========================================

const DASHBOARD_ROUTE = "/dashboard";
const REPORTS_ROUTE = "/reports";

// ==========================================
// TYPES
// ==========================================

type SubmittedState = {
  reportId?: string;
  [key: string]: unknown;
};

type WasteReport = {
  report_id: string;
  user_id: string;
  site_id: string | null;
  date_uploaded: string;
  address: string | null;
  site_description: string | null;
  cnn_detection_level: string | null;
};

type SubmittedDetails = {
  report: WasteReport;
  siteName: string;
  status: string;
  collectionDate: string | null;
};

// ==========================================
// FORMAT DATE
// ==========================================

function formatDate(value?: string | null): string {
  if (!value) return "Not scheduled yet";

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (match) {
    const [, year, month, day] = match;
    return `${Number(month)}-${Number(day)}-${year}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date
    .toLocaleDateString("en-US", {
      timeZone: "Asia/Manila",
      month: "numeric",
      day: "numeric",
      year: "numeric",
    })
    .replace(/\//g, "-");
}

// ==========================================
// CNN RESULT
// ==========================================

function formatCNNResult(value: string | null): string {
  switch (value) {
    case "EMPTY":
      return "Empty";
    case "NEAR FULL":
      return "Near Full";
    case "FULL":
      return "Full";
    default:
      return "Not available";
  }
}

function getCNNStyle(value: string | null): string {
  switch (value) {
    case "EMPTY":
      return "bg-[#DFEDCB] text-[#283C19]";
    case "NEAR FULL":
      return "bg-[#F6E4B4] text-[#29241B]";
    case "FULL":
      return "bg-[#F6CECE] text-[#7F2020]";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function getCNNDotStyle(value: string | null): string {
  switch (value) {
    case "EMPTY":
      return "bg-green-500";
    case "NEAR FULL":
      return "bg-amber-500";
    case "FULL":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

// ==========================================
// REPORT STATUS
// ==========================================

function formatStatus(value: string): string {
  switch (value) {
    case "Pending":
      return "Under Review";
    case "Accepted":
      return "Accepted";
    case "Rejected":
      return "Rejected";
    case "Scheduled":
      return "Scheduled";
    case "Resolved":
      return "Resolved";
    default:
      return value;
  }
}

function getStatusStyle(value: string): string {
  switch (value) {
    case "Pending":
      return "bg-[#EDE1CC] text-[#342C20]";
    case "Accepted":
      return "bg-blue-100 text-blue-800";
    case "Rejected":
      return "bg-red-100 text-red-800";
    case "Scheduled":
      return "bg-indigo-100 text-indigo-800";
    case "Resolved":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

// ==========================================
// RESPONSIVE DETAILS ROW
// ==========================================

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="
        flex min-h-[56px] w-full
        flex-wrap items-center justify-between
        gap-x-3 gap-y-2
        border-b border-[#D8D8D8]
        px-4 py-3
        sm:min-h-[60px] sm:px-5
        last:border-b-0
      "
    >
      <span
        className="
          min-w-0 flex-1
          text-[14px] font-medium
          leading-relaxed text-[#555555]
          sm:text-[15px]
        "
      >
        {label}
      </span>

      <span
        className="
          min-w-0 max-w-full
          break-words text-right
          text-[14px] font-bold
          leading-relaxed text-black
          sm:text-[15px]
        "
      >
        {value}
      </span>
    </div>
  );
}

// ==========================================
// RESPONSIVE BADGE ROW
// ==========================================

function BadgeRow({
  label,
  value,
  badgeClass,
  dotClass,
}: {
  label: string;
  value: string;
  badgeClass: string;
  dotClass?: string;
}) {
  return (
    <div
      className="
        flex min-h-[56px] w-full
        flex-wrap items-center justify-between
        gap-x-3 gap-y-2
        border-b border-[#D8D8D8]
        px-4 py-3
        sm:min-h-[60px] sm:px-5
      "
    >
      <span
        className="
          min-w-0 flex-1
          text-[14px] font-medium
          leading-relaxed text-[#555555]
          sm:text-[15px]
        "
      >
        {label}
      </span>

      <span
        className={`
          inline-flex max-w-full
          items-center justify-center
          gap-2 rounded-full
          px-3 py-2
          text-center text-[13px]
          font-bold leading-snug
          sm:text-[14px]
          ${badgeClass}
        `}
      >
        {dotClass && (
          <span
            className={`
              h-[9px] w-[9px]
              shrink-0 rounded-full
              ${dotClass}
            `}
          />
        )}

        <span className="break-words">{value}</span>
      </span>
    </div>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function Submitted() {
  const location = useLocation();

  const state =
    location.state as SubmittedState | null;

  const queryParams = new URLSearchParams(
    location.search
  );

  const reportId =
    queryParams.get("reportId") ||
    state?.reportId ||
    null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [details, setDetails] =
    useState<SubmittedDetails | null>(null);

  // ========================================
  // FETCH DATA FROM SUPABASE
  // ========================================

  useEffect(() => {
    let active = true;

    async function fetchSubmittedReport() {
      setLoading(true);
      setError("");
      setDetails(null);

      if (!reportId) {
        setError(
          "Report ID not found. Please open your report from My Reports."
        );
        setLoading(false);
        return;
      }

      try {
        // STEP 1: AUTHENTICATED USER

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          throw new Error(
            "Please log in to view your report."
          );
        }

        // STEP 2: WASTE REPORT

        const {
          data: reportData,
          error: reportError,
        } = await supabase
          .from("waste_reports")
          .select(`
            report_id,
            user_id,
            site_id,
            date_uploaded,
            address,
            site_description,
            cnn_detection_level
          `)
          .eq("report_id", reportId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (reportError) throw reportError;

        if (!reportData) {
          throw new Error(
            "Report not found or you do not have permission to view it."
          );
        }

        const report = reportData as WasteReport;

        // STEP 3: LATEST STATUS

        const {
          data: statusData,
          error: statusError,
        } = await supabase
          .from("status")
          .select("status, created_at")
          .eq("report_id", reportId)
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (statusError) throw statusError;

        const reportStatus =
          statusData?.status || "Unavailable";

        // STEP 4: DISPOSAL SITE

        let siteName =
          report.site_description ||
          report.address ||
          "Selected Location";

        if (report.site_id) {
          const {
            data: siteData,
            error: siteError,
          } = await supabase
            .from("disposal_sites")
            .select("site_name")
            .eq("site_id", report.site_id)
            .maybeSingle();

          if (siteError) {
            console.warn(
              "[WasteTrack] Site lookup error:",
              siteError.message
            );
          }

          if (siteData?.site_name) {
            siteName = siteData.site_name;
          }
        }

        // STEP 5: COLLECTION SCHEDULE

        let collectionDate: string | null = null;

        const {
          data: scheduleData,
          error: scheduleError,
        } = await supabase
          .from("schedules")
          .select("date, status, created_at")
          .eq("source_report_id", reportId)
          .neq("status", "Cancelled")
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (scheduleError) {
          console.warn(
            "[WasteTrack] Schedule lookup error:",
            scheduleError.message
          );
        }

        if (scheduleData?.date) {
          collectionDate = scheduleData.date;
        }

        // STEP 6: UPDATE COMPONENT

        if (!active) return;

        setDetails({
          report,
          siteName,
          status: reportStatus,
          collectionDate,
        });

        console.log(
          "[WasteTrack] Submitted report loaded:",
          report.report_id
        );
      } catch (err) {
        console.error(
          "[WasteTrack] Submitted page error:",
          err
        );

        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load report details."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchSubmittedReport();

    return () => {
      active = false;
    };
  }, [reportId]);

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading) {
    return (
      <main
        className="
          flex min-h-dvh w-full
          items-center justify-center
          bg-[#F2E6D2] px-5
        "
      >
        <div className="text-center">
          <LoaderCircle
            size={48}
            className="
              mx-auto animate-spin
              text-[#9CA874]
            "
          />

          <p
            className="
              mt-5 text-[15px]
              font-semibold text-black
              sm:text-[16px]
            "
          >
            Loading report details...
          </p>
        </div>
      </main>
    );
  }

  // ========================================
  // ERROR SCREEN
  // ========================================

  if (error || !details) {
    return (
      <main
        className="
          flex min-h-dvh w-full
          flex-col items-center
          justify-center
          bg-[#F2E6D2]
          px-5 py-10
        "
      >
        <FileText
          size={48}
          className="text-red-600"
        />

        <h1
          className="
            mt-5 text-center
            text-[22px] font-bold
            text-black sm:text-[24px]
          "
        >
          Unable to load report
        </h1>

        <p
          role="alert"
          className="
            mt-3 max-w-[380px]
            break-words text-center
            text-[15px] leading-7
            text-[#555555]
          "
        >
          {error ||
            "Report details are unavailable."}
        </p>

        <Link
          to={REPORTS_ROUTE}
          className="
            mt-7 inline-flex
            min-h-[48px]
            items-center justify-center
            rounded-lg bg-red-600
            px-6 py-3
            text-[15px] font-bold
            text-white
            hover:bg-red-700
          "
        >
          View My Reports
        </Link>
      </main>
    );
  }

  // ========================================
  // SAVED REPORT INFORMATION
  // ========================================

  const {
    report,
    siteName,
    status,
    collectionDate,
  } = details;

  const cnnLabel = formatCNNResult(
    report.cnn_detection_level
  );

  // ========================================
  // SUCCESS PAGE
  // ========================================

  return (
    <main
      className="
        min-h-dvh w-full
        overflow-x-hidden
        bg-[#F2E6D2]
        px-4 pb-12 pt-6
        text-black
        sm:px-6 sm:pt-10
        md:pb-16
      "
    >
      <div
        className="
          mx-auto w-full
          max-w-[440px]
          sm:max-w-[500px]
        "
      >
        {/* CLOSE BUTTON */}

        <div className="flex justify-end">
          <Link
            to={DASHBOARD_ROUTE}
            aria-label="Close"
            className="
              inline-flex h-11 w-11
              items-center justify-center
              rounded-full
              text-black
              transition-colors
              hover:bg-black/5
            "
          >
            <X
              size={27}
              strokeWidth={2.5}
            />
          </Link>
        </div>

        {/* SUCCESS MESSAGE */}

        <section
          className="
            mt-8 flex flex-col
            items-center text-center
            sm:mt-12
          "
        >
          {/* CHECK CIRCLE */}

          <div
            className="
              flex h-[92px] w-[92px]
              items-center justify-center
              rounded-full bg-[#D6D9AB]
              sm:h-[100px] sm:w-[100px]
            "
          >
            <Check
              size={62}
              strokeWidth={2.2}
              className="text-black"
            />
          </div>

          {/* TITLE */}

          <h1
            className="
              mt-8 text-center
              text-[24px] font-bold
              leading-tight text-black
              sm:text-[28px]
            "
          >
            Report submitted
          </h1>

          {/* DESCRIPTION */}

          <p
            className="
              mx-auto mt-4
              max-w-[380px]
              px-2 text-center
              text-[15px] leading-7
              text-[#555555]
              sm:text-[16px]
            "
          >
            Your report on{" "}
            <span className="font-semibold text-black">
              {siteName}
            </span>{" "}
            is now with barangay staff.
            You can track its status anytime from My Reports.
            
          </p>
        </section>

        {/* DETAILS CARD */}

        <section
          className="
            mt-10 w-full
            rounded-[20px]
            border border-[#E1D3C1]
            bg-[#ECE0CF]
            p-3 shadow-sm
            sm:mt-12 sm:p-5
          "
        >
          {/* DETAILS HEADER */}

          <div
            className="
              flex items-center
              gap-2 px-2 pb-3
            "
          >
            <ClipboardList
              size={21}
              strokeWidth={2.3}
              className="shrink-0 text-black"
            />

            <h2
              className="
                text-[17px] font-bold
                text-black
                sm:text-[19px]
              "
            >
              Details
            </h2>
          </div>

          {/* DETAILS TABLE */}

          <div
            className="
              w-full overflow-hidden
              rounded-[12px]
              border border-[#DEDEDE]
              bg-white
            "
          >
            {/* CNN RESULT */}

            <BadgeRow
              label="CNN Result"
              value={cnnLabel}
              badgeClass={getCNNStyle(
                report.cnn_detection_level
              )}
              dotClass={getCNNDotStyle(
                report.cnn_detection_level
              )}
            />

            {/* REPORT STATUS */}

            <BadgeRow
              label="Status"
              value={formatStatus(status)}
              badgeClass={getStatusStyle(status)}
            />

            {/* COLLECTION DATE */}

            <Row
              label="Date Collection"
              value={
                collectionDate
                  ? formatDate(collectionDate)
                  : "Not scheduled yet"
              }
            />

            {/* SUBMISSION DATE */}

            <Row
              label="Report Submitted"
              value={formatDate(
                report.date_uploaded
              )}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
