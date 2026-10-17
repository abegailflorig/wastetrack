
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft, Navigation } from "lucide-react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import { supabase } from "../../lib/supabase";
import bin1 from "../../assets/bin1.png";
import bin2 from "../../assets/bin2.png";
import bin3 from "../../assets/bin3.png";

type WasteLevel = "FULL" | "NEAR FULL" | "EMPTY";

type Site = {
  id: string;
  name: string;
  image: string;
  address: string;
  latitude: number;
  longitude: number;
  qrCode: string;
  residents: number;
  wasteLevel: WasteLevel;
  lastCollection: string;
  collectionDate?: string;
  collectionTime?: string;
  scheduleStatus?: string;
};

type SiteRow = {
  site_id: string;
  site_name: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  qr_code?: string | null;
};

type ScheduleRow = {
  schedule_id: string;
  site_id: string;
  date: string | null;
  collection_time: string | null;
  status: string | null;
  date_completed: string | null;
  collection_type?: string | null;
};

type CollectionRow = {
  schedule_id: string;
  collection_status: string | null;
  completed_at: string | null;
};

type ReportRow = {
  site_id: string | null;
  cnn_detection_level: string | null;
  created_at?: string | null;
};

type DirectionStep = {
  name: string;
  distance: number;
  maneuver: {
    location: [number, number];
    type: string;
    modifier?: string;
    instruction?: string;
  };
};

type RoadRoute = {
  distance: number;
  duration: number;
  geometry: {
    coordinates: [number, number][];
  };
  legs: {
    steps: DirectionStep[];
  }[];
};

const TOKEN = import.meta.env.VITE_LOCATIONIQ_TOKEN as
  | string
  | undefined;

const ARRIVAL_RADIUS = 30;
const MAX_ARRIVAL_ACCURACY = 25;

const defaultImages = [bin1, bin2, bin3];

function formatDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function formatTime(time?: string | null) {
  if (!time) return "Time not set";

  const parts = time.split(":");
  if (parts.length < 2) return time;

  const date = new Date();
  date.setHours(Number(parts[0]), Number(parts[1]), 0, 0);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCollectionDate(date?: string | null) {
  if (!date) return "Date not set";

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLastCollection(
  schedule?: ScheduleRow,
  collection?: CollectionRow,
) {
  if (collection?.completed_at) {
    return new Date(collection.completed_at).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (schedule?.date) {
    return `${formatCollectionDate(schedule.date)}, ${formatTime(
      schedule.collection_time,
    )}`;
  }

  return "No collection recorded";
}

function instructionFor(step: DirectionStep) {
  if (step.maneuver.instruction) {
    return step.maneuver.instruction;
  }

  const { type, modifier } = step.maneuver;

  if (type === "arrive") {
    return "Arrive at the collection site";
  }

  if (type === "depart") {
    return step.name
      ? `Head along ${step.name}`
      : "Follow the highlighted route";
  }

  const action = type.replace(/_/g, " ");
  const direction = modifier?.replace(/_/g, " ") || "";
  const road = step.name ? ` onto ${step.name}` : "";

  return `${action} ${direction}${road}`.trim();
}

function locationErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: number }).code;

    if (code === 1) {
      return "Location permission was denied. Allow location access and try again.";
    }

    if (code === 2) {
      return "Your location is unavailable. Turn on GPS and try again.";
    }

    if (code === 3) {
      return "Getting your location timed out. Try again outdoors.";
    }
  }

  return "Unable to start routing. Check location access and your connection.";
}

function normalizeWasteLevel(value?: string | null): WasteLevel {
  const level = (value || "").trim().toUpperCase();

  if (level.includes("NEAR")) return "NEAR FULL";
  if (level.includes("FULL") || level.includes("OVERFLOW")) {
    return "FULL";
  }

  return "EMPTY";
}

export default function CollectorRoute() {
  const navigate = useNavigate();
  const location = useLocation();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);

  const watchRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const startingRef = useRef(false);

  const activeSiteRef = useRef<Site | null>(null);
  const routeStepsRef = useRef<DirectionStep[]>([]);
  const stepIndexRef = useRef(0);

  const arrivalReadingsRef = useRef(0);
  const lastArrivalTimestampRef = useRef(0);
  const arrivedRef = useRef(false);

  const incomingSite = (
    location.state as { site?: Partial<Site> } | null
  )?.site;

  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState("");

  const [selectedSite, setSelectedSite] = useState<Site | null>(() => {
    if (
      !incomingSite ||
      !Number.isFinite(incomingSite.latitude) ||
      !Number.isFinite(incomingSite.longitude) ||
      (incomingSite.latitude as number) < -90 ||
      (incomingSite.latitude as number) > 90 ||
      (incomingSite.longitude as number) < -180 ||
      (incomingSite.longitude as number) > 180
    ) {
      return null;
    }

    return {
      id: String(incomingSite.id ?? ""),
      name: incomingSite.name || "Collection site",
      image: incomingSite.image || bin1,
      address: incomingSite.address || "",
      latitude: incomingSite.latitude as number,
      longitude: incomingSite.longitude as number,
      qrCode: incomingSite.qrCode || "Not available",
      residents: incomingSite.residents ?? 0,
      wasteLevel: normalizeWasteLevel(incomingSite.wasteLevel),
      lastCollection: incomingSite.lastCollection || "No collection recorded",
      collectionDate: incomingSite.collectionDate,
      collectionTime: incomingSite.collectionTime,
      scheduleStatus: incomingSite.scheduleStatus,
    };
  });

  const [routing, setRouting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [distance, setDistance] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [routeSummary, setRouteSummary] = useState("");
  const [instruction, setInstruction] = useState("");

  // Load sites, schedules, completed collections, and report information.
  useEffect(() => {
    let cancelled = false;

    async function loadSites() {
      setSitesLoading(true);
      setSitesError("");

      try {
        const [
          sitesResult,
          schedulesResult,
          collectionsResult,
          reportsResult,
        ] = await Promise.all([
          supabase
            .from("disposal_sites")
            .select("site_id, site_name, location, latitude, longitude, qr_code")
            .order("site_name", { ascending: true }),

          supabase
            .from("schedules")
            .select(
              "schedule_id, site_id, date, collection_time, status, date_completed, collection_type",
            )
            .order("date", { ascending: false }),

          supabase
            .from("collections")
            .select("schedule_id, collection_status, completed_at"),

          supabase
            .from("waste_reports")
            .select("site_id, cnn_detection_level, created_at")
            .order("created_at", { ascending: false }),
        ]);

        if (sitesResult.error) throw sitesResult.error;

        const siteRows = (sitesResult.data || []) as SiteRow[];
        const scheduleRows = (
          schedulesResult.error ? [] : schedulesResult.data || []
        ) as ScheduleRow[];
        const collectionRows = (
          collectionsResult.error ? [] : collectionsResult.data || []
        ) as CollectionRow[];
        const reportRows = (
          reportsResult.error ? [] : reportsResult.data || []
        ) as ReportRow[];

        const validSites = siteRows.filter(
          (site) =>
            site.latitude !== null &&
            site.longitude !== null &&
            Number.isFinite(Number(site.latitude)) &&
            Number.isFinite(Number(site.longitude)) &&
            Number(site.latitude) >= -90 &&
            Number(site.latitude) <= 90 &&
            Number(site.longitude) >= -180 &&
            Number(site.longitude) <= 180,
        );

        const mappedSites: Site[] = validSites.map((site, index) => {
          const siteSchedules = scheduleRows
            .filter((schedule) => schedule.site_id === site.site_id)
            .sort((a, b) => {
              const dateA = `${a.date || ""} ${a.collection_time || ""}`;
              const dateB = `${b.date || ""} ${b.collection_time || ""}`;
              return dateB.localeCompare(dateA);
            });

          const latestSchedule = siteSchedules[0];

          const latestCollection = latestSchedule
            ? collectionRows.find(
                (collection) =>
                  collection.schedule_id === latestSchedule.schedule_id,
              )
            : undefined;

          const latestReport = reportRows.find(
            (report) => report.site_id === site.site_id,
          );

          const siteReports = reportRows.filter(
            (report) => report.site_id === site.site_id,
          );

          return {
            id: site.site_id,
            name: site.site_name || "Unnamed disposal site",
            image: defaultImages[index % defaultImages.length],
            address: site.location || "Address not available",
            latitude: Number(site.latitude),
            longitude: Number(site.longitude),
            qrCode: site.qr_code || "Not available",
            residents: siteReports.length,
            wasteLevel: normalizeWasteLevel(
              latestReport?.cnn_detection_level,
            ),
            lastCollection: formatLastCollection(
              latestSchedule,
              latestCollection,
            ),
            collectionDate: latestSchedule?.date || undefined,
            collectionTime: latestSchedule?.collection_time || undefined,
            scheduleStatus: latestSchedule?.status || undefined,
          };
        });

        if (cancelled) return;

        setSites(mappedSites);

        // Keep the route-state selected site aligned with the database row.
        if (incomingSite) {
          const matchingSite = mappedSites.find(
            (site) =>
              site.id === String(incomingSite.id || "") ||
              site.name === incomingSite.name,
          );

          if (matchingSite) setSelectedSite(matchingSite);
        }
      } catch (loadError) {
        if (cancelled) return;

        setSitesError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load disposal sites from Supabase.",
        );
      } finally {
        if (!cancelled) setSitesLoading(false);
      }
    }

    void loadSites();

    return () => {
      cancelled = true;
    };
  }, []);

  function clearTracking() {
    sessionRef.current += 1;
    startingRef.current = false;

    controllerRef.current?.abort();
    controllerRef.current = null;

    if (watchRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }

    activeSiteRef.current = null;
    routeStepsRef.current = [];
    stepIndexRef.current = 0;
    arrivalReadingsRef.current = 0;
    lastArrivalTimestampRef.current = 0;
    arrivedRef.current = false;

    routeLineRef.current?.remove();
    routeLineRef.current = null;

    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
  }

  function stopRouting() {
    clearTracking();

    setRouting(false);
    setLoading(false);
    setInstruction("");
    setRouteSummary("");
    setDistance(null);
    setAccuracy(null);
    setError("");
  }

  // Create the map once; site markers are updated in the next effect.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [8.23912, 124.24842],
      zoom: 16,
      minZoom: 12,
      maxZoom: 19,
      zoomControl: false,
    });

    mapRef.current = map;

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      clearTracking();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw markers from the live Supabase data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || sites.length === 0) return;

    const markers: L.Marker[] = [];

    sites.forEach((site) => {
      const color =
        site.wasteLevel === "EMPTY"
          ? "#00a65a"
          : site.wasteLevel === "FULL"
            ? "#ed0015"
            : "#ffa000";

      const icon = L.divIcon({
        className: "",
        html: `
          <svg xmlns="http://www.w3.org/2000/svg"
            width="28" height="36" viewBox="0 0 24 32">
            <path d="M12 31S1 18 1 11a11 11 0 0 1 22 0c0 7-11 20-11 20Z"
              fill="${color}" stroke="white" stroke-width="1.5"/>
            <circle cx="12" cy="11" r="4" fill="white"/>
          </svg>
        `,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -30],
      });

      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = site.name;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "View Site";
      button.style.cssText =
        "display:block;margin-top:8px;padding:10px 14px;" +
        "background:#c90000;color:white;border:0;" +
        "border-radius:6px;cursor:pointer;font-weight:600;";

      button.addEventListener("click", () => {
        if (activeSiteRef.current || startingRef.current) return;

        map.closePopup();
        setError("");
        setDistance(null);
        setAccuracy(null);
        setSelectedSite(site);
      });

      popup.append(title, button);

      const marker = L.marker([site.latitude, site.longitude], {
        icon,
        title: site.name,
      })
        .addTo(map)
        .bindPopup(popup);

      markers.push(marker);
    });

    map.fitBounds(
      L.latLngBounds(
        sites.map(
          (site): L.LatLngTuple => [site.latitude, site.longitude],
        ),
      ),
      {
        padding: [35, 40],
        maxZoom: 16,
      },
    );

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [sites]);

  function updatePosition(position: GeolocationPosition) {
    const site = activeSiteRef.current;
    const map = mapRef.current;

    if (!site || !map || arrivedRef.current) return;

    const point: L.LatLngTuple = [
      position.coords.latitude,
      position.coords.longitude,
    ];

    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      return;
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(point);
    } else {
      userMarkerRef.current = L.circleMarker(point, {
        radius: 8,
        color: "white",
        weight: 3,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip("Your location");
    }

    const meters = L.latLng(point).distanceTo([
      site.latitude,
      site.longitude,
    ]);

    setDistance(meters);
    setAccuracy(position.coords.accuracy);
    setError("");

    map.panTo(point, { animate: true });

    const steps = routeStepsRef.current;
    let index = stepIndexRef.current;

    while (index + 1 < steps.length) {
      const [longitude, latitude] =
        steps[index + 1].maneuver.location;

      const nextDistance = L.latLng(point).distanceTo([
        latitude,
        longitude,
      ]);

      if (nextDistance > 25 || position.coords.accuracy > 30) {
        break;
      }

      index += 1;
    }

    stepIndexRef.current = index;

    if (steps[index]) {
      setInstruction(instructionFor(steps[index]));
    }

    const age = Date.now() - position.timestamp;
    const isFresh = age >= 0 && age < 15000;
    const isAccurate =
      position.coords.accuracy <= MAX_ARRIVAL_ACCURACY;
    const isNearSite = meters <= ARRIVAL_RADIUS;

    if (isNearSite && isAccurate && isFresh) {
      if (position.timestamp > lastArrivalTimestampRef.current) {
        arrivalReadingsRef.current += 1;
        lastArrivalTimestampRef.current = position.timestamp;
      }
    } else {
      arrivalReadingsRef.current = 0;
      lastArrivalTimestampRef.current = 0;
    }

    if (arrivalReadingsRef.current >= 2 && !arrivedRef.current) {
      arrivedRef.current = true;

      const arrivalPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };

      clearTracking();

      navigate("/collector/waste-collection", {
        replace: true,
        state: {
          site,
          collection: site,
          selectedLocation: {
            latitude: site.latitude,
            longitude: site.longitude,
            address: site.address,
          },
          arrivalPosition,
        },
      });
    }
  }

  async function startRouting() {
    if (!selectedSite || startingRef.current || activeSiteRef.current) {
      return;
    }

    if (!TOKEN) {
      setError("Add VITE_LOCATIONIQ_TOKEN to your .env file.");
      return;
    }

    if (!navigator.geolocation) {
      setError("Location access is unavailable on this device.");
      return;
    }

    clearTracking();

    const session = sessionRef.current;
    const site = selectedSite;

    startingRef.current = true;
    arrivedRef.current = false;

    setLoading(true);
    setError("");
    setDistance(null);
    setAccuracy(null);

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          });
        },
      );

      if (session !== sessionRef.current) return;

      const controller = new AbortController();
      controllerRef.current = controller;

      const coordinates =
        `${position.coords.longitude},${position.coords.latitude};` +
        `${site.longitude},${site.latitude}`;

      const params = new URLSearchParams({
        key: TOKEN,
        overview: "full",
        geometries: "geojson",
        steps: "true",
      });

      const response = await fetch(
        `https://us1.locationiq.com/v1/directions/driving/${coordinates}?${params}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Routing limit reached. Try again later."
            : "Unable to load directions. Check your LocationIQ token and connection.",
        );
      }

      const data: { code: string; routes?: RoadRoute[] } =
        await response.json();

      if (session !== sessionRef.current) return;

      const route = data.routes?.[0];

      if (
        data.code !== "Ok" ||
        !route ||
        !route.geometry?.coordinates?.length
      ) {
        throw new Error("No driving route was found for this site.");
      }

      const map = mapRef.current;
      if (!map) return;

      const points: L.LatLngTuple[] = route.geometry.coordinates.map(
        ([longitude, latitude]): L.LatLngTuple => [latitude, longitude],
      );

      routeLineRef.current = L.polyline(points, {
        color: "#009b55",
        weight: 6,
        opacity: 0.95,
      }).addTo(map);

      map.fitBounds(routeLineRef.current.getBounds(), {
        padding: [35, 35],
        maxZoom: 17,
      });

      routeStepsRef.current = route.legs.reduce<DirectionStep[]>(
        (allSteps, leg) => allSteps.concat(leg.steps),
        [],
      );

      activeSiteRef.current = site;
      startingRef.current = false;

      setRouteSummary(
        `${formatDistance(route.distance)} · approximately ${Math.max(
          1,
          Math.round(route.duration / 60),
        )} min`,
      );

      setRouting(true);
      setLoading(false);

      updatePosition(position);

      if (session !== sessionRef.current || arrivedRef.current) return;

      watchRef.current = navigator.geolocation.watchPosition(
        (nextPosition) => {
          if (session === sessionRef.current) updatePosition(nextPosition);
        },
        (gpsError) => {
          if (session !== sessionRef.current) return;

          arrivalReadingsRef.current = 0;
          lastArrivalTimestampRef.current = 0;
          setError(locationErrorMessage(gpsError));
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        },
      );
    } catch (routingError) {
      if (session !== sessionRef.current) return;

      clearTracking();
      setLoading(false);
      setRouting(false);
      setError(locationErrorMessage(routingError));
    }
  }

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2">
        <Link
          to="/collector/dashboard"
          aria-label="Back to dashboard"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100"
        >
          <ArrowLeft size={21} />
        </Link>

        <div>
          <p className="text-[9px] uppercase text-neutral-500">
            Brgy. San Miguel
          </p>
          <h1 className="text-sm font-semibold">Route Map</h1>
        </div>
      </header>

      <div className="relative isolate min-h-0 flex-1">
        <div
          ref={containerRef}
          className="h-full w-full"
          aria-label="Collector route map in San Miguel, Iligan City"
        />

        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] space-y-2 pr-12">
          {sitesLoading && (
            <p className="pointer-events-auto rounded-lg bg-white p-3 text-xs text-neutral-600 shadow">
              Loading disposal sites...
            </p>
          )}

          {sitesError && (
            <p
              role="alert"
              className="pointer-events-auto rounded-lg border border-red-200 bg-white p-3 text-xs text-red-700 shadow"
            >
              {sitesError}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="pointer-events-auto rounded-lg border border-red-200 bg-white p-3 text-xs text-red-700 shadow"
            >
              {error}
            </p>
          )}

          {routing && (
            <section
              aria-label="Route instructions"
              className="rounded-xl bg-[#008d50] p-3 text-white shadow"
            >
              <p aria-live="polite" className="flex items-start gap-2 text-sm font-bold">
                <Navigation size={20} className="shrink-0" />
                {instruction || "Follow the highlighted route"}
              </p>

              <p className="mt-1 text-xs">
                Initial route: {routeSummary}
              </p>
            </section>
          )}
        </div>

        {routing && (
          <section className="absolute inset-x-3 bottom-6 z-[1000] mx-auto max-w-lg rounded-xl bg-white p-4 shadow-lg">
            <h2 className="text-sm font-bold">{selectedSite?.name}</h2>

            <p className="mt-1 text-xs text-neutral-600">
              {distance !== null
                ? `${formatDistance(distance)} straight-line distance to the pin`
                : "Finding your position…"}
            </p>

            <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
              GPS accuracy:{" "}
              {accuracy !== null ? `±${Math.round(accuracy)} m` : "—"}.
              {" "}Waste Collection opens automatically after arrival.
            </p>

            {accuracy !== null && accuracy > MAX_ARRIVAL_ACCURACY && (
              <p className="mt-2 text-[10px] text-amber-700">
                Waiting for a more accurate GPS reading.
              </p>
            )}

            <button
              type="button"
              onClick={stopRouting}
              className="mt-3 min-h-11 w-full rounded-lg border border-red-300 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Stop Routing
            </button>
          </section>
        )}

        {selectedSite && !routing && (
          <section
            aria-label="Selected site details"
            className="absolute inset-x-0 bottom-0 z-[1100] mx-auto max-h-[70%] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-[0_-3px_12px_rgba(0,0,0,0.15)]"
          >
            <button
              type="button"
              aria-label="Close selected site"
              className="mx-auto mb-3 block h-1 w-14 rounded bg-neutral-300"
              onClick={() => {
                stopRouting();
                setSelectedSite(null);
              }}
            />

            <div className="flex items-start gap-3">
              <img
                src={selectedSite.image}
                alt={selectedSite.name}
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />

              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">{selectedSite.name}</h2>

                <p className="mt-1 text-[10px] text-neutral-600">
                  {selectedSite.address}
                </p>

                <p className="mt-1 break-words text-[9px] text-neutral-500">
                  {selectedSite.latitude.toFixed(7)},{" "}
                  {selectedSite.longitude.toFixed(7)}
                </p>

                <span className="mt-1 inline-block rounded border border-red-300 px-1.5 py-0.5 text-[8px]">
                  Registered · {selectedSite.qrCode}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <DetailBox
                label="Reported by"
                value={`${selectedSite.residents} report(s)`}
              />
              <DetailBox
                label="Waste Level (CNN)"
                value={selectedSite.wasteLevel}
              />
              <DetailBox
                label="Last Collection"
                value={selectedSite.lastCollection}
              />
              <DetailBox
                label="Destination"
                value="Selected pin"
              />
            </div>

            <button
              type="button"
              onClick={() => void startRouting()}
              disabled={loading}
              className="flex min-h-11 w-full items-center justify-center rounded-lg bg-[#c90000] px-4 text-xs font-bold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Preparing route..." : "Start Routing"}
            </button>
          </section>
        )}
      </div>

      <a
        href="https://locationiq.com/"
        target="_blank"
        rel="noreferrer"
        className="shrink-0 py-1 text-center text-[9px] text-neutral-500"
      >
        Routing by LocationIQ
      </a>
    </main>
  );
}

function DetailBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#ff7474] bg-[#f5e7d2] p-3">
      <p className="text-[8px] uppercase text-neutral-600">{label}</p>
      <p className="mt-1 whitespace-pre-line break-words text-xs font-medium">
        {value}
      </p>
    </div>
  );
}
