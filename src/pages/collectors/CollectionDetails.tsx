import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  MapPin,
  Trash2,
} from "lucide-react";

import bin3 from "../../assets/bin3.png";

type CollectionStatus = "collected" | "not-collected";

type CollectionDraft = {
  status?: CollectionStatus;
  remarks?: string;
  photo?: File | null;
};

type DetailsState = {
  capturedPhoto?: File;
  draft?: CollectionDraft;
};

export default function CollectionDetails() {
  const location = useLocation();
  const state = location.state as DetailsState | null;

  const [status, setStatus] = useState<CollectionStatus>(
    state?.draft?.status === "not-collected"
      ? "not-collected"
      : "collected"
  );

  const [remarks, setRemarks] = useState(
    state?.draft?.remarks || ""
  );

  const [photo, setPhoto] = useState<File | null>(() => {
    if (state?.capturedPhoto instanceof File) {
      return state.capturedPhoto;
    }

    return state?.draft?.photo instanceof File
      ? state.draft.photo
      : null;
  });

  const [photoPreview, setPhotoPreview] = useState("");
  const previewSlideRef = useRef<HTMLDivElement | null>(null);
  const photoStripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const incoming = location.state as DetailsState | null;

    if (incoming?.draft) {
      if (
        incoming.draft.status === "collected" ||
        incoming.draft.status === "not-collected"
      ) {
        setStatus(incoming.draft.status);
      }

      if (typeof incoming.draft.remarks === "string") {
        setRemarks(incoming.draft.remarks);
      }
    }

    if (incoming?.capturedPhoto instanceof File) {
      setPhoto(incoming.capturedPhoto);
    }
  }, [location.state]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }

    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!photoPreview) return;

    const strip = photoStripRef.current;
    const slide = previewSlideRef.current;

    if (strip && slide) {
      strip.scrollTo({
        left:
          slide.getBoundingClientRect().left -
          strip.getBoundingClientRect().left +
          strip.scrollLeft,
        behavior: "smooth",
      });
    }
  }, [photoPreview]);

  const captureState = {
    returnTo: location.pathname,
    draft: {
      status,
      remarks,
      photo,
    },
  };

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-3 pb-3 pt-7 sm:px-4">
        {/* Fixed heading */}
        <header className="shrink-0 rounded-t-xl bg-[#A61B1B] px-1 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <Link
              to="/collector/waste-collection"
              aria-label="Back to waste collection"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ArrowLeft size={20} strokeWidth={1.8} />
            </Link>

            <h1 className="text-base font-bold text-white">
              Waste Collection
            </h1>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="relative -mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-t-2xl border-x border-neutral-200 bg-white px-3 pb-8 pt-3">
          {/* Site summary */}
          <section className="flex items-center gap-3 rounded-2xl border border-[#bfb7b9] bg-[#fff6f7] p-3 shadow-[0_3px_3px_rgba(0,0,0,0.20)]">
            <div
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#eaa8b2] text-[#ff092b]"
            >
              <Trash2 size={33} strokeWidth={2.4} />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold leading-tight text-black">
                C-Park, Bin 1
              </h2>

              <p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-800">
                <MapPin size={13} className="shrink-0" />
                Miguel Sheker Ave
              </p>

              <p className="mt-1 pl-4 text-[10px] text-neutral-800">
                QR-143
              </p>
            </div>
          </section>

          {/* Collection status */}
          <section className="mt-5 rounded-xl border border-[#bdbdbd] bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold text-[#b51b1b]">
              Collection Status
            </h2>

            <div
              role="group"
              aria-label="Collection status"
              className="space-y-2"
            >
              <StatusOption
                label="Collected"
                selected={status === "collected"}
                onSelect={() => setStatus("collected")}
                tone="green"
              />

              <StatusOption
                label="Not Collected"
                selected={status === "not-collected"}
                onSelect={() => setStatus("not-collected")}
                tone="gray"
              />
            </div>
          </section>

          {/* Collection details */}
          <section className="mt-3 overflow-hidden rounded-xl border border-[#bdbdbd] bg-white">
            <h2 className="px-3 pb-2 pt-3 text-sm font-semibold text-[#b51b1b]">
              Collection Details
            </h2>

            <DetailRow
              icon={<CalendarDays size={17} />}
              label="Date Collected"
              value="August 19, 2026 (Wed)"
            />

            <DetailRow
              icon={<Clock3 size={17} />}
              label="Time Completed"
              value="2:20 PM"
            />

            <div className="px-4 pb-3 pt-3 sm:px-6">
              <label
                htmlFor="collection-remarks"
                className="block text-xs text-neutral-900"
              >
                Remarks (optional)
              </label>

              <textarea
                id="collection-remarks"
                value={remarks}
                onChange={(event) =>
                  setRemarks(event.target.value)
                }
                placeholder="Area is clean."
                rows={2}
                className="mt-2 block w-full resize-y rounded-lg border border-[#b8b2ad] bg-[#f8f3e8] px-3 py-2 text-xs text-neutral-800 placeholder:text-[#8a8378] focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </div>
          </section>

          {/* Horizontal photo strip */}
          <section className="mt-3 min-w-0 rounded-xl border border-[#bdbdbd] bg-white p-3">
            <h2 className="mb-3 text-sm font-semibold text-[#b51b1b]">
              Before Collection
            </h2>

            <div
              ref={photoStripRef}
              role="region"
              aria-label="Collection photos; scroll horizontally"
              tabIndex={0}
              className="flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
            >
              {/* Full-width before photo */}
              <div className="w-full shrink-0 snap-start px-2">
                <img
                  src={bin3}
                  alt="C-Park waste bin before collection"
                  draggable={false}
                  className="block aspect-[3/2] w-full rounded-xl object-cover"
                />
              </div>

              {/* Navigate to Capture.tsx */}
              <div className="flex w-full shrink-0 snap-start items-center justify-center px-2">
                <Link
                  to="/collector/capture"
                  state={captureState}
                  className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-3 rounded-xl border border-[#c6c6c6] bg-white text-neutral-900 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
                >
                  <Camera
                    size={42}
                    strokeWidth={2.3}
                    className="text-[#aaa]"
                  />

                  <span className="text-xs font-medium">
                    {photo ? "Retake photo" : "Take a photo"}
                  </span>
                </Link>
              </div>

              {/* Photo returned from Capture */}
              {photoPreview && (
                <div
                  ref={previewSlideRef}
                  className="w-full shrink-0 snap-start px-2"
                >
                  <img
                    src={photoPreview}
                    alt="Waste bin after collection"
                    draggable={false}
                    className="block aspect-[3/2] w-full rounded-xl object-cover"
                  />
                </div>
              )}
            </div>

            <p className="mt-2 text-center text-[10px] text-neutral-500">
              Swipe left to take a photo
            </p>

            {photo && (
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  photoStripRef.current?.scrollTo({
                    left: 0,
                    behavior: "smooth",
                  });
                }}
                className="mt-2 min-h-9 w-full text-xs font-medium text-red-700 hover:underline"
              >
                Remove photo
              </button>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

type StatusOptionProps = {
  label: string;
  selected: boolean;
  onSelect: () => void;
  tone: "green" | "gray";
};

function StatusOption({
  label,
  selected,
  onSelect,
  tone,
}: StatusOptionProps) {
  const green = tone === "green";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 ${
        selected
          ? green
            ? "border-[#69cf8b] bg-[#dff3e8] text-[#005d27]"
            : "border-neutral-500 bg-neutral-200 text-neutral-800"
          : "border-[#bdbdbd] bg-[#ededed] text-[#484848]"
      }`}
    >
      <span>{label}</span>

      <span
        aria-hidden="true"
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
          selected
            ? green
              ? "bg-[#006328] text-white"
              : "bg-neutral-600 text-white"
            : "border border-[#b6b6b6] bg-white"
        }`}
      >
        {selected && <Check size={18} strokeWidth={3.5} />}
      </span>
    </button>
  );
}

type DetailRowProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function DetailRow({ icon, label, value }: DetailRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2 border-b border-[#eee0cd] px-3 py-3 text-[11px] sm:text-xs">
      <span className="flex items-center gap-2 text-neutral-900">
        <span className="shrink-0">{icon}</span>
        <span>{label}</span>
      </span>

      <span className="break-words text-right text-black">
        {value}
      </span>
    </div>
  );
}