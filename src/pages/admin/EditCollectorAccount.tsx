
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { useNavigate, useParams } from "react-router";

import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Trash2,
  KeyRound,
  UserRound,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

interface CollectorRow {
  user_id: string;
  full_name: string;
  email: string;
  contact_info: string | null;
  is_active: boolean;
  collector_status: string | null;
}

interface SiteRow {
  site_id: string;
  site_name: string;
  location: string;
  assigned_collector: string | null;
}

interface ProfileSnapshot {
  fullName: string;
  contact: string;
  active: boolean;
}

// ========================================
// GENERATE INITIALS FROM FULL NAME
// ========================================

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "?";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words[0].charAt(0) +
    words[words.length - 1].charAt(0)
  ).toUpperCase();
}

// ========================================
// COMPONENT
// ========================================

export default function EditCollectorAccount() {
  const navigate = useNavigate();

  const { collectorId } = useParams<{
    collectorId: string;
  }>();

  // COLLECTOR INFORMATION
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [active, setActive] = useState(true);

  // ORIGINAL SAVED PROFILE
  const [savedProfile, setSavedProfile] =
    useState<ProfileSnapshot | null>(null);

  // DISPOSAL SITES
  const [sites, setSites] = useState<SiteRow[]>([]);

  const [selectedSites, setSelectedSites] =
    useState<string[]>([]);

  // LOADING STATES
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] =
    useState(false);

  const [resettingPassword, setResettingPassword] =
    useState(false);

  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ========================================
  // COLLECTOR NAME FROM SUPABASE
  // ========================================

  // Display the saved name from public.users.
  // Once a profile edit is saved, the displayed
  // name and initials are updated.

  const collectorDisplayName =
    savedProfile?.fullName || fullName || "Collector";

  const collectorInitials = getInitials(
    collectorDisplayName
  );

  // ========================================
  // LOAD COLLECTOR ACCOUNT
  // ========================================

  useEffect(() => {
    let mounted = true;

    async function loadCollector() {
      if (!collectorId) {
        if (mounted) {
          setLoading(false);
          setNotFound(true);
        }
        return;
      }

      try {
        setLoading(true);
        setLoadError("");
        setNotFound(false);
        setError("");

        // ====================================
        // 1. FETCH USERS TABLE
        // ====================================

        const {
          data: collectorData,
          error: collectorError,
        } = await supabase
          .from("users")
          .select(
            "user_id, full_name, email, contact_info, is_active, collector_status"
          )
          .eq("user_id", collectorId)
          .eq("role", "collector")
          .maybeSingle();

        if (collectorError) {
          throw new Error(
            `Unable to load collector: ${collectorError.message}`
          );
        }

        if (!collectorData) {
          if (mounted) setNotFound(true);
          return;
        }

        const collector =
          collectorData as CollectorRow;

        // ====================================
        // 2. FETCH DISPOSAL SITES
        // ====================================

        const {
          data: siteData,
          error: siteError,
        } = await supabase
          .from("disposal_sites")
          .select(
            "site_id, site_name, location, assigned_collector"
          )
          .order("site_name");

        if (siteError) {
          throw new Error(
            `Unable to load disposal sites: ${siteError.message}`
          );
        }

        const siteRows =
          (siteData ?? []) as SiteRow[];

        const collectorIsActive =
          collector.is_active &&
          collector.collector_status !== "On leave";

        const assignedSiteIds = siteRows
          .filter(
            (site) =>
              site.assigned_collector === collectorId
          )
          .map((site) => site.site_id);

        if (!mounted) return;

        // ====================================
        // 3. SET COLLECTOR DETAILS
        // ====================================

        setFullName(collector.full_name);
        setEmail(collector.email);

        setContact(
          collector.contact_info ?? ""
        );

        setActive(collectorIsActive);

        setSites(siteRows);
        setSelectedSites(assignedSiteIds);

        // Store current saved values.
        setSavedProfile({
          fullName: collector.full_name,
          contact: collector.contact_info ?? "",
          active: collectorIsActive,
        });

      } catch (err) {
        console.error(
          "[WasteTrack] Load collector error:",
          err
        );

        if (mounted) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "Failed to load collector account."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCollector();

    return () => {
      mounted = false;
    };
  }, [collectorId, reloadKey]);

  // ========================================
  // TOGGLE DISPOSAL SITE
  // ========================================

  function toggleSite(
    siteId: string,
    checked: boolean
  ) {
    setSelectedSites((previous) =>
      checked
        ? Array.from(
            new Set([...previous, siteId])
          )
        : previous.filter((id) => id !== siteId)
    );

    setError("");
    setSuccess("");
  }

  const selectedSiteNames = sites
    .filter((site) =>
      selectedSites.includes(site.site_id)
    )
    .map((site) => site.site_name);

  const availableSiteCount = sites.filter(
    (site) =>
      site.assigned_collector === null ||
      site.assigned_collector === collectorId
  ).length;

  // ========================================
  // SAVE COLLECTOR ACCOUNT
  // ========================================

  async function handleSave(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!collectorId || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    let changesSaved = false;

    try {
      const cleanName = fullName.trim();
      const cleanContact = contact.trim();

      if (!cleanName) {
        throw new Error("Full name is required.");
      }

      if (!savedProfile) {
        throw new Error(
          "Collector information has not loaded."
        );
      }

      // ====================================
      // 1. CHECK PROFILE CHANGES
      // ====================================

      const profileChanged =
        cleanName !== savedProfile.fullName.trim() ||
        cleanContact !== savedProfile.contact.trim() ||
        active !== savedProfile.active;

      // ====================================
      // 2. FETCH LATEST SITE DATA
      // ====================================

      const {
        data: currentSiteData,
        error: currentSiteError,
      } = await supabase
        .from("disposal_sites")
        .select(
          "site_id, site_name, location, assigned_collector"
        );

      if (currentSiteError) {
        throw new Error(
          `Failed to load sites: ${currentSiteError.message}`
        );
      }

      const currentSites =
        (currentSiteData ?? []) as SiteRow[];

      const currentSiteMap = new Map(
        currentSites.map(
          (site) => [site.site_id, site]
        )
      );

      // ====================================
      // 3. VERIFY SELECTED SITES
      // ====================================

      for (const siteId of selectedSites) {
        const site = currentSiteMap.get(siteId);

        if (!site) {
          throw new Error(
            "A selected disposal site was not found."
          );
        }

        if (
          site.assigned_collector !== null &&
          site.assigned_collector !== collectorId
        ) {
          throw new Error(
            `${site.site_name} is assigned to another collector.`
          );
        }
      }

      // ====================================
      // 4. DETERMINE ASSIGNMENT CHANGES
      // ====================================

      const toAssign = selectedSites.filter(
        (siteId) =>
          currentSiteMap.get(siteId)
            ?.assigned_collector === null
      );

      const toUnassign = currentSites
        .filter(
          (site) =>
            site.assigned_collector === collectorId &&
            !selectedSites.includes(site.site_id)
        )
        .map((site) => site.site_id);

      const sitesChanged =
        toAssign.length > 0 ||
        toUnassign.length > 0;

      if (!profileChanged && !sitesChanged) {
        setSuccess("No changes to save.");
        return;
      }

      // ====================================
      // 5. UPDATE USERS ONLY IF NEEDED
      // ====================================

      // Site-only assignment changes skip
      // the users table completely.

      if (profileChanged) {
        const {
          data: updatedCollector,
          error: updateError,
        } = await supabase
          .from("users")
          .update({
            full_name: cleanName,
            contact_info: cleanContact || null,
            is_active: active,
            collector_status: active
              ? "Active"
              : "On leave",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", collectorId)
          .eq("role", "collector")
          .select("user_id")
          .maybeSingle();

        if (updateError) {
          throw new Error(
            `Failed to update collector: ${updateError.message}`
          );
        }

        if (!updatedCollector) {
          throw new Error(
            "Collector profile update was not permitted."
          );
        }

        changesSaved = true;

        // Update the displayed name and initials.
        setSavedProfile({
          fullName: cleanName,
          contact: cleanContact,
          active,
        });
      }

      // ====================================
      // 6. ASSIGN NEW SITES
      // ====================================

      if (toAssign.length > 0) {
        const {
          data: assignedSites,
          error: assignError,
        } = await supabase
          .from("disposal_sites")
          .update({
            assigned_collector: collectorId,
          })
          .in("site_id", toAssign)
          .is("assigned_collector", null)
          .select("site_id");

        if (assignError) {
          throw new Error(
            `Failed to assign sites: ${assignError.message}`
          );
        }

        if ((assignedSites?.length ?? 0) > 0) {
          changesSaved = true;
        }

        if (
          (assignedSites?.length ?? 0) !==
          toAssign.length
        ) {
          throw new Error(
            "Some sites could not be assigned. Refresh to verify the assignments."
          );
        }
      }

      // ====================================
      // 7. UNASSIGN REMOVED SITES
      // ====================================

      if (toUnassign.length > 0) {
        const {
          data: unassignedSites,
          error: unassignError,
        } = await supabase
          .from("disposal_sites")
          .update({
            assigned_collector: null,
          })
          .in("site_id", toUnassign)
          .eq(
            "assigned_collector",
            collectorId
          )
          .select("site_id");

        if (unassignError) {
          throw new Error(
            `Failed to unassign sites: ${unassignError.message}`
          );
        }

        if ((unassignedSites?.length ?? 0) > 0) {
          changesSaved = true;
        }

        if (
          (unassignedSites?.length ?? 0) !==
          toUnassign.length
        ) {
          throw new Error(
            "Some sites could not be unassigned. Refresh to verify."
          );
        }
      }

      // ====================================
      // 8. REFRESH ASSIGNMENTS
      // ====================================

      const {
        data: refreshedData,
        error: refreshError,
      } = await supabase
        .from("disposal_sites")
        .select(
          "site_id, site_name, location, assigned_collector"
        )
        .order("site_name");

      if (!refreshError) {
        const refreshedSites =
          (refreshedData ?? []) as SiteRow[];

        setSites(refreshedSites);

        setSelectedSites(
          refreshedSites
            .filter(
              (site) =>
                site.assigned_collector === collectorId
            )
            .map((site) => site.site_id)
        );
      }

      if (refreshError) {
        setSuccess(
          "Changes saved, but the site list could not be refreshed."
        );
      } else if (profileChanged && sitesChanged) {
        setSuccess(
          "Collector profile and assigned sites updated successfully."
        );
      } else if (sitesChanged) {
        setSuccess(
          "Assigned disposal sites updated successfully."
        );
      } else {
        setSuccess(
          "Collector profile updated successfully."
        );
      }
    } catch (err) {
      console.error(
        "[WasteTrack] Save error:",
        err
      );

      const message =
        err instanceof Error
          ? err.message
          : "Unable to save changes.";

      setError(
        changesSaved
          ? `${message} Some changes may have been saved. Refresh to verify.`
          : message
      );
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // PASSWORD RESET
  // ========================================

  async function handlePasswordReset() {
    if (!email || resettingPassword) return;

    setError("");
    setSuccess("");
    setResettingPassword(true);

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo:
              `${window.location.origin}/reset-password`,
          }
        );

      if (resetError) throw resetError;

      setSuccess(
        "Password reset requested. If the email is registered, a reset link will be sent."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to request password reset."
      );
    } finally {
      setResettingPassword(false);
    }
  }

  // ========================================
  // DEACTIVATE COLLECTOR
  // ========================================

  async function handleDeactivate() {
    if (!collectorId || deactivating) return;

    const confirmed = window.confirm(
      `Deactivate ${collectorDisplayName}?\n\n` +
      "The account will be marked inactive and assigned disposal sites will be unassigned."
    );

    if (!confirmed) return;

    setDeactivating(true);
    setError("");
    setSuccess("");

    let deactivated = false;

    try {
      const {
        data: updated,
        error: updateError,
      } = await supabase
        .from("users")
        .update({
          is_active: false,
          collector_status: "On leave",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", collectorId)
        .eq("role", "collector")
        .select("user_id")
        .maybeSingle();

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (!updated) {
        throw new Error(
          "Unable to deactivate collector."
        );
      }

      deactivated = true;

      const { error: unassignError } =
        await supabase
          .from("disposal_sites")
          .update({
            assigned_collector: null,
          })
          .eq(
            "assigned_collector",
            collectorId
          );

      if (unassignError) {
        throw new Error(unassignError.message);
      }

      navigate("/admin/collectors", {
        replace: true,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to deactivate collector.";

      setError(
        deactivated
          ? `${message} Some changes may have been saved.`
          : message
      );
    } finally {
      setDeactivating(false);
    }
  }

  // ========================================
  // TAILWIND STYLES
  // ========================================

  const inputClass =
    "h-10 w-full min-w-0 rounded-lg border border-[#D1C8BB] bg-white px-3 text-[13px] text-[#242424] outline-none transition focus:border-[#A5B879] focus:ring-2 focus:ring-[#A5B879]/25";

  const labelClass =
    "mb-1.5 block text-[12px] font-semibold text-[#555]";

  const panelClass =
    "min-w-0 rounded-2xl bg-[#F7F0E4] p-5 sm:p-6";

  const primaryButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-[#B80000] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#940000] disabled:cursor-not-allowed disabled:opacity-50";

  const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-[#B80000] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#B80000] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

  // ========================================
  // LOADING SCREEN
  // ========================================

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center gap-3 bg-white">
        <LoaderCircle
          size={27}
          className="animate-spin text-[#A5B879]"
        />

        <p className="text-sm text-gray-600">
          Loading collector account...
        </p>
      </main>
    );
  }

  // ========================================
  // LOAD ERROR / NOT FOUND
  // ========================================

  if (loadError || notFound) {
    return (
      <main className="min-h-[100dvh] bg-white p-5 sm:p-8">
        <button
          type="button"
          onClick={() =>
            navigate("/admin/collectors")
          }
          className="mb-5 flex items-center gap-2 text-sm font-semibold text-[#B80000]"
        >
          <ArrowLeft size={16} />
          Back to Collectors
        </button>

        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-[#FFF8F6] p-6">
          <AlertCircle
            size={30}
            className="mb-3 text-[#B80000]"
          />

          <h2 className="text-lg font-bold">
            {notFound
              ? "Collector not found"
              : "Failed to load collector account"}
          </h2>

          <p className="mt-2 break-words text-sm text-red-700">
            {notFound
              ? "The collector does not exist or your account does not have access."
              : loadError}
          </p>

          <button
            type="button"
            onClick={() =>
              setReloadKey(
                (previous) => previous + 1
              )
            }
            className={`${primaryButton} mt-4`}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <main className="min-h-[100dvh] w-full min-w-0 bg-white text-[#1B1B1B]">

      {/* ====================================
          HEADER
      ==================================== */}

      <header className="flex flex-wrap items-center justify-between gap-4 border-b-[7px] border-[#A5B879] px-4 py-4 sm:px-6 lg:px-8">

        <div>
          <button
            type="button"
            onClick={() =>
              navigate("/admin/collectors")
            }
            className="mb-1 flex items-center gap-1 text-xs font-semibold text-[#B80000] hover:underline"
          >
            <ArrowLeft size={14} />
            Back to Collectors
          </button>

          <h1 className="text-2xl font-bold sm:text-[27px]">
            Manage account
          </h1>

          <p className="mt-1 text-xs text-gray-600 sm:text-sm">
            Editing collector:{" "}
            <span className="font-semibold text-[#B80000]">
              {collectorDisplayName}
            </span>
          </p>
        </div>

        {/* ====================================
            DYNAMIC COLLECTOR AVATAR
            FROM public.users.full_name
        ==================================== */}

        <div className="flex min-w-0 items-center gap-3">

          <div className="hidden max-w-[200px] min-w-0 text-right sm:block">
            <p className="truncate text-[13px] font-bold text-[#292929]">
              {collectorDisplayName}
            </p>

            <p className="text-[11px] text-gray-500">
              Collector account
            </p>
          </div>

          <div
            title={collectorDisplayName}
            aria-label={`Collector: ${collectorDisplayName}`}
            className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FFD0D7] text-lg font-bold text-[#C50013] sm:h-12 sm:w-14"
          >
            {collectorInitials}
          </div>
        </div>
      </header>

      {/* ====================================
          ACCOUNT FORM
      ==================================== */}

      <form
        onSubmit={handleSave}
        className="grid grid-cols-1 items-start gap-4 px-3 py-6 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:px-7"
      >

        {/* ====================================
            LEFT PANEL
        ==================================== */}

        <section className={panelClass}>

          {/* FULL NAME */}
          <div className="mb-4">
            <label
              htmlFor="ec-name"
              className={labelClass}
            >
              Full name
            </label>

            <input
              id="ec-name"
              type="text"
              required
              maxLength={200}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setSuccess("");
              }}
              className={inputClass}
            />
          </div>

          {/* EMAIL */}
          <div className="mb-4">
            <label
              htmlFor="ec-email"
              className={labelClass}
            >
              Gmail / Email address
            </label>

            <input
              id="ec-email"
              type="email"
              value={email}
              readOnly
              className={`${inputClass} bg-[#EFEAE1] text-gray-600`}
            />

            <p className="mt-1.5 text-[11px] text-gray-500">
              Registered login email.
            </p>
          </div>

          {/* CONTACT NUMBER */}
          <div className="mb-4">
            <label
              htmlFor="ec-contact"
              className={labelClass}
            >
              Contact number
            </label>

            <input
              id="ec-contact"
              type="tel"
              maxLength={100}
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                setSuccess("");
              }}
              className={inputClass}
            />
          </div>

          {/* ====================================
              ASSIGNED SITES
          ==================================== */}

          <div className="mb-5">
            <label className={labelClass}>
              Assigned sites
            </label>

            <details className="group">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-[#D1C8BB] bg-white px-3 py-2 text-[13px] [&::-webkit-details-marker]:hidden">

                <span className="min-w-0 flex-1 truncate">
                  {selectedSiteNames.length > 0
                    ? selectedSiteNames.join(", ")
                    : "Select disposal sites"}
                </span>

                <ChevronDown
                  size={17}
                  className="shrink-0 text-gray-500 transition group-open:rotate-180"
                />
              </summary>

              <div className="mt-1 max-h-[260px] overflow-y-auto rounded-xl border border-[#E1D8CB] bg-white p-2 shadow-md">

                {sites.length === 0 && (
                  <p className="p-3 text-xs text-gray-500">
                    No disposal sites found.
                  </p>
                )}

                {sites.map((site) => {
                  const assignedToOther =
                    site.assigned_collector !== null &&
                    site.assigned_collector !== collectorId;

                  const checked =
                    selectedSites.includes(
                      site.site_id
                    );

                  return (
                    <label
                      key={site.site_id}
                      className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-[13px] ${
                        assignedToOther
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-[#F7F0E4]"
                      }`}
                    >

                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={assignedToOther}
                        onChange={(e) =>
                          toggleSite(
                            site.site_id,
                            e.target.checked
                          )
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#A5B879]"
                      />

                      <span className="min-w-0 flex-1">

                        <strong className="block break-words font-semibold">
                          {site.site_name}
                        </strong>

                        <span className="mt-1 block break-words text-[11px] text-gray-500">
                          {site.location}
                        </span>

                        {assignedToOther && (
                          <span className="mt-1 block text-[11px] text-red-600">
                            Already assigned to another collector
                          </span>
                        )}

                        {!assignedToOther &&
                          site.assigned_collector === null && (
                            <span className="mt-1 block text-[11px] text-green-700">
                              Available
                            </span>
                          )}

                        {site.assigned_collector ===
                          collectorId && (
                            <span className="mt-1 block text-[11px] text-green-700">
                              Currently assigned
                            </span>
                          )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </details>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
              <span>
                {selectedSites.length} selected
              </span>

              <span>
                {availableSiteCount} available or assigned to this collector
              </span>
            </div>
          </div>

          {/* SAVE BUTTON */}
          <button
            type="submit"
            disabled={saving || deactivating}
            className={primaryButton}
          >
            {saving && (
              <LoaderCircle
                size={16}
                className="animate-spin"
              />
            )}

            {saving
              ? "Saving changes..."
              : "Save changes"}
          </button>

          {/* ERROR MESSAGE */}
          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700"
            >
              <AlertCircle
                size={17}
                className="shrink-0"
              />

              <span className="break-words">
                {error}
              </span>
            </div>
          )}

          {/* SUCCESS MESSAGE */}
          {success && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs leading-relaxed text-green-700"
            >
              <CheckCircle2
                size={17}
                className="shrink-0"
              />

              <span>{success}</span>
            </div>
          )}
        </section>

        {/* ====================================
            RIGHT PANEL
        ==================================== */}

        <div className="flex min-w-0 flex-col gap-4">

          {/* ACCOUNT STATUS */}
          <section className={panelClass}>
            <h2 className="mb-4 text-sm font-bold uppercase text-[#626262]">
              Account Status
            </h2>

            <label className="flex cursor-pointer items-center justify-between gap-3">

              <span className="text-[13px] font-medium">
                Active Collector
              </span>

              <input
                type="checkbox"
                checked={active}
                onChange={(e) => {
                  setActive(e.target.checked);
                  setSuccess("");
                }}
                className="h-5 w-5 accent-[#A5B879]"
              />
            </label>

            <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
              Site-only changes do not update the users
              table. Collector status changes require
              permission to update the collector profile.
            </p>
          </section>

          {/* LOGIN CREDENTIALS */}
          <section className={panelClass}>
            <h2 className="mb-4 text-sm font-bold uppercase text-[#626262]">
              Login Credentials
            </h2>

            {/* COLLECTOR ID */}
            <div className="mb-4">
              <label
                htmlFor="ec-collector-id"
                className={labelClass}
              >
                Collector ID
              </label>

              <input
                id="ec-collector-id"
                type="text"
                value={collectorId ?? ""}
                readOnly
                className={`${inputClass} bg-[#EFEAE1] text-[11px]`}
              />
            </div>

            {/* PASSWORD RESET */}
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={
                resettingPassword || !email
              }
              className={outlineButton}
            >
              {resettingPassword ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <KeyRound size={16} />
              )}

              {resettingPassword
                ? "Sending..."
                : "Send password reset"}
            </button>

            <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
              The collector can set a new password
              using the link sent to their email.
            </p>
          </section>
        </div>
      </form>

      {/* ====================================
          COLLECTOR ACTIONS
      ==================================== */}

      <section className="mx-3 mb-8 flex flex-col gap-4 rounded-2xl bg-[#F7F0E4] p-5 sm:mx-5 sm:flex-row sm:items-center sm:justify-between lg:mx-7">

        <div>
          <h2 className="text-sm font-bold uppercase text-[#626262]">
            Deactivate Collector
          </h2>

          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Deactivate {collectorDisplayName} and
            unassign their disposal sites. This does
            not automatically disable their Supabase
            Authentication login.
          </p>
        </div>

        <button
          type="button"
          disabled={saving || deactivating}
          onClick={handleDeactivate}
          className={`${outlineButton} self-start sm:self-auto`}
        >
          {deactivating ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
            />
          ) : (
            <Trash2 size={16} />
          )}

          {deactivating
            ? "Deactivating..."
            : "Deactivate account"}
        </button>
      </section>
    </main>
  );
}
