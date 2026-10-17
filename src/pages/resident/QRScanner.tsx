import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import QrScanner from "qr-scanner";

function cameraErrorMessage(error: unknown) {
  const name =
    error instanceof DOMException || error instanceof Error
      ? error.name
      : "";

  if (name === "NotAllowedError") {
    return "Camera permission was denied. Allow camera access in your browser settings, then retry.";
  }

  if (name === "NotFoundError") {
    return "No camera was found on this device.";
  }

  if (name === "NotReadableError") {
    return "The camera is unavailable. Close other apps using it, then retry.";
  }

  return "Could not start the camera. Check camera permissions and use HTTPS or localhost.";
}

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
      "bottom-[4px] right-[4px] rounded-br-md border-b-[3px] border-r-[3px]",
  },
];

export default function QRScanner() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decodedText, setDecodedText] = useState<
    string | null
  >(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let decoded = false;
    let scanner: QrScanner | null = null;

    function releaseCamera() {
      scanner?.destroy();

      const stream = video!.srcObject;

      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      video!.srcObject = null;
    }

    async function startCamera() {
      setLoading(true);
      setError("");
      setDecodedText(null);

      if (!window.isSecureContext) {
        setError(
          "Camera access requires HTTPS or localhost. A phone opening an HTTP network address cannot access the camera."
        );
        setLoading(false);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "This browser does not support camera access."
        );
        setLoading(false);
        return;
      }

      try {
        scanner = new QrScanner(
          video!,
          (result) => {
            if (disposed || decoded) return;

            decoded = true;
            setDecodedText(result.data);
            setLoading(false);
            releaseCamera();
          },
          {
            preferredCamera: "environment",
            returnDetailedScanResult: true,
            maxScansPerSecond: 10,
            highlightScanRegion: false,
            highlightCodeOutline: false,

            // Decode the central square displayed in the preview.
            calculateScanRegion: (cameraVideo) => {
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

        await scanner.start();

        if (disposed || decoded) {
          releaseCamera();
          return;
        }

        setLoading(false);
      } catch (cameraError) {
        releaseCamera();

        if (!disposed) {
          setError(cameraErrorMessage(cameraError));
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

  function scanAgain() {
    setDecodedText(null);
    setError("");
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  function continueToSite() {
    if (decodedText === null) return;

    navigate("/resident/report-waste/site", {
      state: { qrCode: decodedText },
    });
  }

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-white">
      <div className="scanner-page mx-auto flex min-h-full w-full max-w-[640px] flex-col pb-6 pt-6 sm:pt-8">
        <header className="shrink-0 bg-[#ed0000] px-4 py-3 text-center">
          <h1 className="text-base font-bold text-white">
            QR Scanner
          </h1>
        </header>

        <div className="flex shrink-0 justify-end px-4 pt-2">
          <Link
            to="/resident/report-waste"
            aria-label="Close QR scanner"
            className="grid h-10 w-10 place-items-center rounded-full text-black hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
          >
            <X size={23} strokeWidth={2.5} />
          </Link>
        </div>

        <p
          aria-live="polite"
          className="px-5 text-center text-sm text-neutral-600"
        >
          {decodedText !== null
            ? "QR code detected"
            : "Place the QR code inside the area"}
        </p>

        {/* Responsive camera preview */}
        <div className="scanner-container px-5">
          <div className="scanner-frame relative mx-auto">
            <div className="absolute inset-[6px] overflow-hidden rounded-md bg-neutral-100">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Live camera preview"
                className="block h-full w-full object-cover object-center"
              />

              {loading && (
                <div
                  role="status"
                  className="absolute inset-0 grid place-items-center bg-white/90 px-4 text-center text-sm text-neutral-500"
                >
                  Starting camera...
                </div>
              )}

              {error && (
                <div className="absolute inset-0 grid place-items-center bg-white px-4 text-center text-sm text-red-600">
                  Camera unavailable
                </div>
              )}

              {decodedText !== null && (
                <div className="absolute inset-0 grid place-items-center bg-green-50 px-4 text-center text-sm font-semibold text-green-700">
                  QR code scanned
                </div>
              )}
            </div>

            {/* Animated red scan line */}
            {!error && !loading && decodedText === null && (
              <span
                aria-hidden="true"
                className="qr-scan-line pointer-events-none absolute inset-x-[6px] top-[6px] z-10 h-[2px] rounded-full bg-[#ff383c] shadow-[0_0_8px_#ff383c]"
              />
            )}

            {/* Decorative scanner corners */}
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

        {/* Camera errors */}
        {error && (
          <div
            role="alert"
            className="mx-auto mt-5 w-full max-w-[460px] px-5 text-center"
          >
            <p className="text-sm leading-relaxed text-red-600">
              {error}
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

        {/* Decoded QR content */}
        {decodedText !== null && (
          <div className="mx-auto mt-5 w-full max-w-[460px] px-5">
            <section className="rounded-xl border border-green-200 bg-green-50 p-4">
              <h2 className="text-sm font-semibold text-green-700">
                Scanned QR code
              </h2>

              <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-all text-sm text-neutral-700">
                {decodedText}
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={scanAgain}
                  className="min-h-10 rounded-lg border border-red-600 px-4 py-2 text-sm text-red-600"
                >
                  Scan Again
                </button>

                <button
                  type="button"
                  onClick={continueToSite}
                  className="min-h-10 rounded-lg bg-[#ed0000] px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Continue
                </button>
              </div>
            </section>
          </div>
        )}

        <div className="scanner-actions flex justify-center px-5">
          <Link
            to="/resident/report-waste"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#ed0000] px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Cancel Scanning
          </Link>
        </div>
      </div>

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