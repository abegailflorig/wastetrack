import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import { Link } from "react-router";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import TopBar from "../../components/TopBar";
import { supabase } from "../../lib/supabase";

const SAN_MIGUEL: L.LatLngTuple = [8.23912, 124.24842];
const SEARCH_VIEWBOX = "124.225,8.260,124.275,8.215";
const API_BASE = "https://us1.locationiq.com/v1";

const TOKEN = import.meta.env.VITE_LOCATIONIQ_TOKEN as
  | string
  | undefined;

type DisposalSite = {
  site_id: string;
  site_name: string;
  location: string;
  description: string | null;
  latitude: number;
  longitude: number;
  qr_code: string | null;
  site_image: string | null;
};

type SearchResult = {
  place_id: string | number;
  lat: string;
  lon: string;
  display_name: string;
};

type SelectedLocation = {
  latitude: number;
  longitude: number;
  address: string;
  siteId?: string;
  siteName?: string;
  qrCode?: string | null;
  isRegistered?: boolean;
};

type AddressPoint = {
  latitude: number;
  longitude: number;
};

function validCoordinates(
  latitude: number,
  longitude: number
) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function createPin(color: string) {
  return L.divIcon({
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
          fill="${color}"
          stroke="white"
          stroke-width="1.5"
        />
        <circle cx="12" cy="11" r="4" fill="white"/>
      </svg>
    `,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
  });
}

function popupContent(title: string, address: string) {
  const container = document.createElement("div");

  const heading = document.createElement("strong");
  heading.textContent = title;

  const paragraph = document.createElement("p");
  paragraph.textContent = address;
  paragraph.style.marginTop = "6px";

  container.append(heading, paragraph);

  return container;
}

async function searchPlaces(
  text: string,
  signal: AbortSignal,
  bounded: boolean
): Promise<SearchResult[]> {
  if (!TOKEN) {
    throw new Error(
      "Add VITE_LOCATIONIQ_TOKEN to your .env file."
    );
  }

  const params = new URLSearchParams({
    key: TOKEN,
    q: /iligan/i.test(text)
      ? text
      : `${text}, Iligan City, Philippines`,
    format: "json",
    countrycodes: "ph",
    viewbox: SEARCH_VIEWBOX,
    bounded: bounded ? "1" : "0",
    limit: "5",
    "accept-language": "en",
  });

  const response = await fetch(
    `${API_BASE}/search?${params}`,
    { signal }
  );

  if (response.status === 404) return [];

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Location lookup limit reached. Please try again later."
        : "Location lookup failed. Check your LocationIQ token."
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Unexpected location search response.");
  }

  return (data as SearchResult[]).filter((result) =>
    validCoordinates(Number(result.lat), Number(result.lon))
  );
}

export default function SiteMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectedMarkerRef = useRef<L.Marker | null>(null);
  const binsLayerRef = useRef<L.LayerGroup | null>(null);
  const addressMarkerRef = useRef<L.Marker | null>(null);

  const selectPointRef = useRef<
    (
      point: SelectedLocation,
      description?: string,
      lookup?: boolean
    ) => void
  >(() => {});

  const searchControllerRef =
    useRef<AbortController | null>(null);

  const reverseControllerRef =
    useRef<AbortController | null>(null);

  const reverseTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectionVersionRef = useRef(0);

  const [sites, setSites] = useState<DisposalSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [savedAddress, setSavedAddress] = useState("");
  const [addressPoint, setAddressPoint] =
    useState<AddressPoint | null>(null);

  const [addressMatches, setAddressMatches] =
    useState<SearchResult[]>([]);

  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");

  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);

  // Initialize the map.
  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    const map = L.map(containerRef.current, {
      center: SAN_MIGUEL,
      zoom: 16,
      minZoom: 12,
      maxZoom: 19,
      zoomControl: false,
    });

    mapRef.current = map;
    binsLayerRef.current = L.layerGroup().addTo(map);

    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(map);

    async function reverseGeocode(
      latitude: number,
      longitude: number,
      version: number
    ) {
      if (!TOKEN) {
        if (!disposed) {
          setAddressLoading(false);
          setError(
            "Address lookup needs a LocationIQ token. You can still confirm the coordinates."
          );
        }
        return;
      }

      const controller = new AbortController();
      reverseControllerRef.current = controller;

      try {
        const params = new URLSearchParams({
          key: TOKEN,
          lat: String(latitude),
          lon: String(longitude),
          format: "json",
          "accept-language": "en",
        });

        const response = await fetch(
          `${API_BASE}/reverse?${params}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(
            "Unable to find an address for this pin."
          );
        }

        const data = (await response.json()) as {
          display_name?: string;
        };

        if (
          disposed ||
          controller.signal.aborted ||
          version !== selectionVersionRef.current
        ) {
          return;
        }

        setSelectedLocation((current) =>
          current
            ? {
                ...current,
                address:
                  data.display_name || "Address unavailable",
              }
            : null
        );
      } catch (failure) {
        if (
          disposed ||
          controller.signal.aborted ||
          version !== selectionVersionRef.current
        ) {
          return;
        }

        setError(
          failure instanceof Error
            ? failure.message
            : "Address lookup failed."
        );
      } finally {
        if (
          !disposed &&
          version === selectionVersionRef.current
        ) {
          setAddressLoading(false);
        }
      }
    }

    function selectPoint(
      point: SelectedLocation,
      siteDescription = "",
      lookup = false
    ) {
      if (
        disposed ||
        !validCoordinates(point.latitude, point.longitude)
      ) {
        return;
      }

      const version = ++selectionVersionRef.current;

      reverseControllerRef.current?.abort();

      if (reverseTimerRef.current !== null) {
        clearTimeout(reverseTimerRef.current);
      }

      setError("");
      setResults([]);
      setSelectedLocation(point);
      setDescription(siteDescription);
      setAddressLoading(lookup);

      const coordinates: L.LatLngTuple = [
        point.latitude,
        point.longitude,
      ];

      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.setLatLng(coordinates);
      } else {
        const marker = L.marker(coordinates, {
          icon: createPin("#A61B1B"),
          draggable: true,
          autoPan: true,
          zIndexOffset: 1000,
          title: "Selected reporting location",
        }).addTo(map);

        marker.on("dragend", () => {
          const position = marker.getLatLng();

          selectPoint(
            {
              latitude: position.lat,
              longitude: position.lng,
              address: "Address unavailable",
            },
            "",
            true
          );
        });

        selectedMarkerRef.current = marker;
      }

      if (lookup) {
        reverseTimerRef.current = setTimeout(() => {
          void reverseGeocode(
            point.latitude,
            point.longitude,
            version
          );
        }, 700);
      }
    }

    selectPointRef.current = selectPoint;

    map.on("click", (event: L.LeafletMouseEvent) => {
      selectPoint(
        {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
          address: "Address unavailable",
        },
        "",
        true
      );
    });

    const observer = new ResizeObserver(() =>
      map.invalidateSize()
    );

    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      selectionVersionRef.current += 1;

      observer.disconnect();
      searchControllerRef.current?.abort();
      reverseControllerRef.current?.abort();

      if (reverseTimerRef.current !== null) {
        clearTimeout(reverseTimerRef.current);
      }

      selectPointRef.current = () => {};
      selectedMarkerRef.current = null;
      addressMarkerRef.current = null;
      binsLayerRef.current = null;
      mapRef.current = null;

      map.remove();
    };
  }, []);

  // Refresh when the account changes.
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

  // Load the user's address and active registered bins.
  useEffect(() => {
    let active = true;

    async function loadDatabase() {
      setSitesLoading(true);
      setDatabaseError("");
      setHomeError("");
      setSites([]);
      setSavedAddress("");
      setAddressPoint(null);
      setAddressMatches([]);

      setSelectedLocation(null);
      setDescription("");

      selectedMarkerRef.current?.remove();
      selectedMarkerRef.current = null;

      selectionVersionRef.current += 1;
      reverseControllerRef.current?.abort();
      setAddressLoading(false);

      if (reverseTimerRef.current !== null) {
        clearTimeout(reverseTimerRef.current);
      }

      try {
        const { data, error: authError } =
          await supabase.auth.getUser();

        if (!active) return;

        if (!data.user) {
          throw new Error(
            "Sign in to display registered bins and your address pin."
          );
        }

        if (authError) throw authError;

        const profileResult = await supabase
          .from("users")
          .select("address")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (!active) return;

        if (profileResult.error) {
          setHomeError(
            "Your address pin could not load."
          );
        } else {
          setSavedAddress(
            profileResult.data?.address?.trim() || ""
          );
        }

        const allSites: DisposalSite[] = [];
        const pageSize = 200;
        let offset = 0;

        while (active) {
          const { data: rows, error: sitesError } =
            await supabase
              .from("disposal_sites")
              .select(`
                site_id,
                site_name,
                location,
                description,
                latitude,
                longitude,
                qr_code,
                site_image
              `)
              .eq("is_active", true)
              .eq("is_registered", true)
              .order("site_id")
              .range(offset, offset + pageSize - 1);

          if (sitesError) throw sitesError;

          const page = (rows ?? []) as DisposalSite[];
          allSites.push(...page);

          if (page.length < pageSize) break;
          offset += pageSize;
        }

        if (!active) return;

        setSites(
          allSites.filter((site) =>
            validCoordinates(site.latitude, site.longitude)
          )
        );
      } catch (failure) {
        if (!active) return;

        setDatabaseError(
          failure instanceof Error
            ? failure.message
            : "Unable to load map data."
        );
      } finally {
        if (active) setSitesLoading(false);
      }
    }

    void loadDatabase();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  // Find coordinates for the saved address.
  useEffect(() => {
    if (!savedAddress) {
      setHomeLoading(false);
      return;
    }

    const controller = new AbortController();

    async function locateSavedAddress() {
      setHomeLoading(true);
      setHomeError("");
      setAddressPoint(null);
      setAddressMatches([]);

      try {
        const matches = await searchPlaces(
          savedAddress,
          controller.signal,
          false
        );

        if (controller.signal.aborted) return;

        if (matches.length === 0) {
          setHomeError(
            "Your address pin could not be located. Check the street address in your profile."
          );
          return;
        }

        if (matches.length === 1) {
          setAddressPoint({
            latitude: Number(matches[0].lat),
            longitude: Number(matches[0].lon),
          });
        } else {
          setAddressMatches(matches);
        }
      } catch (failure) {
        if (controller.signal.aborted) return;

        setHomeError(
          failure instanceof Error
            ? failure.message
            : "Unable to locate your address pin."
        );
      } finally {
        if (!controller.signal.aborted) {
          setHomeLoading(false);
        }
      }
    }

    void locateSavedAddress();

    return () => controller.abort();
  }, [savedAddress, refreshKey]);

  // Green registered-bin pins.
  useEffect(() => {
    const layer = binsLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    for (const site of sites) {
      const marker = L.marker(
        [site.latitude, site.longitude],
        {
          icon: createPin("#008753"),
          title: site.site_name,
          bubblingMouseEvents: false,
        }
      ).addTo(layer);

      marker.bindPopup(
        popupContent(site.site_name, site.location)
      );

      marker.on("click", () => {
        selectPointRef.current(
          {
            latitude: site.latitude,
            longitude: site.longitude,
            address: site.location,
            siteId: site.site_id,
            siteName: site.site_name,
            qrCode: site.qr_code,
            isRegistered: true,
          },
          site.description || ""
        );
      });
    }

    return () => {
      layer.clearLayers();
    };
  }, [sites]);

  // Blue address pin. Address text is shown only in its popup.
  useEffect(() => {
    addressMarkerRef.current?.remove();
    addressMarkerRef.current = null;

    const map = mapRef.current;
    if (!map || !addressPoint) return;

    const marker = L.marker(
      [addressPoint.latitude, addressPoint.longitude],
      {
        icon: createPin("#2563eb"),
        title: "Saved address — approximate location",
        bubblingMouseEvents: false,
      }
    )
      .addTo(map)
      .bindPopup(
        popupContent(
          "Your saved address — approximate location",
          savedAddress
        )
      );

    addressMarkerRef.current = marker;

    return () => {
      marker.remove();

      if (addressMarkerRef.current === marker) {
        addressMarkerRef.current = null;
      }
    };
  }, [addressPoint, savedAddress]);

  async function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!query.trim()) return;

    searchControllerRef.current?.abort();

    const controller = new AbortController();
    searchControllerRef.current = controller;

    setSearching(true);
    setError("");
    setResults([]);

    try {
      const matches = await searchPlaces(
        query.trim(),
        controller.signal,
        true
      );

      if (controller.signal.aborted) return;

      setResults(matches);

      if (!matches.length) {
        setError("No nearby match found.");
      }
    } catch (failure) {
      if (controller.signal.aborted) return;

      setError(
        failure instanceof Error
          ? failure.message
          : "Search failed."
      );
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }

  function showAddress() {
    if (!addressPoint) return;

    mapRef.current?.setView(
      [addressPoint.latitude, addressPoint.longitude],
      17
    );

    addressMarkerRef.current?.openPopup();
  }

  function showBins() {
    if (!sites.length) return;

    const bounds = L.latLngBounds(
      sites.map(
        (site): L.LatLngTuple => [
          site.latitude,
          site.longitude,
        ]
      )
    );

    mapRef.current?.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 17,
    });
  }

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-white">
      <TopBar title="Disposal Site Map" />

      <div className="mx-auto w-full max-w-6xl px-3 pb-6 sm:px-6 lg:px-8">
        {/* Search */}
        <form
          onSubmit={handleSearch}
          className="mt-3 flex items-center gap-2 rounded-xl border bg-white p-2"
        >
          <Search
            size={18}
            className="shrink-0 text-neutral-500"
          />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search streets or places"
            aria-label="Search streets or places"
            className="min-w-0 flex-1 text-sm outline-none"
          />

          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="min-h-11 rounded-lg bg-[#A61B1B] px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {/* Only shown when the address has multiple matches. */}
        {addressMatches.length > 0 && (
          <section className="mt-3 rounded-xl border border-blue-200 p-3">
            <p className="text-xs font-semibold">
              Choose the location for your blue address pin:
            </p>

            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {addressMatches.map((match, index) => (
                <button
                  key={`${match.place_id}-${index}`}
                  type="button"
                  onClick={() => {
                    const point = {
                      latitude: Number(match.lat),
                      longitude: Number(match.lon),
                    };

                    setAddressPoint(point);
                    setAddressMatches([]);

                    mapRef.current?.setView(
                      [point.latitude, point.longitude],
                      17
                    );
                  }}
                  className="w-full rounded-lg border p-3 text-left text-xs hover:bg-blue-50"
                >
                  {match.display_name}
                </button>
              ))}
            </div>
          </section>
        )}

        {results.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border">
            {results.map((result, index) => (
              <li key={`${result.place_id}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    const point = {
                      latitude: Number(result.lat),
                      longitude: Number(result.lon),
                      address: result.display_name,
                    };

                    selectPointRef.current(point);

                    mapRef.current?.setView(
                      [point.latitude, point.longitude],
                      18
                    );
                  }}
                  className="w-full border-b p-3 text-left text-xs hover:bg-red-50"
                >
                  {result.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {databaseError && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700"
          >
            {databaseError}
          </p>
        )}

        {homeError && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"
          >
            {homeError}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700"
          >
            {error}
          </p>
        )}

        {/* Map toolbar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p
            role="status"
            className="text-xs text-neutral-600"
          >
            {sitesLoading
              ? "Loading registered bins..."
              : `${sites.length} active registered bin(s)`}

            {homeLoading && " · Finding address pin..."}
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={!sites.length}
              onClick={showBins}
              className="min-h-9 text-xs font-semibold text-green-700 disabled:opacity-40"
            >
              Show All Bins
            </button>

            <button
              type="button"
              disabled={sitesLoading}
              onClick={() =>
                setRefreshKey((value) => value + 1)
              }
              className="min-h-9 text-xs font-semibold text-red-700 disabled:opacity-40"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="relative isolate mt-2 overflow-hidden rounded-2xl border">
          <div
            ref={containerRef}
            aria-label="Map showing your address pin and registered disposal bins"
            className="h-[48dvh] min-h-[280px] w-full bg-neutral-100 sm:min-h-[360px]"
          />

          <div className="absolute right-3 top-3 z-[1000] overflow-hidden rounded-xl bg-white shadow">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => mapRef.current?.zoomIn()}
              className="grid h-11 w-11 place-items-center border-b hover:bg-neutral-100"
            >
              <Plus size={20} />
            </button>

            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => mapRef.current?.zoomOut()}
              className="grid h-11 w-11 place-items-center border-b hover:bg-neutral-100"
            >
              <Minus size={20} />
            </button>

            <button
              type="button"
              aria-label={
                addressPoint
                  ? "Show address pin"
                  : "Return to San Miguel"
              }
              onClick={() => {
                if (addressPoint) {
                  showAddress();
                } else {
                  mapRef.current?.setView(SAN_MIGUEL, 16);
                }
              }}
              className="grid h-11 w-11 place-items-center text-blue-700 hover:bg-neutral-100"
            >
              <LocateFixed size={20} />
            </button>
          </div>
        </div>

        {/* Pin legend */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1">
            <MapPin size={16} className="text-blue-600" />
            Address pin
          </span>

          <span className="flex items-center gap-1">
            <MapPin size={16} className="text-green-700" />
            Registered bin
          </span>

          <span className="flex items-center gap-1">
            <MapPin size={16} className="text-red-700" />
            Selected location
          </span>
        </div>

        {/* Selected reporting location */}
        <section className="mt-4 rounded-2xl border p-4 shadow-sm">
          <h1 className="text-sm font-bold sm:text-base">
            {selectedLocation?.siteName || "Selected Location"}
          </h1>

          <p
            aria-live="polite"
            className="mt-2 break-words text-sm text-neutral-600"
          >
            {addressLoading
              ? "Looking up address..."
              : selectedLocation?.address ||
                "Click a green bin pin or tap the map to select a reporting location."}
          </p>

          {selectedLocation && (
            <>
              <p className="mt-2 text-xs text-neutral-500">
                Latitude:{" "}
                {selectedLocation.latitude.toFixed(7)}
                <br />
                Longitude:{" "}
                {selectedLocation.longitude.toFixed(7)}
              </p>

              <p className="mt-2 text-xs font-semibold text-[#A61B1B]">
                {selectedLocation.siteId
                  ? `Registered · ${selectedLocation.qrCode ?? ""}`
                  : "Manually pinned location"}
              </p>
            </>
          )}

          <label
            htmlFor="site-description"
            className="mt-4 block text-sm font-medium"
          >
            Site description (optional)
          </label>

          <textarea
            id="site-description"
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            placeholder="Add a nearby landmark or description"
            className="mt-2 min-h-20 w-full rounded-xl border p-3 text-sm"
          />

          {selectedLocation && !addressLoading ? (
            <Link
              to="/resident/report-waste/site"
              state={{
                selectedLocation: {
                  ...selectedLocation,
                  description: description.trim(),
                },
              }}
              className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-red-300 bg-[#fff1e6] px-4 py-3 text-sm font-bold text-[#A61B1B]"
            >
              Confirm Location
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="mt-4 min-h-11 w-full rounded-xl bg-neutral-100 p-3 text-sm text-neutral-400"
            >
              {addressLoading
                ? "Looking up address..."
                : "Select a location first"}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}