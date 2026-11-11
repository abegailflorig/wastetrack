
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  MapPin,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

// =========================================
// TYPES
// =========================================

type CollectorStatus = "Active" | "On leave" | "Not set";

interface Collector {
  userId: string;
  name: string;
  street: string;
  sites: number | null;
  status: CollectorStatus;
}

interface UserRow {
  user_id: string;
  full_name: string | null;
  collector_status: string | null;
}

interface SiteRow {
  site_id: string;
  site_name: string;
  location: string | null;
  assigned_collector: string | null;
}

interface UnassignedSite {
  id: string;
  name: string;
  location: string;
}

// =========================================
// NORMALIZE COLLECTOR STATUS
// =========================================

function normalizeStatus(
  status: string | null
): CollectorStatus {
  if (status?.trim().toLowerCase() === "active") {
    return "Active";
  }

  if (status?.trim().toLowerCase() === "on leave") {
    return "On leave";
  }

  return "Not set";
}

// =========================================
// MAIN COMPONENT
// =========================================

export default function ManageCollectors() {
  const navigate = useNavigate();

  // Collector records
  const [collectors, setCollectors] = useState<Collector[]>([]);

  // Unassigned disposal sites
  const [unassignedSites, setUnassignedSites] =
    useState<UnassignedSite[]>([]);

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [siteError, setSiteError] = useState("");

  const [siteDataAvailable, setSiteDataAvailable] =
    useState(false);

  // =========================================
  // FETCH DATA FROM SUPABASE
  // =========================================

  useEffect(() => {
    let mounted = true;

    async function fetchCollectors() {
      try {
        setLoading(true);
        setError("");
        setSiteError("");
        setSiteDataAvailable(false);

        // =====================================
        // 1. FETCH COLLECTORS FROM USERS TABLE
        // =====================================

        const {
          data: usersData,
          error: usersError,
        } = await supabase
          .from("users")
          .select(
            "user_id, full_name, collector_status"
          )
          .eq("role", "collector")
          .order("full_name", {
            ascending: true,
          });

        if (usersError) {
          throw usersError;
        }

        const users = (usersData ?? []) as UserRow[];

        // Prepare collector records
        const collectorRecords: Collector[] = users.map(
          (user) => ({
            userId: user.user_id,
            name:
              user.full_name?.trim() ||
              "Unnamed collector",
            street: "Not available",
            sites: null,
            status: normalizeStatus(
              user.collector_status
            ),
          })
        );

        if (!mounted) return;

        setCollectors(collectorRecords);

        // =====================================
        // 2. FETCH DISPOSAL SITES
        // =====================================

        // assigned_collector references users.user_id

        const {
          data: sitesData,
          error: sitesError,
        } = await supabase
          .from("disposal_sites")
          .select(
            "site_id, site_name, location, assigned_collector"
          )
          .order("site_name", {
            ascending: true,
          });

        if (sitesError) {
          if (mounted) {
            setSiteError(sitesError.message);
          }
          return;
        }

        const sites = (sitesData ?? []) as SiteRow[];

        // =====================================
        // 3. MATCH COLLECTORS TO ASSIGNED SITES
        // =====================================

        const collectorsWithSites: Collector[] =
          collectorRecords.map((collector) => {
            const assignedSites = sites.filter(
              (site) =>
                site.assigned_collector ===
                collector.userId
            );

            // Get unique assigned streets
            const assignedStreets = Array.from(
              new Set(
                assignedSites.map(
                  (site) =>
                    site.location?.trim() ||
                    site.site_name
                )
              )
            );

            return {
              ...collector,

              street:
                assignedStreets.length > 0
                  ? assignedStreets.join(", ")
                  : "Not assigned",

              sites: assignedSites.length,
            };
          });

        // =====================================
        // 4. GET UNASSIGNED DISPOSAL SITES
        // =====================================

        // A NULL assigned_collector means
        // the site has no assigned collector.

        const unassigned: UnassignedSite[] = sites
          .filter(
            (site) =>
              site.assigned_collector === null
          )
          .map((site) => ({
            id: site.site_id,
            name: site.site_name,
            location: site.location || "",
          }));

        if (!mounted) return;

        setCollectors(collectorsWithSites);
        setUnassignedSites(unassigned);
        setSiteDataAvailable(true);
      } catch (err) {
        console.error(
          "Error loading collectors:",
          err
        );

        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load collector records."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchCollectors();

    return () => {
      mounted = false;
    };
  }, []);

  // =========================================
  // DYNAMIC COUNTS
  // =========================================

  const activeCount = collectors.filter(
    (collector) =>
      collector.status === "Active"
  ).length;

  const leaveCount = collectors.filter(
    (collector) =>
      collector.status === "On leave"
  ).length;

  const unsetCount = collectors.filter(
    (collector) =>
      collector.status === "Not set"
  ).length;

  // =========================================
  // NAVIGATION
  // =========================================

  const handleAdd = () => {
    navigate("/admin/collectors/new");
  };

  const handleManage = (
    collector: Collector
  ) => {
    navigate(
      `/admin/collectors/${collector.userId}`
    );
  };

  // =========================================
  // USER INTERFACE
  // =========================================

  return (
    <main
      className="
        min-h-[100dvh] w-full min-w-0
        bg-white text-[#1b1b1b]
        font-['Fira_Sans',Arial,sans-serif]
      "
    >
      {/* ================================= */}
      {/* HEADER */}
      {/* ================================= */}

      <header
        className="
          flex flex-wrap items-center
          justify-between gap-3
          border-b-[7px] border-[#A5B879]
          px-4 py-4
          sm:px-6 lg:px-8
        "
      >
        <div>
          <h1
            className="
              text-[23px] font-bold
              leading-tight sm:text-[27px]
            "
          >
            Collectors
          </h1>

          <p className="mt-1 text-[13px] text-[#666]">
            {loading
              ? "Loading collectors..."
              : `${activeCount} active · ${leaveCount} on leave`}

            {!loading && unsetCount > 0
              ? ` · ${unsetCount} without status`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* ADD COLLECTOR ACCOUNT */}

          <button
            type="button"
            onClick={handleAdd}
            className="
              rounded-lg bg-[#B80000]
              px-3 py-2.5
              text-xs font-bold text-white
              transition duration-200
              hover:bg-[#940000]
              focus-visible:outline-2
              focus-visible:outline-offset-2
              focus-visible:outline-red-700
              sm:px-4 sm:text-sm
            "
          >
            + Add collector account
          </button>
        </div>
      </header>

      {/* ================================= */}
      {/* MAIN CONTENT */}
      {/* ================================= */}

      <div
        className="
          w-full px-3 py-5
          sm:px-5 lg:px-7
        "
      >
        <section
          className="
            min-h-[480px] w-full
            rounded-[18px] bg-[#F7F0E4]
            px-3 py-6
            sm:px-5
            lg:min-h-[570px]
          "
        >
          {/* ERROR MESSAGE */}

          {error && (
            <div
              role="alert"
              className="
                mb-4 rounded-lg
                border border-red-200
                bg-red-50 p-3
                text-sm text-red-700
              "
            >
              {error}
            </div>
          )}

          {/* LOADING STATE */}

          {loading ? (
            <div
              className="
                flex min-h-48 items-center
                justify-center gap-3
              "
            >
              <LoaderCircle
                size={25}
                className="animate-spin text-[#A5B879]"
              />

              <p className="text-sm text-gray-600">
                Loading collectors from Supabase...
              </p>
            </div>
          ) : !error ? (
            <>
              {/* ================================= */}
              {/* COLLECTORS TABLE */}
              {/* ================================= */}

              <div className="w-full overflow-x-auto">
                <table
                  className="
                    w-full min-w-[640px]
                    border-collapse text-left
                    text-xs sm:text-[13px]
                  "
                >
                  <thead>
                    <tr
                      className="
                        border-b border-[#C9C5BC]
                        text-[#555]
                      "
                    >
                      <th className="px-3 py-3 font-medium">
                        Name
                      </th>

                      <th className="px-3 py-3 font-medium">
                        Assigned Street
                      </th>

                      <th className="px-3 py-3 font-medium">
                        Sites
                      </th>

                      <th className="px-3 py-3 font-medium">
                        Status
                      </th>

                      <th className="px-3 py-3 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {/* COLLECTORS FROM SUPABASE */}

                    {collectors.map((collector) => (
                      <tr
                        key={collector.userId}
                        className="
                          border-b border-[#C9C5BC]
                          transition-colors
                          hover:bg-white/40
                        "
                      >
                        {/* NAME */}

                        <td className="px-3 py-4 font-bold">
                          {collector.name}
                        </td>

                        {/* ASSIGNED STREET */}

                        <td className="max-w-[300px] px-3 py-4">
                          {collector.street}
                        </td>

                        {/* SITE COUNT */}

                        <td className="px-3 py-4">
                          {collector.sites ?? "—"}
                        </td>

                        {/* STATUS */}

                        <td className="px-3 py-4">
                          <span
                            className={`
                              inline-flex min-w-[70px]
                              items-center justify-center
                              rounded-full px-3 py-1
                              text-[11px] leading-none
                              ${
                                collector.status === "Active"
                                  ? "bg-[#A5B879] text-white"
                                  : collector.status === "On leave"
                                    ? "bg-[#FFBF4B] text-white"
                                    : "bg-gray-200 text-gray-700"
                              }
                            `}
                          >
                            {collector.status}
                          </span>
                        </td>

                        {/* MANAGE BUTTON */}

                        <td className="px-3 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              handleManage(collector)
                            }
                            className="
                              font-bold text-[#D00016]
                              hover:underline
                              focus-visible:outline-2
                              focus-visible:outline-red-600
                            "
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* NO COLLECTORS */}

                    {collectors.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="
                            py-8 text-center
                            text-gray-500
                          "
                        >
                          No collector accounts found.
                        </td>
                      </tr>
                    )}

                    {/* BLANK ROWS LIKE REFERENCE */}

                    <tr
                      className="
                        h-12 border-b
                        border-[#C9C5BC]
                      "
                    >
                      <td colSpan={5} />
                    </tr>

                    <tr
                      className="
                        h-12 border-b
                        border-[#C9C5BC]
                      "
                    >
                      <td colSpan={5} />
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ================================= */}
              {/* REDESIGNED UNASSIGNED SITES */}
              {/* ================================= */}

              <section
                className="
                  mt-7 w-full overflow-hidden
                  rounded-2xl
                  border border-[#E4D9C9]
                  bg-white
                  shadow-[0_3px_12px_rgba(0,0,0,0.06)]
                "
              >
                {/* SECTION HEADER */}

                <div
                  className="
                    flex flex-wrap items-center
                    justify-between gap-3
                    border-b border-[#EEE5D9]
                    px-4 py-4
                    sm:px-6 sm:py-5
                  "
                >
                  <div
                    className="
                      flex min-w-0 items-center gap-3
                    "
                  >
                    {/* LOCATION ICON */}

                    <div
                      className="
                        flex h-11 w-11 shrink-0
                        items-center justify-center
                        rounded-xl bg-[#FBE9E7]
                      "
                    >
                      <MapPin
                        size={22}
                        strokeWidth={2}
                        className="text-[#B80000]"
                      />
                    </div>

                    {/* HEADER TEXT */}

                    <div className="min-w-0">
                      <h2
                        className="
                          text-[15px] font-bold
                          text-[#303030]
                          sm:text-[17px]
                        "
                      >
                        Unassigned Sites
                      </h2>

                      <p
                        className="
                          mt-0.5 text-[11px]
                          text-[#858585]
                          sm:text-xs
                        "
                      >
                        Disposal locations that need collectors
                      </p>
                    </div>
                  </div>

                  {/* DYNAMIC SITE COUNT */}

                  {siteDataAvailable && (
                    <span
                      className="
                        inline-flex items-center
                        gap-1.5 rounded-full
                        bg-[#FFF0E6]
                        px-3 py-1.5
                        text-[11px] font-bold
                        text-[#B80000]
                      "
                    >
                      <span
                        className="
                          h-2 w-2 rounded-full
                          bg-[#D0102B]
                        "
                      />

                      {unassignedSites.length}{" "}
                      {unassignedSites.length === 1
                        ? "site"
                        : "sites"}
                    </span>
                  )}
                </div>

                {/* UNASSIGNED SITES CONTENT */}

                <div className="p-3 sm:p-5">
                  {siteDataAvailable ? (
                    unassignedSites.length > 0 ? (
                      /* RESPONSIVE SITE CARDS */

                      <div
                        className="
                          grid grid-cols-1 gap-3
                          md:grid-cols-2
                          xl:grid-cols-3
                        "
                      >
                        {unassignedSites.map(
                          (site, index) => (
                            <div
                              key={site.id}
                              className="
                                group flex min-w-0
                                flex-col justify-between
                                gap-4 rounded-xl
                                border border-[#E9E0D5]
                                bg-[#FBF7F0] p-4
                                transition-all duration-200
                                hover:-translate-y-0.5
                                hover:border-[#CBA8A5]
                                hover:shadow-md
                              "
                            >
                              {/* SITE DETAILS */}

                              <div
                                className="
                                  flex min-w-0
                                  items-start gap-3
                                "
                              >
                                {/* SITE NUMBER */}

                                <div
                                  className="
                                    flex h-9 w-9 shrink-0
                                    items-center justify-center
                                    rounded-lg bg-white
                                    text-xs font-bold
                                    text-[#B80000]
                                    shadow-sm
                                  "
                                >
                                  {String(index + 1).padStart(
                                    2,
                                    "0"
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  {/* SITE NAME */}

                                  <h3
                                    className="
                                      break-words
                                      text-[13px] font-bold
                                      leading-snug
                                      text-[#242424]
                                      sm:text-sm
                                    "
                                  >
                                    {site.name}
                                  </h3>

                                  {/* SITE LOCATION */}

                                  <div
                                    className="
                                      mt-2 flex
                                      items-start gap-1.5
                                    "
                                  >
                                    <MapPin
                                      size={13}
                                      className="
                                        mt-0.5 shrink-0
                                        text-[#888]
                                      "
                                    />

                                    <p
                                      className="
                                        break-words
                                        text-[11px]
                                        leading-relaxed
                                        text-[#777]
                                      "
                                    >
                                      {site.location ||
                                        "Location unavailable"}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* SITE STATUS */}

                              <div
                                className="
                                  flex flex-wrap
                                  items-center
                                  justify-between gap-2
                                  border-t
                                  border-[#E9DED1]
                                  pt-3
                                "
                              >
                                <div
                                  className="
                                    flex items-center gap-2
                                  "
                                >
                                  <span
                                    className="
                                      h-2 w-2 rounded-full
                                      bg-[#D0102B]
                                    "
                                  />

                                  <span
                                    className="
                                      text-[11px]
                                      font-medium
                                      text-[#B80000]
                                    "
                                  >
                                    Needs collector
                                  </span>
                                </div>

                                <span
                                  className="
                                    rounded-md
                                    bg-[#FCE7E7]
                                    px-2.5 py-1
                                    text-[10px]
                                    font-semibold
                                    text-[#B80000]
                                  "
                                >
                                  Unassigned
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      /* ALL SITES ASSIGNED */

                      <div
                        className="
                          flex flex-col
                          items-center justify-center
                          rounded-xl bg-[#F5F8EF]
                          px-4 py-9 text-center
                        "
                      >
                        <div
                          className="
                            mb-3 flex h-12 w-12
                            items-center justify-center
                            rounded-full
                            bg-[#E4EDD6]
                          "
                        >
                          <CheckCircle2
                            size={26}
                            className="text-[#78964E]"
                          />
                        </div>

                        <h3
                          className="
                            text-sm font-bold
                            text-[#475D33]
                          "
                        >
                          All sites are assigned!
                        </h3>

                        <p
                          className="
                            mt-1 max-w-xs
                            text-xs leading-relaxed
                            text-[#7B8870]
                          "
                        >
                          Every disposal site currently
                          has an assigned collector.
                        </p>
                      </div>
                    )
                  ) : (
                    /* SITE LOADING OR ERROR */

                    <div
                      className="
                        flex min-h-[120px]
                        flex-col items-center
                        justify-center gap-2
                        rounded-xl
                        bg-[#FBF7F0]
                        px-4 py-6 text-center
                      "
                    >
                      {siteError ? (
                        <>
                          <AlertCircle
                            size={23}
                            className="text-[#B80000]"
                          />

                          <p
                            className="
                              text-xs text-[#B80000]
                            "
                          >
                            Could not load disposal sites:
                            {" "}
                            {siteError}
                          </p>
                        </>
                      ) : (
                        <>
                          <LoaderCircle
                            size={25}
                            className="
                              animate-spin
                              text-[#A5B879]
                            "
                          />

                          <p
                            className="
                              text-xs text-[#777]
                            "
                          >
                            Loading unassigned sites...
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* END UNASSIGNED SITES */}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
