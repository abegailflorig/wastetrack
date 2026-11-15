
import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { MapPin, QrCode } from "lucide-react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import TopBar from "../../components/TopBar";

// ==========================================
// TYPES
// ==========================================

type SelectionMethod = "qr" | "manual";

type SelectedLocation = {
  latitude: number;
  longitude: number;
  address: string;
  description?: string;

  siteId?: string;
  siteName?: string;
  qrCode?: string;
  isRegistered?: boolean;

  selectionMethod?: SelectionMethod;
  source?: string;
};

type RouteState = {
  selectedLocation?: unknown;
  selectionMethod?: unknown;
  source?: unknown;
  qrVerified?: unknown;
  qrCode?: unknown;
};

// ==========================================
// VALIDATE SELECTED LOCATION
// ==========================================

function isSelectedLocation(
  value: unknown
): value is SelectedLocation {
  if (!value || typeof value !== "object") {
    return false;
  }

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
      typeof point.description === "string") &&

    (point.siteId === undefined ||
      typeof point.siteId === "string") &&

    (point.siteName === undefined ||
      typeof point.siteName === "string") &&

    (point.qrCode === undefined ||
      typeof point.qrCode === "string") &&

    (point.isRegistered === undefined ||
      typeof point.isRegistered === "boolean")
  );
}

// ==========================================
// DETECT HOW LOCATION WAS SELECTED
// ==========================================

function detectSelectionMethod(
  state: RouteState | null,
  selectedLocation: SelectedLocation | null
): SelectionMethod {
  // Prefer an explicitly supplied method.
  const declared =
    state?.selectionMethod ??
    state?.source ??
    selectedLocation?.selectionMethod ??
    selectedLocation?.source;

  // ====================================
  // MANUALLY PINNED FROM SITEMAP
  // ====================================

  if (
    declared === "manual" ||
    declared === "map"
  ) {
    return "manual";
  }

  // ====================================
  // SCANNED USING QRSCANNER
  // ====================================

  if (
    declared === "qr" ||
    declared === "qr-scanner"
  ) {
    return "qr";
  }

  // ====================================
  // SUPPORT EXISTING QR SCANNER STATE
  // ====================================

  if (state?.qrVerified === true) {
    return "qr";
  }

  // Existing QRScanner.tsx navigates with:
  // {
  //   selectedLocation,
  //   qrCode: selectedLocation.qrCode
  // }
  //
  // Detect that format for compatibility.

  if (
    selectedLocation?.isRegistered === true &&
    typeof state?.qrCode === "string" &&
    state.qrCode.trim().length > 0
  ) {
    return "qr";
  }

  // Default for map-selected locations.
  // A registered location selected on the map
  // is still considered manually selected.
  return "manual";
}

// ==========================================
// MAIN SITE DETAILS COMPONENT
// ==========================================

export default function SiteDetails() {
  const location = useLocation();

  // ========================================
  // READ NAVIGATION STATE
  // ========================================

  const state =
    (location.state ?? null) as RouteState | null;

  const selectedLocation = isSelectedLocation(
    state?.selectedLocation
  )
    ? state.selectedLocation
    : null;

  // ========================================
  // DETECT SELECTION METHOD
  // ========================================

  const selectionMethod = detectSelectionMethod(
    state,
    selectedLocation
  );

  const isQrScanned =
    selectionMethod === "qr";

  // ========================================
  // LOCATION DETAILS
  // ========================================

  const latitude =
    selectedLocation?.latitude;

  const longitude =
    selectedLocation?.longitude;

  const qrCode = isQrScanned
    ? selectedLocation?.qrCode ||
      (typeof state?.qrCode === "string"
        ? state.qrCode
        : "")
    : "";

  // ========================================
  // LEAFLET MAP REFERENCE
  // ========================================

  const mapContainerRef =
    useRef<HTMLDivElement | null>(null);

  // ========================================
  // INITIALIZE MAP
  // ========================================

  useEffect(() => {
    const container =
      mapContainerRef.current;

    if (
      !container ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return;
    }

    // ====================================
    // CREATE LEAFLET MAP
    // ====================================

    const map = L.map(container, {
      center: [latitude, longitude],
      zoom: 18,
      minZoom: 12,
      maxZoom: 19,
      scrollWheelZoom: false,
    });

    // ====================================
    // OPENSTREETMAP TILES
    // ====================================

    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(map);

    // ====================================
    // CUSTOM LOCATION PIN
    // ====================================

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
          <circle
            cx="12"
            cy="11"
            r="4"
            fill="white"
          />
        </svg>
      `,
      iconSize: [36, 44],
      iconAnchor: [18, 44],
    });

    // ====================================
    // DISPLAY SELECTED LOCATION PIN
    // ====================================

    L.marker(
      [latitude, longitude],
      {
        icon: pinIcon,
        title: isQrScanned
          ? "QR-scanned disposal site"
          : "Manually selected location",
      }
    ).addTo(map);

    // ====================================
    // RESPONSIVE MAP
    // ====================================

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });

    observer.observe(container);

    const frame =
      window.requestAnimationFrame(() => {
        map.invalidateSize();
      });

    // ====================================
    // CLEANUP
    // ====================================

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      map.remove();
    };
  }, [
    latitude,
    longitude,
    isQrScanned,
  ]);

  // ========================================
  // MAIN USER INTERFACE
  // ========================================

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-white">
      <TopBar
        title="Disposal Site Map"
        back="/resident/report-waste/map"
      />

      <div className="mx-auto w-full max-w-6xl px-3 pb-6 sm:px-6 lg:px-8">

        {/* ====================================
            NO LOCATION SELECTED
        ==================================== */}

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
              Select a disposal site on the map
              or scan a registered QR code
              to continue.
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

            {/* ====================================
                DISPOSAL SITE MAP
            ==================================== */}

            <div className="relative isolate mt-3 overflow-hidden rounded-2xl border border-neutral-200">
              <div
                ref={mapContainerRef}
                aria-label="Map showing the selected disposal site"
                className="h-[35dvh] min-h-[220px] w-full bg-neutral-100 sm:min-h-[300px] lg:h-[45dvh]"
              />
            </div>

            {/* ====================================
                SITE INFORMATION CARD
            ==================================== */}

            <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">

              {/* ====================================
                  SITE HEADER
              ==================================== */}

              <div className="flex items-start gap-3">

                {/* ICON CHANGES BASED ON SOURCE */}

                <div
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl sm:h-14 sm:w-14 ${
                    isQrScanned
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-[#A61B1B]"
                  }`}
                >
                  {isQrScanned ? (
                    <QrCode size={27} />
                  ) : (
                    <MapPin size={27} />
                  )}
                </div>

                <div className="min-w-0 flex-1">

                  {/* ====================================
                      SITE TITLE
                  ==================================== */}

                  <h1 className="break-words text-base font-bold sm:text-lg">
                    {isQrScanned &&
                    selectedLocation.siteName
                      ? selectedLocation.siteName
                      : "Selected Disposal Site"}
                  </h1>

                  {/* ADDRESS */}

                  <p className="mt-1 break-words text-xs leading-relaxed text-neutral-600 sm:text-sm">
                    {selectedLocation.address ||
                      "Address unavailable"}
                  </p>

                  {/* ====================================
                      AUTOMATIC SELECTION DETECTION
                  ==================================== */}

                  <span
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-medium sm:text-xs ${
                      isQrScanned
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-red-200 bg-red-50 text-[#A61B1B]"
                    }`}
                  >
                    {isQrScanned ? (
                      <>
                        <QrCode size={13} />
                        Scanned QR code
                      </>
                    ) : (
                      <>
                        <MapPin size={13} />
                        Manually pinned location
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* ====================================
                  COORDINATES
              ==================================== */}

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">

                {/* LATITUDE */}

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                    Latitude
                  </p>

                  <p className="mt-1 break-words text-sm font-semibold">
                    {selectedLocation.latitude.toFixed(7)}°
                  </p>
                </div>

                {/* LONGITUDE */}

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">
                    Longitude
                  </p>

                  <p className="mt-1 break-words text-sm font-semibold">
                    {selectedLocation.longitude.toFixed(7)}°
                  </p>
                </div>
              </div>

              {/* ====================================
                  SITE DESCRIPTION
              ==================================== */}

              <div className="mt-4 rounded-xl border border-neutral-200 p-3 sm:p-4">
                <h2 className="text-xs font-semibold sm:text-sm">
                  Site Description
                </h2>

                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-600 sm:text-sm">
                  {selectedLocation.description?.trim() ||
                    "No description provided."}
                </p>
              </div>

              {/* ====================================
                  CREATE A REPORT
              ==================================== */}

              <Link
                to="/resident/report-waste/create"
                state={{
                  selectedLocation: {
                    ...selectedLocation,
                    selectionMethod,
                  },

                  selectionMethod,

                  qrVerified: isQrScanned,

                  ...(isQrScanned && qrCode
                    ? { qrCode }
                    : {}),
                }}
                className="mt-5 flex min-h-11 items-center justify-center rounded-xl border border-red-300 bg-[#fff1e6] px-4 py-3 text-sm font-bold text-[#A61B1B] transition-colors hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                CREATE A REPORT
              </Link>

              {/* ====================================
                  CHANGE LOCATION
              ==================================== */}

              <Link
                to="/resident/report-waste"
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
