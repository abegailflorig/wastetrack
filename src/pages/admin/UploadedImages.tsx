
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";

type FillStatus = "Empty" | "Near Full" | "Full" | "Overflowing" | "Invalid" | "Not analyzed";

type WasteImageRow = {
  image_id: string;
  report_id: string;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string | null;
};

type WasteReportRow = {
  report_id: string;
  user_id: string;
  site_id: string | null;
  site_description: string | null;
  address: string | null;
  cnn_detection_level: string | null;
  date_uploaded: string | null;
};

type ProfileRow = { user_id: string; full_name: string | null };
type SiteRow = { site_id: string; site_name: string | null };

type UploadedImage = {
  id: string;
  reportId: string;
  site: string;
  uploadedBy: string;
  uploadedAt: string;
  status: FillStatus;
  imageUrl: string;
  photoError: string;
};

const BUCKET = "waste-images";
const PAGE_SIZE = 60;

function statusFromCNN(value: string | null): FillStatus {
  const level = (value || "").trim().toUpperCase().replace(/[_-]/g, " ");
  if (["LOW", "EMPTY"].includes(level)) return "Empty";
  if (["MEDIUM", "NEAR FULL", "HALF FULL"].includes(level)) return "Near Full";
  if (["HIGH", "FULL"].includes(level)) return "Full";
  if (level === "OVERFLOWING") return "Overflowing";
  if (level === "INVALID") return "Invalid";
  return "Not analyzed";
}

function badgeClass(status: FillStatus): string {
  if (status === "Full" || status === "Overflowing") return "full";
  if (status === "Near Full") return "near";
  if (status === "Empty") return "empty";
  return "unknown";
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown time";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  });
}

function fullDateTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown date";
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  return (words[0] || "AD").slice(0, 2).toUpperCase();
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  return "Unable to retrieve uploaded images.";
}

// The waste_images table has storage_path, NOT src.
async function resolveImage(row: WasteImageRow): Promise<{
  imageUrl: string;
  photoError: string;
}> {
  const bucket = row.storage_bucket?.trim() || BUCKET;
  let path = (row.storage_path || "").trim();
  if (!path) return { imageUrl: "", photoError: "No storage path saved for this image." };

  // Accept raw object paths, bucket-prefixed paths, or Supabase Storage URLs.
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      const match = url.pathname.match(
        /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i
      );
      if (!match || decodeURIComponent(match[1]) !== bucket) {
        return { imageUrl: "", photoError: "Image URL does not match the storage bucket." };
      }
      path = decodeURIComponent(match[2]);
    } catch {
      return { imageUrl: "", photoError: "Invalid saved image URL." };
    }
  }

  path = path.replace(/^\/+/, "").split("?")[0];
  while (path.toLowerCase().startsWith(`${bucket.toLowerCase()}/`)) {
    path = path.slice(bucket.length + 1);
  }
  if (!path) return { imageUrl: "", photoError: "Image storage path is empty." };

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    return { imageUrl: "", photoError: error?.message || "Unable to access stored image." };
  }
  return { imageUrl: data.signedUrl, photoError: "" };
}

const css = `
.ui-root, .ui-root * { box-sizing:border-box; }
.ui-root { --red:#a81b1e; --red-bright:#d0102b; --olive:#a5b26b; --cream:#f7f0e4; --line:#d9cfbd;
  min-height:100dvh; background:white; color:#1b1b1b; font-family:"Fira Sans","Segoe UI",Roboto,Arial,sans-serif; }
.ui-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;
  padding:16px 20px 12px; border-bottom:5px solid var(--olive); }
.ui-title { margin:0; font-size:22px; font-weight:700; }
.ui-sub { margin:3px 0 0; color:#666; font-size:13px; }
.ui-head-actions { display:flex; align-items:center; gap:10px; }
.ui-avatar { width:38px; height:32px; border:0; border-radius:8px; background:#f8ced4; color:var(--red-bright);
  display:grid; place-items:center; font-size:15px; font-weight:700; cursor:pointer; }
.ui-refresh { background:white; border:1px solid var(--line); border-radius:6px; font:inherit;
  font-size:12px; font-weight:700; cursor:pointer; padding:8px 12px; }
.ui-refresh:disabled { opacity:.5; cursor:not-allowed; }
.ui-body { padding:18px 20px 24px; display:flex; flex-direction:column; gap:14px; }
.ui-card { display:flex; align-items:center; gap:14px; background:var(--cream); border:2px solid transparent;
  border-radius:8px; padding:10px 14px; }
.ui-card.selected { border-color:#4da3e0; }
.ui-thumb { width:76px; height:64px; flex-shrink:0; border-radius:5px; overflow:hidden;
  background:#e9e5da; display:grid; place-items:center; text-align:center; font-size:10px; color:#777; }
.ui-thumb img { display:block; width:100%; height:100%; object-fit:contain; }
.ui-info { flex:1; min-width:0; }
.ui-site { margin:0; font-size:13.5px; font-weight:700; overflow-wrap:anywhere; }
.ui-meta { margin:4px 0 0; font-size:11.5px; line-height:1.5; color:#666; }
.ui-actions { display:flex; align-items:center; gap:10px; flex-shrink:0; }
.ui-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:6px;
  font-size:10.5px; font-weight:700; white-space:nowrap; box-shadow:0 1px 2px #0002; }
.ui-badge .dot { width:6px; height:6px; border-radius:50%; }
.ui-badge.near { background:#fbe2b0; border:1px solid #efc77c; color:#222; }
.ui-badge.near .dot { background:#f5c04a; }
.ui-badge.full { background:white; border:1px solid var(--red-bright); color:#222; }
.ui-badge.full .dot { background:var(--red-bright); }
.ui-badge.empty { background:#e2ede0; border:1px solid var(--olive); color:#222; }
.ui-badge.empty .dot { background:var(--olive); }
.ui-badge.unknown { background:#efefef; border:1px solid #bbb; color:#444; }
.ui-badge.unknown .dot { background:#888; }
.ui-review { background:white; border:1.5px solid var(--red-bright); color:var(--red-bright); font:inherit;
  font-size:11.5px; font-weight:700; padding:7px 16px; border-radius:16px; cursor:pointer; }
.ui-review:hover { background:#fbeceb; }
.ui-refresh:focus-visible,.ui-avatar:focus-visible,.ui-review:focus-visible,.ui-close:focus-visible {
  outline:2px solid var(--red-bright); outline-offset:2px; }
.ui-message { background:var(--cream); padding:18px; border-radius:8px; font-size:13px; }
.ui-error { background:#fff0f0; border:1px solid #e1aaaa; color:var(--red); }
.ui-note { color:#6e6252; font-size:11px; margin:0; }
.ui-overlay { position:fixed; inset:0; z-index:10000; background:#000f; color:white;
  display:flex; flex-direction:column; }
.ui-dialog { width:100%; height:100dvh; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.ui-dialog-head { display:flex; flex:0 0 auto; align-items:center; justify-content:space-between; gap:12px;
  padding:12px 20px; background:#1b1b1b; }
.ui-dialog-head-copy { min-width:0; flex:1; }
.ui-dialog-title { margin:0; color:white; font-size:16px; overflow-wrap:anywhere; }
.ui-dialog-head .ui-meta { color:#bcbcbc; }
.ui-close { flex-shrink:0; width:38px; height:38px; padding:0; border:1px solid var(--red-bright);
  border-radius:8px; background:var(--red); color:white; font-size:25px; cursor:pointer; }
.ui-close:hover { background:var(--red-bright); }
.ui-large-photo { flex:1 1 auto; min-height:0; min-width:0; width:100%; background:#0b0b0b;
  display:flex; align-items:center; justify-content:center; overflow:hidden; padding:8px; }
.ui-large-photo img { display:block; width:100%; height:100%; max-width:100%; max-height:100%;
  object-fit:contain; object-position:center; margin:auto; }
.ui-photo-unavailable { margin:auto; padding:20px; font-size:13px; color:#ddd; text-align:center; }
.ui-details { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap;
  gap:8px 22px; max-height:25dvh; overflow-y:auto; padding:10px 20px 12px; background:#1b1b1b; font-size:12px; }
.ui-details p { margin:0; overflow-wrap:anywhere; }
.ui-details .ui-badge { vertical-align:middle; }
.ui-viewer-caption { margin:0; font-size:11px; color:#bcbcbc; }
@media (max-width:650px) {
  .ui-head,.ui-body { padding:14px; }
  .ui-card { gap:10px; padding:10px; flex-wrap:wrap; }
  .ui-thumb { width:70px; height:62px; }
  .ui-info { flex-basis:calc(100% - 80px); }
  .ui-actions { width:100%; justify-content:space-between; padding-left:80px; }
  .ui-title { font-size:19px; }
  .ui-dialog-head { padding:10px 12px; }
  .ui-dialog-title { font-size:14px; }
  .ui-dialog-head .ui-meta { font-size:10px; }
  .ui-close { width:34px; height:34px; font-size:23px; }
  .ui-large-photo { padding:4px; }
  .ui-details { padding:9px 12px; font-size:11px; }
}
@media (max-width:360px) { .ui-actions { padding-left:0; } }
`;

export default function UploadedImages() {
  const navigate = useNavigate();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [adminName, setAdminName] = useState("Administrator");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewImage, setReviewImage] = useState<UploadedImage | null>(null);
  const [reviewPhotoFailed, setReviewPhotoFailed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh the list when a resident uploads another report photo.
  useEffect(() => {
    const channel = supabase.channel("admin-uploaded-images").on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "waste_images" },
      () => setRefreshKey(key => key + 1)
    ).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadImages() {
      setLoading(true);
      setError("");
      setNotice("");

      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) throw new Error("Please sign in as an administrator.");

        const { data: admin, error: adminError } = await supabase
          .from("users").select("full_name,role,is_active")
          .eq("user_id", auth.user.id).maybeSingle();
        if (adminError) throw adminError;
        if (!admin || String(admin.role).toLowerCase() !== "admin" || admin.is_active === false) {
          throw new Error("Only an active administrator can view uploaded images.");
        }
        if (active) setAdminName(admin.full_name?.trim() || "Administrator");

        // IMPORTANT: waste_images.src does not exist. Use storage_path only.
        const { data: imageData, error: imagesError } = await supabase
          .from("waste_images")
          .select("image_id,report_id,storage_bucket,storage_path,created_at")
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);
        if (imagesError) throw imagesError;
        const imageRows = (imageData ?? []) as WasteImageRow[];
        if (!imageRows.length) {
          if (active) setImages([]);
          return;
        }

        const reportIds = [...new Set(imageRows.map(row => row.report_id))];
        const { data: reportData, error: reportsError } = await supabase
          .from("waste_reports")
          .select("report_id,user_id,site_id,site_description,address,cnn_detection_level,date_uploaded")
          .in("report_id", reportIds);
        if (reportsError) throw reportsError;
        const reportRows = (reportData ?? []) as WasteReportRow[];
        const userIds = [...new Set(reportRows.map(row => row.user_id))];
        const siteIds = [...new Set(reportRows.map(row => row.site_id).filter((id): id is string => !!id))];

        const [usersResult, sitesResult] = await Promise.all([
          userIds.length
            ? supabase.from("users").select("user_id,full_name").in("user_id", userIds)
            : Promise.resolve({ data: [] as ProfileRow[], error: null }),
          siteIds.length
            ? supabase.from("disposal_sites").select("site_id,site_name").in("site_id", siteIds)
            : Promise.resolve({ data: [] as SiteRow[], error: null }),
        ]);
        if (usersResult.error) throw usersResult.error;
        if (sitesResult.error) throw sitesResult.error;

        const reportsById = new Map(reportRows.map(row => [row.report_id, row]));
        const namesById = new Map(((usersResult.data ?? []) as ProfileRow[])
          .map(row => [row.user_id, row.full_name]));
        const sitesById = new Map(((sitesResult.data ?? []) as SiteRow[])
          .map(row => [row.site_id, row.site_name]));

        const visibleRows = imageRows.filter(row => reportsById.has(row.report_id));
        const photoResults = await Promise.all(visibleRows.map(resolveImage));
        const combined: UploadedImage[] = visibleRows.map((row, index) => {
          const report = reportsById.get(row.report_id)!;
          return {
            id: row.image_id,
            reportId: row.report_id,
            site: (report.site_id ? sitesById.get(report.site_id) : null)
              || report.site_description || report.address || "Unknown disposal site",
            uploadedBy: namesById.get(report.user_id) || "Unknown resident",
            uploadedAt: row.created_at || report.date_uploaded || "",
            status: statusFromCNN(report.cnn_detection_level),
            imageUrl: photoResults[index].imageUrl,
            photoError: photoResults[index].photoError,
          };
        });
        if (!active) return;
        setImages(combined);
        const failed = photoResults.filter(photo => photo.photoError).length;
        const messages = [];
        if (failed) messages.push(`${failed} image(s) could not be displayed. Check the storage paths and waste-images Storage SELECT policy.`);
        if (imageRows.length === PAGE_SIZE) messages.push(`Showing the latest ${PAGE_SIZE} images.`);
        setNotice(messages.join(" "));
      } catch (cause) {
        console.error("[WasteTrack] Uploaded Images:", cause);
        if (active) setError(errorMessage(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadImages();
    return () => { active = false; };
  }, [refreshKey]);

  // Full-screen viewer: Escape closes it, Tab stays on the close button.
  useEffect(() => {
    if (!reviewImage) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReviewImage(null);
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = oldOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [reviewImage?.id]);

  function handleReview(image: UploadedImage) {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    setSelectedId(image.id);
    setReviewPhotoFailed(false);
    setReviewImage(image);
  }

  return (
    <div className="ui-root">
      <style>{css}</style>
      <header className="ui-head">
        <div>
          <h1 className="ui-title">Uploaded images</h1>
        </div>
        <div className="ui-head-actions">
          <button type="button" className="ui-refresh" disabled={loading}
            onClick={() => setRefreshKey(key => key + 1)}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button type="button" className="ui-avatar" title={adminName}
            aria-label="Manage account" onClick={() => navigate("/admin/account")}>
            {getInitials(adminName)}
          </button>
        </div>
      </header>

      <main className="ui-body">
        {loading && (
          <div className="ui-message" role="status">Loading uploaded images</div>
        )}

        {!loading && error && (
          <div className="ui-message ui-error" role="alert">
            <strong>Unable to load uploaded images.</strong>
            <p style={{ marginBottom: 0 }}>{error}</p>
            <button type="button" className="ui-refresh" style={{ marginTop: 10 }}
              onClick={() => setRefreshKey(key => key + 1)}>Try again</button>
          </div>
        )}

        {!loading && !error && images.length === 0 && (
          <div className="ui-message">No uploaded images yet. Photos submitted by residents will appear here.</div>
        )}

        {!loading && !error && images.map(image => (
          <article key={image.id} className={`ui-card${selectedId === image.id ? " selected" : ""}`}>
            <div className="ui-thumb">
              {image.imageUrl
                ? <img src={image.imageUrl} alt={`Waste bin at ${image.site}`} loading="lazy" />
                : <span>Photo unavailable</span>}
            </div>
            <div className="ui-info">
              <p className="ui-site">{image.site}</p>
              <p className="ui-meta">Uploaded by {image.uploadedBy} · {relativeTime(image.uploadedAt)}</p>
            </div>
            <div className="ui-actions">
              <span className={`ui-badge ${badgeClass(image.status)}`}>
                <span className="dot" />{image.status}
              </span>
              <button type="button" className="ui-review" onClick={() => handleReview(image)}>
                Review
              </button>
            </div>
          </article>
        ))}

        {!loading && !error && !!notice && <p className="ui-note" role="status">{notice}</p>}
      </main>

      {reviewImage && (
        <div className="ui-overlay" onClick={() => setReviewImage(null)}>
          <section className="ui-dialog" role="dialog" aria-modal="true"
            aria-label={`Review uploaded image at ${reviewImage.site}`}
            onClick={event => event.stopPropagation()}>
            <header className="ui-dialog-head">
              <div className="ui-dialog-head-copy">
                <h2 className="ui-dialog-title">{reviewImage.site}</h2>
                <p className="ui-meta">
                  Uploaded by {reviewImage.uploadedBy} · {fullDateTime(reviewImage.uploadedAt)}
                </p>
              </div>
              <button ref={closeButtonRef} type="button" className="ui-close"
                aria-label="Close full-screen image" title="Close"
                onClick={() => setReviewImage(null)}>×</button>
            </header>

            <div className="ui-large-photo">
              {reviewImage.imageUrl && !reviewPhotoFailed
                ? <img src={reviewImage.imageUrl} alt={`Entire uploaded waste image at ${reviewImage.site}`}
                    onError={() => setReviewPhotoFailed(true)} />
                : <p className="ui-photo-unavailable">
                    {reviewImage.photoError || "Image unavailable. Check your Storage permissions or refresh the page."}
                  </p>}
            </div>

            <footer className="ui-details">
              <p><strong>CNN waste level:</strong>{" "}
                <span className={`ui-badge ${badgeClass(reviewImage.status)}`}>
                  <span className="dot" />{reviewImage.status}
                </span>
              </p>
              <p><strong>Report ID:</strong> {reviewImage.reportId}</p>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}