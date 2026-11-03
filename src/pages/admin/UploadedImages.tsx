
import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";

// ==========================================
// TYPES
// ==========================================

type FillStatus =
  | "Empty"
  | "Near Full"
  | "Full"
  | "Not analyzed";

type WasteImageRow = {
  image_id: string;
  report_id: string;
  src: string | null;
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

type ProfileRow = {
  user_id: string;
  full_name: string | null;
};

type SiteRow = {
  site_id: string;
  site_name: string | null;
};

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

// ==========================================
// CONFIGURATION
// ==========================================

const DEFAULT_BUCKET = "waste-images";
const PAGE_SIZE = 60;

// ==========================================
// CNN RESULT MAPPING
// ==========================================

function statusFromCNN(
  value: string | null
): FillStatus {
  const level = (value || "")
    .trim()
    .toUpperCase()
    .replace(/[_-]/g, " ");

  if (
    level === "LOW" ||
    level === "EMPTY"
  ) {
    return "Empty";
  }

  if (
    ["MEDIUM", "NEAR FULL", "HALF FULL"]
      .includes(level)
  ) {
    return "Near Full";
  }

  if (
    level === "HIGH" ||
    level === "FULL"
  ) {
    return "Full";
  }

  return "Not analyzed";
}

function badgeClass(status: FillStatus): string {
  if (status === "Full") return "full";
  if (status === "Near Full") return "near";
  if (status === "Empty") return "empty";
  return "unknown";
}

// ==========================================
// DATE HELPERS
// ==========================================

function relativeTime(value: string): string {
  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return "Unknown time";
  }

  const mins = Math.max(
    0,
    Math.floor((Date.now() - time) / 60000)
  );

  if (mins < 1) return "Just now";

  if (mins < 60) {
    return `${mins} min ago`;
  }

  const hours = Math.floor(mins / 60);

  if (hours < 24) {
    return `${hours} hr${
      hours === 1 ? "" : "s"
    } ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 30) {
    return `${days} day${
      days === 1 ? "" : "s"
    } ago`;
  }

  return new Date(value).toLocaleDateString(
    "en-PH",
    {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

function fullDateTime(value: string): string {
  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return "Unknown date";
  }

  return new Date(value).toLocaleString(
    "en-PH",
    {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return parts.length > 1
    ? `${parts[0][0]}${
        parts[parts.length - 1][0]
      }`.toUpperCase()
    : (parts[0] || "AD")
        .slice(0, 2)
        .toUpperCase();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String(
      (error as { message: unknown }).message
    );
  }

  return "Unable to retrieve uploaded images.";
}

// ==========================================
// FETCH IMAGE FROM SUPABASE STORAGE
// ==========================================

async function resolveImage(
  row: WasteImageRow
): Promise<{
  imageUrl: string;
  photoError: string;
}> {
  if (
    row.src &&
    /^https?:\/\//i.test(row.src)
  ) {
    return {
      imageUrl: row.src,
      photoError: "",
    };
  }

  const path =
    row.storage_path || row.src;

  if (!path) {
    return {
      imageUrl: "",
      photoError: "No image path saved.",
    };
  }

  const { data, error } =
    await supabase.storage
      .from(
        row.storage_bucket ||
          DEFAULT_BUCKET
      )
      .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return {
      imageUrl: "",
      photoError:
        error?.message ||
        "The image could not be loaded.",
    };
  }

  return {
    imageUrl: data.signedUrl,
    photoError: "",
  };
}

// ==========================================
// CSS
// ==========================================

const css = `
.ui-root,
.ui-root * {
  box-sizing: border-box;
}

.ui-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --olive: #a5b26b;
  --amber: #f5c04a;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --ink: #1b1b1b;

  min-height: 100dvh;
  background: #fff;
  color: var(--ink);

  font-family:
    "Fira Sans",
    "Segoe UI",
    Roboto,
    Arial,
    sans-serif;
}

/* ========================================
   HEADER
======================================== */

.ui-head {
  display: flex;
  justify-content: space-between;
  align-items: center;

  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);

  gap: 16px;
  flex-wrap: wrap;
}

.ui-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.ui-sub {
  margin: 3px 0 0;
  font-size: 13px;
  color: #666;
}

.ui-head-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.ui-avatar {
  width: 38px;
  height: 32px;
  border-radius: 8px;
  border: 0;

  background: #f8ced4;
  color: var(--red-bright);

  font-size: 15px;
  font-weight: 700;

  display: grid;
  place-items: center;
  cursor: pointer;
}

.ui-refresh {
  background: white;
  border: 1px solid var(--cream-line);
  border-radius: 6px;

  font: inherit;
  font-size: 12px;
  font-weight: 700;

  cursor: pointer;
  padding: 8px 12px;
}

.ui-refresh:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/* ========================================
   IMAGE LIST
======================================== */

.ui-body {
  padding: 18px 20px 24px;

  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ui-card {
  display: flex;
  align-items: center;
  gap: 14px;

  background: var(--cream);
  border: 2px solid transparent;
  border-radius: 8px;

  padding: 10px 14px;
}

.ui-card.selected {
  border-color: #4da3e0;
}

/* THUMBNAIL */

.ui-thumb {
  width: 76px;
  height: 64px;

  border-radius: 5px;
  flex-shrink: 0;
  overflow: hidden;

  background: #e9e5da;

  display: grid;
  place-items: center;

  color: #777;
  font-size: 10px;
  text-align: center;
}

.ui-thumb img {
  display: block;

  width: 100%;
  height: 100%;

  object-fit: contain;
}

/* INFORMATION */

.ui-info {
  flex: 1;
  min-width: 0;
}

.ui-site {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.ui-meta {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: #666;
  line-height: 1.5;
}

/* ACTIONS */

.ui-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* STATUS BADGES */

.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;

  padding: 4px 10px;
  border-radius: 6px;

  font-size: 10.5px;
  font-weight: 700;

  box-shadow: 0 1px 2px rgba(0,0,0,.12);
  white-space: nowrap;
}

.ui-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.ui-badge.near {
  background: #fbe2b0;
  border: 1px solid #efc77c;
  color: #222;
}

.ui-badge.near .dot {
  background: var(--amber);
}

.ui-badge.full {
  background: white;
  border: 1px solid var(--red-bright);
  color: #222;
}

.ui-badge.full .dot {
  background: var(--red-bright);
}

.ui-badge.empty {
  background: #e2ede0;
  border: 1px solid var(--olive);
  color: #222;
}

.ui-badge.empty .dot {
  background: var(--olive);
}

.ui-badge.unknown {
  background: #efefef;
  border: 1px solid #bbb;
  color: #444;
}

.ui-badge.unknown .dot {
  background: #888;
}

/* REVIEW BUTTON */

.ui-review {
  background: white;
  border: 1.5px solid var(--red-bright);
  color: var(--red-bright);

  font: inherit;
  font-size: 11.5px;
  font-weight: 700;

  padding: 7px 16px;
  border-radius: 16px;

  cursor: pointer;
}

.ui-review:hover {
  background: #fbeceb;
}

.ui-review:focus-visible,
.ui-refresh:focus-visible,
.ui-avatar:focus-visible {
  outline: 2px solid var(--red-bright);
  outline-offset: 2px;
}

/* MESSAGES */

.ui-message {
  background: var(--cream);
  padding: 18px;
  border-radius: 8px;
  font-size: 13px;
}

.ui-error {
  color: #a81b1e;
  background: #fff0f0;
  border: 1px solid #e1aaaa;
}

.ui-note {
  color: #6e6252;
  font-size: 11px;
  margin: 0;
}

/* ========================================
   FULL SCREEN IMAGE VIEWER
======================================== */

.ui-overlay {
  position: fixed;
  inset: 0;

  z-index: 10000;

  background: rgba(0,0,0,.96);

  display: flex;
  flex-direction: column;

  padding: 0;
  color: #fff;
}

.ui-dialog {
  width: 100%;
  height: 100vh;
  height: 100dvh;

  min-height: 0;

  display: flex;
  flex-direction: column;

  overflow: hidden;
}

/* VIEWER HEADER */

.ui-dialog-head {
  display: flex;
  flex: 0 0 auto;

  align-items: center;
  justify-content: space-between;

  gap: 12px;
  padding: 12px 20px;

  background: #1b1b1b;
}

.ui-dialog-head-copy {
  flex: 1;
  min-width: 0;
}

.ui-dialog-title {
  margin: 0;
  color: #fff;
  font-size: 16px;
  overflow-wrap: anywhere;
}

.ui-dialog-head .ui-meta {
  color: #bcbcbc;
}

/* CLOSE BUTTON ONLY */

.ui-close {
  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  width: 38px;
  height: 38px;

  padding: 0;

  background: var(--red);
  border: 1px solid var(--red-bright);
  border-radius: 8px;

  color: #fff;
  font-size: 25px;
  font-weight: 400;
  line-height: 1;

  cursor: pointer;

  transition: background .2s;
}

.ui-close:hover {
  background: #d0102b;
}

.ui-close:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* ========================================
   FIT WHOLE IMAGE AUTOMATICALLY
======================================== */

.ui-large-photo {
  flex: 1 1 auto;

  min-height: 0;
  min-width: 0;
  width: 100%;

  display: flex;
  align-items: center;
  justify-content: center;

  overflow: hidden;

  background: #0b0b0b;

  padding: 8px;
}

/* Always display the entire photo */

.ui-large-photo img {
  display: block;

  width: 100%;
  height: 100%;

  max-width: 100%;
  max-height: 100%;

  object-fit: contain;
  object-position: center;

  margin: auto;
}

/* UNAVAILABLE PHOTO */

.ui-photo-unavailable {
  font-size: 13px;
  color: #ddd;
  text-align: center;

  margin: auto;
  padding: 20px;
}

/* ========================================
   VIEWER FOOTER
======================================== */

.ui-details {
  flex: 0 0 auto;

  padding: 10px 20px 12px;

  background: #1b1b1b;

  display: flex;
  flex-wrap: wrap;

  align-items: center;
  justify-content: space-between;

  gap: 8px 22px;

  font-size: 12px;

  max-height: 25dvh;
  overflow-y: auto;
}

.ui-details p {
  margin: 0;
  overflow-wrap: anywhere;
}

.ui-details .ui-badge {
  vertical-align: middle;
}

.ui-viewer-caption {
  margin: 0;
  font-size: 11px;
  color: #bcbcbc;
}

/* ========================================
   MOBILE RESPONSIVENESS
======================================== */

@media (max-width: 650px) {
  .ui-head {
    padding: 14px;
  }

  .ui-body {
    padding: 14px;
  }

  .ui-card {
    gap: 10px;
    padding: 10px;
    flex-wrap: wrap;
  }

  .ui-thumb {
    width: 70px;
    height: 62px;
  }

  .ui-info {
    flex-basis: calc(100% - 80px);
  }

  .ui-actions {
    width: 100%;
    justify-content: space-between;
    padding-left: 80px;
  }

  .ui-title {
    font-size: 19px;
  }

  .ui-dialog-head {
    padding: 10px 12px;
    align-items: center;
  }

  .ui-dialog-title {
    font-size: 14px;
  }

  .ui-dialog-head .ui-meta {
    font-size: 10px;
  }

  .ui-close {
    width: 34px;
    height: 34px;
    font-size: 23px;
  }

  .ui-large-photo {
    padding: 4px;
  }

  .ui-details {
    padding: 9px 12px;
    font-size: 11px;
  }
}

@media (max-width: 360px) {
  .ui-actions {
    padding-left: 0;
  }
}
`;

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function UploadedImages() {
  const navigate = useNavigate();

  // ========================================
  // STATE
  // ========================================

  const [images, setImages] =
    useState<UploadedImage[]>([]);

  const [adminName, setAdminName] =
    useState("Administrator");

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [reviewImage, setReviewImage] =
    useState<UploadedImage | null>(null);

  const [reviewPhotoFailed, setReviewPhotoFailed] =
    useState(false);

  const closeButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const previouslyFocusedRef =
    useRef<HTMLElement | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  // ========================================
  // REALTIME UPDATES
  // ========================================

  useEffect(() => {
    const channel = supabase
      .channel("admin-uploaded-images")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "waste_images",
        },
        () => {
          setRefreshKey(
            (current) => current + 1
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // ========================================
  // FETCH IMAGES FROM SUPABASE
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadImages() {
      setLoading(true);
      setError("");
      setNotice("");

      try {
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

        // STEP 2: VERIFY ADMIN ROLE

        const {
          data: admin,
          error: adminError,
        } = await supabase
          .from("users")
          .select(
            "full_name,role,is_active"
          )
          .eq(
            "user_id",
            authData.user.id
          )
          .maybeSingle();

        if (adminError) {
          throw adminError;
        }

        if (
          !admin ||
          String(admin.role).toLowerCase() !==
            "admin" ||
          admin.is_active === false
        ) {
          throw new Error(
            "Only an active administrator can view uploaded images."
          );
        }

        if (active) {
          setAdminName(
            admin.full_name?.trim() ||
              "Administrator"
          );
        }

        // STEP 3: FETCH IMAGE RECORDS

        const {
          data: imageData,
          error: imagesError,
        } = await supabase
          .from("waste_images")
          .select(`
            image_id,
            report_id,
            src,
            storage_bucket,
            storage_path,
            created_at
          `)
          .order("created_at", {
            ascending: false,
          })
          .limit(PAGE_SIZE);

        if (imagesError) {
          throw imagesError;
        }

        const imageRows =
          (imageData ?? []) as WasteImageRow[];

        if (imageRows.length === 0) {
          if (active) {
            setImages([]);
          }

          return;
        }

        // STEP 4: FETCH RELATED REPORTS

        const reportIds = [
          ...new Set(
            imageRows.map(
              (row) => row.report_id
            )
          ),
        ];

        const {
          data: reportData,
          error: reportsError,
        } = await supabase
          .from("waste_reports")
          .select(`
            report_id,
            user_id,
            site_id,
            site_description,
            address,
            cnn_detection_level,
            date_uploaded
          `)
          .in(
            "report_id",
            reportIds
          );

        if (reportsError) {
          throw reportsError;
        }

        const reportRows =
          (reportData ?? []) as WasteReportRow[];

        // STEP 5: GET USER IDS

        const userIds = [
          ...new Set(
            reportRows.map(
              (row) => row.user_id
            )
          ),
        ];

        // STEP 6: GET SITE IDS

        const siteIds = [
          ...new Set(
            reportRows
              .map((row) => row.site_id)
              .filter(
                (value): value is string =>
                  Boolean(value)
              )
          ),
        ];

        // STEP 7: FETCH USER AND SITE DETAILS

        const [
          usersResult,
          sitesResult,
        ] = await Promise.all([
          userIds.length > 0
            ? supabase
                .from("users")
                .select(
                  "user_id,full_name"
                )
                .in(
                  "user_id",
                  userIds
                )
            : Promise.resolve({
                data: [] as ProfileRow[],
                error: null,
              }),

          siteIds.length > 0
            ? supabase
                .from("disposal_sites")
                .select(
                  "site_id,site_name"
                )
                .in(
                  "site_id",
                  siteIds
                )
            : Promise.resolve({
                data: [] as SiteRow[],
                error: null,
              }),
        ]);

        if (usersResult.error) {
          throw usersResult.error;
        }

        if (sitesResult.error) {
          throw sitesResult.error;
        }

        // STEP 8: CREATE LOOKUP MAPS

        const reportsById = new Map(
          reportRows.map(
            (report) => [
              report.report_id,
              report,
            ]
          )
        );

        const usersById = new Map(
          ((
            usersResult.data ??
            []
          ) as ProfileRow[]).map(
            (user) => [
              user.user_id,
              user.full_name,
            ]
          )
        );

        const sitesById = new Map(
          ((
            sitesResult.data ??
            []
          ) as SiteRow[]).map(
            (site) => [
              site.site_id,
              site.site_name,
            ]
          )
        );

        // STEP 9: GET ACCESSIBLE IMAGES

        const readableImages =
          imageRows.filter(
            (row) =>
              reportsById.has(row.report_id)
          );

        // STEP 10: GENERATE STORAGE IMAGE URLS

        const photoResults =
          await Promise.all(
            readableImages.map(
              resolveImage
            )
          );

        // STEP 11: FORMAT DISPLAY DATA

        const combined: UploadedImage[] =
          readableImages.map(
            (row, index) => {
              const report =
                reportsById.get(
                  row.report_id
                )!;

              return {
                id: row.image_id,

                reportId:
                  report.report_id,

                site:
                  (report.site_id
                    ? sitesById.get(
                        report.site_id
                      )
                    : null) ||
                  report.site_description ||
                  report.address ||
                  "Unknown disposal site",

                uploadedBy:
                  usersById.get(
                    report.user_id
                  ) ||
                  "Unknown resident",

                uploadedAt:
                  row.created_at ||
                  report.date_uploaded ||
                  "",

                status:
                  statusFromCNN(
                    report.cnn_detection_level
                  ),

                imageUrl:
                  photoResults[index]
                    .imageUrl,

                photoError:
                  photoResults[index]
                    .photoError,
              };
            }
          );

        if (!active) return;

        setImages(combined);

        // STEP 12: CHECK PHOTO ERRORS

        const failedPhotos =
          photoResults.filter(
            (item) =>
              item.photoError
          ).length;

        if (failedPhotos > 0) {
          setNotice(
            `${failedPhotos} image(s) could not be displayed. Check the waste-images Storage SELECT policy.`
          );
        }

        if (
          imageRows.length === PAGE_SIZE
        ) {
          setNotice((message) =>
            [
              message,
              `Showing the latest ${PAGE_SIZE} images.`,
            ]
              .filter(Boolean)
              .join(" ")
          );
        }
      } catch (cause) {
        console.error(
          "[WasteTrack] Uploaded Images:",
          cause
        );

        if (active) {
          setError(
            errorMessage(cause)
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadImages();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  // ========================================
  // FULL SCREEN KEYBOARD HANDLING
  // ========================================

  useEffect(() => {
    if (!reviewImage) return;

    // Prevent background scrolling.
    const oldOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    // Focus on the close button.
    const frame =
      window.requestAnimationFrame(
        () => {
          closeButtonRef.current?.focus();
        }
      );

    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      // Close with Escape.
      if (event.key === "Escape") {
        setReviewImage(null);
        return;
      }

      // Keep keyboard focus on the
      // only button inside the viewer.
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    document.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        onKeyDown
      );

      window.cancelAnimationFrame(frame);

      document.body.style.overflow =
        oldOverflow;

      previouslyFocusedRef.current?.focus();
    };
  }, [reviewImage?.id]);

  // ========================================
  // OPEN IMAGE IN FULL SCREEN
  // ========================================

  const handleReview = (
    image: UploadedImage
  ) => {
    previouslyFocusedRef.current =
      document.activeElement as
        | HTMLElement
        | null;

    setSelectedId(image.id);

    setReviewPhotoFailed(false);

    // Open the image directly.
    // It will always fit the whole screen.
    setReviewImage(image);
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="ui-root">
      <style>{css}</style>

      {/* ================================= */}
      {/* HEADER */}
      {/* ================================= */}

      <header className="ui-head">
        <div>
          <h1 className="ui-title">
            Uploaded images
          </h1>

          <p className="ui-sub">
            Supabase · waste-images
          </p>
        </div>

        <div className="ui-head-actions">
          <button
            type="button"
            className="ui-refresh"
            disabled={loading}
            onClick={() =>
              setRefreshKey(
                (current) => current + 1
              )
            }
          >
            {loading
              ? "Loading..."
              : "Refresh"}
          </button>

          <button
            type="button"
            className="ui-avatar"
            title={adminName}
            aria-label="Manage account"
            onClick={() =>
              navigate("/admin/account")
            }
          >
            {getInitials(adminName)}
          </button>
        </div>
      </header>

      {/* ================================= */}
      {/* UPLOADED IMAGE LIST */}
      {/* ================================= */}

      <main className="ui-body">

        {/* LOADING */}

        {loading && (
          <div
            className="ui-message"
            role="status"
          >
            Loading uploaded images
            from Supabase...
          </div>
        )}

        {/* ERROR */}

        {!loading && error && (
          <div
            className="ui-message ui-error"
            role="alert"
          >
            <strong>
              Unable to load uploaded images.
            </strong>

            <p style={{ marginBottom: 0 }}>
              {error}
            </p>

            <button
              type="button"
              className="ui-refresh"
              style={{
                marginTop: 10,
              }}
              onClick={() =>
                setRefreshKey(
                  (current) => current + 1
                )
              }
            >
              Try again
            </button>
          </div>
        )}

        {/* EMPTY STATE */}

        {!loading &&
          !error &&
          images.length === 0 && (
            <div className="ui-message">
              No uploaded images yet.
              Photos submitted by residents
              will appear here.
            </div>
          )}

        {/* ================================= */}
        {/* REAL SUPABASE UPLOADED IMAGES */}
        {/* ================================= */}

        {!loading &&
          !error &&
          images.map((img) => (
            <article
              key={img.id}
              className={`ui-card${
                selectedId === img.id
                  ? " selected"
                  : ""
              }`}
            >

              {/* PHOTO THUMBNAIL */}

              <div className="ui-thumb">
                {img.imageUrl ? (
                  <img
                    src={img.imageUrl}
                    loading="lazy"
                    alt={`Waste bin at ${img.site}`}
                  />
                ) : (
                  <span>
                    Photo unavailable
                  </span>
                )}
              </div>

              {/* IMAGE INFORMATION */}

              <div className="ui-info">
                <p className="ui-site">
                  {img.site}
                </p>

                <p className="ui-meta">
                  Uploaded by{" "}
                  {img.uploadedBy}
                  {" · "}
                  {relativeTime(
                    img.uploadedAt
                  )}
                </p>
              </div>

              {/* STATUS AND REVIEW BUTTON */}

              <div className="ui-actions">
                <span
                  className={`ui-badge ${
                    badgeClass(img.status)
                  }`}
                >
                  <span className="dot" />
                  {img.status}
                </span>

                <button
                  type="button"
                  className="ui-review"
                  onClick={() =>
                    handleReview(img)
                  }
                >
                  Review
                </button>
              </div>
            </article>
          ))}

        {/* PHOTO WARNING */}

        {!loading &&
          !error &&
          notice && (
            <p
              className="ui-note"
              role="status"
            >
              {notice}
            </p>
          )}
      </main>

      {/* ================================= */}
      {/* FULL SCREEN IMAGE REVIEW */}
      {/* ================================= */}

      {reviewImage && (
        <div
          className="ui-overlay"
          onClick={() =>
            setReviewImage(null)
          }
        >
          <section
            className="ui-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Review uploaded image at ${reviewImage.site}`}
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* ================================= */}
            {/* VIEWER HEADER */}
            {/* ================================= */}

            <header className="ui-dialog-head">

              <div className="ui-dialog-head-copy">
                <h2 className="ui-dialog-title">
                  {reviewImage.site}
                </h2>

                <p className="ui-meta">
                  Uploaded by{" "}
                  {reviewImage.uploadedBy}
                  {" · "}
                  {fullDateTime(
                    reviewImage.uploadedAt
                  )}
                </p>
              </div>

              {/* CLOSE BUTTON ONLY */}

              <button
                ref={closeButtonRef}
                type="button"
                className="ui-close"
                aria-label="Close full-screen image"
                title="Close"
                onClick={() =>
                  setReviewImage(null)
                }
              >
                ×
              </button>
            </header>

            {/* ================================= */}
            {/* WHOLE IMAGE DISPLAY */}
            {/* ================================= */}

            <div className="ui-large-photo">
              {reviewImage.imageUrl &&
              !reviewPhotoFailed ? (
                <img
                  src={reviewImage.imageUrl}
                  alt={`Entire uploaded waste image at ${reviewImage.site}`}
                  onError={() =>
                    setReviewPhotoFailed(true)
                  }
                />
              ) : (
                <p className="ui-photo-unavailable">
                  {reviewImage.photoError ||
                    "Image unavailable. Check your Storage permissions or refresh the page."}
                </p>
              )}
            </div>

            {/* ================================= */}
            {/* PHOTO DETAILS */}
            {/* ================================= */}

            <footer className="ui-details">

              {/* CNN RESULT */}

              <p>
                <strong>
                  CNN waste level:
                </strong>{" "}

                <span
                  className={`ui-badge ${
                    badgeClass(
                      reviewImage.status
                    )
                  }`}
                >
                  <span className="dot" />
                  {reviewImage.status}
                </span>
              </p>

              {/* REPORT ID */}

              <p>
                <strong>
                  Report ID:
                </strong>{" "}
                {reviewImage.reportId}
              </p>

              {/* VIEWER CAPTION */}

              <p className="ui-viewer-caption">
                Whole image displayed
                without cropping
              </p>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
