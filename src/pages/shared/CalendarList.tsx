import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  MapPin,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

export type Schedule = {
  id: string;
  siteId: string;
  assignedCollectorId: string | null;
  date: string;
  name: string;
  address: string;
  image: string;
  time: string;
  completedTime?: string;
  status: "Pending" | "In Progress" | "Collected" | "Cancelled";
  type: "Priority Collection" | "Scheduled" | "Open for Disposal";
  level: "FULL" | "NEAR FULL" | "EMPTY" | null;
  confidence: string;
  analyzedAt: string | null;
  collector: string;
  qrCode: string;
  latitude: number;
  longitude: number;
  remarks: string;
};

type ScheduleRow = {
  schedule_id: string;
  site_id: string;
  assigned_collector_id: string | null;
  date: string;
  collection_time: string | null;
  collection_type: Schedule["type"];
  status: Schedule["status"];
  date_completed: string | null;
  remarks: string | null;

  site: {
    site_name: string;
    location: string;
    site_image: string | null;
    qr_code: string | null;
    latitude: number;
    longitude: number;
  } | null;

  collector: {
    full_name: string;
  } | null;

  source_report: {
    cnn_detection_level: Schedule["level"];
    confidence_level: number | string | null;
    analyzed_at: string | null;
  } | null;
};

const scheduleSelect = `
  schedule_id,
  site_id,
  assigned_collector_id,
  date,
  collection_time,
  collection_type,
  status,
  date_completed,
  remarks,
  site:disposal_sites!site_id (
    site_name,
    location,
    site_image,
    qr_code,
    latitude,
    longitude
  ),
  collector:users!assigned_collector_id (
    full_name
  ),
  source_report:waste_reports!source_report_id (
    cnn_detection_level,
    confidence_level,
    analyzed_at
  )
`;

export function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function parseDate(value?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");

  if (match) {
    const result = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    if (dateKey(result) === value) return result;
  }

  return new Date();
}

export function badgeColor(type: Schedule["type"]) {
  if (type === "Priority Collection") return "bg-[#ed0015]";
  if (type === "Scheduled") return "bg-[#ffbf42]";
  return "bg-[#9db77a]";
}

export function collectionStatusColor(status: Schedule["status"]) {
  if (status === "Collected") return "bg-green-600";
  if (status === "In Progress") return "bg-blue-600";
  if (status === "Cancelled") return "bg-neutral-500";
  return "bg-amber-500";
}

function formatTime(value: string | null) {
  if (!value) return "—";

  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return "—";

  const hour = Number(match[1]);

  return `${hour % 12 || 12}:${match[2]} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

function mapSchedule(row: ScheduleRow): Schedule {
  if (!row.site) {
    throw new Error(
      "Disposal-site information is missing or unavailable under your access policies."
    );
  }

  const confidence =
    row.source_report?.confidence_level == null
      ? null
      : Number(row.source_report.confidence_level);

  return {
    id: row.schedule_id,
    siteId: row.site_id,
    assignedCollectorId: row.assigned_collector_id,
    date: row.date,
    name: row.site.site_name,
    address: row.site.location,
    image: row.site.site_image || "",
    time: formatTime(row.collection_time),
    completedTime: row.date_completed
      ? new Date(row.date_completed).toLocaleTimeString("en-US", {
          timeZone: "Asia/Manila",
          hour: "numeric",
          minute: "2-digit",
        })
      : undefined,
    status: row.status,
    type: row.collection_type,
    level: row.source_report?.cnn_detection_level ?? null,
    confidence:
      confidence !== null && Number.isFinite(confidence)
        ? `${confidence}%`
        : "Unavailable",
    analyzedAt: row.source_report?.analyzed_at ?? null,
    collector:
      row.collector?.full_name ||
      (row.assigned_collector_id
        ? "Assigned collector"
        : "Unassigned"),
    qrCode: row.site.qr_code || "",
    latitude: row.site.latitude,
    longitude: row.site.longitude,
    remarks: row.remarks || "",
  };
}

export async function getScheduleById(
  scheduleId: string,
  collectorId?: string
): Promise<Schedule | null> {
  let query = supabase
    .from("schedules")
    .select(scheduleSelect)
    .eq("schedule_id", scheduleId);

  if (collectorId) {
    query = query.eq("assigned_collector_id", collectorId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapSchedule(data as unknown as ScheduleRow);
}

type Props = {
  role?: "resident" | "collector";
};

export default function CalendarList({ role }: Props) {
  const { date } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const currentRole =
    role ||
    (location.pathname.startsWith("/collector")
      ? "collector"
      : "resident");

  const resident = currentRole === "resident";
  const selected = parseDate(date);
  const selectedKey = dateKey(selected);
  const today = dateKey(new Date());

  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const weekStart = new Date(
    selected.getFullYear(),
    selected.getMonth(),
    selected.getDate() - selected.getDay()
  );

  const week = Array.from(
    { length: 7 },
    (_, index) =>
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + index
      )
  );

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setRefreshKey((value) => value + 1);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSchedules() {
      setLoading(true);
      setError("");
      setItems([]);

      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (!active) return;
        if (!authData.user) throw new Error("Please sign in.");
        if (authError) throw authError;

        const chosen = parseDate(selectedKey);

        const monthStart = dateKey(
          new Date(chosen.getFullYear(), chosen.getMonth(), 1)
        );

        const nextMonthStart = dateKey(
          new Date(chosen.getFullYear(), chosen.getMonth() + 1, 1)
        );

        const rows: ScheduleRow[] = [];
        const pageSize = 200;
        let offset = 0;

        while (active) {
          let query = supabase
            .from("schedules")
            .select(scheduleSelect);

          if (resident) {
            query = query
              .gte("date", monthStart)
              .lt("date", nextMonthStart);
          } else {
            query = query
              .eq("date", selectedKey)
              .eq("assigned_collector_id", authData.user.id)
              .neq("collection_type", "Open for Disposal");
          }

          const { data, error: queryError } = await query
            .order("date")
            .order("collection_time", {
              ascending: true,
              nullsFirst: false,
            })
            .order("schedule_id")
            .range(offset, offset + pageSize - 1);

          if (queryError) throw queryError;

          const page = (data ?? []) as unknown as ScheduleRow[];
          rows.push(...page);

          if (page.length < pageSize) break;
          offset += pageSize;
        }

        if (active) {
          setItems(rows.map(mapSchedule));
        }
      } catch (failure) {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load schedules."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSchedules();

    return () => {
      active = false;
    };
  }, [resident, selectedKey, refreshKey]);

  function selectDay(day: Date) {
    navigate(`/${currentRole}/calendar/list/${dateKey(day)}`);
  }

  function moveWeek(direction: number) {
    selectDay(
      new Date(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate() + direction * 7
      )
    );
  }

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <section className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-3 pb-3 pt-8">
        <header className="shrink-0 rounded-t-xl bg-[#c90000] px-3 pb-4 pt-3">
          <h1 className="text-sm font-bold text-white">
            Collection Schedule
          </h1>
        </header>

        <div className="relative -mt-2 flex min-h-0 flex-1 flex-col rounded-t-xl bg-white px-3 pt-4">
          {/* Weekly calendar */}
          <section className="shrink-0 rounded-xl border border-neutral-300 px-2 pb-2 shadow-sm">
            <div className="flex items-center justify-between py-1">
              <button
                type="button"
                onClick={() => moveWeek(-1)}
                aria-label="Previous week"
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-100"
              >
                <ChevronLeft size={17} />
              </button>

              <Link
                to={`/${currentRole}/calendar`}
                className="text-xs font-bold"
              >
                {selected.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </Link>

              <button
                type="button"
                onClick={() => moveWeek(1)}
                aria-label="Next week"
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-100"
              >
                <ChevronRight size={17} />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center">
              {week.map((day) => {
                const key = dateKey(day);

                return (
                  <div key={key}>
                    <p className="py-1 text-[10px]">
                      {day.toLocaleDateString("en-US", {
                        weekday: "short",
                      })}
                    </p>

                    <button
                      type="button"
                      onClick={() => selectDay(day)}
                      aria-pressed={key === selectedKey}
                      aria-current={key === today ? "date" : undefined}
                      aria-label={day.toLocaleDateString("en-US", {
                        dateStyle: "full",
                      })}
                      className="grid h-9 w-full place-items-center rounded hover:bg-red-50"
                    >
                      <span
                        className={`grid h-7 w-7 place-items-center rounded-full text-xs ${
                          key === selectedKey ? "bg-[#ffa7b1]" : ""
                        } ${
                          key === today
                            ? "font-bold text-blue-600"
                            : "text-black"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {resident && (
            <div className="mt-2 flex shrink-0 items-center gap-1 rounded bg-[#ffe4e9] px-2 py-2">
              <Info size={14} className="shrink-0 text-[#ff254c]" />
              <p className="text-[10px] font-medium">
                Schedules are based on the latest waste level reports.
              </p>
            </div>
          )}

          <div className="flex shrink-0 items-center justify-between gap-2 py-3">
            <div>
              <h2 className="text-xs font-bold">
                Collection Schedule
              </h2>
              <p className="mt-1 text-[9px] text-neutral-500">
                {resident
                  ? "Selected month's schedules"
                  : "Your assignments for the selected date"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500">
                {loading ? "Loading..." : `${items.length} schedule(s)`}
              </span>
            </div>
          </div>

          <div
            role="region"
            aria-label="Collection schedules"
            aria-busy={loading}
            tabIndex={0}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-0.5 pb-5"
          >
            {loading ? (
              <p role="status" className="py-8 text-center text-xs text-neutral-500">
                Loading schedules...
              </p>
            ) : error ? (
              <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">
                {error}
              </p>
            ) : items.length === 0 ? (
              <p className="rounded-xl border p-4 text-center text-xs text-neutral-500">
                No schedules available for this period.
              </p>
            ) : (
              items.map((item) => {
                const label = resident ? item.type : item.status;

                const color = resident
                  ? badgeColor(item.type)
                  : collectionStatusColor(item.status);

                // Completed/cancelled work opens read-only details.
                const detailsPath =
                  resident ||
                  item.status === "Collected" ||
                  item.status === "Cancelled"
                    ? `/${currentRole}/schedule-details/${item.id}`
                    : `/collector/waste-collection/${item.id}`;

                const site = {
                  id: item.siteId,
                  scheduleId: item.id,
                  name: item.name,
                  image: item.image,
                  address: item.address,
                  latitude: item.latitude,
                  longitude: item.longitude,
                  qrCode: item.qrCode,
                  wasteLevel: item.level,
                  collectionDate: item.date,
                  collectionTime: item.time,
                };

                return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-[#ffadb5] bg-[#fff6f7] shadow-[0_3px_2px_rgba(0,0,0,0.16)]"
                  >
                    <div className="flex items-start gap-2 px-2.5 pb-3 pt-2">
                      <div className="mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#ffa7b1] text-[#ff1737]">
                        <Trash2 size={30} strokeWidth={2.3} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex justify-end">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-medium text-white ${color}`}
                          >
                            {label}
                          </span>
                        </div>

                        <h3 className="break-words text-xs font-bold">
                          {item.name}
                        </h3>

                        <p className="mt-1 flex items-start gap-1 text-[10px] text-neutral-700">
                          <MapPin size={11} className="mt-0.5 shrink-0" />
                          <span>{item.address}</span>
                        </p>

                        <p className="mt-1 flex items-center gap-1 text-[10px] text-neutral-700">
                          <Clock3 size={11} />
                          {item.time}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-[#ffd9dd] px-2">
                      {resident ? (
                        <p className="flex min-w-0 items-center gap-1 text-[9px]">
                          <UserRound size={11} className="shrink-0" />
                          <span>Collector: {item.collector}</span>
                        </p>
                      ) : (
                        <span />
                      )}

                      <Link
                        to={detailsPath}
                        state={{
                          schedule: item,
                          site,
                          collection: site,
                        }}
                        className="flex min-h-9 shrink-0 items-center gap-0.5 text-[10px] font-medium text-[#d32b37] hover:underline"
                      >
                        View details
                        <ChevronRight size={12} />
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>
    </main>
  );
}