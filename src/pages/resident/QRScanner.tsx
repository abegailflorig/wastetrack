
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Link, useNavigate } from "react-router";
import QrScanner from "qr-scanner";
import { supabase } from "../../lib/supabase";

// ==========================================
// ROUTES AND CONFIGURATION
// ==========================================

const SITE_DETAILS_ROUTE = "/resident/report-waste/site";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==========================================
// TYPES
// ==========================================

type RegisteredSite = {
  site_id: string;
  site_name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  qr_code: string | null;
  is_registered: boolean;
  is_active: boolean;
};

type QRIdentifier = {
  siteId: string | null;
  qrCode: string;
};

// ==========================================
// CAMERA ERROR HANDLING
// ==========================================

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";

  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError"
  ) {
    return "Camera permission was denied. Allow camera access in your browser settings and retry.";
  }

  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError"
  ) {
    return "No camera was found on this device.";
  }

  if (
    name === "NotReadableError" ||
    name === "TrackStartError"
  ) {
    return "The camera is busy. Close other apps using the camera and retry.";
  }

  return "Could not start the camera. Use HTTPS or localhost, check permissions, and retry.";
}

// ==========================================
// PARSE QR CODE
// ==========================================

// Supports:
// 1. A raw site UUID
// 2. A custom disposal_sites.qr_code
// 3. A WasteTrack URL with ?siteId=UUID

function parseQRValue(scanned: string): QRIdentifier {
  const value = scanned.trim();

  if (!value || value.length > 2048) {
    throw new Error(
      "Invalid QR code. Please scan a WasteTrack disposal-site QR code."
    );
  }

  if (UUID_RE.test(value)) {
    return {
      siteId: value,
      qrCode: value,
    };
  }

  if (/^https?:\/\//i.test(value)) {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new Error(
        "This QR code contains an invalid link."
      );
    }

    if (
      !/^\/resident\/report-waste\/qr\/?$/.test(
        url.pathname
      )
    ) {
      throw new Error(
        "This is not a WasteTrack registered-site QR link."
      );
    }

    const siteId =
      url.searchParams.get("siteId")?.trim() ?? "";

    const qrCode =
      url.searchParams.get("qrCode")?.trim() ?? "";

    if (siteId) {
      if (!UUID_RE.test(siteId)) {
        throw new Error(
          "This QR code contains an invalid site ID."
        );
      }

      return {
        siteId,
        qrCode: qrCode || siteId,
      };
    }

    if (qrCode && qrCode.length <= 200) {
      return {
        siteId: null,
        qrCode,
      };
    }

    throw new Error(
      "No disposal-site identifier was found in this QR code."
    );
  }

  if (
    value.length <= 200 &&
    /^[a-z0-9_.:-]+$/i.test(value)
  ) {
    return {
      siteId: null,
      qrCode: value,
    };
  }

  throw new Error(
    "This is not a valid WasteTrack disposal-site QR code."
  );
}

// ==========================================
// VERIFY DISPOSAL SITE IN SUPABASE
// ==========================================

async function findRegisteredSite(
  identifier: QRIdentifier
): Promise<RegisteredSite> {
  const fields =
    "site_id,site_name,location,latitude,longitude,qr_code,is_registered,is_active";

  let site: RegisteredSite | null = null;

  // Search by site ID first.
  if (identifier.siteId) {
    const { data, error } = await supabase
      .from("disposal_sites")
      .select(fields)
      .eq("site_id", identifier.siteId)
      .eq("is_registered", true)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    site =
      (data as unknown as RegisteredSite | null) ??
      null;
  }

  // Search by QR code if no site was found.
  if (!site) {
    const { data, error } = await supabase
      .from("disposal_sites")
      .select(fields)
      .eq("qr_code", identifier.qrCode)
      .eq("is_registered", true)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    site =
      (data as unknown as RegisteredSite | null) ??
      null;
  }

  if (!site) {
    throw new Error(
      "This QR code does not match an active, registered disposal site."
    );
  }

  const latitude = Number(site.latitude);
  const longitude = Number(site.longitude);

  if (
    site.latitude === null ||
    site.longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      "This registered site has missing or invalid map coordinates."
    );
  }

  return site;
}

// ==========================================
// SCANNER CORNER DESIGN
// ==========================================

const corners = [
  {
    outer:
      "left-0 top-0 rounded-tl-lg border-l-[4px] border-t-[4px]",
    middle:
      "left-[2px] top-[2px] rounded-tl-md border-l-[3px] border-t-[3px]",
    inner:
      "left-[4px] top-[4px] rounded-tl-md border-l-[3px] border-t-[3px]",
  },
  {
    outer:
      "right-0 top-0 rounded-tr-lg border-r-[4px] border-t-[4px]",
    middle:
      "right-[2px] top-[2px] rounded-tr-md border-r-[3px] border-t-[3px]",
    inner:
      "right-[4px] top-[4px] rounded-tr-md border-r-[3px] border-t-[3px]",
  },
  {
    outer:
      "bottom-0 left-0 rounded-bl-lg border-b-[4px] border-l-[4px]",
    middle:
      "bottom-[2px] left-[2px] rounded-bl-md border-b-[3px] border-l-[3px]",
    inner:
      "bottom-[4px] left-[4px] rounded-bl-md border-b-[3px] border-l-[3px]",
  },
  {
    outer:
      "bottom-0 right-0 rounded-br-lg border-b-[4px] border-r-[4px]",
    middle:
      "bottom-[2px] right-[2px] rounded-br-md border-b-[3px] border-r-[3px]",
    inner:
      "bottom-[4px] right-[4px] rounded-br-md border-r-[3px] border-b-[3px]",
  },
];

// ==========================================
// MAIN QR SCANNER COMPONENT
// ==========================================

export default function QRScanner() {
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement>(null);

  // ========================================
  // STATES
  // ========================================

  const [attempt, setAttempt] = useState(0);

  const [loading, setLoading] = useState(true);

  const [cameraError, setCameraError] = useState("");

  const [decodedText, setDecodedText] =
    useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);

  const [verificationError, setVerificationError] =
    useState("");

  const [verifiedSiteName, setVerifiedSiteName] =
    useState("");

  // ========================================
  // CAMERA INITIALIZATION
  // ========================================

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    // Non-null reference for TypeScript.
    const videoElement: HTMLVideoElement = video;

    let disposed = false;
    let decoded = false;

    let scanner: QrScanner | null = null;

    // ====================================
    // STOP CAMERA
    // ====================================

    function releaseCamera() {
      const current = scanner;
      scanner = null;

      current?.destroy();

      const stream = videoElement.srcObject;

      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }

      videoElement.srcObject = null;
    }

    // ====================================
    // START CAMERA
    // ====================================

    async function startCamera() {
      setLoading(true);
      setCameraError("");

      if (!window.isSecureContext) {
        setCameraError(
          "Camera access requires HTTPS or localhost. On a phone, use your deployed HTTPS WasteTrack website."
        );

        setLoading(false);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "This browser does not support camera access."
        );

        setLoading(false);
        return;
      }

      try {
        const instance = new QrScanner(
          videoElement,

          (result: { data: string }) => {
            if (disposed || decoded) {
              return;
            }

            decoded = true;

            releaseCamera();

            setDecodedText(result.data);
            setLoading(false);
          },

          {
            preferredCamera: "environment",

            returnDetailedScanResult: true,

            maxScansPerSecond: 10,

            highlightScanRegion: false,

            highlightCodeOutline: false,

            calculateScanRegion: (
              cameraVideo: HTMLVideoElement
            ) => {
              const size = Math.min(
                cameraVideo.videoWidth,
                cameraVideo.videoHeight
              );

              return {
                x: Math.round(
                  (cameraVideo.videoWidth - size) / 2
                ),

                y: Math.round(
                  (cameraVideo.videoHeight - size) / 2
                ),

                width: size,
                height: size,

                downScaledWidth: 400,
                downScaledHeight: 400,
              };
            },
          }
        );

        scanner = instance;

        await instance.start();

        if (disposed || decoded) {
          releaseCamera();
          return;
        }

        setLoading(false);
      } catch (cause) {
        releaseCamera();

        if (!disposed && !decoded) {
          setCameraError(
            cameraErrorMessage(cause)
          );

          setLoading(false);
        }
      }
    }

    void startCamera();

    return () => {
      disposed = true;
      releaseCamera();
    };
  }, [attempt]);

  // ========================================
  // VERIFY QR AND NAVIGATE
  // ========================================

  useEffect(() => {
    if (decodedText === null) {
      return;
    }

    let active = true;

    async function verifyAndOpenSite() {
      setVerifying(true);
      setVerificationError("");
      setVerifiedSiteName("");

      try {
        // Parse scanned QR.
        const identifier = parseQRValue(decodedText!);

        // Verify against Supabase.
        const site = await findRegisteredSite(identifier);

        if (!active) {
          return;
        }

        setVerifiedSiteName(site.site_name);

        // Prepare SiteDetails location data.
        const selectedLocation = {
          latitude: Number(site.latitude),
          longitude: Number(site.longitude),

          address: site.location ?? "",

          siteId: site.site_id,
          siteName: site.site_name,

          qrCode:
            site.qr_code?.trim() ||
            site.site_id,

          isRegistered: true,
          description: "",
        };

        // ====================================
        // AUTO-NAVIGATE TO SITEDETAILS.TSX
        // ====================================

        navigate(SITE_DETAILS_ROUTE, {
          replace: true,

          state: {
            selectedLocation,
            qrCode: selectedLocation.qrCode,
          },
        });
      } catch (cause) {
        if (!active) {
          return;
        }

        console.error(
          "[WasteTrack] QR verification:",
          cause
        );

        setVerificationError(
          cause instanceof Error
            ? cause.message
            : "Unable to verify this QR code."
        );
      } finally {
        if (active) {
          setVerifying(false);
        }
      }
    }

    void verifyAndOpenSite();

    return () => {
      active = false;
    };
  }, [decodedText, navigate]);

  // ========================================
  // SCAN AGAIN
  // ========================================

  function scanAgain() {
    setDecodedText(null);
    setVerificationError("");
    setVerifiedSiteName("");
    setVerifying(false);

    setCameraError("");
    setLoading(true);

    setAttempt((current) => current + 1);
  }

  // ========================================
  // USER INTERFACE
  // ========================================

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-white">
      <div className="scanner-page mx-auto flex min-h-full w-full max-w-[640px] flex-col pb-6 pt-6 sm:pt-8">

        {/* ====================================
            HEADER - NO X ICON
        ==================================== */}

        <header className="shrink-0 bg-[#ed0000] px-4 py-3 text-center">
          <h1 className="text-base font-bold text-white">
            QR Scanner
          </h1>
        </header>

        {/* ====================================
            SCANNER MESSAGE
        ==================================== */}

        <p
          aria-live="polite"
          className="px-5 text-center text-sm text-neutral-600"
        >
          {verifying
            ? "Verifying registered location..."
            : verifiedSiteName
              ? "Location verified. Opening Site Details..."
              : decodedText !== null
                ? verificationError
                  ? "QR verification failed"
                  : "QR code detected"
                : "Place the QR code inside the area"}
        </p>

        {/* ====================================
            LIVE CAMERA PREVIEW
        ==================================== */}

        <div className="scanner-container px-5">
          <div className="scanner-frame relative mx-auto">
            <div className="absolute inset-[6px] overflow-hidden rounded-md bg-neutral-100">

              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Live QR camera preview"
                className="block h-full w-full object-cover object-center"
              />

              {/* CAMERA LOADING - INSIDE BOX ONLY */}

              {loading &&
                decodedText === null &&
                !cameraError && (
                  <div
                    role="status"
                    className="absolute inset-0 grid place-items-center bg-white/90 px-4 text-center text-sm text-neutral-500"
                  >
                    Starting camera...
                  </div>
                )}

              {/* CAMERA ERROR */}

              {cameraError && (
                <div className="absolute inset-0 grid place-items-center bg-white px-4 text-center text-sm text-red-600">
                  Camera unavailable
                </div>
              )}

              {/* QR VERIFICATION STATUS - INSIDE BOX */}

              {decodedText !== null && (
                <div
                  className={`absolute inset-0 grid place-items-center px-4 text-center text-sm font-semibold ${
                    verificationError
                      ? "bg-red-50 text-red-700"
                      : "bg-green-50 text-green-700"
                  }`}
                >
                  {verifying ? (
                    <span className="flex items-center gap-2">
                      <LoaderCircle
                        size={19}
                        className="animate-spin"
                      />
                      Verifying location...
                    </span>
                  ) : verificationError ? (
                    "Invalid or unregistered QR code"
                  ) : verifiedSiteName ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={20} />
                      Location verified
                    </span>
                  ) : (
                    "QR code scanned"
                  )}
                </div>
              )}
            </div>

            {/* ====================================
                ANIMATED SCANNING LINE
            ==================================== */}

            {!cameraError &&
              !loading &&
              decodedText === null && (
                <span
                  aria-hidden="true"
                  className="qr-scan-line pointer-events-none absolute inset-x-[6px] top-[6px] z-10 h-[2px] rounded-full bg-[#ff383c] shadow-[0_0_8px_#ff383c]"
                />
              )}

            {/* ====================================
                DECORATIVE SCANNER CORNERS
            ==================================== */}

            <div
              aria-hidden="true"
              className="pointer-events-none"
            >
              {corners.map((corner, index) => (
                <div key={index}>
                  <span
                    className={`absolute z-20 h-8 w-8 border-[#ffbd00] ${corner.outer}`}
                  />

                  <span
                    className={`absolute z-20 h-[29px] w-[29px] border-[#ff383c] ${corner.middle}`}
                  />

                  <span
                    className={`absolute z-20 h-[27px] w-[27px] border-[#00b5cc] ${corner.inner}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ====================================
            CAMERA ERROR AND RETRY
        ==================================== */}

        {cameraError && (
          <div
            role="alert"
            className="mx-auto mt-5 w-full max-w-[460px] px-5 text-center"
          >
            <p className="text-sm leading-relaxed text-red-600">
              {cameraError}
            </p>

            <button
              type="button"
              onClick={scanAgain}
              className="mt-3 min-h-10 rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Retry Camera
            </button>
          </div>
        )}

        {/* ====================================
            INVALID QR ERROR ONLY
            NO LOADING BELOW SCANNER
        ==================================== */}

        {decodedText !== null &&
          !verifying &&
          verificationError && (
            <div className="mx-auto mt-5 w-full max-w-[460px] px-5">
              <section
                className="rounded-xl border border-red-200 bg-red-50 p-4"
                role="alert"
              >
                <h2 className="text-sm font-semibold text-red-700">
                  Location not verified
                </h2>

                <p className="mt-2 break-words text-sm text-red-700">
                  {verificationError}
                </p>

                <button
                  type="button"
                  onClick={scanAgain}
                  className="mt-4 min-h-10 rounded-lg bg-[#ed0000] px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Scan Again
                </button>
              </section>
            </div>
          )}

        {/* ====================================
            CANCEL SCANNING
        ==================================== */}

        <div className="scanner-actions flex justify-center px-5">
          <Link
            to="/resident/report-waste"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#ed0000] px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Cancel Scanning
          </Link>
        </div>
      </div>

      {/* ====================================
          RESPONSIVE CSS
      ==================================== */}

      <style>{`
        .scanner-container {
          margin-top: clamp(16px, 4dvh, 36px);
        }

        .scanner-frame {
          width: min(100%, 78vw, 420px, 52dvh);
          aspect-ratio: 1 / 1;
        }

        .scanner-actions {
          margin-top: clamp(20px, 4dvh, 36px);
        }

        .qr-scan-line {
          animation: qr-scan-move 2.5s ease-in-out infinite alternate;
        }

        @keyframes qr-scan-move {
          from {
            top: 6px;
          }
          to {
            top: calc(100% - 8px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .qr-scan-line {
            animation: none;
            top: 50%;
          }
        }

        @media (orientation: landscape) and (max-height: 600px) {
          .scanner-page {
            padding-top: 8px;
          }

          .scanner-container {
            margin-top: 12px;
          }

          .scanner-frame {
            width: min(100%, 320px, 48dvh);
          }

          .scanner-actions {
            margin-top: 16px;
          }
        }
      `}</style>
    </main>
  );
}
