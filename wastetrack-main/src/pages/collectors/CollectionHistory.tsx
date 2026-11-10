
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../../lib/supabase";

type CollectionStatus = "Collected" | "Pending" | "Delayed";
type Filter = "All" | CollectionStatus;

type ScheduleRow = {
  schedule_id: string;
  site_id: string;
  assigned_collector_id: string;
  date: string;
  collection_time: string | null;
  status: string;
  date_completed: string | null;
};

type CollectionRow = {
  collection_id: string;
  schedule_id: string;
  collector_id: string;
  collection_status: string;
  completed_at: string | null;
};

type SiteRow = {
  site_id: string;
  site_name: string;
  location: string | null;
};

type HistoryItem = {
  id: string;
  location: string;
  address: string;
  status: CollectionStatus;
  date: string;
  time: string;
  completedTime?: string;
};

const filters: Filter[] = [
  "All",
  "Collected",
  "Pending",
  "Delayed",
];

const statusStyles: Record<CollectionStatus, string> = {
  Collected: "bg-[#b5e6c8] text-[#006b32]",
  Pending: "bg-[#ffe2a3] text-[#e89100]",
  Delayed: "bg-[#ffd1d1] text-[#d00000]",
};

function formatTime(value: string | null | undefined): string {
  if (!value) return "Time not set";

  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return value;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCompletedTime(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isPastSchedule(
  date: string,
  time: string | null,
): boolean {
  if (!time) return false;

  const scheduled = new Date(`${date}T${time}`);

  return (
    !Number.isNaN(scheduled.getTime()) &&
    scheduled.getTime() < Date.now()
  );
}

export default function CollectionHistory() {
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        setHistory([]);
        setError("Please log in to view your collection history.");
        return;
      }

      // Load schedules assigned to the current collector.
      const { data: schedulesData, error: schedulesError } =
        await supabase
          .from("schedules")
          .select(
            `
              schedule_id,
              site_id,
              assigned_collector_id,
              date,
              collection_time,
              status,
              date_completed
            `,
          )
          .eq("assigned_collector_id", user.id)
          .neq("status", "Cancelled")
          .order("date", { ascending: false })
          .order("collection_time", { ascending: false });

      if (schedulesError) throw schedulesError;

      const schedules = (schedulesData ?? []) as ScheduleRow[];

      if (schedules.length === 0) {
        setHistory([]);
        return;
      }

      const scheduleIds = schedules.map(
        (schedule) => schedule.schedule_id,
      );

      const siteIds = [
        ...new Set(schedules.map((schedule) => schedule.site_id)),
      ];

      // Load collection records for this collector.
      const { data: collectionsData, error: collectionsError } =
        await supabase
          .from("collections")
          .select(
            `
              collection_id,
              schedule_id,
              collector_id,
              collection_status,
              completed_at
            `,
          )
          .eq("collector_id", user.id)
          .in("schedule_id", scheduleIds);

      if (collectionsError) throw collectionsError;

      const collections = (collectionsData ?? []) as CollectionRow[];

      const collectionBySchedule = new Map(
        collections.map((collection) => [
          collection.schedule_id,
          collection,
        ]),
      );

      // Load disposal site names and addresses.
      const { data: sitesData, error: sitesError } =
        await supabase
          .from("disposal_sites")
          .select("site_id, site_name, location")
          .in("site_id", siteIds);

      if (sitesError) throw sitesError;

      const sites = (sitesData ?? []) as SiteRow[];

      const siteById = new Map(
        sites.map((site) => [site.site_id, site]),
      );

      const items: HistoryItem[] = schedules.map((schedule) => {
        const collection = collectionBySchedule.get(
          schedule.schedule_id,
        );
        const site = siteById.get(schedule.site_id);

        const collected =
          collection?.collection_status === "Collected" ||
          schedule.status === "Collected";

        const delayed =
          !collected &&
          isPastSchedule(schedule.date, schedule.collection_time);

        const status: CollectionStatus = collected
          ? "Collected"
          : delayed
            ? "Delayed"
            : "Pending";

        return {
          id: collection?.collection_id ?? schedule.schedule_id,
          location: site?.site_name || "Unknown Site",
          address: site?.location || "Address unavailable",
          status,
          date: schedule.date,
          time: formatTime(schedule.collection_time),
          completedTime: collected
            ? formatCompletedTime(
                collection?.completed_at ?? schedule.date_completed,
              )
            : undefined,
        };
      });

      items.sort((a, b) => {
        const dateDifference = b.date.localeCompare(a.date);
        if (dateDifference !== 0) return dateDifference;
        return b.time.localeCompare(a.time);
      });

      setHistory(items);
    } catch (err) {
      console.error("Failed to load collection history:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load collection history.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filteredHistory =
    activeFilter === "All"
      ? history
      : history.filter((item) => item.status === activeFilter);

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-3 pt-3 sm:px-6 sm:pt-5 lg:px-10 lg:pt-7">
        {/* Header */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[#b8b8b8] px-1 pb-4 pt-2 sm:gap-4 sm:pb-5 lg:pb-6">
          <Link
            to="/collector/dashboard"
            aria-label="Back to dashboard"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-black transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 sm:h-12 sm:w-12"
          >
            <ArrowLeft size={30} strokeWidth={2} className="sm:hidden" />
            <ArrowLeft size={36} strokeWidth={2} className="hidden sm:block" />
          </Link>

          <h1 className="text-xl font-extrabold text-black sm:text-2xl lg:text-3xl">
            Collection History
          </h1>
        </header>

        {/* Filters */}
        <div
          role="group"
          aria-label="Filter collection history"
          className="flex shrink-0 gap-2 overflow-x-auto overscroll-x-contain py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3 sm:py-5 lg:gap-4 lg:py-6"
        >
          {filters.map((filter) => {
            const isActive = activeFilter === filter;

            const count =
              filter === "All"
                ? history.length
                : history.filter((item) => item.status === filter).length;

            return (
              <button
                key={filter}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveFilter(filter)}
                className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:min-h-12 sm:rounded-2xl sm:px-6 sm:text-base lg:min-h-14 lg:px-8 lg:text-lg ${
                  isActive
                    ? "bg-[#ad1d1d] font-bold text-white"
                    : "bg-[#f3e6d1] font-semibold text-[#ad1d1d] hover:bg-[#ead8bc]"
                }`}
              >
                {filter === "All" ? `All (${count})` : filter}
              </button>
            );
          })}
        </div>

        {/* Scrollable collection list */}
        <div
          role="region"
          aria-label="Collection history"
          tabIndex={0}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain pb-6 sm:space-y-4 lg:space-y-5"
        >
          {loading ? (
            <div
              role="status"
              className="rounded-2xl border border-neutral-200 bg-[#f8f2e6] px-4 py-10 text-center sm:rounded-3xl"
            >
              <RefreshCw
                size={28}
                className="mx-auto animate-spin text-[#ad1d1d]"
              />
              <p className="mt-3 text-sm text-neutral-600 sm:text-base">
                Loading collection history...
              </p>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-center sm:rounded-3xl"
            >
              <p className="text-sm font-bold text-red-700 sm:text-base">
                Unable to load collection history
              </p>
              <p className="mt-2 break-words text-xs text-red-600 sm:text-sm">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void loadHistory()}
                className="mt-4 rounded-xl bg-[#ad1d1d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
              >
                Try Again
              </button>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div
              role="status"
              className="rounded-2xl border border-neutral-200 bg-[#f8f2e6] px-4 py-10 text-center sm:rounded-3xl"
            >
              <Clock3
                size={30}
                className="mx-auto text-neutral-400"
              />
              <p className="mt-3 text-base font-bold text-black sm:text-lg">
                {activeFilter === "All"
                  ? "No collection history yet"
                  : `No ${activeFilter.toLowerCase()} collections`}
              </p>
              <p className="mt-2 text-sm text-neutral-500">
                {activeFilter === "All"
                  ? "Your assigned collection schedules will appear here."
                  : "Select another filter to view your history."}
              </p>
            </div>
          ) : (
            filteredHistory.map((item) => (
              <article
                key={item.id}
                className="flex items-center gap-2 rounded-2xl border border-[#b8b3ad] bg-[#f8f2e6] px-2.5 py-4 shadow-[0_3px_4px_rgba(0,0,0,0.20)] sm:gap-4 sm:rounded-3xl sm:px-4 sm:py-5 lg:gap-5 lg:px-6 lg:py-6"
              >
                {/* Status icon */}
                <div
                  aria-hidden="true"
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white sm:h-12 sm:w-12 sm:rounded-xl lg:h-14 lg:w-14 ${
                    item.status === "Collected"
                      ? "bg-[#7bcf98]"
                      : item.status === "Delayed"
                        ? "bg-[#ef4444]"
                        : "bg-[#ffa900]"
                  }`}
                >
                  {item.status === "Collected" ? (
                    <Check size={25} strokeWidth={4} className="sm:hidden" />
                  ) : (
                    <RefreshCw size={22} strokeWidth={3.5} className="sm:hidden" />
                  )}

                  {item.status === "Collected" ? (
                    <Check size={34} strokeWidth={4} className="hidden sm:block" />
                  ) : (
                    <RefreshCw size={29} strokeWidth={3.5} className="hidden sm:block" />
                  )}
                </div>

                {/* Collection information */}
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-sm font-extrabold leading-tight text-black sm:text-lg lg:text-xl">
                    {item.location}
                  </h2>

                  <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-relaxed text-[#222] sm:mt-2 sm:gap-1.5 sm:text-sm lg:text-base">
                    <MapPin
                      size={13}
                      className="mt-0.5 shrink-0 sm:hidden"
                    />
                    <MapPin
                      size={17}
                      className="mt-0.5 hidden shrink-0 sm:block"
                    />
                    <span className="break-words">{item.address}</span>
                  </p>

                  <p className="mt-1.5 flex items-start gap-1 text-[9px] leading-relaxed text-[#333] sm:mt-2 sm:gap-1.5 sm:text-xs lg:text-sm">
                    {item.status === "Collected" ? (
                      <CalendarDays
                        size={12}
                        className="mt-0.5 shrink-0 sm:hidden"
                      />
                    ) : (
                      <Clock3
                        size={12}
                        className="mt-0.5 shrink-0 sm:hidden"
                      />
                    )}

                    {item.status === "Collected" ? (
                      <CalendarDays
                        size={16}
                        className="mt-0.5 hidden shrink-0 sm:block"
                      />
                    ) : (
                      <Clock3
                        size={16}
                        className="mt-0.5 hidden shrink-0 sm:block"
                      />
                    )}

                    <span>
                      {item.status === "Collected"
                        ? `${item.time}${
                            item.completedTime
                              ? ` · Completed at ${item.completedTime}`
                              : " · Completed"
                          }`
                        : `Estimated Time of Arrival: ${item.time}`}
                    </span>
                  </p>

                  <p className="mt-1 text-[9px] text-neutral-500 sm:text-xs">
                    {formatDate(item.date)}
                  </p>
                </div>

                {/* Status badge */}
                <span
                  className={`shrink-0 rounded-md px-1.5 py-1.5 text-[9px] font-bold sm:rounded-lg sm:px-2.5 sm:py-2 sm:text-xs lg:px-3 lg:text-sm ${
                    statusStyles[item.status]
                  }`}
                >
                  {item.status}
                </span>

                <ChevronRight
                  aria-hidden="true"
                  size={18}
                  strokeWidth={1.8}
                  className="shrink-0 text-black sm:h-6 sm:w-6 lg:h-7 lg:w-7"
                />
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
