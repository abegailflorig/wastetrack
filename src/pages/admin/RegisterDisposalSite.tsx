
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router";

import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import { supabase } from "../../lib/supabase";

// ==========================================
// TYPES
// ==========================================

type SiteStatus =
  | "Active"
  | "Pending review"
  | "Inactive";

type DisposalSite = {
  site_id: string;
  site_name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  is_registered: boolean;
  is_active: boolean;
};

type LocationIQResult = {
  place_id?: string | number;
  lat: string;
  lon: string;
  display_name: string;
  display_place?: string;
  display_address?: string;
};

type SelectedLocation = {
  input: string;
  displayName: string;
  latitude: number;
  longitude: number;
};

type DatabaseError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

// ==========================================
// CONSTANTS
// ==========================================

const STATUS_OPTIONS: SiteStatus[] = [
  "Active",
  "Pending review",
  "Inactive",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Use your existing LocationIQ token.
const LOCATIONIQ_TOKEN =
  import.meta.env.VITE_LOCATIONIQ_TOKEN as
    | string
    | undefined;

// Default map center: Iligan City.
// This is only the initial map view.
const INITIAL_CENTER: L.LatLngExpression = [
  8.2421,
  124.245,
];

// Preferred search area around Iligan City.
const LOCATION_VIEWBOX =
  "124.16,8.16,124.33,8.34";

const SEARCH_DELAY = 550;
const AUTO_MATCH_THRESHOLD = 0.75;

// ==========================================
// GENERAL HELPERS
// ==========================================

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "AD";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}

function statusFromSite(
  site: DisposalSite
): SiteStatus {
  if (!site.is_registered) {
    return "Pending review";
  }

  return site.is_active
    ? "Active"
    : "Inactive";
}

function statusToFlags(status: SiteStatus) {
  return {
    is_registered:
      status !== "Pending review",

    is_active:
      status === "Active",
  };
}

function validCoordinates(
  latitude: number,
  longitude: number
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

// ==========================================
// SUPABASE ERROR HANDLING
// ==========================================

function getDatabaseErrorMessage(
  cause: unknown
): string {
  console.error(
    "[WasteTrack] Full Supabase error:",
    cause
  );

  if (
    typeof cause !== "object" ||
    cause === null
  ) {
    return typeof cause === "string"
      ? cause
      : "Unable to save disposal site.";
  }

  const error = cause as DatabaseError;

  const messages: string[] = [];

  if (error.message) {
    messages.push(error.message);
  }

  if (error.code) {
    messages.push(
      `Error code: ${error.code}`
    );
  }

  if (error.details) {
    messages.push(
      `Details: ${error.details}`
    );
  }

  if (error.hint) {
    messages.push(
      `Hint: ${error.hint}`
    );
  }

  switch (error.code) {
    case "42501":
      messages.push(
        "Possible permission or Row Level Security (RLS) issue. Check the disposal_sites policies for the authenticated administrator."
      );
      break;

    case "23502":
      messages.push(
        "A required database column has no value. Check NOT NULL columns in disposal_sites."
      );
      break;

    case "23503":
      messages.push(
        "A foreign key reference is invalid. Check created_by and related records."
      );
      break;

    case "23505":
      messages.push(
        "A duplicate value violates a unique constraint."
      );
      break;

    case "42703":
    case "PGRST204":
      messages.push(
        "A database column may be missing or not available in the API schema."
      );
      break;

    default:
      break;
  }

  return (
    messages.join("\n") ||
    "Unable to save disposal site. Check the browser console for details."
  );
}

// ==========================================
// LOCATION HELPERS
// ==========================================

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/\bave\b/g, "avenue")
    .replace(/\brd\b/g, "road")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validPlace(
  place: LocationIQResult
): boolean {
  return (
    validCoordinates(
      Number(place.lat),
      Number(place.lon)
    ) &&
    typeof place.display_name === "string" &&
    place.display_name.trim().length > 0
  );
}

function uniquePlaces(
  places: LocationIQResult[]
): LocationIQResult[] {
  const seen = new Set<string>();

  return places.filter((place) => {
    if (!validPlace(place)) {
      return false;
    }

    const key =
      `${place.lat}:${place.lon}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

// ==========================================
// LOCATION RELEVANCE
// ==========================================

function relevanceScore(
  query: string,
  place: LocationIQResult
): number {
  const ignored = new Set([
    "iligan",
    "city",
    "lanao",
    "norte",
    "philippines",
    "province",
    "del",
    "the",
    "and",
    "children",
  ]);

  const queryTerms = normalizeText(query)
    .split(" ")
    .filter(
      (term) =>
        term.length > 1 &&
        !ignored.has(term)
    );

  if (queryTerms.length === 0) {
    return 0;
  }

  const mainName = normalizeText(
    place.display_place ||
      place.display_name.split(",")[0]
  );

  const placeTerms = mainName.split(" ");

  const categories = [
    "park",
    "avenue",
    "road",
    "street",
    "school",
    "hospital",
    "church",
  ];

  const categoryMismatch = categories.some(
    (category) =>
      queryTerms.includes(category) &&
      !placeTerms.includes(category)
  );

  if (categoryMismatch) {
    return 0;
  }

  const matches = queryTerms.filter(
    (term) => placeTerms.includes(term)
  ).length;

  const similarity =
    matches / queryTerms.length;

  const cityBonus =
    /iligan/i.test(place.display_name)
      ? 0.15
      : 0;

  return similarity + cityBonus;
}

// ==========================================
// LOCATIONIQ REQUEST
// ==========================================

async function locationIQRequest(
  endpoint: "autocomplete" | "search",
  query: string,
  signal: AbortSignal
): Promise<LocationIQResult[]> {
  if (!LOCATIONIQ_TOKEN?.trim()) {
    throw new Error(
      "LocationIQ token is missing. Add VITE_LOCATIONIQ_TOKEN to your .env file."
    );
  }

  const url = new URL(
    endpoint === "autocomplete"
      ? "https://api.locationiq.com/v1/autocomplete"
      : "https://us1.locationiq.com/v1/search"
  );

  url.searchParams.set(
    "key",
    LOCATIONIQ_TOKEN
  );

  url.searchParams.set(
    "q",
    query.slice(0, 200)
  );

  url.searchParams.set(
    "limit",
    "6"
  );

  url.searchParams.set(
    "countrycodes",
    "ph"
  );

  url.searchParams.set(
    "viewbox",
    LOCATION_VIEWBOX
  );

  if (endpoint === "search") {
    url.searchParams.set(
      "format",
      "json"
    );
  }

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      signal,
    }
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        "LocationIQ token is invalid or the domain is not authorized."
      );
    }

    if (response.status === 429) {
      throw new Error(
        "LocationIQ request limit reached. Please try again later."
      );
    }

    throw new Error(
      `LocationIQ search failed (HTTP ${response.status}).`
    );
  }

  const data: unknown =
    await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return uniquePlaces(
    data as LocationIQResult[]
  );
}

// ==========================================
// SEARCH PLACE AUTOMATICALLY
// ==========================================

async function findPlaces(
  input: string,
  signal: AbortSignal
): Promise<LocationIQResult[]> {
  const query = input.trim();

  if (!query) {
    return [];
  }

  const initial =
    await locationIQRequest(
      "autocomplete",
      query,
      signal
    );

  let combined = [...initial];

  const hasGoodMatch = initial.some(
    (place) =>
      relevanceScore(query, place) >=
      AUTO_MATCH_THRESHOLD
  );

  if (!hasGoodMatch) {
    const contextualQuery =
      /iligan/i.test(query)
        ? query
        : `${query}, Iligan City, Lanao del Norte, Philippines`;

    const additional =
      await locationIQRequest(
        "search",
        contextualQuery,
        signal
      );

    combined = uniquePlaces([
      ...additional,
      ...combined,
    ]);
  }

  // Alternative names:
  // Children's Park -> Park

  const stillNoMatch = !combined.some(
    (place) =>
      relevanceScore(query, place) >=
      AUTO_MATCH_THRESHOLD
  );

  if (
    stillNoMatch &&
    /children['’]?s/i.test(query)
  ) {
    const simplifiedQuery = query
      .replace(/children['’]?s/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const additional =
      await locationIQRequest(
        "search",
        `${simplifiedQuery}, Iligan City, Lanao del Norte, Philippines`,
        signal
      );

    combined = uniquePlaces([
      ...additional,
      ...combined,
    ]);
  }

  return combined
    .sort(
      (a, b) =>
        relevanceScore(query, b) -
        relevanceScore(query, a)
    )
    .slice(0, 6);
}

function asSelectedLocation(
  place: LocationIQResult,
  input: string
): SelectedLocation {
  return {
    input,
    displayName: place.display_name,
    latitude: Number(place.lat),
    longitude: Number(place.lon),
  };
}

// ==========================================
// MAP PIN ICON
// ==========================================

function getPinIcon(status: SiteStatus) {
  const className =
    status === "Active"
      ? "rd-pin-active"
      : status === "Pending review"
      ? "rd-pin-pending"
      : "rd-pin-inactive";

  return L.divIcon({
    className:
      `rd-map-marker ${className}`,

    html: `
      <span class="rd-marker-shape">
        <span class="rd-marker-center"></span>
      </span>
    `,

    iconSize: [32, 42],
    iconAnchor: [16, 42],
  });
}

// ==========================================
// CSS
// ==========================================

const css = `
.rd-root,
.rd-root * {
  box-sizing: border-box;
}

.rd-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --olive: #a5b26b;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --ink: #1b1b1b;

  min-height: 100dvh;
  width: 100%;
  background: #fff;
  color: var(--ink);

  font-family:
    "Fira Sans",
    "Segoe UI",
    Roboto,
    Arial,
    sans-serif;
}

/* HEADER */

.rd-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px;
  flex-wrap: wrap;
}

.rd-back {
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
  color: var(--red-bright);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
}

.rd-back:hover {
  text-decoration: underline;
}

.rd-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.rd-sub {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: #666;
  line-height: 1.5;
}

.rd-avatar {
  width: 38px;
  height: 34px;
  border-radius: 8px;
  background: #f8ced4;
  color: var(--red-bright);
  font-size: 16px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}

/* MAIN LAYOUT */

.rd-body {
  padding: 18px 20px 28px;
  display: grid;
  grid-template-columns:
    minmax(0, 1.1fr)
    minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

/* FORM PANEL */

.rd-panel {
  min-width: 0;
  background: var(--cream);
  border-radius: 8px;
  padding: 16px 18px 20px;
}

.rd-panel-title {
  margin: 0 0 14px;
  font-size: 12.5px;
  font-weight: 700;
  color: #555;
}

/* FORM FIELDS */

.rd-field {
  margin-bottom: 14px;
  min-width: 0;
}

.rd-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #444;
  margin-bottom: 5px;
}

.rd-field input,
.rd-field select {
  width: 100%;
  min-width: 0;
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 5px;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  padding: 10px 11px;
}

.rd-field input::placeholder {
  color: #a9a08f;
}

.rd-field input:focus-visible,
.rd-field select:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 1px;
}

.rd-field input:disabled,
.rd-field select:disabled {
  opacity: .65;
  cursor: not-allowed;
}

.rd-help {
  margin: 7px 0 0;
  color: #777;
  font-size: 11px;
  line-height: 1.6;
}

/* ADDRESS SEARCH */

.rd-searching {
  margin: 10px 0 0;
  color: #535d1e;
  font-size: 12px;
}

.rd-location-error {
  margin: 10px 0 0;
  color: var(--red);
  font-size: 12px;
  line-height: 1.5;
}

.rd-location-results {
  margin-top: 10px;
  max-height: 235px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 6px;
}

.rd-results-heading {
  margin: 0;
  padding: 10px 11px;
  font-weight: 700;
  font-size: 11px;
  color: #6f6659;
  background: #f8f6f1;
}

.rd-location-option {
  border: 0;
  border-top: 1px solid #ebe5da;
  background: #fff;
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 4px;
  width: 100%;
  cursor: pointer;
  font-family: inherit;
}

.rd-location-option:hover {
  background: #f7f0e4;
}

.rd-option-title {
  font-size: 12px;
  font-weight: 700;
  color: #1b1b1b;
}

.rd-option-address {
  font-size: 11px;
  color: #6e665d;
  line-height: 1.45;
}

.rd-pin-found {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: #e8f4e5;
  border: 1px solid #accb9b;
  border-radius: 6px;
  padding: 12px;
  margin-top: 12px;
  font-size: 12px;
  color: #275e2a;
}

.rd-pin-found span {
  overflow-wrap: anywhere;
  color: #344a2d;
}

.rd-pin-found small {
  font-size: 11px;
}

/* BUTTONS */

.rd-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.rd-cancel {
  background: #fff;
  border: 1.5px solid var(--red-bright);
  color: var(--red-bright);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
}

.rd-save {
  background: var(--red);
  color: #fff;
  border: 0;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 10px 20px;
  border-radius: 6px;
}

.rd-save:hover:not(:disabled) {
  background: #8f1619;
}

.rd-save:disabled {
  background: #c98f8f;
  cursor: not-allowed;
}

/* ERROR MESSAGE */

.rd-error {
  margin: 14px 0 0;
  padding: 12px;
  font-size: 12px;
  color: #a81b1e;
  background: #fff0f0;
  border: 1px solid #e1aaaa;
  border-radius: 6px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  line-height: 1.7;
}

.rd-confirm {
  margin: 14px 0 0;
  padding: 12px;
  font-size: 12px;
  font-weight: 600;
  color: #2f6b2f;
  background: #e7f3e3;
  border: 1px solid #a6c69a;
  border-radius: 6px;
  line-height: 1.5;
}

.rd-view-sites {
  margin-top: 10px;
  padding: 7px 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  color: var(--red-bright);
  cursor: pointer;
}

/* MAP */

.rd-map-container {
  min-width: 0;
  width: 100%;
}

.rd-map {
  width: 100%;
  height: clamp(350px, 45vw, 580px);
  border-radius: 8px;
  overflow: hidden;
  background: #e9e7e0;
  position: relative;
  border: 1px solid var(--cream-line);
  z-index: 0;
}

.rd-map-note {
  margin-top: 9px;
  font-size: 11px;
  color: #666;
  line-height: 1.6;
}

/* MAP PIN */

.rd-map-marker {
  background: transparent;
  border: 0;
}

.rd-marker-shape {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  border: 2px solid white;
  background: var(--red-bright);
  box-shadow: 0 2px 6px rgba(0,0,0,.3);
}

.rd-marker-center {
  width: 8px;
  height: 8px;
  background: #fff;
  border-radius: 50%;
}

.rd-pin-pending .rd-marker-shape {
  background: #d99619;
}

.rd-pin-inactive .rd-marker-shape {
  background: #777;
}

.rd-pin-active .rd-marker-shape {
  background: var(--red-bright);
}

/* RESPONSIVE */

@media (max-width: 850px) {
  .rd-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .rd-map {
    height: 400px;
  }
}

@media (max-width: 640px) {
  .rd-head {
    padding: 14px;
  }

  .rd-body {
    padding: 14px;
  }

  .rd-panel {
    padding: 14px;
  }

  .rd-map {
    height: 350px;
  }
}

@media (max-width: 380px) {
  .rd-actions {
    flex-direction: column;
  }

  .rd-actions button {
    width: 100%;
  }
}
`;

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function RegisterDisposalSite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const editingId =
    searchParams.get("siteId");

  const [createdId, setCreatedId] =
    useState<string | null>(null);

  const [adminId, setAdminId] =
    useState<string | null>(null);

  const [adminName, setAdminName] =
    useState("Administrator");

  const [siteName, setSiteName] =
    useState("");

  const [pinLocation, setPinLocation] =
    useState("");

  const [selectedPlace, setSelectedPlace] =
    useState<SelectedLocation | null>(null);

  const [placeMatches, setPlaceMatches] =
    useState<LocationIQResult[]>([]);

  const [searchingPlace, setSearchingPlace] =
    useState(false);

  const [placeError, setPlaceError] =
    useState("");

  const [status, setStatus] =
    useState<SiteStatus>("Active");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [saved, setSaved] =
    useState(false);

  const [error, setError] =
    useState("");

  const [savedMessage, setSavedMessage] =
    useState("");

  // ========================================
  // MAP REFERENCES
  // ========================================

  const mapElementRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<L.Map | null>(null);

  const markerRef =
    useRef<L.Marker | null>(null);

  // ========================================
  // FORM VALIDATION
  // ========================================

  const canSave =
    !loading &&
    !saving &&
    !saved &&
    !searchingPlace &&
    Boolean(adminId) &&
    siteName.trim().length > 0 &&
    pinLocation.trim().length > 0 &&
    selectedPlace !== null &&
    selectedPlace.input === pinLocation &&
    validCoordinates(
      selectedPlace.latitude,
      selectedPlace.longitude
    );

  function fieldChanged() {
    setSaved(false);
    setSavedMessage("");
    setError("");
  }

  // ========================================
  // AUTHENTICATE ADMIN
  // ========================================

  useEffect(() => {
    let active = true;

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        // Get authenticated Supabase user.
        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        const user = authData.user;

        if (!user) {
          throw new Error(
            "Please sign in as an administrator."
          );
        }

        // Verify admin role.
        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("users")
          .select("full_name,role,is_active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (
          !profile ||
          String(profile.role).toLowerCase() !==
            "admin" ||
          profile.is_active === false
        ) {
          throw new Error(
            "Only an active administrator can register disposal sites."
          );
        }

        if (!active) return;

        setAdminId(user.id);

        setAdminName(
          profile.full_name?.trim() ||
            "Administrator"
        );

        // Load existing site if editing.
        if (editingId) {
          if (!UUID_RE.test(editingId)) {
            throw new Error(
              "Invalid disposal site ID."
            );
          }

          const {
            data: site,
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
            .eq("site_id", editingId)
            .maybeSingle();

          if (siteError) {
            throw siteError;
          }

          if (!site) {
            throw new Error(
              "Disposal site not found."
            );
          }

          if (!active) return;

          const record =
            site as DisposalSite;

          setSiteName(
            record.site_name || ""
          );

          setPinLocation(
            record.location || ""
          );

          if (
            record.latitude !== null &&
            record.longitude !== null &&
            validCoordinates(
              record.latitude,
              record.longitude
            )
          ) {
            setSelectedPlace({
              input: record.location || "",
              displayName:
                record.location ||
                "Existing site location",
              latitude: record.latitude,
              longitude: record.longitude,
            });
          }

          setStatus(
            statusFromSite(record)
          );
        }
      } catch (cause) {
        if (active) {
          setError(
            getDatabaseErrorMessage(cause)
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [editingId]);

  // ========================================
  // AUTOMATIC LOCATION SEARCH
  // ========================================

  useEffect(() => {
    if (
      loading ||
      !pinLocation.trim() ||
      selectedPlace?.input === pinLocation
    ) {
      setSearchingPlace(false);
      return;
    }

    if (pinLocation.trim().length < 3) {
      setPlaceMatches([]);
      setSearchingPlace(false);

      setPlaceError(
        "Type at least 3 characters to search."
      );

      return;
    }

    const controller =
      new AbortController();

    let active = true;

    setSearchingPlace(true);
    setPlaceError("");

    const query = pinLocation.trim();

    const timer = window.setTimeout(
      async () => {
        try {
          const results =
            await findPlaces(
              query,
              controller.signal
            );

          if (!active) return;

          setPlaceMatches(results);

          if (results.length === 0) {
            setSelectedPlace(null);

            setPlaceError(
              "No matching place found. Try entering a more complete address."
            );

            return;
          }

          const best = results[0];

          const score = relevanceScore(
            query,
            best
          );

          if (
            score >= AUTO_MATCH_THRESHOLD
          ) {
            setSelectedPlace(
              asSelectedLocation(
                best,
                pinLocation
              )
            );

            setPlaceError("");
          } else {
            setSelectedPlace(null);

            setPlaceError(
              "No confident automatic match. Select the correct location from the suggestions."
            );
          }
        } catch (cause) {
          if (
            !active ||
            controller.signal.aborted
          ) {
            return;
          }

          setSelectedPlace(null);
          setPlaceMatches([]);

          setPlaceError(
            cause instanceof Error
              ? cause.message
              : "Unable to search location."
          );
        } finally {
          if (active) {
            setSearchingPlace(false);
          }
        }
      },
      SEARCH_DELAY
    );

    return () => {
      active = false;

      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    loading,
    pinLocation,
    selectedPlace,
  ]);

  // ========================================
  // SELECT LOCATION SUGGESTION
  // ========================================

  function choosePlace(
    place: LocationIQResult
  ) {
    const address =
      place.display_name.slice(0, 255);

    setPinLocation(address);

    setSelectedPlace(
      asSelectedLocation(
        place,
        address
      )
    );

    setPlaceMatches([]);
    setPlaceError("");
    setSearchingPlace(false);

    fieldChanged();
  }

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
      {
        zoomControl: true,
      }
    ).setView(
      INITIAL_CENTER,
      15
    );

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(map);

    mapRef.current = map;

    // Map is for preview only.
    // No manual coordinate entry.
    // No manual pin placement on click.

    const frame =
      window.requestAnimationFrame(
        () => map.invalidateSize()
      );

    return () => {
      window.cancelAnimationFrame(frame);

      if (markerRef.current) {
        map.removeLayer(
          markerRef.current
        );

        markerRef.current = null;
      }

      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ========================================
  // AUTOMATIC MAP PIN
  // ========================================

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    if (!selectedPlace) {
      if (markerRef.current) {
        map.removeLayer(
          markerRef.current
        );

        markerRef.current = null;
      }

      return;
    }

    const point: L.LatLngExpression = [
      selectedPlace.latitude,
      selectedPlace.longitude,
    ];

    if (!markerRef.current) {
      markerRef.current = L.marker(
        point,
        {
          icon: getPinIcon(status),
          interactive: false,
        }
      ).addTo(map);
    } else {
      markerRef.current.setLatLng(
        point
      );

      markerRef.current.setIcon(
        getPinIcon(status)
      );
    }

    map.setView(
      point,
      17,
      {
        animate: true,
      }
    );
  }, [selectedPlace, status]);

  // ========================================
  // SAVE DISPOSAL SITE TO SUPABASE
  // ========================================

  async function handleSave() {
    setError("");
    setSavedMessage("");

    // Validate site name.
    if (!siteName.trim()) {
      setError(
        "Site name is required."
      );

      return;
    }

    // Validate address.
    if (!pinLocation.trim()) {
      setError(
        "Please enter a place name or complete address."
      );

      return;
    }

    // Validate resolved location.
    if (!selectedPlace) {
      setError(
        "Location not found. Please select a valid place from the suggestions."
      );

      return;
    }

    if (
      selectedPlace.input !== pinLocation
    ) {
      setError(
        "Address changed. Please wait for the new location search."
      );

      return;
    }

    if (
      !validCoordinates(
        selectedPlace.latitude,
        selectedPlace.longitude
      )
    ) {
      setError(
        "Invalid coordinates received from LocationIQ."
      );

      return;
    }

    if (!adminId) {
      setError(
        "Administrator session is unavailable. Please sign in again."
      );

      return;
    }

    if (saving || saved) return;

    setSaving(true);

    try {
      // Confirm the Supabase session.
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (
        !authData.user ||
        authData.user.id !== adminId
      ) {
        throw new Error(
          "Your administrator session has expired or changed. Please sign in again."
        );
      }

      const flags =
        statusToFlags(status);

      // Coordinates are automatically
      // obtained from LocationIQ.
      const values = {
        site_name:
          siteName.trim(),

        location:
          pinLocation.trim(),

        latitude:
          selectedPlace.latitude,

        longitude:
          selectedPlace.longitude,

        is_registered:
          flags.is_registered,

        is_active:
          flags.is_active,
      };

      console.log(
        "[WasteTrack] Saving disposal site:",
        values
      );

      const recordId =
        editingId || createdId;

      if (recordId) {
        // ==================================
        // UPDATE EXISTING SITE
        // ==================================

        const {
          data,
          error: updateError,
        } = await supabase
          .from("disposal_sites")
          .update(values)
          .eq(
            "site_id",
            recordId
          )
          .select("site_id")
          .single();

        if (updateError) {
          console.error(
            "[WasteTrack] Supabase UPDATE error:",
            updateError
          );

          throw updateError;
        }

        if (!data) {
          throw new Error(
            "Supabase did not return the updated site. Check UPDATE and SELECT permissions."
          );
        }

        console.log(
          "[WasteTrack] Site updated:",
          data
        );

        setSavedMessage(
          "Disposal site updated successfully in Supabase."
        );
      } else {
        // ==================================
        // REGISTER NEW SITE
        // ==================================

        const newSiteId =
          crypto.randomUUID();

        const qrCode =
          "QR-" +
          crypto
            .randomUUID()
            .replace(/-/g, "")
            .slice(0, 12)
            .toUpperCase();

        const payload = {
          site_id:
            newSiteId,

          ...values,

          created_by:
            adminId,

          qr_code:
            qrCode,
        };

        console.log(
          "[WasteTrack] Inserting site:",
          payload
        );

        const {
          data,
          error: insertError,
        } = await supabase
          .from("disposal_sites")
          .insert(payload)
          .select("site_id")
          .single();

        if (insertError) {
          console.error(
            "[WasteTrack] Supabase INSERT error:",
            insertError
          );

          throw insertError;
        }

        if (!data) {
          throw new Error(
            "Supabase did not return the inserted site. Check INSERT and SELECT permissions."
          );
        }

        console.log(
          "[WasteTrack] Site registered:",
          data
        );

        // Prevent duplicate insertion
        // if admin edits the saved site.
        setCreatedId(
          data.site_id
        );

        setSavedMessage(
          "New disposal site registered successfully in Supabase."
        );
      }

      setSaved(true);
    } catch (cause: unknown) {
      const message =
        getDatabaseErrorMessage(cause);

      setError(message);

      console.error(
        "[WasteTrack] Save failed:",
        message
      );
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="rd-root">
      <style>{css}</style>

      {/* ================================= */}
      {/* HEADER */}
      {/* ================================= */}

      <header className="rd-head">
        <div>
          <button
            type="button"
            className="rd-back"
            onClick={() =>
              navigate(
                "/admin/disposal-sites"
              )
            }
          >
            ← Back to Disposal sites
          </button>

          <h1 className="rd-title">
            {editingId
              ? "Edit disposal site"
              : "Register new disposal site"}
          </h1>

          <p className="rd-sub">
            Add a site so residents can pin
            and report to it
          </p>
        </div>

        <button
          type="button"
          className="rd-avatar"
          aria-label="Manage account"
          title={adminName}
          onClick={() =>
            navigate("/admin/account")
          }
        >
          {getInitials(adminName)}
        </button>
      </header>

      <div className="rd-body">

        {/* ================================= */}
        {/* LEFT COLUMN - FORM */}
        {/* ================================= */}

        <section className="rd-panel">
          <h2 className="rd-panel-title">
            ADD/EDIT DISPOSAL SITE
          </h2>

          {loading && (
            <p
              className="rd-help"
              role="status"
              style={{
                marginBottom: 12,
              }}
            >
              Loading administrator details...
            </p>
          )}

          {/* SITE NAME */}

          <div className="rd-field">
            <label htmlFor="rd-name">
              Site name
            </label>

            <input
              id="rd-name"
              type="text"
              maxLength={150}
              placeholder="Miguel Sheker Park Bin 1"
              value={siteName}
              disabled={loading || saving}
              onChange={(event) => {
                setSiteName(
                  event.target.value
                );

                fieldChanged();
              }}
            />
          </div>

          {/* ================================= */}
          {/* LOCATION SEARCH */}
          {/* ================================= */}

          <div className="rd-field">
            <label htmlFor="rd-pin">
              Place name or full address
            </label>

            <input
              id="rd-pin"
              type="text"
              autoComplete="off"
              maxLength={255}
              placeholder="Miguel Sheker Children's Park, Iligan City"
              value={pinLocation}
              disabled={loading || saving}
              onChange={(event) => {
                setPinLocation(
                  event.target.value
                );

                setSelectedPlace(null);
                setPlaceMatches([]);
                setPlaceError("");

                fieldChanged();
              }}
            />

            <p className="rd-help">
              Enter a place name or full
              address. WasteTrack will
              automatically search and pin
              the location on the map.
              Check the map before saving.
            </p>

            {/* SEARCHING */}

            {searchingPlace && (
              <p
                className="rd-searching"
                role="status"
              >
                Searching location...
              </p>
            )}

            {/* SEARCH ERROR */}

            {!searchingPlace &&
              placeError && (
                <p
                  className="rd-location-error"
                  role="status"
                >
                  {placeError}
                </p>
              )}

            {/* LOCATION SUGGESTIONS */}

            {placeMatches.length > 0 &&
              !searchingPlace && (
                <div
                  className="rd-location-results"
                  aria-label="Matching places"
                >
                  <p className="rd-results-heading">
                    Suggested locations
                  </p>

                  {placeMatches.map(
                    (place, index) => (
                      <button
                        key={`${
                          place.place_id ??
                          index
                        }-${place.lat}-${place.lon}`}
                        type="button"
                        className="rd-location-option"
                        disabled={saving}
                        onClick={() =>
                          choosePlace(place)
                        }
                      >
                        <span className="rd-option-title">
                          {place.display_place ||
                            place.display_name.split(
                              ","
                            )[0]}
                        </span>

                        <span className="rd-option-address">
                          {place.display_name}
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}

            {/* LOCATION FOUND */}

            {selectedPlace &&
              !searchingPlace && (
                <div
                  className="rd-pin-found"
                  role="status"
                >
                  <strong>
                    ✓ Map pin found
                  </strong>

                  <span>
                    {selectedPlace.displayName}
                  </span>

                  <small>
                    Coordinates have been
                    determined automatically.
                    Verify that the pin matches
                    your intended disposal site.
                  </small>
                </div>
              )}
          </div>

          {/* ================================= */}
          {/* STATUS */}
          {/* ================================= */}

          <div className="rd-field">
            <label htmlFor="rd-status">
              Status
            </label>

            <select
              id="rd-status"
              value={status}
              disabled={loading || saving}
              onChange={(event) => {
                setStatus(
                  event.target.value as SiteStatus
                );

                fieldChanged();
              }}
            >
              {STATUS_OPTIONS.map(
                (option) => (
                  <option
                    key={option}
                    value={option}
                  >
                    {option}
                  </option>
                )
              )}
            </select>
          </div>

          {/* ================================= */}
          {/* ACTIONS */}
          {/* ================================= */}

          <div className="rd-actions">
            <button
              type="button"
              className="rd-cancel"
              disabled={saving}
              onClick={() =>
                navigate(
                  "/admin/disposal-sites"
                )
              }
            >
              Cancel
            </button>

            <button
              type="button"
              className="rd-save"
              disabled={!canSave}
              onClick={() =>
                void handleSave()
              }
            >
              {saving
                ? "Saving..."
                : saved
                ? "Saved"
                : editingId || createdId
                ? "Update disposal site"
                : "Save disposal site"}
            </button>
          </div>

          {/* ================================= */}
          {/* SUPABASE ERROR MESSAGE */}
          {/* ================================= */}

          {error && (
            <p
              className="rd-error"
              role="alert"
            >
              {error}
            </p>
          )}

          {/* ================================= */}
          {/* SUCCESS MESSAGE */}
          {/* ================================= */}

          {saved && (
            <>
              <p
                className="rd-confirm"
                role="status"
              >
                {savedMessage}
              </p>

              <button
                type="button"
                className="rd-view-sites"
                onClick={() =>
                  navigate(
                    "/admin/disposal-sites"
                  )
                }
              >
                View disposal sites
              </button>
            </>
          )}
        </section>

        {/* ================================= */}
        {/* RIGHT COLUMN - MAP */}
        {/* ================================= */}

        <div className="rd-map-container">
          <div
            ref={mapElementRef}
            className="rd-map"
            aria-label="Map showing the automatically located disposal site"
          />

          <p className="rd-map-note">
            The map automatically displays
            the location returned by
            LocationIQ. Coordinates are
            saved directly to Supabase
            when the admin registers the
            disposal site.
          </p>
        </div>
      </div>
    </div>
  );
}
