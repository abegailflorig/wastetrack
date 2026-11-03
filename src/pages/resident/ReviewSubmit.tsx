
import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  Recycle,
  MapPin,
  LoaderCircle,
} from "lucide-react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router";

import { supabase } from "../../lib/supabase";

// ============================================
// TYPES
// ============================================

type WasteLevel =
  | "empty"
  | "half-full"
  | "full"
  | "overflowing";

type CNNResult = {
  waste_level: string;
  confidence: number;
  is_valid_bin: boolean;
};

type SelectedLocation = {
  latitude?: number;
  longitude?: number;
  address?: string;
  siteId?: string;
  siteName?: string;
};

type ReviewState = {
  photo?: File | null;
  photoSource?: "gallery" | "camera";
  selectedLocation?: SelectedLocation;
  cnnResult?: CNNResult;
  [key: string]: unknown;
};

// ============================================
// ROUTES
// ============================================

const CREATE_ROUTE =
  "/resident/report-waste/create";

const CAPTURE_ROUTE =
  "/resident/report-waste/capture";

const SUBMITTED_ROUTE =
  "/resident/report-waste/submitted";

// ============================================
// CONFIGURATION
// ============================================

const STORAGE_BUCKET = "waste-images";

const MIN_CONFIDENCE = 0.70;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

// ============================================
// CNN DISPLAY LABELS
// ============================================

const WASTE_LABELS: Record<WasteLevel, string> = {
  empty: "Empty",
  "half-full": "Half-Full",
  full: "Full",
  overflowing: "Overflowing",
};

// ============================================
// SUPABASE DATABASE LABELS
// ============================================

const DATABASE_LABELS: Record<WasteLevel, string> = {
  empty: "EMPTY",
  "half-full": "NEAR FULL",
  full: "FULL",
  overflowing: "OVERFLOWING",
};

// ============================================
// CNN RESULT BADGE STYLES
// ============================================

const WASTE_STYLES: Record<WasteLevel, string> = {
  empty: "bg-green-100 text-green-800",
  "half-full": "bg-amber-100 text-amber-800",
  full: "bg-red-100 text-red-800",
  overflowing: "bg-red-200 text-red-900",
};

const DOT_STYLES: Record<WasteLevel, string> = {
  empty: "bg-green-500",
  "half-full": "bg-amber-500",
  full: "bg-red-500",
  overflowing: "bg-red-800",
};

// ============================================
// CNN VALIDATION
// ============================================

function isWasteLevel(
  value: unknown
): value is WasteLevel {
  return (
    value === "empty" ||
    value === "half-full" ||
    value === "full" ||
    value === "overflowing"
  );
}

// ============================================
// LOCATION VALIDATION
// ============================================

function isValidLatitude(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ReviewSubmit() {
  const navigate = useNavigate();
  const location = useLocation();

  const state =
    location.state as ReviewState | null;

  // ==========================================
  // COMPONENT STATES
  // ==========================================

  const [confirmed, setConfirmed] = useState(false);

  const [photoUrl, setPhotoUrl] = useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState("");

  const submittingRef = useRef(false);

  // ==========================================
  // GET CNN RESULT
  // ==========================================

  const cnnResult = state?.cnnResult;

  const rawWasteLevel =
    cnnResult?.waste_level;

  const wasteLevel: WasteLevel | null =
    isWasteLevel(rawWasteLevel)
      ? rawWasteLevel
      : null;

  const confidence =
    cnnResult?.confidence;

  // CNN confidence is used internally.
  // It will not be displayed in the UI.

  const validConfidence =
    typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence >= MIN_CONFIDENCE &&
    confidence <= 1;

  // ==========================================
  // VALIDATE CNN PREDICTION
  // ==========================================

  const validPrediction =
    wasteLevel !== null &&
    cnnResult?.is_valid_bin === true;

  const displayWasteLevel = wasteLevel
    ? WASTE_LABELS[wasteLevel]
    : null;

  // ==========================================
  // GET PHOTO INFORMATION
  // ==========================================

  const photo = state?.photo;

  const validImage =
    photo instanceof File &&
    ALLOWED_TYPES.includes(photo.type) &&
    photo.size > 0 &&
    photo.size <= MAX_IMAGE_SIZE;

  // ==========================================
  // GET LOCATION INFORMATION
  // ==========================================

  const selectedLocation =
    state?.selectedLocation;

  const latitude =
    selectedLocation?.latitude;

  const longitude =
    selectedLocation?.longitude;

  const validLocation =
    isValidLatitude(latitude) &&
    isValidLongitude(longitude);

  // ==========================================
  // SUBMISSION VALIDATION
  // ==========================================

  const canSubmit =
    confirmed &&
    validImage &&
    validPrediction &&
    validConfidence &&
    validLocation &&
    !isSubmitting;

  // ==========================================
  // BACK NAVIGATION
  // ==========================================

  const backRoute =
    state?.photoSource === "camera"
      ? CAPTURE_ROUTE
      : CREATE_ROUTE;

  // ==========================================
  // PHOTO PREVIEW
  // ==========================================

  useEffect(() => {
    if (!(photo instanceof File)) {
      setPhotoUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(photo);

    setPhotoUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photo]);

  // ==========================================
  // SUBMIT REPORT TO SUPABASE
  // ==========================================

  async function handleSubmit() {
    if (submittingRef.current) {
      return;
    }

    if (
      !canSubmit ||
      !(photo instanceof File) ||
      !wasteLevel ||
      typeof confidence !== "number" ||
      !isValidLatitude(latitude) ||
      !isValidLongitude(longitude)
    ) {
      setSubmitError(
        "Please provide a valid waste-bin photo, CNN result, and collection location."
      );

      return;
    }

    submittingRef.current = true;

    setIsSubmitting(true);
    setSubmitError("");

    let uploadedPath: string | null = null;

    try {
      // ======================================
      // STEP 1: GET LOGGED-IN USER
      // ======================================

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error(
          "Please sign in before submitting a report."
        );
      }

      const userId = authData.user.id;

      // ======================================
      // STEP 2: VERIFY RESIDENT ACCOUNT
      // ======================================

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("users")
        .select("role, is_active")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (!profile) {
        throw new Error(
          "Your user profile was not found."
        );
      }

      if (profile.is_active === false) {
        throw new Error(
          "Your account is inactive."
        );
      }

      if (profile.role !== "resident") {
        throw new Error(
          "Only residents can submit waste reports."
        );
      }

      // ======================================
      // STEP 3: PREPARE IMAGE
      // ======================================

      const fileExtension =
        photo.type === "image/png"
          ? "png"
          : photo.type === "image/webp"
          ? "webp"
          : "jpg";

      const imageId = crypto.randomUUID();

      const imagePath =
        `${userId}/${imageId}.${fileExtension}`;

      // ======================================
      // STEP 4: UPLOAD PHOTO TO SUPABASE
      // ======================================

      const {
        error: uploadError,
      } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(imagePath, photo, {
          contentType: photo.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `Image upload failed: ${uploadError.message}`
        );
      }

      uploadedPath = imagePath;

      console.log(
        "[WasteTrack] Image uploaded:",
        imagePath
      );

      // ======================================
      // STEP 5: PREPARE CNN RESULT
      // ======================================

      const cnnDetectionLevel =
        DATABASE_LABELS[wasteLevel];

      // Convert CNN confidence from
      // 0-1 to a percentage.

      const confidencePercentage =
        Math.round(confidence * 10000) / 100;

      console.log(
        "[WasteTrack] CNN result:",
        cnnDetectionLevel
      );

      // ======================================
      // STEP 6: PREPARE LOCATION
      // ======================================

      const siteId =
        selectedLocation?.siteId || null;

      const address =
        selectedLocation?.address || null;

      const siteDescription =
        selectedLocation?.siteName || null;

      // ======================================
      // STEP 7: SAVE REPORT TO DATABASE
      // ======================================

      const {
        data: reportId,
        error: reportError,
      } = await supabase.rpc(
        "submit_waste_report",
        {
          p_site_id: siteId,
          p_latitude: latitude,
          p_longitude: longitude,
          p_address: address,
          p_site_description: siteDescription,
          p_cnn_detection_level:
            cnnDetectionLevel,
          p_confidence_level:
            confidencePercentage,
          p_storage_path: imagePath,
        }
      );

      if (reportError) {
        throw new Error(
          `Failed to save report: ${reportError.message}`
        );
      }

      if (
        typeof reportId !== "string" ||
        !reportId
      ) {
        throw new Error(
          "Supabase did not return a valid report ID."
        );
      }

      // The database now references the photo.
      uploadedPath = null;

      console.log(
        "[WasteTrack] Report submitted:",
        reportId
      );

      // ======================================
      // STEP 8: NAVIGATE TO SUBMITTED PAGE
      // ======================================

      const submittedUrl =
        `${SUBMITTED_ROUTE}?reportId=${encodeURIComponent(
          reportId
        )}`;

      navigate(submittedUrl, {
        replace: true,

        state: {
          reportId,
          wasteLevel,
          wasteLevelLabel:
            displayWasteLevel,
          confidence,
          confirmed: true,
          submitted: true,
        },
      });
    } catch (error) {
      console.error(
        "[WasteTrack] Submission error:",
        error
      );

      // ======================================
      // CLEAN UP IMAGE IF SUBMISSION FAILS
      // ======================================

      if (uploadedPath) {
        const {
          error: cleanupError,
        } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([uploadedPath]);

        if (cleanupError) {
          console.warn(
            "[WasteTrack] Cleanup failed:",
            cleanupError.message
          );
        }
      }

      setSubmitError(
        error instanceof Error
          ? error.message
          : "Report submission failed. Please try again."
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  // ==========================================
  // USER INTERFACE
  // ==========================================

  return (
    <main className="min-h-dvh w-full bg-white">
      {/* RESPONSIVE PAGE */}

      <div
        className="
          mx-auto min-h-dvh w-full
          max-w-[1600px]
          px-3 pb-8
          sm:px-6
          lg:px-10
          xl:px-14
          2xl:px-20
        "
      >
        {/* ================================= */}
        {/* HEADER */}
        {/* ================================= */}

        <header
          className="
            flex items-center gap-2
            py-7 sm:py-8 lg:py-9
          "
        >
          <Link
            to={backRoute}
            state={state}
            aria-label="Back to photo"
            className="flex items-center"
          >
            <ArrowLeft
              size={21}
              strokeWidth={1.8}
            />
          </Link>

          <h1
            className="
              text-sm font-semibold
              text-black
              sm:text-base
              lg:text-lg
            "
          >
            Review Result
          </h1>
        </header>

        {/* ================================= */}
        {/* MAIN RESPONSIVE GRID */}
        {/* ================================= */}

        <section
          className="
            grid grid-cols-1 gap-4
            lg:grid-cols-[1.15fr_0.85fr]
            lg:items-start
            lg:gap-7
            xl:gap-10
          "
        >
          {/* ================================= */}
          {/* LEFT COLUMN - PHOTO */}
          {/* ================================= */}

          <div className="min-w-0">
            <div
              className="
                w-full rounded-[19px]
                bg-[#A9BB78] p-2
                sm:rounded-[23px] sm:p-3
                lg:rounded-[25px] lg:p-4
              "
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Captured or uploaded waste bin"
                  className="
                    aspect-[1.05/1] w-full
                    rounded-[12px] object-cover
                    sm:rounded-[15px]
                    lg:aspect-[4/3]
                    lg:rounded-[17px]
                    xl:aspect-[5/4]
                  "
                />
              ) : (
                <div
                  className="
                    flex aspect-[1.05/1]
                    w-full items-center justify-center
                    rounded-xl bg-neutral-100
                    text-xs text-neutral-500
                    lg:aspect-[4/3]
                  "
                >
                  No waste-bin photo available
                </div>
              )}
            </div>
          </div>

          {/* ================================= */}
          {/* RIGHT COLUMN */}
          {/* ================================= */}

          <div className="flex min-w-0 flex-col gap-3">
            {/* ================================= */}
            {/* CNN RESULT */}
            {/* ================================= */}

            <div
              className="
                flex min-h-[48px]
                items-center justify-between
                gap-3 rounded-[9px]
                bg-[#FFF5E6]
                px-4 py-2
                sm:min-h-[54px] sm:px-5
                lg:min-h-[60px] lg:px-6
              "
            >
              <span
                className="
                  text-xs font-medium
                  text-neutral-800
                  sm:text-sm
                  lg:text-base
                "
              >
                CNN Result:
              </span>

              {validPrediction &&
              wasteLevel &&
              displayWasteLevel ? (
                <span
                  className={`
                    inline-flex items-center
                    justify-center gap-2
                    rounded-full
                    px-4 py-1.5
                    text-[11px] font-bold
                    sm:px-5 sm:py-2 sm:text-sm
                    lg:px-6 lg:py-2.5
                    ${WASTE_STYLES[wasteLevel]}
                  `}
                >
                  <span
                    className={`
                      h-2 w-2 rounded-full
                      sm:h-2.5 sm:w-2.5
                      ${DOT_STYLES[wasteLevel]}
                    `}
                  />

                  {displayWasteLevel}
                </span>
              ) : (
                <span
                  className="
                    rounded-full bg-red-100
                    px-4 py-2
                    text-xs font-semibold
                    text-red-600
                  "
                >
                  Invalid CNN Result
                </span>
              )}
            </div>

            {/* ================================= */}
            {/* COLLECTION LOCATION */}
            {/* ================================= */}

            {selectedLocation && (
              <div
                className="
                  rounded-[9px]
                  bg-[#FFF5E6]
                  p-3 sm:p-4 lg:p-5
                "
              >
                <div className="flex items-center gap-2">
                  <MapPin
                    size={16}
                    className="text-[#A47739]"
                  />

                  <h2
                    className="
                      text-[11px] font-bold
                      sm:text-sm
                    "
                  >
                    Collection Location
                  </h2>
                </div>

                <p
                  className="
                    mt-2 text-[11px]
                    font-semibold text-neutral-800
                    sm:text-sm
                  "
                >
                  {selectedLocation.siteName ||
                    "Selected site"}
                </p>

                <p
                  className="
                    mt-1 break-words
                    text-[10px] leading-relaxed
                    text-neutral-500
                    sm:text-xs
                  "
                >
                  {selectedLocation.address ||
                    "Address unavailable"}
                </p>

                {validLocation &&
                  typeof latitude === "number" &&
                  typeof longitude === "number" && (
                    <p
                      className="
                        mt-2 break-all
                        text-[9px] text-neutral-400
                      "
                    >
                      Coordinates:{" "}
                      {latitude.toFixed(6)},{" "}
                      {longitude.toFixed(6)}
                    </p>
                  )}
              </div>
            )}

            {/* ================================= */}
            {/* TYPES OF WASTE */}
            {/* ================================= */}

            <div
              className="
                rounded-[9px]
                bg-[#FFF2DF]
                p-3 sm:p-4 lg:p-5
              "
            >
              <div className="mb-3 flex items-center gap-2">
                <Recycle
                  size={17}
                  className="text-[#A47739]"
                />

                <h2
                  className="
                    text-[11px] font-bold
                    text-neutral-800
                    sm:text-sm
                  "
                >
                  Types of Waste
                </h2>
              </div>

              <div className="space-y-2 pl-2">
                {/* BIODEGRADABLE */}

                <div className="flex items-center gap-2">
                  <span
                    className="
                      h-[7px] w-[7px]
                      rounded-full bg-lime-500
                    "
                  />

                  <span
                    className="
                      text-[10px] text-red-600
                      sm:text-xs
                    "
                  >
                    Biodegradable
                  </span>
                </div>

                {/* NON-BIODEGRADABLE */}

                <div className="flex items-center gap-2">
                  <span
                    className="
                      h-[7px] w-[7px]
                      rounded-full bg-amber-400
                    "
                  />

                  <span
                    className="
                      text-[10px] text-neutral-700
                      sm:text-xs
                    "
                  >
                    Non-Biodegradable
                  </span>
                </div>

                {/* MIXED / UNSORTED */}

                <div className="flex items-center gap-2">
                  <span
                    className="
                      h-[7px] w-[7px]
                      rounded-full bg-neutral-500
                    "
                  />

                  <span
                    className="
                      text-[10px] text-neutral-700
                      sm:text-xs
                    "
                  >
                    Mix/Unsorted
                  </span>
                </div>
              </div>

              <p
                className="
                  mt-3 text-[10px]
                  text-neutral-500
                "
              >
                Reference categories only.
                The CNN currently detects
                waste-bin fill level.
              </p>
            </div>

            {/* ================================= */}
            {/* USER CONFIRMATION */}
            {/* ================================= */}

            <label
              className="
                mt-2 flex cursor-pointer
                items-start gap-2 px-2
              "
            >
              <input
                type="checkbox"
                checked={confirmed}
                disabled={isSubmitting}
                onChange={(event) => {
                  setConfirmed(event.target.checked);
                  setSubmitError("");
                }}
                className="
                  mt-0.5 h-4 w-4
                  shrink-0 cursor-pointer
                  accent-red-600
                "
              />

              <span
                className="
                  text-[10px] leading-relaxed
                  text-neutral-500
                "
              >
                I confirm the attached photo and
                details are accurate and were taken
                at this location. False reports may
                be flagged by barangay staff.
              </span>
            </label>

            {/* ================================= */}
            {/* SUBMIT REPORT BUTTON */}
            {/* ================================= */}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="
                mx-auto mt-2
                flex h-10 w-full
                max-w-[220px]
                items-center justify-center
                gap-2 rounded-[9px]
                bg-[#E60000]
                px-6 text-xs font-bold
                text-white
                transition-colors
                hover:bg-red-700
                disabled:cursor-not-allowed
                disabled:opacity-50
                lg:mx-0 lg:max-w-none
              "
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle
                    size={17}
                    className="animate-spin"
                  />

                  Submitting...
                </>
              ) : (
                "Submit Report"
              )}
            </button>

            {/* ================================= */}
            {/* SUBMISSION ERROR */}
            {/* ================================= */}

            {submitError && (
              <div
                role="alert"
                className="
                  mt-2 rounded-lg
                  border border-red-200
                  bg-red-50 p-3
                "
              >
                <p className="text-xs font-semibold text-red-700">
                  Report Submission Failed
                </p>

                <p className="mt-1 text-[11px] text-red-600">
                  {submitError}
                </p>
              </div>
            )}

            {/* ================================= */}
            {/* VALIDATION MESSAGE */}
            {/* ================================= */}

            {(!validImage ||
              !validPrediction ||
              !validConfidence ||
              !validLocation) && (
              <div className="mt-2 text-center lg:text-left">
                <p className="text-[11px] text-red-600">
                  {!validImage
                    ? "Please upload or capture a valid JPG, PNG, or WebP photo up to 10 MB."
                    : !validPrediction
                    ? "A verified waste-bin CNN result is required. Invalid photos cannot be submitted."
                    : !validConfidence
                    ? "Please take a clearer photo for CNN analysis."
                    : "Please select a valid collection location."}
                </p>

                <Link
                  to={CREATE_ROUTE}
                  state={{
                    ...(state ?? {}),
                    photo: null,
                    cnnResult: null,
                    wasteLevel: undefined,
                    confidence: undefined,
                    isValidBin: false,
                  }}
                  className="
                    mt-2 inline-block
                    text-xs font-semibold
                    text-red-600 underline
                  "
                >
                  Choose Another Photo
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
