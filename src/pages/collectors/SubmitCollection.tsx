
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Trash2,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import bin3 from "../../assets/bin3.png";

type CollectionStatus = "collected" | "not-collected";

type CollectionDraft = {
  status?: CollectionStatus;
  remarks?: string;
  photo?: File | null;
};

type SubmitState = {
  capturedPhoto?: File;
  draft?: CollectionDraft;
  returnTo?: string;
  siteId?: string | number;
  scheduleId?: string | number;
  collectionId?: string | number;
};

type SiteInfo = {
  site_id: string;
  site_name: string;
  location: string | null;
  qr_code: string | null;
};

type ScheduleInfo = {
  schedule_id: string | number;
  site_id: string;
  date: string | null;
  collection_time: string | null;
  status: string | null;
  date_completed: string | null;
};

type CollectionInfo = {
  collection_id: string | number;
  schedule_id: string | number;
  collector_id: string;
  collection_status: string;
  completed_at: string | null;
  remarks: string | null;
  after_photo_path: string | null;
};

const PHOTO_BUCKET = "collection-photos";

export default function SubmitCollection() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as SubmitState | null;

  const photo =
    state?.capturedPhoto instanceof File
      ? state.capturedPhoto
      : state?.draft?.photo instanceof File
        ? state.draft.photo
        : null;

  const [status, setStatus] = useState<CollectionStatus>(
    state?.draft?.status === "not-collected"
      ? "not-collected"
      : "collected"
  );

  const [remarks, setRemarks] = useState(
    state?.draft?.remarks || ""
  );

  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [site, setSite] = useState<SiteInfo | null>(null);
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const [collection, setCollection] = useState<CollectionInfo | null>(
    null
  );

  const returnTo =
    state?.returnTo?.startsWith("/collector/collection-details/")
      ? state.returnTo
      : "/collector/dashboard";

  const draft: CollectionDraft = { status, remarks, photo };

  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }

    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Load the site, selected schedule, and an existing collection record.
  useEffect(() => {
    let active = true;

    async function loadDetails() {
      setLoading(true);
      setMessage("");

      try {
        if (!state?.siteId || !state?.scheduleId) {
          throw new Error(
            "The disposal site or schedule ID is missing. Open this page from the collector route."
          );
        }

        const [siteResult, scheduleResult] = await Promise.all([
          supabase
            .from("disposal_sites")
            .select("site_id, site_name, location, qr_code")
            .eq("site_id", state.siteId)
            .single(),

          supabase
            .from("schedules")
            .select(
              "schedule_id, site_id, date, collection_time, status, date_completed"
            )
            .eq("schedule_id", state.scheduleId)
            .single(),
        ]);

        if (siteResult.error) throw siteResult.error;
        if (scheduleResult.error) throw scheduleResult.error;

        const siteData = siteResult.data as SiteInfo;
        const scheduleData = scheduleResult.data as ScheduleInfo;

        if (scheduleData.site_id !== siteData.site_id) {
          throw new Error(
            "The selected schedule does not belong to this disposal site."
          );
        }

        if (!active) return;

        setSite(siteData);
        setSchedule(scheduleData);

        // Load an existing collection for this schedule, if present.
        let collectionQuery = supabase
          .from("collections")
          .select(
            "collection_id, schedule_id, collector_id, collection_status, completed_at, remarks, after_photo_path"
          )
          .eq("schedule_id", scheduleData.schedule_id);

        if (state.collectionId != null) {
          collectionQuery = supabase
            .from("collections")
            .select(
              "collection_id, schedule_id, collector_id, collection_status, completed_at, remarks, after_photo_path"
            )
            .eq("collection_id", state.collectionId);
        }

        const { data: collectionData, error: collectionError } =
          await collectionQuery.limit(1).maybeSingle();

        if (collectionError) throw collectionError;

        if (!active) return;

        if (collectionData) {
          const existing = collectionData as CollectionInfo;
          setCollection(existing);

          const savedStatus = existing.collection_status.toLowerCase();

          setStatus(
            savedStatus === "not collected" ||
              savedStatus === "not-collected" ||
              savedStatus === "not_collected"
              ? "not-collected"
              : "collected"
          );

          setRemarks(existing.remarks || "");
        } else if (scheduleData.status) {
          const scheduleStatus = scheduleData.status.toLowerCase();

          if (
            scheduleStatus === "not collected" ||
            scheduleStatus === "not-collected"
          ) {
            setStatus("not-collected");
          }
        }
      } catch (error) {
        console.error("Failed to load collection details:", error);

        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load collection details."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDetails();

    return () => {
      active = false;
    };
  }, [state?.siteId, state?.scheduleId, state?.collectionId]);

  function formatDate(value?: string | null) {
    if (!value) return "Not available";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      weekday: "short",
    });
  }

  function formatTime(value?: string | null) {
    if (!value) return "Not available";

    // PostgreSQL time values normally look like "14:20:00".
    const match = value.match(/^(\d{1,2}):(\d{2})/);

    if (match) {
      const date = new Date();
      date.setHours(Number(match[1]), Number(match[2]), 0, 0);

      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
  }

  async function submitUpdate() {
    if (saving) return;

    if (!photo) {
      setMessage("Please take an after-collection photo first.");
      return;
    }

    if (!site || !schedule) {
      setMessage("The disposal site or schedule has not loaded.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) {
        throw new Error("Please log in before submitting a collection.");
      }

      // Upload the after-collection photo to Supabase Storage.
      const extension = photo.name.split(".").pop() || "jpg";
      const photoPath =
        `${user.id}/${schedule.schedule_id}/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(photoPath, photo, {
          upsert: true,
          contentType: photo.type || "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const completedAt =
        status === "collected" ? new Date().toISOString() : null;

      const collectionPayload = {
        schedule_id: schedule.schedule_id,
        collector_id: user.id,
        collection_status:
          status === "collected" ? "Collected" : "Not Collected",
        completed_at: completedAt,
        remarks: remarks.trim() || null,
        after_photo_path: photoPath,
      };

      // Update the existing record or create a new record.
      if (collection) {
        const { error } = await supabase
          .from("collections")
          .update(collectionPayload)
          .eq("collection_id", collection.collection_id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("collections")
          .insert(collectionPayload)
          .select(
            "collection_id, schedule_id, collector_id, collection_status, completed_at, remarks, after_photo_path"
          )
          .single();

        if (error) throw error;
        setCollection(data as CollectionInfo);
      }

      // Keep the schedule's status and remarks synchronized.
      const scheduleUpdate = await supabase
        .from("schedules")
        .update({
          status:
            status === "collected" ? "Completed" : "Not Collected",
          date_completed: completedAt,
          remarks: remarks.trim() || null,
        })
        .eq("schedule_id", schedule.schedule_id);

      if (scheduleUpdate.error) {
        // The collection record is already saved, so make this clear.
        console.error(
          "Collection saved, but schedule update failed:",
          scheduleUpdate.error
        );

        setMessage(
          "Collection saved, but the schedule status could not be updated. Check the schedules table permissions and status values."
        );
        return;
      }

      setSchedule({
        ...schedule,
        status: status === "collected" ? "Completed" : "Not Collected",
        date_completed: completedAt,
      });

      setMessage("Collection update saved successfully.");

      // Keep the user on this page so they can see the confirmation.
      // Navigate back only when they choose the Back button.
    } catch (error) {
      console.error("Failed to submit collection:", error);

      setMessage(
        error instanceof Error
          ? `Unable to save collection: ${error.message}`
          : "Unable to save collection. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const displayedDate =
    collection?.completed_at ||
    schedule?.date_completed ||
    schedule?.date;

  const displayedTime =
    collection?.completed_at ||
    schedule?.collection_time;

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-3 pb-3 pt-7 sm:px-4">
        {/* Fixed red heading */}
        <header className="shrink-0 rounded-t-xl bg-[#A61B1B] px-1 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <Link
              to={returnTo}
              state={{ siteId: state?.siteId, scheduleId: state?.scheduleId, draft, capturedPhoto: photo }}
              aria-label="Back to collection details"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ArrowLeft size={20} strokeWidth={1.8} />
            </Link>

            <h1 className="text-base font-bold text-white">
              Waste Collection
            </h1>
          </div>
        </header>

        {/* Vertically scrollable content */}
        <div className="relative -mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-t-2xl border-x border-neutral-200 bg-white px-3 pb-7 pt-3">
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
                {loading ? "Loading disposal site..." : site?.site_name || "Disposal site not found"}
              </h2>

              <p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-800">
                <MapPin size={13} className="shrink-0" />
                {site?.location || "Location not available"}
              </p>

              <p className="mt-1 pl-4 text-[10px] text-neutral-800">
                {site?.qr_code || "QR code not available"}
              </p>
            </div>
          </section>

          {/* Collection status */}
          <section className="mt-5 rounded-xl border border-[#bdbdbd] bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold text-[#b51b1b]">
              Collection Status
            </h2>

            <div role="group" aria-label="Collection status" className="space-y-2">
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
              value={loading ? "Loading..." : formatDate(displayedDate)}
            />

            <DetailRow
              icon={<Clock3 size={17} />}
              label="Time Completed"
              value={loading ? "Loading..." : formatTime(displayedTime)}
            />

            <div className="px-4 pb-3 pt-3 sm:px-6">
              <label htmlFor="submit-remarks" className="block text-xs text-neutral-900">
                Remarks (optional)
              </label>

              <textarea
                id="submit-remarks"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Area is clean."
                rows={2}
                className="mt-2 block w-full resize-y rounded-lg border border-[#b8b2ad] bg-[#f8f3e8] px-3 py-2 text-xs text-neutral-800 placeholder:text-[#8a8378] focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </div>
          </section>

          {/* Horizontally scrollable before and after photos */}
          <section className="mt-3 min-w-0 rounded-xl border border-[#bdbdbd] bg-white p-3">
            <div
              role="region"
              aria-label="Before and after collection photos; scroll horizontally"
              tabIndex={0}
              className="flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
            >
              <div className="w-full shrink-0 snap-start">
                <h2 className="mb-3 text-sm font-semibold text-[#b51b1b]">
                  Before Collection
                </h2>

                <div className="px-2 pb-2">
                  <img
                    src={bin3}
                    alt="Waste bin before collection"
                    draggable={false}
                    className="block aspect-[3/2] w-full rounded-xl object-cover"
                  />
                </div>
              </div>

              <div className="w-full shrink-0 snap-start">
                <h2 className="mb-3 text-sm font-semibold text-[#b51b1b]">
                  After Collection
                </h2>

                <div className="px-2 pb-2">
                  {photo ? (
                    preview ? (
                      <img
                        src={preview}
                        alt="Waste bin after collection"
                        draggable={false}
                        className="block aspect-[3/2] w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div className="aspect-[3/2] w-full rounded-xl bg-neutral-100" />
                    )
                  ) : (
                    <div className="flex aspect-[3/2] w-full flex-col items-center justify-center rounded-xl bg-neutral-50 p-4 text-center">
                      <p className="text-xs text-neutral-600">
                        No captured photo available.
                      </p>

                      <Link
                        to="/collector/capture"
                        state={{
                          returnTo: "/collector/submit-collection",
                          siteId: state?.siteId,
                          scheduleId: state?.scheduleId,
                          collectionId: state?.collectionId,
                          draft,
                        }}
                        className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-red-300 px-4 text-xs font-semibold text-[#A61B1B]"
                      >
                        Take a Photo
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-2 text-center text-[10px] text-neutral-500">
              Swipe left to view After Collection
            </p>
          </section>

          {/* Submit action */}
          <button
            type="button"
            onClick={submitUpdate}
            disabled={!photo || saving || loading}
            className="mx-auto mt-4 flex min-h-11 w-[78%] max-w-[280px] items-center justify-center rounded-xl bg-[#A61B1B] px-4 text-sm font-bold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Submit Update"}
          </button>

          {message && (
            <p
              role="status"
              className="mt-3 rounded-lg bg-amber-50 p-3 text-center text-xs text-amber-800"
            >
              {message}
            </p>
          )}
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

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2 border-b border-[#eee0cd] px-3 py-3 text-[11px] sm:text-xs">
      <span className="flex items-center gap-2 text-neutral-900">
        <span className="shrink-0">{icon}</span>
        <span>{label}</span>
      </span>

      <span className="break-words text-right text-black">{value}</span>
    </div>
  );
}
