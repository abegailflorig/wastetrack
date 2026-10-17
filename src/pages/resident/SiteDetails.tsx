import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { MapPin } from "lucide-react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import TopBar from "../../components/TopBar";

type SelectedLocation = {
  latitude: number;
  longitude: number;
  address: string;
  description?: string;
};

function isSelectedLocation(value: unknown): value is SelectedLocation {
  if (!value || typeof value !== "object") return false;

  const point = value as Partial<SelectedLocation>;

  return (
    typeof point.latitude === "number" &&
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180 &&
    typeof point.address === "string" &&
    (point.description === undefined ||
      typeof point.description === "string")
  );
}

export default function SiteDetails() {
  const location = useLocation();

  const state = location.state as
    | { selectedLocation?: unknown }
    | null;

  const selectedLocation = isSelectedLocation(
    state?.selectedLocation
  )
    ? state.selectedLocation
    : null;

  const latitude = selectedLocation?.latitude;
  const longitude = selectedLocation?.longitude;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = mapContainerRef.current;

    if (
      !container ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return;
    }

    const map = L.map(container, {
      center: [latitude, longitude],
      zoom: 18,
      minZoom: 12,
      maxZoom: 19,
      scrollWheelZoom: false,
    });

    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(map);

    const pinIcon = L.divIcon({
      className: "",
      html: `
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="44"
          viewBox="0 0 24 30"
        >
          <path
            d="M12 29S1 17 1 11a11 11 0 0 1 22 0c0 6-11 18-11 18Z"
            fill="#A61B1B"
            stroke="white"
            stroke-width="1.5"
          />
          <circle cx="12" cy="11" r="4" fill="white"/>
        </svg>
      `,
      iconSize: [36, 44],
      iconAnchor: [18, 44],
    });

    L.marker([latitude, longitude], {
      icon: pinIcon,
      title: "Selected disposal site",
    }).addTo(map);

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [latitude, longitude]);

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-white">
      <TopBar
        title="Disposal Site Map"
        back="/resident/report-waste/map"
      />

      <div className="mx-auto w-full max-w-6xl px-3 pb-6 sm:px-6 lg:px-8">
        {!selectedLocation ? (
          <section className="mt-6 rounded-2xl border border-neutral-200 p-5 text-center">
            <MapPin
              size={32}
              className="mx-auto text-[#A61B1B]"
            />

            <h1 className="mt-3 text-base font-bold">
              No location selected
            </h1>

            <p className="mt-2 text-sm text-neutral-600">
              Select a disposal site on the map to continue.
            </p>

            <Link
              to="/resident/report-waste/map"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#A61B1B] px-5 py-3 text-sm font-semibold text-white hover:bg-red-800"
            >
              Select Location
            </Link>
          </section>
        ) : (
          <>
            {/* Map centered on the confirmed location */}
            <div className="relative isolate mt-3 overflow-hidden rounded-2xl border border-neutral-200">
              <div
                ref={mapContainerRef}
                aria-label="Map showing the selected disposal site"
                className="h-[35dvh] min-h-[220px] w-full bg-neutral-100 sm:min-h-[300px] lg:h-[45dvh]"
              />
            </div>

            {/* Site information received from SiteMap */}
            <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-50 text-[#A61B1B] sm:h-14 sm:w-14">
                  <MapPin size={27} />
                </div>

                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-bold sm:text-lg">
                    Selected Disposal Site
                  </h1>

                  <p className="mt-1 break-words text-xs leading-relaxed text-neutral-600 sm:text-sm">
                    {selectedLocation.address ||
                      "Address unavailable"}
                  </p>

                  <span className="mt-2 inline-block rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-medium text-[#A61B1B] sm:text-xs">
                    Manually pinned location
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                    Latitude
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold">
                    {selectedLocation.latitude.toFixed(7)}°
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                    Longitude
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold">
                    {selectedLocation.longitude.toFixed(7)}°
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-neutral-200 p-3 sm:p-4">
                <h2 className="text-xs font-semibold sm:text-sm">
                  Site Description
                </h2>

                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-600 sm:text-sm">
                  {selectedLocation.description?.trim() ||
                    "No description provided."}
                </p>
              </div>

              <Link
                to="/resident/report-waste/create"
                state={{ selectedLocation }}
                className="mt-5 flex min-h-11 items-center justify-center rounded-xl border border-red-300 bg-[#fff1e6] px-4 py-3 text-sm font-bold text-[#A61B1B] transition-colors hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                CREATE A REPORT
              </Link>

              <Link
                to="/resident/report-waste/map"
                className="mt-3 flex min-h-11 items-center justify-center rounded-xl px-4 text-xs font-medium text-neutral-600 hover:bg-neutral-100 sm:text-sm"
              >
                Change Location
              </Link>
            </section>
          </>
        )}
      </div>
    </main>
  );
}