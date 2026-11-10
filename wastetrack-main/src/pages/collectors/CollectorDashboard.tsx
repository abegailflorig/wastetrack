import { useEffect, useId, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  RotateCw,
  UserRound,
} from "lucide-react";
import { Link } from "react-router";

type CollectionItem = {
  id: string;
  siteId: string;
  name: string;
  address: string;
  date: string;
  status: "Collected" | "Pending";
  scheduledTime?: string;
  completedTime?: string;
};

type CollectionRecord = {
  collection_id: string;
  schedule_id: string;
  collector_id: string;
  collection_status: string;
  completed_at: string | null;
};

type SiteRecord = {
  site_name: string;
  location: string;
};

type ScheduleRecord = {
  schedule_id: string;
  site_id: string;
  assigned_collector_id: string | null;
  date: string;
  collection_time: string | null;
  collection_type: string;
  status: string;
  date_completed: string | null;
  disposal_sites: SiteRecord | SiteRecord[] | null;
  collections: CollectionRecord | CollectionRecord[] | null;
};

function formatTime(value?: string | null) {
  if (!value) return "Not set";

  const match = value.match(/^(\d{2}):(\d{2})/);

  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCompletedTime(value?: string | null) {
  if (!value) return undefined;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

export default function CollectorDashboard() {
  const id = useId().replace(/:/g, "");
  const filterId = `collector-water-${id}`;
  const patternId = `collector-pattern-${id}`;

  const teamName =
    localStorage.getItem("teamName") || "Team A";

  const [collections, setCollections] = useState<
    CollectionItem[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchCollections() {
      setLoading(true);
      setError(null);

      try {
        // 1. Get the authenticated collector.
        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        const user = authData.user;

        if (!user) {
          throw new Error(
            "Please log in to view your collection schedules."
          );
        }

        // 2. Fetch schedules and related sites/collections.
        const { data, error: scheduleError } = await supabase
          .from("schedules")
          .select(`
            schedule_id,
            site_id,
            assigned_collector_id,
            date,
            collection_time,
            collection_type,
            status,
            date_completed,
            disposal_sites!schedules_site_id_fkey (
              site_name,
              location
            ),
            collections!collections_schedule_id_fkey (
              collection_id,
              schedule_id,
              collector_id,
              collection_status,
              completed_at
            )
          `)
          .eq("assigned_collector_id", user.id)
          .neq("status", "Cancelled")
          .order("date", { ascending: true })
          .order("collection_time", { ascending: true });

        if (scheduleError) throw scheduleError;

        const schedules = (data ?? []) as unknown as ScheduleRecord[];

        // 3. Map each schedule to its display card.
        // The collections table determines whether a job
        // has actually been collected.
        const mapped: CollectionItem[] = schedules.map(
          (schedule) => {
            const site = Array.isArray(schedule.disposal_sites)
              ? schedule.disposal_sites[0]
              : schedule.disposal_sites;

            const collectionRows = Array.isArray(
              schedule.collections
            )
              ? schedule.collections
              : schedule.collections
                ? [schedule.collections]
                : [];

            const ownCollection = collectionRows.find(
              (record) =>
                record.collector_id === user.id
            );

            const isCollected =
              ownCollection?.collection_status === "Collected";

            return {
              id: schedule.schedule_id,
              siteId: schedule.site_id,
              name: site?.site_name ?? "Waste Disposal Site",
              address: site?.location ?? "Location not available",
              date: schedule.date,
              status: isCollected ? "Collected" : "Pending",
              scheduledTime: formatTime(
                schedule.collection_time
              ),
              completedTime: formatCompletedTime(
                ownCollection?.completed_at ??
                  schedule.date_completed
              ),
            };
          }
        );

        if (active) {
          setCollections(mapped);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load collection records."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchCollections();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  // Counts are based on the records fetched from Supabase.
  const completed = collections.filter(
    (item) => item.status === "Collected"
  );

  const pending = collections.filter(
    (item) => item.status === "Pending"
  );

  const progress =
    collections.length > 0
      ? Math.round(
          (completed.length / collections.length) * 100
        )
      : 0;

  const today = new Date();

  const dateLabel = today
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();

  const greeting =
    today.getHours() < 12
      ? "Good morning,"
      : today.getHours() < 18
        ? "Good afternoon,"
        : "Good evening,";

  return (
    <main className="flex h-[calc(100dvh-5rem)] w-full flex-col overflow-hidden bg-white">
      {/* Header */}
      <header className="dashboard-header relative isolate shrink-0 overflow-hidden rounded-b-[28px] bg-[#A61B1B] px-4 pb-6 pt-4 text-white sm:rounded-b-[40px] sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
        {/* Water-caustic background */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter
              id={filterId}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.018 0.025"
                numOctaves="2"
                seed="8"
                result="waterNoise"
              />

              <feDisplacementMap
                in="SourceGraphic"
                in2="waterNoise"
                scale="42"
                xChannelSelector="R"
                yChannelSelector="G"
              />

              <feGaussianBlur stdDeviation="1.2" />
            </filter>

            <pattern
              id={patternId}
              width="160"
              height="140"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="
                  M-20 35 Q20 5 60 30 T140 25 T200 40
                  M-20 100 Q25 65 65 95 T145 90 T200 110
                  M30 -20 Q5 30 35 70 T30 160
                  M110 -20 Q80 30 115 65 T110 160
                "
                fill="none"
                stroke="#FF383C"
                strokeWidth="12"
                strokeOpacity="0.25"
              />

              <path
                d="
                  M-20 35 Q20 5 60 30 T140 25 T200 40
                  M-20 100 Q25 65 65 95 T145 90 T200 110
                  M30 -20 Q5 30 35 70 T30 160
                  M110 -20 Q80 30 115 65 T110 160
                "
                fill="none"
                stroke="#FF383C"
                strokeWidth="3"
                strokeOpacity="0.5"
              />
            </pattern>
          </defs>

          <rect width="100%" height="100%" fill="#A61B1B" />

          <rect
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            fill={`url(#${patternId})`}
            filter={`url(#${filterId})`}
          />
        </svg>
        
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ff5777] sm:h-12 sm:w-12">
                <UserRound
                  size={29}
                  strokeWidth={1.6}
                  className="text-[#ffedbd]"
                />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs">
                  {greeting}
                </p>
                <h1 className="break-words text-lg font-bold leading-tight sm:text-xl">
                  {teamName}
                </h1>
                <span className="mt-1 inline-block rounded-sm bg-white px-1.5 py-0.5 text-[7px] font-semibold text-[#b80000] sm:text-[9px]">
                  Waste Collector
                </span>
              </div>
            </div>

            <Link
              to="/collector/notifications"
              aria-label="Notifications"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
            >
              <Bell size={24} fill="white" strokeWidth={1.5} />
            </Link>
          </div>

          {/* Collection progress */}
          <section className="mt-4 overflow-hidden rounded-lg bg-white text-black">
            <div className="px-3 pb-3 pt-2.5 sm:px-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] sm:text-sm">
                  Collection Progress
                </h2>
                <span className="text-[9px] text-neutral-500 sm:text-[10px]">
                  {dateLabel}
                </span>
              </div>

              <p className="mt-2 text-[9px] font-semibold sm:text-xs">
                <span className="text-[#00b865]">
                  {completed.length}
                </span>{" "}
                of {collections.length} collections completed
              </p>

              <div className="mt-2 flex items-center gap-2">
                <div
                  role="progressbar"
                  aria-label="Collection progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-[#b7b3b3]"
                >
                  <div
                    className="h-full rounded-full bg-[#00bb62] transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[9px] font-semibold text-[#71964d] sm:text-xs">
                  {progress}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 border-t border-[#f5e9de] px-3 py-2.5 sm:py-3">
              <Summary
                value={completed.length}
                label="Collected"
                completed
              />
              <Summary
                value={pending.length}
                label="Pending"
              />
            </div>
          </section>
        </div>
      </header>

      {/* Schedule lists */}
      <div
        role="region"
        aria-label="Assigned collections"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto w-full max-w-3xl px-2 pb-5 pt-3 sm:px-6">

          {loading && (
            <p className="rounded-lg bg-[#faf3e8] px-4 py-5 text-center text-sm text-neutral-600">
              Fetching schedules and collection records...
            </p>
          )}

          {!loading && error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"
            >
              <p className="font-semibold">
                Unable to fetch collection records
              </p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && collections.length === 0 && (
            <p className="rounded-lg bg-[#faf3e8] px-4 py-5 text-center text-sm text-neutral-600">
              No collection schedules are assigned to your account.
            </p>
          )}

          {!loading && !error && collections.length > 0 && (
            <>
              <section aria-labelledby="completed-heading">
                <h2
                  id="completed-heading"
                  className="mb-2 text-sm font-semibold text-black"
                >
                  COLLECTED
                </h2>

                <div className="space-y-2">
                  {completed.map((item) => (
                    <CollectionCard
                      key={item.id}
                      item={item}
                    />
                  ))}
                </div>

                {completed.length === 0 && (
                  <p className="py-2 text-xs text-neutral-500">
                    No completed collection records yet.
                  </p>
                )}
              </section>

              <section
                aria-labelledby="pending-heading"
                className="mt-4 border-t border-neutral-200 pt-2"
              >
                <h2
                  id="pending-heading"
                  className="mb-2 text-sm font-semibold text-black"
                >
                  UP NEXT
                </h2>

                <div className="space-y-2">
                  {pending.map((item) => (
                    <CollectionCard
                      key={item.id}
                      item={item}
                    />
                  ))}
                </div>

                {pending.length === 0 && (
                  <p className="py-2 text-xs text-neutral-500">
                    No pending collections.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Summary({
  value,
  label,
  completed = false,
}: {
  value: number;
  label: string;
  completed?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-center gap-1.5 ${
        completed ? "border-r border-[#f5e9de]" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-5 w-5 place-items-center rounded-full ${
          completed
            ? "bg-[#9de8c5] text-[#00b96b]"
            : "bg-[#ffe8cc] text-[#ffa73f]"
        }`}
      >
        {completed ? (
          <CheckCircle2 size={15} />
        ) : (
          <Clock3 size={14} />
        )}
      </span>

      <div>
        <p className="text-lg font-bold leading-5">{value}</p>
        <p className="text-[9px] text-neutral-600 sm:text-[11px]">
          {label}
        </p>
      </div>
    </div>
  );
}

function CollectionCard({
  item,
}: {
  item: CollectionItem;
}) {
  const isCompleted = item.status === "Collected";

  return (
    <Link
      to={
        isCompleted
          ? "/collector/history"
          : "/collector/waste-collection"
      }
      state={{ collection: item }}
      className="flex min-w-0 items-center gap-2 rounded-xl border border-[#c9c3b9] bg-[#faf3e8] px-2 py-2.5 shadow-[0_3px_3px_rgba(0,0,0,0.2)] transition-colors hover:bg-[#fff0dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:gap-3 sm:px-3 sm:py-3"
    >
      <span
        aria-hidden="true"
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-white sm:h-9 sm:w-9 ${
          isCompleted ? "bg-[#58d39b]" : "bg-[#ffa500]"
        }`}
      >
        {isCompleted ? (
          <Check size={23} strokeWidth={4} />
        ) : (
          <RotateCw size={21} strokeWidth={4} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="break-words text-sm font-bold leading-tight text-black sm:text-base">
          {item.name}
        </h3>

        <p className="mt-1 flex items-start gap-1 text-[10px] leading-tight text-neutral-700 sm:text-xs">
          <MapPin size={11} className="shrink-0" />
          <span>{item.address}</span>
        </p>

        <p className="mt-1 flex items-start gap-1 text-[9px] leading-tight text-neutral-700 sm:text-[11px]">
          <CalendarDays size={11} className="shrink-0" />
          <span>
            {isCompleted ? (
              <>
                {formatDate(item.date)} ·{" "}
                {`Completed at ${
                  item.completedTime ?? "Time not recorded"
                }`}
              </>
            ) : (
              `Estimated Time of Arrival : ${
                item.scheduledTime ?? "Not set"
              }`
            )}
          </span>
        </p>
      </div>

      <span
        className={`shrink-0 rounded px-1.5 py-1 text-[9px] font-semibold sm:px-2 sm:text-[10px] ${
          isCompleted
            ? "bg-[#a8e8ce] text-[#006a40]"
            : "bg-[#ffdda0] text-[#f19100]"
        }`}
      >
        {item.status}
      </span>

      <ChevronRight
        size={17}
        aria-hidden="true"
        className="shrink-0 text-neutral-700"
      />
    </Link>
  );
}
