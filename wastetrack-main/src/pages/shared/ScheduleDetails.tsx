import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Clock3,
  ImageOff,
  MapPin,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  badgeColor,
  collectionStatusColor,
  getScheduleById,
  parseDate,
} from "./CalendarList";

import type { Schedule } from "./CalendarList";
import { supabase } from "../../lib/supabase";
import { img } from "../../utils";

type Props = {
  role?: "resident" | "collector";
};

type RecentReportRow = {
  report_id: string;
  date_uploaded: string;
  cnn_detection_level: Schedule["level"];
  waste_images: {
    src: string | null;
    storage_bucket: string;
    storage_path: string | null;
    created_at: string;
  }[];
};

type RecentReport = {
  id: string;
  image: string;
  date: string;
  level: Schedule["level"];
};

type CollectionRow = {
  collection_status: "Collected" | "Not Collected";
  before_image_path: string | null;
  after_image_path: string;
  storage_bucket: string;
  remarks: string | null;
  completed_at: string;
};

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unavailable";

  return date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function resolveImage(
  bucket: string,
  path: string | null,
  fallback = ""
): Promise<string> {
  if (!path) return fallback;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);

  if (error) throw new Error(error.message);

  return data.signedUrl;
}

export default function ScheduleDetails({ role }: Props) {
  const { scheduleId } = useParams();
  const location = useLocation();

  const currentRole =
    role ||
    (location.pathname.startsWith("/collector")
      ? "collector"
      : "resident");

  const resident = currentRole === "resident";

  const [item, setItem] = useState<Schedule | null>(null);
  const [recentReports, setRecentReports] =
    useState<RecentReport[]>([]);
  const [collection, setCollection] =
    useState<CollectionRow | null>(null);

  const [beforeImage, setBeforeImage] = useState("");
  const [afterImage, setAfterImage] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

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

    async function loadDetails() {
      setLoading(true);
      setError("");
      setNotice("");
      setItem(null);
      setRecentReports([]);
      setCollection(null);
      setBeforeImage("");
      setAfterImage("");

      try {
        if (
          !scheduleId ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            scheduleId
          )
        ) {
          throw new Error(
            "No valid schedule selected. Open a schedule from the calendar."
          );
        }

        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (!active) return;
        if (!authData.user) throw new Error("Please sign in.");
        if (authError) throw authError;

        const schedule = await getScheduleById(
          scheduleId,
          resident ? undefined : authData.user.id
        );

        if (!active) return;

        if (!schedule) {
          throw new Error(
            "Schedule not found or not assigned to your account."
          );
        }

        setItem(schedule);
        setBeforeImage(schedule.image);

        const warnings: string[] = [];

        if (resident) {
          const { data, error: reportsError } = await supabase
            .from("waste_reports")
            .select(`
              report_id,
              date_uploaded,
              cnn_detection_level,
              waste_images (
                src,
                storage_bucket,
                storage_path,
                created_at
              )
            `)
            .eq("site_id", schedule.siteId)
            .order("date_uploaded", { ascending: false })
            .order("report_id")
            .limit(3);

          if (!active) return;

          if (reportsError) {
            warnings.push("Recent reports could not load.");
          } else {
            const reports = await Promise.all(
              ((data ?? []) as unknown as RecentReportRow[]).map(
                async (report): Promise<RecentReport> => {
                  const latestImage = [
                    ...(report.waste_images ?? []),
                  ].sort((a, b) =>
                    b.created_at.localeCompare(a.created_at)
                  )[0];

                  let image = latestImage?.src || "";

                  try {
                    image = await resolveImage(
                      latestImage?.storage_bucket || "waste-images",
                      latestImage?.storage_path ?? null,
                      image
                    );
                  } catch {
                    warnings.push(
                      "Some report photos could not load."
                    );
                  }

                  return {
                    id: report.report_id,
                    image,
                    date: formatTimestamp(report.date_uploaded),
                    level: report.cnn_detection_level,
                  };
                }
              )
            );

            if (active) setRecentReports(reports);
          }
        } else {
          const { data, error: collectionError } = await supabase
            .from("collections")
            .select(`
              collection_status,
              before_image_path,
              after_image_path,
              storage_bucket,
              remarks,
              completed_at
            `)
            .eq("schedule_id", schedule.id)
            .eq("collector_id", authData.user.id)
            .maybeSingle();

          if (!active) return;

          if (collectionError) {
            warnings.push("Collection update could not load.");
          } else if (data) {
            const record = data as CollectionRow;
            setCollection(record);

            const resolved = await Promise.allSettled([
              resolveImage(
                record.storage_bucket,
                record.before_image_path,
                schedule.image
              ),
              resolveImage(
                record.storage_bucket,
                record.after_image_path
              ),
            ]);

            if (!active) return;

            if (resolved[0].status === "fulfilled") {
              setBeforeImage(resolved[0].value);
            } else {
              warnings.push("Before-collection photo could not load.");
            }

            if (resolved[1].status === "fulfilled") {
              setAfterImage(resolved[1].value);
            } else {
              warnings.push("After-collection photo could not load.");
            }
          }
        }

        if (active) {
          setNotice([...new Set(warnings)].join(" "));
        }
      } catch (failure) {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load schedule details."
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
  }, [scheduleId, resident, refreshKey]);

  const backPath = item
    ? `/${currentRole}/calendar/list/${item.date}`
    : `/${currentRole}/calendar`;

  const fullDate = item
    ? parseDate(item.date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const selectedLocation = item
    ? {
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address,
        siteId: item.siteId,
        siteName: item.name,
        qrCode: item.qrCode,
      }
    : null;

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-3 pb-3 pt-8">
        <header className="shrink-0 rounded-t-xl bg-[#c90000] px-1 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <Link
              to={backPath}
              aria-label="Back to schedule list"
              className="grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/15"
            >
              <ArrowLeft size={18} />
            </Link>

            <h1 className="flex-1 text-sm font-bold text-white">
              {resident ? "Schedule Details" : "Waste Collection"}
            </h1>
          </div>
        </header>

        <div
          aria-busy={loading}
          className="relative -mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-t-xl bg-white px-3 pb-6 pt-3"
        >
          {loading ? (
            <p role="status" className="py-8 text-center text-xs text-neutral-500">
              Loading schedule details...
            </p>
          ) : error ? (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">
              {error}
            </p>
          ) : item ? (
            <>
              {notice && (
                <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  {notice}
                </p>
              )}

              {/* Site summary */}
              <section className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-[#fff6f7] p-3 shadow-sm">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#ffa7b1] text-[#ff1737]">
                  <Trash2 size={30} strokeWidth={2.3} />
                </div>

                <div className="min-w-0 flex-1">
                  {resident && (
                    <div className="mb-1 flex justify-end">
                      <Badge color={badgeColor(item.type)}>
                        {item.type}
                      </Badge>
                    </div>
                  )}

                  <h2 className="break-words text-xs font-bold">
                    {item.name}
                  </h2>

                  <p className="mt-1 flex items-start gap-1 text-[10px]">
                    <MapPin size={11} className="mt-0.5 shrink-0" />
                    <span>{item.address}</span>
                  </p>

                  {resident ? (
                    <>
                      <p className="mt-1 text-[10px]">{fullDate}</p>
                      <p className="mt-1 text-[10px] font-semibold text-red-600">
                        {item.time}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[10px]">
                      {item.qrCode || "No QR code"}
                    </p>
                  )}
                </div>
              </section>

              <Panel title={resident ? "Schedule Information" : "Site Information"}>
                <Row
                  icon={<CalendarDays size={13} />}
                  label="Collection Date"
                  value={fullDate}
                />
                <Row
                  icon={<Clock3 size={13} />}
                  label="Time"
                  value={item.time}
                />
                <Row
                  icon={<Trash2 size={13} />}
                  label="Collection Type"
                  value={
                    <Badge color={badgeColor(item.type)}>
                      {item.type}
                    </Badge>
                  }
                />
                <Row
                  icon={<UserRound size={13} />}
                  label="Assigned Collector"
                  value={item.collector}
                />
                <Row
                  icon={<RefreshCw size={13} />}
                  label="Schedule Status"
                  value={
                    <Badge color={collectionStatusColor(item.status)}>
                      {item.status}
                    </Badge>
                  }
                />

                {!resident && (
                  <>
                    {collection && (
                      <>
                        <Row
                          label="Collection Result"
                          value={collection.collection_status}
                        />
                        <Row
                          label="Update Recorded"
                          value={formatTimestamp(collection.completed_at)}
                        />
                      </>
                    )}

                    <div className="px-3 pb-3 pt-2">
                      <p className="text-[10px] text-neutral-600">
                        Remarks
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words rounded border bg-[#f8f3e8] p-2 text-xs">
                        {collection?.remarks ||
                          item.remarks ||
                          "No remarks provided."}
                      </p>
                    </div>
                  </>
                )}
              </Panel>

              {resident && (
                <>
                  <Panel title="Waste Level Information">
                    <div className="m-2 grid grid-cols-2 divide-x divide-red-200 rounded-xl border border-red-200 bg-[#fff6f7] p-3">
                      <div className="pr-2">
                        <p className="text-[10px]">Waste Level</p>
                        <p className="mt-3 text-sm font-bold">
                          {item.level || "Unavailable"}
                        </p>
                        <p className="mt-3 text-[9px] text-neutral-500">
                          {item.level === "FULL"
                            ? "Collection is prioritized."
                            : item.level === "NEAR FULL"
                              ? "This disposal bin is near full."
                              : item.level === "EMPTY"
                                ? "Open for disposal."
                                : "No accessible CNN result."}
                        </p>
                      </div>

                      <div className="pl-3">
                        <p className="text-[10px]">Confidence Level</p>
                        <p className="mt-3 text-sm font-bold">
                          {item.confidence}
                        </p>
                        <p className="mt-2 text-[9px] text-neutral-500">
                          Last Updated
                        </p>
                        <p className="mt-1 text-[9px]">
                          {item.analyzedAt
                            ? formatTimestamp(item.analyzedAt)
                            : "Unavailable"}
                        </p>
                      </div>
                    </div>
                  </Panel>

                  <Panel title={`Recent Reports (${recentReports.length})`}>
                    {recentReports.length === 0 ? (
                      <p className="px-3 pb-3 text-xs text-neutral-500">
                        No recent reports available to your account.
                      </p>
                    ) : (
                      <div
                        tabIndex={0}
                        aria-label="Recent report photos"
                        className="flex gap-3 overflow-x-auto px-3 pb-3"
                      >
                        {recentReports.map((report) => (
                          <div key={report.id} className="w-28 shrink-0">
                            <Photo
                              source={report.image}
                              alt="Recent waste report"
                              className="h-20 w-full rounded-lg object-cover"
                            />
                            <p className="mt-1 text-[9px]">{report.date}</p>
                            <p className="mt-1 text-[9px]">
                              CNN Result: {report.level || "Pending"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </>
              )}

              <Panel title="Site Location">
                <Link
                  to={
                    resident
                      ? "/resident/report-waste/map"
                      : "/collector/route"
                  }
                  state={{
                    selectedLocation,
                    site: {
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
                    },
                  }}
                  aria-label={`Open map for ${item.name}`}
                  className="relative m-3 block overflow-hidden rounded-xl border"
                >
                  <img
                    src={img("map.jpg")}
                    alt="Illustrative map preview"
                    className="h-28 w-full object-cover"
                  />
                  <MapPin
                    size={28}
                    fill={resident ? "#ed0015" : "#008b4d"}
                    color="white"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  />
                  <span className="absolute right-2 top-2 rounded bg-white px-2 py-1 text-[9px] text-red-600">
                    Open map
                  </span>
                </Link>
              </Panel>

              {!resident && (
                <Panel
                  title={
                    <span className="flex items-center gap-1">
                      <Camera size={12} />
                      Before and After Collection
                    </span>
                  }
                >
                  <div
                    tabIndex={0}
                    aria-label="Before and after collection photos"
                    className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3"
                  >
                    <PhotoSlide
                      title="Before Collection"
                      source={beforeImage}
                    />
                    <PhotoSlide
                      title="After Collection"
                      source={afterImage}
                    />
                  </div>
                </Panel>
              )}
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Badge({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium text-white ${color}`}>
      {children}
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-neutral-300 bg-white">
      <h2 className="px-2 pb-2 pt-2 text-[11px] font-medium text-[#c90000]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 items-start gap-3 border-b border-[#eee0cd] px-3 py-2 text-[10px] last:border-b-0">
      <span className="flex items-center gap-1.5 text-neutral-700">
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{label}</span>
      </span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  );
}

function Photo({
  source,
  alt,
  className,
}: {
  source: string;
  alt: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [source]);

  if (!source || failed) {
    return (
      <div
        role="img"
        aria-label={`${alt} unavailable`}
        className={`${className} grid place-items-center bg-neutral-100 text-neutral-400`}
      >
        <ImageOff size={24} />
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={alt}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function PhotoSlide({
  title,
  source,
}: {
  title: string;
  source: string;
}) {
  return (
    <div className="relative w-full shrink-0 snap-start">
      <Photo
        source={source}
        alt={title}
        className="aspect-[3/2] w-full rounded-xl object-cover"
      />

      <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-1 text-[9px] text-white">
        {title}
      </span>
    </div>
  );
}