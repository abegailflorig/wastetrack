
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import SiteDetails from "./SiteDetails";

const SITE_ROUTE = "/resident/report-waste/site";
const CAMERA_ROUTE = "/resident/report-waste/capture";
const ANALYZING_ROUTE = "/resident/report-waste/analyzing";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export default function CreateReport() {
  const navigate = useNavigate();
  const location = useLocation();

  const uploadRef = useRef<HTMLInputElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState("");

  const previousState =
    (location.state as Record<string, unknown> | null) ?? {};

  // Remove previous CNN prediction data.
  function getCleanState(): Record<string, unknown> {
    const cleanState = { ...previousState };

    delete cleanState.photo;
    delete cleanState.photoSource;
    delete cleanState.wasteLevel;
    delete cleanState.confidence;
    delete cleanState.cnnResult;
    delete cleanState.confirmed;

    return cleanState;
  }

  function closePopup() {
    navigate(SITE_ROUTE, {
      replace: true,
      state: getCleanState(),
    });
  }

  // Open WasteTrack camera page.
  function openCamera() {
    setError("");

    navigate(CAMERA_ROUTE, {
      state: getCleanState(),
    });
  }

  // Open the phone's native image picker.
  function openGallery() {
    setError("");

    if (uploadRef.current) {
      uploadRef.current.click();
    }
  }

  useEffect(() => {
    const previousFocus = document.activeElement;

    firstButtonRef.current?.focus();

    return () => {
      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  }, []);

  // Handle image selected from phone gallery or PC.
  function handlePhoto(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    // Validate image format.
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(
        "Please select a JPG, PNG, or WebP image."
      );
      return;
    }

    // Validate file size.
    if (file.size > MAX_IMAGE_SIZE) {
      setError(
        "The image must be 10 MB or smaller."
      );
      return;
    }

    setError("");

    console.log(
      "[WasteTrack] Gallery photo:",
      file.name
    );

    // Send selected photo to CNN analysis page.
    navigate(ANALYZING_ROUTE, {
      state: {
        ...getCleanState(),
        photo: file,
        photoSource: "gallery",
      },
    });
  }

  return (
    <>
      {/* Site Details background */}
      <div
        ref={(element) => {
          element?.setAttribute("inert", "");
        }}
      >
        <SiteDetails />
      </div>

      {/* Photo options popup */}
      <div className="fixed inset-0 z-[2000]">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close photo options"
          onClick={closePopup}
          className="absolute inset-0 h-full w-full cursor-default bg-transparent"
        />

        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a report photo"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closePopup();
              return;
            }

            if (event.key !== "Tab") return;

            const buttons =
              dialogRef.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)"
              );

            if (!buttons?.length) return;

            const first = buttons[0];
            const last = buttons[buttons.length - 1];

            if (
              event.shiftKey &&
              document.activeElement === first
            ) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === last
            ) {
              event.preventDefault();
              first.focus();
            }
          }}
          className="
            absolute
            bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]
            left-1/2
            max-h-[calc(100dvh-6rem)]
            w-[calc(100%_-_1rem)]
            max-w-[430px]
            -translate-x-1/2
            overflow-y-auto
            pb-3
          "
        >
          {/* Mobile gallery / PC file picker */}
          <input
            ref={uploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhoto}
            aria-label="Choose photo from gallery"
            className="hidden"
          />

          {/* Error message */}
          {error && (
            <p
              role="alert"
              className="
                mb-2 rounded border border-red-200
                bg-red-50 p-3 text-sm text-red-700
              "
            >
              {error}
            </p>
          )}

          <div
            className="
              overflow-hidden rounded
              border border-[#ff383c]
              bg-[#f5e7d2] shadow-sm
            "
          >
            {/* UPLOAD PHOTO */}
            <button
              ref={firstButtonRef}
              type="button"
              onClick={openGallery}
              className="
                flex min-h-11 w-full items-center
                gap-4 border-b border-[#bcae99]
                px-5 py-2 text-left text-sm
                font-bold hover:bg-[#fff0dc]
                focus-visible:outline
                focus-visible:outline-2
                focus-visible:outline-inset
                focus-visible:outline-red-600
              "
            >
              <ImagePlus
                size={23}
                strokeWidth={1.7}
                className="shrink-0"
              />
              UPLOAD PHOTO
            </button>

            {/* OPEN CAMERA */}
            <button
              type="button"
              onClick={openCamera}
              className="
                flex min-h-11 w-full items-center
                gap-4 px-5 py-2 text-left
                text-sm font-bold
                hover:bg-[#fff0dc]
                focus-visible:outline
                focus-visible:outline-2
                focus-visible:outline-inset
                focus-visible:outline-red-600
              "
            >
              <Camera
                size={23}
                strokeWidth={1.7}
                className="shrink-0"
              />
              OPEN CAMERA
            </button>
          </div>

          {/* CANCEL */}
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={closePopup}
              className="
                min-h-11 w-36 rounded
                border border-[#ff383c]
                bg-[#f5e7d2] px-5 py-2
                text-sm font-medium
                hover:bg-[#fff0dc]
                focus-visible:outline
                focus-visible:outline-2
                focus-visible:outline-offset-2
                focus-visible:outline-red-600
              "
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
