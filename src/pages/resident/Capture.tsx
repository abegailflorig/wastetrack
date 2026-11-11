
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Scan,
} from "lucide-react";

const CREATE_ROUTE = "/resident/report-waste/create";
const ANALYZING_ROUTE = "/resident/report-waste/analyzing";

export default function Capture() {
  const navigate = useNavigate();
  const location = useLocation();

  const previousState =
    (location.state as Record<string, unknown> | null) ?? {};

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureBusyRef = useRef(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [cameraAttempt, setCameraAttempt] = useState(0);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(
      (track) => track.stop()
    );

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // Start camera
  useEffect(() => {
    if (photo) return;

    let cancelled = false;
    let ownedStream: MediaStream | null = null;

    const video = videoRef.current;

    setReady(false);
    setLoading(true);
    setError("");

    async function startCamera() {
      try {
        if (!window.isSecureContext) {
          throw new Error(
            "Camera access requires HTTPS or localhost."
          );
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Camera is not supported by this browser."
          );
        }

        const stream =
          await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });

        ownedStream = stream;

        if (cancelled) {
          stream.getTracks().forEach(
            (track) => track.stop()
          );
          return;
        }

        if (!video) {
          throw new Error(
            "Camera preview is unavailable."
          );
        }

        streamRef.current = stream;
        video.srcObject = stream;

        await video.play();

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err) {
        ownedStream?.getTracks().forEach(
          (track) => track.stop()
        );

        if (!cancelled) {
          setReady(false);
          setLoading(false);
          setError(
            err instanceof Error
              ? err.message
              : "Unable to access camera."
          );
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;

      ownedStream?.getTracks().forEach(
        (track) => track.stop()
      );

      if (streamRef.current === ownedStream) {
        streamRef.current = null;
      }

      if (video && video.srcObject === ownedStream) {
        video.srcObject = null;
      }
    };
  }, [photo, cameraAttempt]);

  // Generate photo preview
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }

    const url = URL.createObjectURL(photo);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function goBack() {
    stopCamera();

    navigate(CREATE_ROUTE, {
      state: previousState,
    });
  }

  // Capture photo from video
  async function takePhoto() {
    const video = videoRef.current;

    if (
      !video ||
      !ready ||
      captureBusyRef.current ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    captureBusyRef.current = true;
    setCapturing(true);
    setError("");

    try {
      const canvas = document.createElement("canvas");
      const ratio = 6 / 7;

      const videoRatio =
        video.videoWidth / video.videoHeight;

      let sourceWidth = video.videoWidth;
      let sourceHeight = video.videoHeight;
      let sourceX = 0;
      let sourceY = 0;

      if (videoRatio > ratio) {
        sourceWidth = sourceHeight * ratio;
        sourceX =
          (video.videoWidth - sourceWidth) / 2;
      } else {
        sourceHeight = sourceWidth / ratio;
        sourceY =
          (video.videoHeight - sourceHeight) / 2;
      }

      canvas.width = Math.round(sourceWidth);
      canvas.height = Math.round(sourceHeight);

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error(
          "Unable to capture the photo."
        );
      }

      context.drawImage(
        video,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob = await new Promise<Blob>(
        (resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) resolve(result);
              else reject(
                new Error("Unable to save photo.")
              );
            },
            "image/jpeg",
            0.92
          );
        }
      );

      const capturedPhoto = new File(
        [blob],
        `waste-bin-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
        }
      );

      console.log(
        "[WasteTrack] Camera photo:",
        capturedPhoto.name
      );

      stopCamera();
      setReady(false);
      setPhoto(capturedPhoto);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to capture photo."
      );
    } finally {
      captureBusyRef.current = false;
      setCapturing(false);
    }
  }

  // Retake captured photo
  function retakePhoto() {
    setPhoto(null);
    setPreview("");
    setReady(false);
    setLoading(true);
    setError("");
  }

  // Send captured photo to analyzing page
  function uploadPhoto() {
    if (!photo) {
      setError("Capture a photo first.");
      return;
    }

    const nextState = { ...previousState };

    delete nextState.wasteLevel;
    delete nextState.confidence;
    delete nextState.cnnResult;
    delete nextState.confirmed;

    stopCamera();

    navigate(ANALYZING_ROUTE, {
      state: {
        ...nextState,
        photo,
        photoSource: "camera",
      },
    });
  }

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-[430px] flex-col px-5 pb-6 pt-6 sm:max-w-[500px] lg:max-w-[600px]">
        <header>
          <button
            type="button"
            onClick={goBack}
            disabled={capturing}
            aria-label="Back to photo options"
            className="grid h-10 w-10 place-items-center rounded-full text-black disabled:opacity-40"
          >
            <ArrowLeft size={21} />
          </button>
        </header>

        {!photo ? (
          <>
            {/* LIVE CAMERA */}
            <div className="capture-size relative mx-auto mt-3">
              <div className="relative aspect-[6/7] w-full overflow-hidden bg-[#d9d9d9]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onPlaying={() => {
                    setReady(true);
                    setLoading(false);
                  }}
                  onWaiting={() => setReady(false)}
                  aria-label="Live camera preview"
                  className="block h-full w-full object-cover"
                />

                {loading && (
                  <div className="absolute inset-0 grid place-items-center bg-[#d9d9d9] text-xs">
                    <div className="text-center">
                      <LoaderCircle
                        className="mx-auto mb-3 animate-spin"
                        size={26}
                      />
                      Opening camera...
                    </div>
                  </div>
                )}
              </div>

              {/* CAMERA SHUTTER */}
              <button
                type="button"
                onClick={() => void takePhoto()}
                disabled={
                  !ready || capturing || !!error
                }
                aria-label="Take photo"
                className="absolute bottom-0 left-1/2 grid h-12 w-12 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full bg-white disabled:opacity-40"
              >
                <Scan size={32} />

                <span className="absolute h-3.5 w-3.5 rounded-full bg-black" />
              </button>
            </div>

            {/* PHOTO GUIDELINES */}
            <section className="mx-auto mt-10 w-full max-w-[350px]">
              <h1 className="mb-3 text-sm font-semibold">
                Photo Guidelines
              </h1>

              <ul className="space-y-1.5">
                <Guideline>
                  Take a clear photo of the waste bin
                </Guideline>
                <Guideline>
                  Make sure the bin is the main focus
                </Guideline>
                <Guideline>
                  Avoid blurry or dark images
                </Guideline>
                <Guideline>
                  Make sure the waste inside the bin is visible
                </Guideline>
              </ul>
            </section>
          </>
        ) : (
          <>
            {/* CAPTURED PHOTO PREVIEW */}
            <section className="capture-size mx-auto mt-8">
              {preview && (
                <img
                  src={preview}
                  alt="Captured waste-bin photo"
                  className="aspect-[6/7] w-full rounded-md object-cover"
                />
              )}
            </section>

            {/* PHOTO ACTIONS */}
            <div className="mx-auto mt-auto grid w-full max-w-[350px] grid-cols-2 gap-2 pt-8">
              <button
                type="button"
                onClick={retakePhoto}
                className="min-h-11 rounded border border-[#ff383c] bg-[#f5e7d2] text-xs"
              >
                RETAKE
              </button>

              <button
                type="button"
                onClick={uploadPhoto}
                className="min-h-11 rounded border border-[#ff383c] bg-[#f5e7d2] text-xs"
              >
                UPLOAD PHOTO
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="mx-auto mt-5 w-full max-w-[350px]">
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>

            {!photo && (
              <button
                type="button"
                onClick={() =>
                  setCameraAttempt((value) => value + 1)
                }
                className="mt-3 rounded border px-4 py-2 text-xs"
              >
                Retry Camera
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        .capture-size {
          width: min(100%, 330px, 54dvh);
        }

        @media (min-width: 768px) {
          .capture-size {
            width: min(100%, 380px, 60dvh);
          }
        }
      `}</style>
    </main>
  );
}

function Guideline({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-1.5 text-xs leading-relaxed text-neutral-700">
      <span className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[#00a641] text-white">
        <Check size={10} strokeWidth={3} />
      </span>
      <span>{children}</span>
    </li>
  );
}
