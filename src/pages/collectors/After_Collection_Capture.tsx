
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Scan,
} from "lucide-react";

type CollectionDraft = {
  status?: "collected" | "not-collected";
  remarks?: string;
  photo?: File | null;
  [key: string]: unknown;
};

type CaptureState = {
  returnTo?: string;
  draft?: CollectionDraft;
  [key: string]: unknown;
};

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
        return "Camera permission was denied. Allow camera access in your browser settings.";

      case "NotFoundError":
        return "No camera was found on this device.";

      case "NotReadableError":
        return "The camera is unavailable or being used by another application.";

      default:
        return "Unable to open the camera. Please try again.";
    }
  }

  return error instanceof Error
    ? error.message
    : "Unable to open the camera.";
}

export default function AfterCollectionCapture() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as CaptureState | null;
  const draft = state?.draft;

  const collectorReturnTo =
    state?.returnTo === "/collector/collection-details" ||
    state?.returnTo?.startsWith(
      "/collector/collection-details/"
    )
      ? state.returnTo
      : "/collector/waste-collection";

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureBusyRef = useRef(false);
  const mountedRef = useRef(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);

  // COMPONENT LIFECYCLE

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
    };
  }, []);

  // INITIALIZE CAMERA

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
            "This browser does not support live camera access."
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
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (!video) {
          throw new Error("Camera preview is unavailable.");
        }

        streamRef.current = stream;
        video.srcObject = stream;

        await video.play();

        if (!cancelled) {
          setLoading(false);
        }
      } catch (cameraError) {
        ownedStream
          ?.getTracks()
          .forEach((track) => track.stop());

        if (streamRef.current === ownedStream) {
          streamRef.current = null;
        }

        if (!cancelled) {
          setReady(false);
          setLoading(false);
          setError(cameraErrorMessage(cameraError));
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;

      ownedStream
        ?.getTracks()
        .forEach((track) => track.stop());

      if (streamRef.current === ownedStream) {
        streamRef.current = null;
      }

      if (video && video.srcObject === ownedStream) {
        video.srcObject = null;
      }
    };
  }, [photo, cameraAttempt]);

  // IMAGE PREVIEW

  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }

    const url = URL.createObjectURL(photo);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // STOP CAMERA

  function stopCamera() {
    streamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // GO BACK

  function goBack() {
    stopCamera();

    navigate(collectorReturnTo, {
      replace: true,
      state: {
        ...(state ?? {}),
      },
    });
  }

  // TAKE PHOTO

  async function takePhoto() {
    const video = videoRef.current;

    if (
      !video ||
      !ready ||
      captureBusyRef.current ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return;
    }

    captureBusyRef.current = true;
    setCapturing(true);
    setError("");

    try {
      const canvas = document.createElement("canvas");

      const frameRatio = 6 / 7;
      const sourceRatio =
        video.videoWidth / video.videoHeight;

      let sourceWidth = video.videoWidth;
      let sourceHeight = video.videoHeight;
      let sourceX = 0;
      let sourceY = 0;

      if (sourceRatio > frameRatio) {
        sourceWidth = sourceHeight * frameRatio;
        sourceX =
          (video.videoWidth - sourceWidth) / 2;
      } else {
        sourceHeight = sourceWidth / frameRatio;
        sourceY =
          (video.videoHeight - sourceHeight) / 2;
      }

      canvas.width = Math.round(sourceWidth);
      canvas.height = Math.round(sourceHeight);

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Unable to capture the photo.");
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
              if (result) {
                resolve(result);
              } else {
                reject(
                  new Error("Unable to create the photo.")
                );
              }
            },
            "image/jpeg",
            0.92
          );
        }
      );

      if (!mountedRef.current) return;

      const capturedPhoto = new File(
        [blob],
        `collection-photo-${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      stopCamera();
      setReady(false);
      setPhoto(capturedPhoto);
    } catch (captureError) {
      if (!mountedRef.current) return;

      setError(
        captureError instanceof Error
          ? captureError.message
          : "Unable to capture the photo."
      );
    } finally {
      captureBusyRef.current = false;

      if (mountedRef.current) {
        setCapturing(false);
      }
    }
  }

  // RETAKE PHOTO

  function retakePhoto() {
    setError("");
    setReady(false);
    setLoading(true);
    setPhoto(null);
  }

  // SUBMIT CAPTURED PHOTO

  function uploadPhoto() {
    if (!photo) return;

    stopCamera();

    navigate("/collector/submit-collection", {
      replace: true,
      state: {
        ...(state ?? {}),
        photo,
        capturedPhoto: photo,
        draft: {
          ...draft,
          photo,
        },
      },
    });
  }

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-[430px] flex-col px-5 pb-6 pt-6 sm:max-w-[500px] lg:max-w-[600px]">

        <header className="shrink-0">
          <button
            type="button"
            onClick={goBack}
            disabled={capturing}
            aria-label="Back to collection details"
            className="grid h-10 w-10 place-items-center rounded-full text-black hover:bg-neutral-100 disabled:opacity-40"
          >
            <ArrowLeft size={21} strokeWidth={1.6} />
          </button>
        </header>

        {!photo ? (
          <>
            <div className="capture-size relative mx-auto mt-3">
              <div className="relative aspect-[6/7] w-full overflow-hidden bg-[#d9d9d9]">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  onPlaying={() => {
                    setReady(true);
                    setLoading(false);
                  }}
                  onWaiting={() => setReady(false)}
                  aria-label="Live collection camera preview"
                  className="block h-full w-full object-cover object-center"
                />

                {loading && (
                  <div
                    role="status"
                    className="absolute inset-0 grid place-items-center bg-[#d9d9d9] px-4 text-center text-xs text-neutral-600"
                  >
                    <div>
                      <LoaderCircle
                        size={26}
                        className="mx-auto mb-3 animate-spin"
                      />
                      Opening camera...
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => void takePhoto()}
                disabled={!ready || capturing || !!error}
                aria-label="Take a collection photo"
                className="absolute bottom-0 left-1/2 grid h-12 w-12 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full bg-white text-black disabled:opacity-40"
              >
                <Scan size={32} strokeWidth={2} />
                <span
                  aria-hidden="true"
                  className="absolute h-3.5 w-3.5 rounded-full bg-black"
                />
              </button>
            </div>

            <section className="mx-auto mt-10 w-full max-w-[350px]">
              <h1 className="mb-3 text-sm font-semibold text-black">
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
              </ul>
            </section>
          </>
        ) : (
          <>
            <section className="capture-size mx-auto mt-8">
              <h1 className="sr-only">
                Review captured collection photo
              </h1>

              {preview ? (
                <img
                  src={preview}
                  alt="Captured collection evidence"
                  draggable={false}
                  className="block aspect-[6/7] w-full rounded-md object-cover"
                />
              ) : (
                <div className="aspect-[6/7] w-full bg-neutral-100" />
              )}
            </section>

            <div className="mx-auto mt-auto grid w-full max-w-[350px] grid-cols-2 gap-2 pt-8">
              <button
                type="button"
                onClick={retakePhoto}
                className="flex min-h-11 items-center justify-center rounded border border-[#ff383c] bg-[#f5e7d2] px-2 text-xs font-medium text-black hover:bg-[#f0ddc2]"
              >
                RETAKE
              </button>

              <button
                type="button"
                onClick={uploadPhoto}
                className="flex min-h-11 items-center justify-center rounded border border-[#ff383c] bg-[#f5e7d2] px-2 text-xs font-medium text-black hover:bg-[#f0ddc2]"
              >
                UPLOAD PHOTO
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="mx-auto mt-5 w-full max-w-[350px]">
            <p
              role="alert"
              className="text-xs leading-relaxed text-red-700"
            >
              {error}
            </p>

            {!photo && (
              <button
                type="button"
                onClick={() =>
                  setCameraAttempt((value) => value + 1)
                }
                className="mt-3 min-h-10 rounded-lg border border-red-300 px-4 text-xs font-semibold text-red-700"
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

        @media (orientation: landscape) and (max-height: 600px) {
          .capture-size {
            width: min(100%, 300px, 60dvh);
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
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[#00a641] text-white"
      >
        <Check size={10} strokeWidth={3} />
      </span>

      <span>{children}</span>
    </li>
  );
}
