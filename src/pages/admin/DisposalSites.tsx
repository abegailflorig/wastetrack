
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../../lib/supabase";

// ==========================================
// SUPABASE TYPES
// ==========================================

type Site = {
  site_id: string;
  site_name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  is_registered: boolean;
  is_active: boolean;
};

type SiteState =
  | "Registered"
  | "Pending review"
  | "Inactive";

const PAGE_SIZE = 500;

// Initial map center only. Actual map pins
// come from Supabase, not hardcoded positions.
const INITIAL_MAP_CENTER: L.LatLngExpression = [
  8.2421,
  124.245,
];

// ==========================================
// HELPERS
// ==========================================

function siteState(site: Site): SiteState {
  if (!site.is_registered) {
    return "Pending review";
  }

  if (!site.is_active) {
    return "Inactive";
  }

  return "Registered";
}

function hasValidCoordinates(site: Site): boolean {
  return (
    typeof site.latitude === "number" &&
    typeof site.longitude === "number" &&
    Number.isFinite(site.latitude) &&
    Number.isFinite(site.longitude) &&
    site.latitude >= -90 &&
    site.latitude <= 90 &&
    site.longitude >= -180 &&
    site.longitude <= 180
  );
}

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "AD";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}

// ==========================================
// LEAFLET MAP PIN
// ==========================================

function markerIcon(
  site: Site,
  index: number,
  selected: boolean
): L.DivIcon {
  const colorType = selected
    ? "selected"
    : !site.is_registered
      ? "pending"
      : !site.is_active
        ? "inactive"
        : "registered";

  return L.divIcon({
    className: `ds-marker ds-marker-${colorType}`,
    html: `
      <span class="ds-marker-pin">
        <span>${index + 1}</span>
      </span>
    `,
    iconSize: [34, 43],
    iconAnchor: [17, 43],
    popupAnchor: [0, -38],
  });
}

// ==========================================
// CSS
// ==========================================

const css = `
.ds-root,
.ds-root * {
  box-sizing: border-box;
}

.ds-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --olive: #a5b26b;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --ink: #1b1b1b;

  min-height: 100dvh;
  background: #fff;
  color: var(--ink);

  font-family:
    "Fira Sans", "Segoe UI",
    Roboto, Arial, sans-serif;
}

/* ================================= */
/* HEADER */
/* ================================= */

.ds-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px;
  flex-wrap: wrap;
}

.ds-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.ds-sub {
  margin: 2px 0 0;
  font-size: 13px;
  color: #666;
}

.ds-avatar {
  width: 38px;
  height: 30px;
  border-radius: 8px;
  background: #f8ced4;
  color: var(--red-bright);
  font-size: 16px;
  font-weight: 700;

  display: grid;
  place-items: center;

  border: 0;
  cursor: pointer;
  font-family: inherit;
}

.ds-avatar:hover {
  background: #f3b9c3;
}

.ds-avatar:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}

/* ================================= */
/* BODY */
/* ================================= */

.ds-body {
  padding: 16px 20px 24px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

/* ================================= */
/* LEAFLET MAP */
/* ================================= */

.ds-map-wrap {
  flex: 2 1 420px;
  min-width: 0;
}

.ds-map {
  position: relative;
  width: 100%;
  height: clamp(340px, 52vw, 600px);

  border: 1px solid var(--cream-line);
  border-radius: 6px;
  overflow: hidden;
  background: #ece9df;
  z-index: 0;
}

.ds-map-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;

  padding: 10px 2px 0;

  font-size: 11px;
  color: #666;
}

.ds-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ds-legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}

/* ================================= */
/* CUSTOM MAP MARKERS */
/* ================================= */

.ds-marker {
  border: none;
  background: transparent;
}

.ds-marker-pin {
  width: 29px;
  height: 29px;

  transform: rotate(-45deg);
  border-radius: 50% 50% 50% 0;

  background: var(--red-bright);

  display: grid;
  place-items: center;

  border: 2px solid #fff;

  box-shadow:
    0 2px 6px rgba(0, 0, 0, .3);
}

.ds-marker-pin span {
  transform: rotate(45deg);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
}

.ds-marker-pending .ds-marker-pin {
  background: #d99619;
}

.ds-marker-inactive .ds-marker-pin {
  background: #777;
}

.ds-marker-selected .ds-marker-pin {
  background: #2f9e44;
}

/* ================================= */
/* SITE PANEL */
/* ================================= */

.ds-panel {
  flex: 1 1 260px;
  min-width: 235px;

  max-height: 610px;
  overflow-y: auto;

  background: var(--cream);
  border-radius: 6px;
  padding: 14px 16px 18px;
}

.ds-panel-title {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  color: #555;
}

.ds-list {
  list-style: none;
  margin: 0 0 18px;
  padding: 0;

  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ds-site-btn {
  width: 100%;
  padding: 8px 6px;

  display: flex;
  gap: 9px;
  align-items: flex-start;

  border: 1px solid transparent;
  border-radius: 7px;

  background: transparent;
  color: var(--ink);

  text-align: left;
  font: inherit;
  cursor: pointer;
}

.ds-site-btn:hover {
  background: rgba(168, 27, 30, .06);
}

.ds-site-btn.selected {
  background: #fff;
  border-color: var(--red);
}

.ds-site-btn:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}

.ds-pin-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--red-bright);
  margin-top: 2px;
}

.ds-site-content {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.ds-site-name {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.ds-site-location {
  font-size: 11px;
  color: #666;
}

.ds-site-state {
  font-size: 10px;
  font-weight: 700;
}

.ds-site-state.pending {
  color: #9c6400;
}

.ds-site-state.inactive {
  color: #777;
}

.ds-site-state.registered {
  color: #39702c;
}

/* ================================= */
/* REGISTER BUTTON */
/* ================================= */

.ds-register {
  width: 100%;
  background: var(--red);
  color: #fff;
  border: 0;
  cursor: pointer;

  font: inherit;
  font-size: 13.5px;
  font-weight: 700;

  padding: 11px 16px;
  border-radius: 6px;
}

.ds-register:hover {
  background: #8f1619;
}

.ds-register:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

/* ================================= */
/* MESSAGES */
/* ================================= */

.ds-alert {
  padding: 10px 12px;
  margin: 0 20px 12px;

  border: 1px solid #d8a4a4;
  border-radius: 6px;

  background: #fff3f3;
  color: #8f1619;
  font-size: 12px;
}

.ds-retry {
  display: inline-block;
  padding: 6px 10px;
  margin-top: 6px;

  background: #fff;
  border: 1px solid var(--red);
  color: var(--red);
  border-radius: 4px;
  cursor: pointer;
}

.ds-empty {
  color: #666;
  font-size: 12px;
  line-height: 1.6;
}

/* ================================= */
/* RESPONSIVE */
/* ================================= */

@media (max-width: 850px) {
  .ds-body {
    flex-direction: column;
  }

  .ds-map-wrap,
  .ds-panel {
    flex: none;
    width: 100%;
    min-width: 0;
  }

  .ds-map {
    height: 410px;
  }

  .ds-panel {
    max-height: none;
  }
}

@media (max-width: 640px) {
  .ds-head {
    padding: 14px;
  }

  .ds-body {
    padding: 14px;
  }

  .ds-map {
    height: 350px;
  }
}
`;

// ==========================================
// PIN ICON
// ==========================================

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="ds-pin-icon"
      aria-hidden="true"
    >
      <path
        d="M12 2C7.6 2 4 5.6 4 10c0 5.4
           6.7 11.2 7 11.5.3.3.7.3 1 0
           .3-.3 7-6.1 7-11.5 0-4.4-3.6-8-8-8
           zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
      />
    </svg>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function DisposalSites() {
  const navigate = useNavigate();

  const [sites, setSites] =
    useState<Site[]>([]);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [adminName, setAdminName] =
    useState("Administrator");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  // LEAFLET REFERENCES
  const mapElementRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<L.Map | null>(null);

  const layerRef =
    useRef<L.LayerGroup | null>(null);

  const markersRef = useRef<
    Map<string, {
      marker: L.Marker;
      index: number;
    }>
  >(new Map());

  const requestRef = useRef(0);

  // ========================================
  // LOAD SUPABASE DISPOSAL SITES
  // ========================================

  const loadSites = useCallback(
    async (showLoading = false) => {
      const request = ++requestRef.current;

      if (showLoading) {
        setLoading(true);
      }

      setError("");

      try {
        // AUTHENTICATION
        const {
          data: auth,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!auth.user) {
          throw new Error(
            "Please sign in to view disposal sites."
          );
        }

        // ADMIN PROFILE
        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("users")
          .select("full_name,role,is_active")
          .eq("user_id", auth.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (
          !profile ||
          String(profile.role).toLowerCase() !==
            "admin" ||
          profile.is_active === false
        ) {
          throw new Error(
            "An active administrator account is required."
          );
        }

        // LOAD ALL DISPOSAL SITES
        const results: Site[] = [];
        let offset = 0;

        while (true) {
          const {
            data,
            error: siteError,
          } = await supabase
            .from("disposal_sites")
            .select(`
              site_id,
              site_name,
              location,
              latitude,
              longitude,
              is_registered,
              is_active
            `)
            .order("site_name", {
              ascending: true,
            })
            .order("site_id", {
              ascending: true,
            })
            .range(
              offset,
              offset + PAGE_SIZE - 1
            );

          if (siteError) {
            throw siteError;
          }

          const rows =
            (data ?? []) as Site[];

          results.push(...rows);

          if (rows.length < PAGE_SIZE) {
            break;
          }

          offset += PAGE_SIZE;
        }

        if (
          request !== requestRef.current
        ) {
          return;
        }

        // UPDATE DATA
        setSites(results);

        setSelectedId((previous) =>
          previous &&
          results.some(
            (site) =>
              site.site_id === previous
          )
            ? previous
            : null
        );

        setAdminName(
          profile.full_name?.trim() ||
            "Administrator"
        );
      } catch (cause) {
        if (
          request !== requestRef.current
        ) {
          return;
        }

        console.error(
          "[WasteTrack] DisposalSites:",
          cause
        );

        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load disposal sites."
        );
      } finally {
        if (
          request === requestRef.current
        ) {
          setLoading(false);
        }
      }
    },
    []
  );

  // ========================================
  // INITIALIZE LEAFLET MAP
  // ========================================

  useEffect(() => {
    if (
      !mapElementRef.current ||
      mapRef.current
    ) {
      return;
    }

    const map = L.map(
      mapElementRef.current,
      { zoomControl: true }
    ).setView(
      INITIAL_MAP_CENTER,
      14
    );

    // OPENSTREETMAP BASEMAP
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    ).addTo(map);

    mapRef.current = map;

    layerRef.current =
      L.layerGroup().addTo(map);

    const frame =
      window.requestAnimationFrame(
        () => map.invalidateSize()
      );

    return () => {
      window.cancelAnimationFrame(frame);

      markersRef.current.clear();

      layerRef.current = null;

      map.remove();

      mapRef.current = null;
    };
  }, []);

  // ========================================
  // DISPLAY REAL MAP PINS
  // ========================================

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;

    if (!map || !layer) {
      return;
    }

    // REMOVE PREVIOUS PINS
    layer.clearLayers();
    markersRef.current.clear();

    const points:
      L.LatLngExpression[] = [];

    sites.forEach((site, index) => {
      if (!hasValidCoordinates(site)) {
        return;
      }

      const coordinate:
        L.LatLngExpression = [
          site.latitude!,
          site.longitude!,
        ];

      points.push(coordinate);

      // ADD PIN USING SUPABASE COORDINATES
      const marker = L.marker(
        coordinate,
        {
          icon: markerIcon(
            site,
            index,
            selectedId === site.site_id
          ),
        }
      ).addTo(layer);

      // SAFE POPUP CONTENT
      const popup =
        document.createElement("div");

      const title =
        document.createElement("strong");

      title.textContent =
        site.site_name;

      const address =
        document.createElement("div");

      address.textContent =
        site.location ||
        "Location not specified";

      const state =
        document.createElement("div");

      state.textContent =
        siteState(site);

      popup.append(
        title,
        address,
        state
      );

      marker.bindPopup(popup);

      // SELECT SITE WHEN PIN IS CLICKED
      marker.on("click", () => {
        setSelectedId(site.site_id);
      });

      markersRef.current.set(
        site.site_id,
        {
          marker,
          index,
        }
      );
    });

    map.invalidateSize();

    // FIT MAP TO REAL SITE LOCATIONS
    if (points.length === 1) {
      map.setView(points[0], 16);
    } else if (points.length > 1) {
      map.fitBounds(
        L.latLngBounds(points),
        {
          padding: [32, 32],
          maxZoom: 16,
        }
      );
    }

    // Marker positions are rebuilt only
    // when Supabase site records change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites]);

  // ========================================
  // HIGHLIGHT SELECTED MAP PIN
  // ========================================

  useEffect(() => {
    markersRef.current.forEach(
      ({ marker, index }, id) => {
        const site = sites.find(
          (item) =>
            item.site_id === id
        );

        if (site) {
          marker.setIcon(
            markerIcon(
              site,
              index,
              selectedId === id
            )
          );
        }
      }
    );

    if (selectedId) {
      const selectedMarker =
        markersRef.current.get(
          selectedId
        )?.marker;

      selectedMarker?.openPopup();
    }
  }, [
    selectedId,
    sites,
  ]);

  // ========================================
  // REFRESH AND SUPABASE REALTIME
  // ========================================

  useEffect(() => {
    void loadSites(true);

    // REFRESH EVERY 60 SECONDS
    const interval = window.setInterval(
      () => void loadSites(),
      60000
    );

    // REFRESH ON BROWSER FOCUS
    const onFocus = () => {
      void loadSites();
    };

    window.addEventListener(
      "focus",
      onFocus
    );

    // REALTIME SITE CHANGES
    let debounce:
      ReturnType<typeof setTimeout> | null =
      null;

    const channel = supabase
      .channel(
        "wastetrack-admin-disposal-sites"
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "disposal_sites",
        },
        () => {
          if (debounce) {
            clearTimeout(debounce);
          }

          debounce = setTimeout(
            () => void loadSites(),
            400
          );
        }
      )
      .subscribe();

    return () => {
      ++requestRef.current;

      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        onFocus
      );

      if (debounce) {
        clearTimeout(debounce);
      }

      void supabase.removeChannel(
        channel
      );
    };
  }, [loadSites]);

  // ========================================
  // ACTUAL SUPABASE COUNTS
  // ========================================

  const registeredCount = useMemo(
    () =>
      sites.filter(
        (site) =>
          site.is_registered
      ).length,
    [sites]
  );

  const pendingCount = useMemo(
    () =>
      sites.filter(
        (site) =>
          !site.is_registered
      ).length,
    [sites]
  );

  const mappedCount = useMemo(
    () =>
      sites.filter(
        hasValidCoordinates
      ).length,
    [sites]
  );

  // ========================================
  // SELECT SITE FROM THE LIST
  // ========================================

  function selectSite(site: Site) {
    setSelectedId(
      site.site_id
    );

    if (
      !hasValidCoordinates(site) ||
      !mapRef.current
    ) {
      return;
    }

    const center:
      L.LatLngExpression = [
        site.latitude!,
        site.longitude!,
      ];

    // FOCUS ON SELECTED SITE
    mapRef.current.flyTo(
      center,
      Math.max(
        mapRef.current.getZoom(),
        16
      ),
      {
        duration: 0.65,
      }
    );
  }

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="ds-root">
      <style>{css}</style>

      {/* HEADER */}
      <header className="ds-head">
        <div>
          <h1 className="ds-title">
            Disposal sites
          </h1>

          <p className="ds-sub">
            {loading &&
            sites.length === 0
              ? "Loading disposal sites..."
              : `${registeredCount} registered · ${pendingCount} pending review`}
          </p>
        </div>

        {/* ADMIN AVATAR */}
        <button
          type="button"
          className="ds-avatar"
          aria-label="Manage account"
          title={adminName}
          onClick={() =>
            navigate("/admin/account")
          }
        >
          {getInitials(adminName)}
        </button>
      </header>

      {/* ERROR MESSAGE */}
      {error && (
        <div
          className="ds-alert"
          role="alert"
        >
          {error}

          <div>
            <button
              type="button"
              className="ds-retry"
              onClick={() =>
                void loadSites(true)
              }
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* MAIN BODY */}
      <div className="ds-body">

        {/* ================================= */}
        {/* LIVE MAP */}
        {/* ================================= */}

        <div className="ds-map-wrap">
          <div
            className="ds-map"
            ref={mapElementRef}
            aria-label="Map of disposal sites"
          />

          {mappedCount === 0 &&
            !loading &&
            !error && (
              <p className="ds-empty">
                No disposal sites with valid
                latitude and longitude are
                available to display on the map.
              </p>
            )}

          {/* MAP LEGEND */}
          <div
            className="ds-map-legend"
            aria-label="Map pin colors"
          >
            <span className="ds-legend-item">
              <span
                className="ds-legend-dot"
                style={{
                  background: "#d0102b",
                }}
              />
              Registered
            </span>

            <span className="ds-legend-item">
              <span
                className="ds-legend-dot"
                style={{
                  background: "#d99619",
                }}
              />
              Pending review
            </span>

            <span className="ds-legend-item">
              <span
                className="ds-legend-dot"
                style={{
                  background: "#777",
                }}
              />
              Inactive
            </span>

            <span className="ds-legend-item">
              <span
                className="ds-legend-dot"
                style={{
                  background: "#2f9e44",
                }}
              />
              Selected
            </span>
          </div>
        </div>

        {/* ================================= */}
        {/* SUPABASE SITE LIST */}
        {/* ================================= */}

        <aside className="ds-panel">
          <h2 className="ds-panel-title">
            DISPOSAL SITES
          </h2>

          <ul className="ds-list">
            {sites.map((site) => {
              const status =
                siteState(site);

              return (
                <li key={site.site_id}>
                  <button
                    type="button"
                    className={`ds-site-btn${
                      selectedId === site.site_id
                        ? " selected"
                        : ""
                    }`}
                    aria-pressed={
                      selectedId === site.site_id
                    }
                    onClick={() =>
                      selectSite(site)
                    }
                  >
                    <PinIcon />

                    <span className="ds-site-content">
                      <span className="ds-site-name">
                        {site.site_name}
                      </span>

                      <span className="ds-site-location">
                        {site.location ||
                          "Location not specified"}

                        {!hasValidCoordinates(site)
                          ? " · No map coordinates"
                          : ""}
                      </span>

                      <span
                        className={`ds-site-state ${
                          status === "Pending review"
                            ? "pending"
                            : status.toLowerCase()
                        }`}
                      >
                        {status}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* LOADING STATE */}
          {loading &&
            sites.length === 0 && (
              <p
                className="ds-empty"
                role="status"
              >
                Loading sites from Supabase...
              </p>
            )}

          {/* EMPTY STATE */}
          {!loading &&
            sites.length === 0 &&
            !error && (
              <p className="ds-empty">
                No disposal sites found in
                Supabase.
              </p>
            )}

          {/* REGISTER SITE */}
          <button
            type="button"
            className="ds-register"
            onClick={() =>
              navigate(
                "/admin/disposal-sites/register"
              )
            }
          >
            + Register Site
          </button>
        </aside>
      </div>
    </div>
  );
}
