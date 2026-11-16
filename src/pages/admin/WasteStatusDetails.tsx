
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft,
  ChevronRight, ClipboardList, Clock3, ImageOff, LoaderCircle,
  MapPin, Send, ShieldCheck, UserRound,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

type Report = {
  report_id: string; user_id: string; site_id: string | null;
  date_uploaded: string; cnn_detection_level: string | null;
  address: string | null; site_description: string | null;
};
type Site = { site_id: string; site_name: string; location: string | null };
type Schedule = {
  schedule_id: string; source_report_id: string | null;
  assigned_collector_id: string | null; date: string;
  collection_time: string | null; status: string; created_at: string;
};
type Collector = {
  user_id: string; full_name: string | null;
  is_active: boolean; collector_status: string | null;
};
type ReportSummary = {
  report: Report; reporter: string; currentStatus: string;
  activeSchedule: Schedule | null;
};
type RejectionReason = "unrelated_image" | "duplicate_or_spam" | "unverifiable_location";

const REJECTION_REASONS: { value: RejectionReason; label: string }[] = [
  { value: "unrelated_image", label: "Unrelated or misleading image" },
  { value: "duplicate_or_spam", label: "Duplicate or spam report" },
  { value: "unverifiable_location", label: "Location cannot be verified" },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;
const inputClass = "w-full min-w-0 rounded-xl border border-[#DDD5C8] bg-white px-3 py-3 text-xs text-[#333] outline-none focus:border-[#A5B26B] focus:ring-2 focus:ring-[#A5B26B]/20 disabled:cursor-not-allowed disabled:bg-[#F5F1EA] disabled:text-[#888]";
const sectionClass = "min-w-0 rounded-2xl border border-[#EAE2D7] bg-white p-4 shadow-sm sm:p-5";

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const e = value as { message?: string; details?: string; hint?: string; code?: string };
    const detail = [e.message, e.details, e.hint, e.code ? `Code: ${e.code}` : ""]
      .filter(Boolean).join(" — ");
    if (detail) return detail;
  }
  return "The request failed. Check the browser console.";
}
function isAwaitingReview(status?: string | null) {
  return ["", "pending", "under review", "under_review", "submitted", "new", "awaiting review"]
    .includes((status ?? "").trim().toLowerCase());
}
function phDateTime(minutesAhead = 60) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + minutesAhead * 60_000));
  const part = (type: string) => parts.find(x => x.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}` };
}
function dateToMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}
function formatted(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
function wasteLevel(value?: string | null) {
  const v = (value ?? "").trim().toLowerCase().replace(/[_-]/g, " ");
  if (["high", "full"].includes(v)) return "Full";
  if (v === "overflowing") return "Overflowing";
  if (["medium", "half full", "near full"].includes(v)) return "Near Full";
  if (["low", "empty"].includes(v)) return "Empty";
  if (v === "invalid") return "Invalid";
  return "Not analyzed";
}
function levelClass(level: string) {
  if (["Full", "Overflowing", "Invalid"].includes(level))
    return "border-[#F2C9CE] bg-[#FFF0F1] text-[#B82030]";
  if (level === "Near Full") return "border-[#F0DCAD] bg-[#FFF6DF] text-[#9A6A08]";
  if (level === "Empty") return "border-[#D4E4BE] bg-[#F1F8E8] text-[#597B31]";
  return "border-[#DDD] bg-[#F3F3F3] text-[#666]";
}
function timeLabel(time: string | null) {
  if (!time) return "Not set";
  const [h, m] = time.split(":").map(Number);
  if (h > 23 || m > 59) return time;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
async function photoUrl(image: { storage_bucket: string | null; storage_path: string | null } | null) {
  if (!image?.storage_path) return "";
  const bucket = image.storage_bucket || "waste-images";
  let path = image.storage_path.trim();
  if (/^https?:\/\//i.test(path)) {
    const match = new URL(path).pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
    if (!match || decodeURIComponent(match[1]) !== bucket) return "";
    path = decodeURIComponent(match[2]);
  }
  while (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
  path = path.replace(/^\/+/, "");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl ?? "";
}

function MiniCalendar({ date, month, changeMonth, onSelect, disabled }: {
  date: string; month: Date; changeMonth: (value: Date) => void;
  onSelect: (value: string) => void; disabled: boolean;
}) {
  const year = month.getFullYear(), number = month.getMonth();
  const first = new Date(year, number, 1).getDay();
  const days = new Date(year, number + 1, 0).getDate();
  const cells = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = phDateTime(0).date;
  return (
    <div className="rounded-2xl border border-[#EBE4D9] bg-[#FFFCF8] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" disabled={disabled} aria-label="Previous month" onClick={() => changeMonth(new Date(year, number - 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F0E8DC] disabled:opacity-40"><ChevronLeft size={18}/></button>
        <strong className="text-xs">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
        <button type="button" disabled={disabled} aria-label="Next month" onClick={() => changeMonth(new Date(year, number + 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#F0E8DC] disabled:opacity-40"><ChevronRight size={18}/></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => <span key={d} className="py-1 text-[10px] font-bold text-[#999]">{d}</span>)}
        {cells.map((day, i) => {
          if (day === null) return <span key={`empty-${i}`}/>;
          const value = `${year}-${String(number + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const selected = value === date;
          return <button key={value} type="button" disabled={disabled || value < today} onClick={() => onSelect(value)}
            className={`aspect-square rounded-lg text-xs font-semibold ${selected ? "bg-[#A81B1E] text-white" : "text-[#555] hover:bg-[#F4E8E5] disabled:text-[#C7C0B6]"}`}>{day}</button>;
        })}
      </div>
    </div>
  );
}

export default function WasteStatusDetails() {
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const [query] = useSearchParams();
  const targetId = siteId || query.get("siteId") || query.get("reportId") || "";
  const requestedReportId = query.get("reportId");
  const initial = useMemo(() => phDateTime(60), []);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [month, setMonth] = useState(() => dateToMonth(initial.date));
  const [selectedCollectorId, setSelectedCollectorId] = useState("");
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [reportPhotoUrl, setReportPhotoUrl] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [rejectionReason, setRejectionReason] = useState<RejectionReason | "">("");
  const [rejectionDetails, setRejectionDetails] = useState("");
  const [rejectionConfirmed, setRejectionConfirmed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionError, setRejectionError] = useState("");
  const [rejectionSuccess, setRejectionSuccess] = useState("");

  useEffect(() => {
    let active = true;
    async function loadAll() {
      setLoading(true); setError("");
      try {
        if (!UUID.test(targetId)) throw new Error("A valid disposal site or report UUID is required.");
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) throw new Error("Please sign in as an administrator.");
        const { data: profile, error: profileError } = await supabase.from("users")
          .select("role,is_active").eq("user_id", auth.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (String(profile?.role).toLowerCase() !== "admin" || profile?.is_active !== true)
          throw new Error("Only active administrators can review reports.");

        const { data: siteData, error: siteError } = await supabase.from("disposal_sites")
          .select("site_id,site_name,location").eq("site_id", targetId).maybeSingle();
        if (siteError) throw siteError;
        let resolvedSite = siteData as Site | null;
        let linkedReport: Report | null = null;
        const reportColumns = "report_id,user_id,site_id,date_uploaded,cnn_detection_level,address,site_description";
        if (!resolvedSite) {
          const { data: reportData, error: reportError } = await supabase.from("waste_reports")
            .select(reportColumns).eq("report_id", targetId).maybeSingle();
          if (reportError) throw reportError;
          linkedReport = reportData as Report | null;
          if (!linkedReport) throw new Error("No matching disposal site or waste report was found.");
          if (linkedReport.site_id) {
            const { data, error: linkedSiteError } = await supabase.from("disposal_sites")
              .select("site_id,site_name,location").eq("site_id", linkedReport.site_id).maybeSingle();
            if (linkedSiteError) throw linkedSiteError;
            resolvedSite = data as Site | null;
          }
        }
        const allReports: Report[] = [];
        const resolvedSiteId = resolvedSite?.site_id || linkedReport?.site_id;
        if (resolvedSiteId) {
          for (let offset = 0; ; offset += PAGE_SIZE) {
            const { data, error: pageError } = await supabase.from("waste_reports")
              .select(reportColumns).eq("site_id", resolvedSiteId)
              .order("date_uploaded", { ascending: false }).order("report_id", { ascending: false })
              .range(offset, offset + PAGE_SIZE - 1);
            if (pageError) throw pageError;
            const page = (data ?? []) as Report[];
            allReports.push(...page);
            if (page.length < PAGE_SIZE) break;
          }
        } else if (linkedReport) allReports.push(linkedReport);
        const ids = allReports.map(r => r.report_id);
        const residentIds = [...new Set(allReports.map(r => r.user_id))];
        const names = new Map<string, string>();
        const statuses = new Map<string, string>();
        const schedules = new Map<string, Schedule>();
        for (let i = 0; i < residentIds.length; i += 100) {
          const { data, error: namesError } = await supabase.from("users")
            .select("user_id,full_name").in("user_id", residentIds.slice(i, i + 100));
          if (namesError) throw namesError;
          for (const row of data ?? []) names.set(row.user_id, row.full_name || "Unknown resident");
        }
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100);
          const [statusResult, scheduleResult] = await Promise.all([
            supabase.from("status").select("report_id,status,created_at").in("report_id", chunk)
              .order("created_at", { ascending: false }),
            supabase.from("schedules").select("schedule_id,source_report_id,assigned_collector_id,date,collection_time,status,created_at")
              .in("source_report_id", chunk).order("created_at", { ascending: false }),
          ]);
          if (statusResult.error) throw statusResult.error;
          if (scheduleResult.error) throw scheduleResult.error;
          for (const row of statusResult.data ?? []) if (!statuses.has(row.report_id)) statuses.set(row.report_id, row.status);
          for (const row of (scheduleResult.data ?? []) as Schedule[]) {
            if (row.source_report_id && !["cancelled", "canceled"].includes(row.status.toLowerCase()) && !schedules.has(row.source_report_id))
              schedules.set(row.source_report_id, row);
          }
        }
        const { data: collectorData, error: collectorError } = await supabase.from("users")
          .select("user_id,full_name,is_active,collector_status").eq("role", "collector").order("full_name");
        if (collectorError) throw collectorError;
        if (!active) return;
        const next = allReports.map(report => ({
          report, reporter: names.get(report.user_id) || "Unknown resident",
          currentStatus: statuses.get(report.report_id) || "Pending",
          activeSchedule: schedules.get(report.report_id) || null,
        }));
        setSite(resolvedSite); setCollectors((collectorData ?? []) as Collector[]); setReports(next);
        setSelectedReportId(previous => {
          if (previous && next.some(r => r.report.report_id === previous)) return previous;
          if (requestedReportId && next.some(r => r.report.report_id === requestedReportId)) return requestedReportId;
          if (linkedReport && next.some(r => r.report.report_id === linkedReport!.report_id)) return linkedReport.report_id;
          return next[0]?.report.report_id || null;
        });
      } catch (cause) {
        console.error("[WasteTrack] Load report review:", cause);
        if (active) setError(errorText(cause));
      } finally { if (active) setLoading(false); }
    }
    void loadAll();
    return () => { active = false; };
  }, [targetId, requestedReportId, refreshKey]);

  const selected = reports.find(r => r.report.report_id === selectedReportId) || null;
  const alreadyScheduled = Boolean(selected?.activeSchedule);
  const isRejected = selected?.currentStatus.trim().toLowerCase() === "rejected";
  const mayReject = Boolean(selected && !alreadyScheduled && isAwaitingReview(selected.currentStatus));
  const level = wasteLevel(selected?.report.cnn_detection_level);
  const availableCollectors = collectors.filter(c => c.is_active && c.collector_status?.trim().toLowerCase() !== "on leave");
  const collectorName = selected?.activeSchedule
    ? collectors.find(c => c.user_id === selected.activeSchedule?.assigned_collector_id)?.full_name || "Assigned collector"
    : "Not yet assigned";
  const siteName = site?.site_name || selected?.report.site_description || "Disposal site";
  const locationName = site?.location || selected?.report.address || "Not provided";
  const filteredReports = reports.filter(r => {
    const s = reportSearch.toLowerCase().trim();
    return !s || r.reporter.toLowerCase().includes(s) || r.report.report_id.toLowerCase().includes(s)
      || wasteLevel(r.report.cnn_detection_level).toLowerCase().includes(s);
  });

  useEffect(() => {
    setRejectionReason(""); setRejectionDetails(""); setRejectionConfirmed(false);
    setRejectionError(""); setRejectionSuccess("");
  }, [selectedReportId]);

  useEffect(() => {
    let active = true;
    setReportPhotoUrl(""); setPhotoError(""); setImageFailed(false);
    if (!selected) return;
    if (selected.activeSchedule) {
      setDate(selected.activeSchedule.date);
      setTime(selected.activeSchedule.collection_time?.slice(0, 5) || "08:00");
      setSelectedCollectorId(selected.activeSchedule.assigned_collector_id || "");
      setMonth(dateToMonth(selected.activeSchedule.date));
    } else {
      const start = phDateTime();
      setDate(start.date); setTime(start.time); setSelectedCollectorId(""); setMonth(dateToMonth(start.date));
    }
    async function loadPhoto() {
      setPhotoLoading(true);
      try {
        const { data, error: imageError } = await supabase.from("waste_images")
          .select("storage_bucket,storage_path").eq("report_id", selected!.report.report_id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (imageError) throw imageError;
        const url = await photoUrl(data);
        if (!active) return;
        setReportPhotoUrl(url);
        if (!url) setPhotoError("Photo unavailable for this report.");
      } catch (cause) { if (active) setPhotoError(errorText(cause)); }
      finally { if (active) setPhotoLoading(false); }
    }
    void loadPhoto();
    return () => { active = false; };
    // Only reset the form when a different report is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReportId]);

  const changeDate = (value: string) => {
    setDate(value); if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setMonth(dateToMonth(value));
    setSaveError(""); setConfirmation("");
  };

  async function handleApprove() {
    setSaveError(""); setConfirmation("");
    if (!selected || saving || rejecting || alreadyScheduled || isRejected) return;
    if (!selected.report.site_id) return setSaveError("Report must be linked to a registered disposal site.");
    if (!selectedCollectorId || !availableCollectors.some(c => c.user_id === selectedCollectorId))
      return setSaveError("Select an available collector.");
    if (!date || !time || !Number.isFinite(new Date(`${date}T${time}:00+08:00`).getTime())
      || new Date(`${date}T${time}:00+08:00`).getTime() <= Date.now())
      return setSaveError("Choose a future date and time in Philippine time.");
    setSaving(true);
    try {
      const { error: approvalError } = await supabase.rpc("admin_assign_waste_collector", {
        p_report_id: selected.report.report_id,
        p_collector_id: selectedCollectorId,
        p_date: date,
        p_collection_time: `${time}:00`,
      });
      if (approvalError) throw approvalError;
      setConfirmation(`Collector assigned for ${date} at ${time}.`);
      setRefreshKey(v => v + 1);
    } catch (cause) { setSaveError(errorText(cause)); }
    finally { setSaving(false); }
  }

  async function handleRejectAndNotify() {
    setRejectionError(""); setRejectionSuccess("");
    if (!selected || !mayReject || rejecting || saving)
      return setRejectionError("Only an unscheduled report awaiting review can be rejected.");
    if (!rejectionReason || !REJECTION_REASONS.some(r => r.value === rejectionReason))
      return setRejectionError("Select a valid rejection reason.");
    const details = rejectionDetails.trim();
    if (details.length > 1000) return setRejectionError("Optional explanation must not exceed 1000 characters.");
    if (!rejectionConfirmed) return setRejectionError("Confirm you reviewed the report.");
    const reportId = selected.report.report_id;
    setRejecting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("wt_admin_reject_invalid_report", {
        p_report_id: reportId, p_reason: rejectionReason,
        p_details: details, p_confirmed: true,
      });
      if (rpcError) throw rpcError;
      if (!data) throw new Error("Supabase returned no notification ID after rejection.");
      setRejectionSuccess("Report rejected. An in-app notification was saved for the resident.");
      setReports(current => current.map(item => item.report.report_id === reportId
        ? { ...item, currentStatus: "Rejected" } : item));
      setRefreshKey(v => v + 1);
    } catch (cause) {
      console.error("[WasteTrack] Reject & notify:", cause);
      setRejectionError(errorText(cause));
    } finally { setRejecting(false); }
  }

  return (
    <main className="min-h-[100dvh] w-full bg-[#FFFCF8] font-['Fira_Sans','Segoe_UI',Arial,sans-serif] text-[#242424]">
      <header className="border-b-[5px] border-[#A5B26B] bg-white">
        <div className="mx-auto max-w-[1540px] px-4 py-5 sm:px-6 lg:px-8">
          <button type="button" onClick={() => navigate("/admin/waste-status")}
            className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-[#A81B1E] hover:underline">
            <ArrowLeft size={16}/> Back to waste status
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">Report review</h1>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[#777]"><MapPin size={14}/>{siteName}</p>
            </div>
            {!loading && !error && <span className="rounded-full border border-[#E3D8CB] bg-[#F7F0E4] px-3 py-2 text-xs font-semibold">{reports.length} report{reports.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1540px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        {loading && <div className={`${sectionClass} flex min-h-56 items-center justify-center gap-2 text-sm`}><LoaderCircle className="animate-spin text-[#A5B26B]"/>Loading site reports...</div>}
        {!loading && error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <div className="flex items-center gap-2"><AlertCircle size={18}/>{error}</div>
          <button type="button" onClick={() => setRefreshKey(v => v + 1)} className="mt-3 rounded-lg bg-[#A81B1E] px-4 py-2 text-white">Try again</button>
        </div>}
        {!loading && !error && <>
          <section className={sectionClass}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#F7F0E4] text-[#A81B1E]"><ClipboardList size={20}/></div>
                <div><h2 className="text-sm font-extrabold">Reports for this site</h2><p className="text-[11px] text-[#999]">Choose a report to review and schedule</p></div>
              </div>
              {reports.length > 4 && <input type="search" value={reportSearch} onChange={e => setReportSearch(e.target.value)}
                placeholder="Search reports..." aria-label="Search reports" className={`${inputClass} sm:w-[230px]`}/>}
            </div>
            {filteredReports.length === 0 ? <p className="rounded-xl bg-[#F7F0E4] px-4 py-7 text-center text-xs text-[#777]">No {reports.length ? "matching" : "submitted"} reports found.</p> :
              <div className="grid max-h-[310px] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {filteredReports.map(({ report, reporter, currentStatus, activeSchedule }) => {
                  const active = selectedReportId === report.report_id;
                  const currentLevel = wasteLevel(report.cnn_detection_level);
                  return <button type="button" key={report.report_id} disabled={saving || rejecting}
                    onClick={() => { setSelectedReportId(report.report_id); setConfirmation(""); setSaveError(""); }}
                    className={`min-w-0 rounded-xl border p-3.5 text-left transition disabled:opacity-60 ${active ? "border-[#B5202A] bg-[#FFF5F3] shadow-[0_0_0_1px_#B5202A]" : "border-[#E7E0D5] bg-[#FFFCF8] hover:border-[#D3C5B7]"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
                      <span>Report {report.report_id.slice(0, 8).toUpperCase()}</span>
                      <span className={`rounded-full px-2 py-1 ${activeSchedule ? "bg-[#ECF4E5] text-[#5D7C3E]" : "bg-[#FFF0CF] text-[#956A13]"}`}>{activeSchedule ? "Scheduled" : "Not scheduled"}</span>
                    </div>
                    <p className="mt-2 truncate text-xs font-semibold text-[#555]">{reporter}</p>
                    <p className="mt-1 text-[11px] text-[#999]">{formatted(report.date_uploaded)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${levelClass(currentLevel)}`}>{currentLevel}</span>
                      <span className="text-[10px] text-[#888]">{currentStatus}</span>
                    </div>
                  </button>;
                })}
              </div>}
          </section>
          {selected && <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
            <div className="flex min-w-0 flex-col gap-5">
              <section className={`${sectionClass} overflow-hidden !p-0`}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFE8DD] px-4 py-4 sm:px-5">
                  <h2 className="flex items-center gap-2 text-sm font-extrabold"><MapPin size={17} className="text-[#A81B1E]"/>Reported waste photo</h2>
                  <span className="text-[11px] text-[#999]">Original uploaded image</span>
                </div>
                <div className="flex min-h-[230px] items-center justify-center bg-[#F7F0E4] p-3 sm:p-4">
                  {photoLoading ? <div className="flex items-center gap-2 py-12 text-xs text-[#777]"><LoaderCircle size={24} className="animate-spin"/>Loading photo...</div>
                    : reportPhotoUrl && !imageFailed ? <img src={reportPhotoUrl} alt={`Waste report for ${siteName}`}
                      onError={() => setImageFailed(true)} className="block h-auto max-h-[65dvh] w-full max-w-full rounded-xl object-contain"/>
                    : <div className="flex flex-col items-center gap-2 py-12 text-xs text-[#888]"><ImageOff size={30}/>Photo unavailable</div>}
                </div>
                {photoError && <p className="px-4 py-3 text-xs text-[#A81B1E]">{photoError}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                  <div><p className="text-[10px] font-bold uppercase text-[#999]">CNN result</p><p className="mt-1 text-xs text-[#777]">Detected waste level</p></div>
                  <span className={`rounded-full border px-4 py-2 text-xs font-extrabold ${levelClass(level)}`}>{level}</span>
                </div>
              </section>
              <section className={sectionClass}>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold"><ClipboardList size={20} className="text-[#6F8D47]"/>Report information</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    { label: "Location", value: locationName, icon: MapPin },
                    { label: "Reported by", value: selected.reporter, icon: UserRound },
                    { label: "Assigned collector", value: collectorName, icon: UserRound },
                    { label: "Reported", value: formatted(selected.report.date_uploaded), icon: Clock3 },
                    { label: "Report status", value: selected.currentStatus, icon: ShieldCheck },
                    { label: "Report ID", value: selected.report.report_id, icon: ClipboardList },
                  ].map(({ label, value, icon: Icon }) => <div key={label} className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#999]"><Icon size={13}/>{label}</p>
                    <p className="mt-1 break-words text-xs font-bold text-[#343434]">{value}</p>
                  </div>)}
                </div>
              </section>
            </div>
            <aside className="min-w-0 overflow-hidden rounded-2xl border border-[#EAE2D7] bg-white shadow-sm lg:sticky lg:top-5">
              <div className="flex items-center gap-3 bg-[#F7F0E4] px-4 py-5 sm:px-5">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#A81B1E] text-white"><CalendarDays size={21}/></div>
                <div><h2 className="text-sm font-extrabold">Collection scheduling</h2><p className="mt-0.5 text-[11px] text-[#777]">{isRejected ? "Rejected reports cannot be scheduled" : alreadyScheduled ? "Collector already assigned" : "Schedule the selected report"}</p></div>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                {alreadyScheduled && <div className="flex items-start gap-2 rounded-xl border border-[#D7E9C7] bg-[#F1F8E9] p-3 text-xs text-[#557836]"><CheckCircle2 size={17}/>This report already has a schedule ({selected.activeSchedule?.status}).</div>}
                <MiniCalendar date={date} month={month} changeMonth={setMonth} onSelect={changeDate} disabled={alreadyScheduled || isRejected || saving || rejecting}/>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <div><label htmlFor="wd-date" className="mb-1.5 block text-[11px] font-bold text-[#666]">Collection date</label>
                    <input id="wd-date" type="date" className={inputClass} value={date} min={phDateTime(0).date} onChange={e => changeDate(e.target.value)} disabled={alreadyScheduled || isRejected || saving || rejecting}/></div>
                  <div><label htmlFor="wd-time" className="mb-1.5 block text-[11px] font-bold text-[#666]">Time (Philippines)</label>
                    <input id="wd-time" type="time" className={inputClass} value={time} onChange={e => { setTime(e.target.value); setSaveError(""); }} disabled={alreadyScheduled || isRejected || saving || rejecting}/></div>
                </div>
                <div><label htmlFor="wd-collector" className="mb-1.5 block text-[11px] font-bold text-[#666]">Assigned collector</label>
                  <select id="wd-collector" value={selectedCollectorId} className={inputClass} disabled={alreadyScheduled || isRejected || saving || rejecting} onChange={e => { setSelectedCollectorId(e.target.value); setSaveError(""); }}>
                    <option value="">Select a collector</option>
                    {availableCollectors.map(c => <option key={c.user_id} value={c.user_id}>{c.full_name || "Unnamed collector"}</option>)}
                  </select></div>
                <button type="button" onClick={() => void handleApprove()} disabled={alreadyScheduled || isRejected || saving || rejecting || !selectedCollectorId || !selected.report.site_id || !availableCollectors.length}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#A81B1E] px-4 py-3.5 text-xs font-bold text-white hover:bg-[#8F1619] disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <LoaderCircle size={17} className="animate-spin"/> : <CheckCircle2 size={17}/>}
                  {saving ? "Saving assignment..." : alreadyScheduled ? "Already assigned" : "Approve & assign collector"}
                </button>
                {confirmation && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">{confirmation}</p>}
                {saveError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{saveError}</p>}
                {!selected.report.site_id && <p className="text-[11px] text-[#9A6A08]">Link this report to a registered disposal site before scheduling.</p>}
                {!availableCollectors.length && <p className="text-[11px] text-[#9A6A08]">No active available collectors.</p>}
              </div>
              <div className="border-t border-[#EAE2D7] px-4 py-5 sm:px-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-extrabold"><Send size={18} className="text-[#B82030]"/>Reject & notify resident</h3>
                <p className="mb-4 text-[11px] text-[#888]">Only for confirmed invalid submissions</p>
                {isRejected ? <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">This report is already Rejected.</p>
                : alreadyScheduled ? <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">This report already has a collection schedule and cannot be rejected here.</p>
                : !mayReject ? <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Only reports awaiting review can be rejected.</p>
                : <div className="space-y-4">
                  <p className="rounded-xl border border-[#F1E2C0] bg-[#FFF9EB] p-3 text-[11px] leading-relaxed text-[#856319]">
                    Reject only unrelated images, duplicate/spam reports, or unverifiable locations. An Invalid CNN prediction alone is not proof.
                  </p>
                  <div><label htmlFor="wd-reason" className="mb-1.5 block text-[11px] font-bold text-[#666]">Rejection reason</label>
                    <select id="wd-reason" value={rejectionReason} className={inputClass} disabled={saving || rejecting}
                      onChange={e => { setRejectionReason(e.target.value as RejectionReason | ""); setRejectionError(""); }}>
                      <option value="">Select a reason</option>
                      {REJECTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select></div>
                  <div><label htmlFor="wd-details" className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold text-[#666]">
                    <span>Evidence / explanation (optional)</span><span className="font-normal text-[#999]">{rejectionDetails.length}/1000</span></label>
                    <textarea id="wd-details" rows={3} value={rejectionDetails} maxLength={1000} disabled={saving || rejecting}
                      onChange={e => { setRejectionDetails(e.target.value); setRejectionError(""); }} placeholder="Optional details for the resident..." className={`${inputClass} resize-y`}/></div>
                  <label className="flex items-start gap-2 text-[11px] text-[#555]"><input type="checkbox" checked={rejectionConfirmed}
                    onChange={e => { setRejectionConfirmed(e.target.checked); setRejectionError(""); }} disabled={saving || rejecting} className="mt-0.5 h-4 w-4 accent-[#A81B1E]"/>
                    I reviewed the submission and confirm the rejection reason is valid.</label>
                  <button type="button" onClick={() => void handleRejectAndNotify()} disabled={saving || rejecting || !rejectionReason || !rejectionConfirmed}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#A81B1E] px-4 py-3.5 text-xs font-bold text-white hover:bg-[#8F1619] disabled:cursor-not-allowed disabled:opacity-50">
                    {rejecting ? <LoaderCircle size={17} className="animate-spin"/> : <Send size={17}/>}
                    {rejecting ? "Rejecting and notifying..." : "Reject report & notify resident"}
                  </button>
                </div>}
                {rejectionSuccess && <p role="status" className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">{rejectionSuccess}</p>}
                {rejectionError && <p role="alert" className="mt-3 break-words rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle size={15} className="mr-1 inline"/>{rejectionError}</p>}
              </div>
            </aside>
          </div>}
        </>}
      </div>
    </main>
  );
}