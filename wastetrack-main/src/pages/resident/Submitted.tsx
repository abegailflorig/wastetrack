
import { useEffect, useState } from "react";

import {
  Check,
  X,
  ClipboardList,
  LoaderCircle,
  FileText,
} from "lucide-react";

import {
  Link,
  useLocation,
} from "react-router";

// Adjust this path to your Supabase client.
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
  waste_type: string;
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

function formatDate(value?: string | null) {
  if (!value) {
    return "Not scheduled yet";
  }

  // Format date-only database values without
  // changing their calendar date.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;

  const match = value.match(dateOnly);

  if (match) {
    const [, year, month, day] = match;

    return `${Number(month)}-${Number(day)}-${year}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  // Philippine timezone.
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
// FORMAT CNN RESULT
// ==========================================

function formatCNNResult(value: string | null) {
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

// ==========================================
// CNN BADGE COLORS
// ==========================================

function getCNNStyle(value: string | null) {
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

function getCNNDotStyle(value: string | null) {
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
// FORMAT STATUS
// ==========================================

function formatStatus(value: string) {
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

// ==========================================
// STATUS BADGE COLORS
// ==========================================

function getStatusStyle(value: string) {
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
// DETAILS TABLE ROW
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
        flex min-h-[36px]
        items-center justify-between
        gap-3 border-b
        border-[#D8D8D8]
        px-3 py-1.5
        last:border-b-0
      "
    >
      <span
        className="
          shrink-0
          text-[11px]
          font-normal
          text-[#858585]
          sm:text-xs
        "
      >
        {label}
      </span>

      <span
        className="
          min-w-0 break-words
          text-right text-[11px]
          font-bold text-black
          sm:text-xs
        "
      >
        {value}
      </span>
    </div>
  );
}

// ==========================================
// MAIN SUBMITTED COMPONENT
// ==========================================

export default function Submitted() {
  const location = useLocation();

  const state =
    location.state as SubmittedState | null;

  // Get report ID from URL or React navigation state.
  const queryParams = new URLSearchParams(
    location.search
  );

  const reportId =
    queryParams.get("reportId") ||
    state?.reportId ||
    null;

  // ========================================
  // COMPONENT STATES
  // ========================================

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [details, setDetails] =
    useState<SubmittedDetails | null>(null);

  // ========================================
  // FETCH REPORT FROM SUPABASE
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
        // STEP 1: GET CURRENT USER

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          throw new Error(
            "Please log in to view your report."
          );
        }

        // STEP 2: FETCH WASTE REPORT

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
            waste_type,
            cnn_detection_level
          `)
          .eq("report_id", reportId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (reportError) {
          throw reportError;
        }

        if (!reportData) {
          throw new Error(
            "Report not found or you do not have permission to view it."
          );
        }

        const report = reportData as WasteReport;

        // STEP 3: FETCH LATEST STATUS

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

        if (statusError) {
          throw statusError;
        }

        const reportStatus =
          statusData?.status || "Unavailable";

        // STEP 4: GET COLLECTION LOCATION

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

        // STEP 5: GET COLLECTION DATE

        let collectionDate: string | null = null;

        const {
          data: scheduleData,
          error: scheduleError,
        } = await supabase
          .from("schedules")
          .select("date, status")
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

        // STEP 6: SAVE FETCHED DATA

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
        if (active) {
          setLoading(false);
        }
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
          flex min-h-[100dvh]
          w-full items-center
          justify-center bg-[#F2E6D2]
          px-5
        "
      >
        <div className="text-center">
          <LoaderCircle
            size={45}
            className="
              mx-auto animate-spin
              text-[#9CA874]
            "
          />

          <p
            className="
              mt-4 text-xs
              font-semibold text-black
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
          flex min-h-[100dvh]
          w-full flex-col
          items-center justify-center
          bg-[#F2E6D2] px-5
        "
      >
        <FileText
          size={45}
          className="text-red-600"
        />

        <h1
          className="
            mt-4 text-lg
            font-bold text-black
          "
        >
          Unable to load report
        </h1>

        <p
          role="alert"
          className="
            mt-2 max-w-xs
            text-center text-xs
            text-neutral-500
          "
        >
          {error ||
            "Report details are unavailable."}
        </p>

        <Link
          to={REPORTS_ROUTE}
          className="
            mt-6 rounded-lg
            bg-red-600 px-6
            py-3 text-xs
            font-bold text-white
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
        min-h-[100dvh]
        w-full bg-[#F2E6D2]
        px-[18px] pb-16
        pt-14 text-black
      "
    >
      <div
        className="
          mx-auto w-full
          max-w-[440px]
        "
      >
        {/* ================================= */}
        {/* CLOSE BUTTON */}
        {/* ================================= */}

        <div className="flex justify-end pr-1">
          <Link
            to={DASHBOARD_ROUTE}
            aria-label="Close"
            className="
              inline-flex h-7 w-7
              items-center justify-center
              text-black
            "
          >
            <X
              size={24}
              strokeWidth={2.7}
            />
          </Link>
        </div>

        {/* ================================= */}
        {/* SUCCESS MESSAGE */}
        {/* ================================= */}

        <section
          className="
            mt-16 flex flex-col
            items-center text-center
          "
        >
          {/* GREEN CHECK CIRCLE */}
          <div
            className="
              flex h-[88px] w-[88px]
              items-center justify-center
              rounded-full bg-[#D6D9AB]
            "
          >
            <Check
              size={61}
              strokeWidth={2.2}
              className="text-black"
            />
          </div>

          {/* SUCCESS TITLE */}
          <h1
            className="
              mt-10 text-[21px]
              font-bold leading-tight
              text-black
            "
          >
            Report submitted
          </h1>

          {/* SUCCESS DESCRIPTION */}
          <p
            className="
              mx-auto mt-3
              max-w-[335px]
              text-[12px]
              leading-[1.45]
              text-[#85837D]
            "
          >
            Your report on{" "}
            <span>
              {siteName}
            </span>{" "}
            is now with barangay staff.
            You can track its status anytime from{" "}
            <Link
              to={REPORTS_ROUTE}
              className="text-inherit"
            >
              My Reports.
            </Link>
          </p>
        </section>

        {/* ================================= */}
        {/* DETAILS CARD */}
        {/* ================================= */}

        <section
          className="
            mt-12 w-full
            rounded-[20px]
            border border-[#E1D3C1]
            bg-[#ECE0CF]
            p-[10px]
            shadow-[0_2px_3px_rgba(0,0,0,0.08)]
          "
        >
          {/* DETAILS HEADER */}
          <div
            className="
              flex items-center
              gap-1.5 px-1.5
              pb-[9px]
            "
          >
            <ClipboardList
              size={17}
              strokeWidth={2.3}
              className="text-black"
            />

            <h2
              className="
                text-[13px]
                font-bold
                text-black
              "
            >
              Details
            </h2>
          </div>

          {/* DETAILS TABLE */}
          <div
            className="
              overflow-hidden
              rounded-[11px]
              border border-[#DEDEDE]
              bg-white
            "
          >
            {/* TYPE OF WASTE */}
            <Row
              label="Type of Waste"
              value={report.waste_type}
            />

            {/* CNN RESULT */}
            <div
              className="
                flex min-h-[36px]
                items-center justify-between
                gap-2 border-b
                border-[#D8D8D8]
                px-3 py-1.5
              "
            >
              <span
                className="
                  text-[11px]
                  text-[#858585]
                  sm:text-xs
                "
              >
                CNN Result
              </span>

              <span
                className={`
                  inline-flex
                  items-center justify-center
                  gap-1.5 rounded-full
                  px-3 py-1
                  text-[11px] font-bold
                  whitespace-nowrap
                  ${getCNNStyle(
                    report.cnn_detection_level
                  )}
                `}
              >
                <span
                  className={`
                    h-[8px] w-[8px]
                    shrink-0 rounded-full
                    ${getCNNDotStyle(
                      report.cnn_detection_level
                    )}
                  `}
                />

                {cnnLabel}
              </span>
            </div>

            {/* STATUS */}
            <div
              className="
                flex min-h-[36px]
                items-center justify-between
                gap-2 border-b
                border-[#D8D8D8]
                px-3 py-1.5
              "
            >
              <span
                className="
                  text-[11px]
                  text-[#858585]
                  sm:text-xs
                "
              >
                Status
              </span>

              <span
                className={`
                  rounded-full
                  px-3 py-1
                  text-[11px]
                  font-bold
                  whitespace-nowrap
                  ${getStatusStyle(status)}
                `}
              >
                {formatStatus(status)}
              </span>
            </div>

            {/* DATE COLLECTION */}
            <Row
              label="Date Collection"
              value={
                collectionDate
                  ? formatDate(collectionDate)
                  : "Not scheduled yet"
              }
            />

            {/* REPORT SUBMITTED DATE */}
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
