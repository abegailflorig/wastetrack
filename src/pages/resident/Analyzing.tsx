
import { useEffect, useState } from "react";

import {
  AlertCircle,
  ArrowLeft,
  ImageOff,
  LoaderCircle,
} from "lucide-react";

import {
  useLocation,
  useNavigate,
} from "react-router";

// ============================================
// TYPES
// ============================================

type WasteLevel =
  | "empty"
  | "half-full"
  | "full"
  | "overflowing";

type AnalysisState = {
  photo?: File | null;
  photoSource?: "gallery" | "camera";
  [key: string]: unknown;
};

type APIResult = {
  is_valid_bin?: unknown;
  waste_level?: unknown;
  confidence?: unknown;
  reason?: unknown;
  detail?: unknown;
  analysis_ms?: unknown;
  probabilities?: unknown;
};

type Problem = {
  kind: "invalid" | "error";
  message: string;
};

// ============================================
// CONFIGURATION
// ============================================

const API_URL = (
  import.meta.env.VITE_CNN_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const REVIEW_ROUTE =
  "/resident/report-waste/review";

const CREATE_ROUTE =
  "/resident/report-waste/create";

const REQUEST_TIMEOUT = 120000;

const MIN_CONFIDENCE = 0.7;

const MAX_IMAGE_SIZE =
  10 * 1024 * 1024;

const MAX_ANALYSIS_EDGE = 800;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// ============================================
// VALIDATE FIVE-CLASS CNN RESULT
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
// OPTIMIZE PHOTO BEFORE CNN ANALYSIS
// ============================================

/*
  Large photos are resized to reduce the
  amount of image data sent to FastAPI.

  IMPORTANT:
  Only the CNN analysis copy is resized.
  The original photo remains unchanged
  for ReviewSubmit and Supabase.
*/

async function preparePhotoForCNN(
  photo: File
): Promise<File> {
  if (
    photo.size <= 350 * 1024 ||
    typeof createImageBitmap !== "function"
  ) {
    return photo;
  }

  let bitmap: ImageBitmap | undefined;

  try {
    bitmap = await createImageBitmap(photo);

    const scale = Math.min(
      1,
      MAX_ANALYSIS_EDGE /
        Math.max(
          bitmap.width,
          bitmap.height
        )
    );

    if (scale === 1) {
      return photo;
    }

    const canvas =
      document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(bitmap.width * scale)
    );

    canvas.height = Math.max(
      1,
      Math.round(bitmap.height * scale)
    );

    const context = canvas.getContext(
      "2d",
      { alpha: false }
    );

    if (!context) {
      return photo;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      bitmap,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const blob =
      await new Promise<Blob | null>(
        (resolve) => {
          canvas.toBlob(
            resolve,
            "image/jpeg",
            0.85
          );
        }
      );

    if (
      !blob ||
      blob.size >= photo.size
    ) {
      return photo;
    }

    return new File(
      [blob],
      "wastetrack-analysis.jpg",
      {
        type: "image/jpeg",
        lastModified: Date.now(),
      }
    );
  } catch (error) {
    console.warn(
      "[WasteTrack] Image optimization skipped:",
      error
    );

    return photo;
  } finally {
    bitmap?.close();
  }
}

// ============================================
// CLEAR PREVIOUS CNN RESULTS
// ============================================

function cleanState(
  state: AnalysisState | null
): AnalysisState {
  const clean: AnalysisState = {
    ...(state ?? {}),
  };

  delete clean.photo;
  delete clean.photoSource;
  delete clean.cnnResult;
  delete clean.wasteLevel;
  delete clean.confidence;
  delete clean.isValidBin;
  delete clean.wasteLevelLabel;
  delete clean.confirmed;

  return clean;
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function Analyzing() {
  const navigate = useNavigate();
  const location = useLocation();

  const state =
    location.state as AnalysisState | null;

  const photo = state?.photo;

  // ==========================================
  // COMPONENT STATES
  // ==========================================

  const [status, setStatus] = useState(
    "Preparing photo..."
  );

  const [problem, setProblem] =
    useState<Problem | null>(null);

  const [attempt, setAttempt] =
    useState(0);

  // ==========================================
  // RUN CNN ANALYSIS
  // ==========================================

  useEffect(() => {
    let active = true;
    let timedOut = false;

    const controller =
      new AbortController();

    const timeout = window.setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      REQUEST_TIMEOUT
    );

    async function analyzePhoto() {
      setProblem(null);

      const started = performance.now();

      try {
        // ======================================
        // STEP 1: VALIDATE PHOTO
        // ======================================

        if (!(photo instanceof File)) {
          setProblem({
            kind: "invalid",
            message:
              "No photo was provided. Please upload or capture a waste-bin photo.",
          });

          return;
        }

        // ======================================
        // STEP 2: VALIDATE IMAGE TYPE
        // ======================================

        if (!ALLOWED_TYPES.has(photo.type)) {
          setProblem({
            kind: "invalid",
            message:
              "Choose a JPG, PNG, or WebP photo.",
          });

          return;
        }

        // ======================================
        // STEP 3: VALIDATE FILE SIZE
        // ======================================

        if (
          photo.size === 0 ||
          photo.size > MAX_IMAGE_SIZE
        ) {
          setProblem({
            kind: "invalid",
            message:
              "Photo must be larger than 0 bytes and no more than 10 MB.",
          });

          return;
        }

        // ======================================
        // STEP 4: OPTIMIZE IMAGE FOR CNN
        // ======================================

        setStatus(
          "Preparing image for fast analysis..."
        );

        const analysisPhoto =
          await preparePhotoForCNN(photo);

        if (!active) {
          return;
        }

        // ======================================
        // STEP 5: SEND PHOTO TO FASTAPI
        // ======================================

        setStatus(
          "CNN is checking the waste bin..."
        );

        const formData = new FormData();

        formData.append(
          "file",
          analysisPhoto,
          analysisPhoto.name
        );

        const response = await fetch(
          `${API_URL}/predict`,
          {
            method: "POST",
            body: formData,
            signal: controller.signal,
          }
        );

        // ======================================
        // STEP 6: READ CNN RESPONSE
        // ======================================

        let data: APIResult;

        try {
          data = (
            await response.json()
          ) as APIResult;
        } catch {
          throw new Error(
            "CNN backend returned an unreadable response."
          );
        }

        if (!response.ok) {
          throw new Error(
            typeof data.detail === "string"
              ? data.detail
              : `CNN API error: ${response.status}`
          );
        }

        if (!active) {
          return;
        }

        // ======================================
        // STEP 7: REJECT INVALID PHOTO
        // ======================================

        if (
          data.is_valid_bin === false ||
          data.waste_level === "Invalid"
        ) {
          setProblem({
            kind: "invalid",
            message:
              typeof data.reason === "string"
                ? data.reason
                : "This does not appear to be a supported waste-bin photo.",
          });

          console.warn(
            "[WasteTrack] Invalid photo:",
            data
          );

          return;
        }

        // Fail closed if the API did not
        // explicitly verify the image.

        if (data.is_valid_bin !== true) {
          throw new Error(
            "The CNN backend did not verify this image."
          );
        }

        // ======================================
        // STEP 8: VALIDATE WASTE LEVEL
        // ======================================

        if (!isWasteLevel(data.waste_level)) {
          throw new Error(
            `Unsupported CNN result: ${String(
              data.waste_level
            )}`
          );
        }

        // ======================================
        // STEP 9: VALIDATE CONFIDENCE
        // ======================================

        if (
          typeof data.confidence !== "number" ||
          !Number.isFinite(data.confidence) ||
          data.confidence < 0 ||
          data.confidence > 1
        ) {
          throw new Error(
            "CNN returned an invalid confidence score."
          );
        }

        if (
          data.confidence < MIN_CONFIDENCE
        ) {
          setProblem({
            kind: "invalid",
            message:
              "The photo is unclear. Please try another waste-bin photo.",
          });

          return;
        }

        if (!active) {
          return;
        }

        // ======================================
        // STEP 10: READ ACTUAL CNN RESULT
        // ======================================

        const wasteLevel =
          data.waste_level;

        const confidence =
          data.confidence;

        const elapsedMs = Math.round(
          performance.now() - started
        );

        console.log(
          "[WasteTrack] Fast CNN analysis:",
          {
            wasteLevel,
            confidence,
            elapsedMs,
            backendMs: data.analysis_ms,
            originalBytes: photo.size,
            uploadedBytes:
              analysisPhoto.size,
            probabilities:
              data.probabilities,
          }
        );

        // ======================================
        // STEP 11: NAVIGATE TO REVIEW
        // ======================================

        navigate(REVIEW_ROUTE, {
          replace: true,

          state: {
            ...(state ?? {}),

            // Preserve the original photo.
            photo,

            photoSource:
              state?.photoSource ?? "gallery",

            cnnResult: {
              waste_level: wasteLevel,
              confidence,
              is_valid_bin: true,
            },

            wasteLevel,
            confidence,
            isValidBin: true,
            wasteLevelLabel: undefined,
          },
        });
      } catch (error) {
        if (!active) {
          return;
        }

        const message = timedOut
          ? "CNN analysis timed out. Check the FastAPI backend."
          : error instanceof TypeError
          ? "Cannot connect to the CNN backend. Make sure port 8000 is running."
          : error instanceof Error
          ? error.message
          : "CNN analysis failed.";

        console.error(
          "[WasteTrack] CNN analysis error:",
          error
        );

        setProblem({
          kind: "error",
          message,
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void analyzePhoto();

    return () => {
      active = false;

      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    photo,
    attempt,
    navigate,
    location.key,
  ]);

  // ==========================================
  // CHOOSE ANOTHER PHOTO
  // ==========================================

  function chooseAnotherPhoto() {
    navigate(CREATE_ROUTE, {
      replace: true,
      state: cleanState(state),
    });
  }

  // ==========================================
  // USER INTERFACE
  // ==========================================

  return (
    <main
      className="
        grid min-h-dvh
        w-full place-items-center
        bg-white px-5 py-8
      "
    >
      <div className="w-full max-w-sm text-center">
        {!problem ? (
          <>
            {/* CIRCULAR SPINNER ONLY */}

            <LoaderCircle
              className="
                mx-auto animate-spin
                text-lime-700
              "
              size={60}
            />

            <h1
              className="
                mt-5 text-base
                font-bold text-red-600
              "
            >
              Analyze Image
            </h1>

            <p
              role="status"
              className="
                mt-3 text-xs
                text-neutral-500
              "
            >
              {status}
            </p>

            <p
              className="
                mt-4 text-[11px]
                text-neutral-400
              "
            >
              Checking photo validity and
              waste level...
            </p>
          </>
        ) : problem.kind === "invalid" ? (
          <>
            {/* INVALID PHOTO */}

            <ImageOff
              className="
                mx-auto text-red-600
              "
              size={52}
            />

            <h1
              className="
                mt-5 text-lg
                font-bold text-red-600
              "
            >
              Invalid Photo
            </h1>

            <p
              role="alert"
              className="
                mt-3 text-sm
                leading-relaxed
                text-neutral-600
              "
            >
              {problem.message}
            </p>

            <p
              className="
                mt-4 text-xs
                text-neutral-500
              "
            >
              Please upload a clear photo
              showing a real waste bin and
              its contents.
            </p>

            <button
              type="button"
              onClick={chooseAnotherPhoto}
              className="
                mt-6 w-full
                rounded-lg bg-red-600
                px-6 py-3
                text-xs font-bold
                text-white
                hover:bg-red-700
              "
            >
              Choose Another Photo
            </button>
          </>
        ) : (
          <>
            {/* CNN ERROR */}

            <AlertCircle
              className="
                mx-auto text-red-600
              "
              size={48}
            />

            <h1
              className="
                mt-4 text-base
                font-bold text-red-600
              "
            >
              CNN Analysis Failed
            </h1>

            <p
              role="alert"
              className="
                mt-3 text-xs
                text-neutral-600
              "
            >
              {problem.message}
            </p>

            <button
              type="button"
              onClick={() =>
                setAttempt(
                  (value) => value + 1
                )
              }
              className="
                mt-6 rounded-lg
                bg-red-600
                px-6 py-2
                text-xs font-bold
                text-white
                hover:bg-red-700
              "
            >
              Retry Analysis
            </button>

            <button
              type="button"
              onClick={chooseAnotherPhoto}
              className="
                mx-auto mt-4 flex
                items-center gap-2
                text-xs text-neutral-600
              "
            >
              <ArrowLeft size={14} />
              Choose Another Photo
            </button>
          </>
        )}
      </div>
    </main>
  );
}
