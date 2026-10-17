import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import SiteDetails from "./SiteDetails";

export default function CreateReport() {
  const navigate = useNavigate();
  const location = useLocation();

  const uploadRef = useRef<HTMLInputElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState("");

  function closePopup() {
    navigate("/resident/report-waste/site", {
      replace: true,
      state: location.state,
    });
  }

  function openCamera() {
    navigate("/resident/report-waste/capture", {
      state: location.state,
    });
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

  function handlePhoto(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    setError("");

    const state = location.state as
      | Record<string, unknown>
      | null;

    navigate("/resident/report-waste/analyzing", {
      state: {
        ...(state ?? {}),
        photo: file,
      },
    });
  }

  return (
    <>
      {/* Site remains visible behind the popup. */}
      <div
        ref={(element) => {
          element?.setAttribute("inert", "");
        }}
      >
        <SiteDetails />
      </div>

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
          className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-1/2 max-h-[calc(100dvh-6rem)] w-[calc(100%_-_1rem)] max-w-[430px] -translate-x-1/2 overflow-y-auto pb-3"
        >
          {/* Upload Photo opens the file picker. */}
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            onChange={handlePhoto}
            aria-label="Upload report photo"
            className="hidden"
          />

          {error && (
            <p
              role="alert"
              className="mb-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div className="overflow-hidden rounded border border-[#ff383c] bg-[#f5e7d2] shadow-sm">
            <button
              ref={firstButtonRef}
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="flex min-h-11 w-full items-center gap-4 border-b border-[#bcae99] px-5 py-2 text-left text-sm font-bold hover:bg-[#fff0dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-600"
            >
              <ImagePlus
                size={23}
                strokeWidth={1.7}
                className="shrink-0"
              />
              UPLOAD PHOTO
            </button>

            {/* Opens the shared Capture page. */}
            <button
              type="button"
              onClick={openCamera}
              className="flex min-h-11 w-full items-center gap-4 px-5 py-2 text-left text-sm font-bold hover:bg-[#fff0dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-600"
            >
              <Camera
                size={23}
                strokeWidth={1.7}
                className="shrink-0"
              />
              OPEN CAMERA
            </button>
          </div>

          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={closePopup}
              className="min-h-11 w-36 rounded border border-[#ff383c] bg-[#f5e7d2] px-5 py-2 text-sm font-medium hover:bg-[#fff0dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </>
  );
}