import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  Info,
  Truck,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

type NotificationCategory = "Collection" | "Reminders";
type Filter = "All" | NotificationCategory;

type NotificationKind =
  | "completed"
  | "overflow"
  | "delayed"
  | "reminder"
  | "info";

type NotificationRow = {
  notification_id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
};

type ResidentNotice = {
  id: string;
  kind: NotificationKind;
  category: NotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

const filters: Filter[] = [
  "All",
  "Collection",
  "Reminders",
];

const appearance = {
  completed: {
    stripe: "bg-[#a6b879]",
    title: "text-[#71863d]",
    iconBackground: "bg-[#a4e4d6]",
  },
  overflow: {
    stripe: "bg-[#ff1329]",
    title: "text-[#ff0019]",
    iconBackground: "bg-white",
  },
  delayed: {
    stripe: "bg-[#ff1329]",
    title: "text-[#ff0019]",
    iconBackground: "bg-[#fff8cd]",
  },
  reminder: {
    stripe: "bg-[#ff902a]",
    title: "text-[#c9660b]",
    iconBackground: "bg-[#fff5c9]",
  },
  info: {
    stripe: "bg-[#a6b879]",
    title: "text-[#71863d]",
    iconBackground: "bg-[#edf2e2]",
  },
};

// The current schema has notification_type but no icon/category
// columns. These rules affect presentation only.
function mapNotification(
  row: NotificationRow
): ResidentNotice {
  const title = row.title.toLowerCase();

  let kind: NotificationKind = "info";

  if (/remind/.test(title)) {
    kind = "reminder";
  } else if (/complet|resolved/.test(title)) {
    kind = "completed";
  } else if (/overflow|bin full|full bin/.test(title)) {
    kind = "overflow";
  } else if (/delay/.test(title)) {
    kind = "delayed";
  }

  const category: NotificationCategory =
    kind === "reminder" ||
    row.notification_type === "system"
      ? "Reminders"
      : "Collection";

  return {
    id: row.notification_id,
    kind,
    category,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    read: row.is_read,
  };
}

function relativeTime(value: string, now: number) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Date unavailable";
  }

  const seconds = Math.max(
    0,
    Math.floor((now - timestamp) / 1000)
  );

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }

  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ResidentNotification() {
  const [activeFilter, setActiveFilter] =
    useState<Filter>("All");

  const [notifications, setNotifications] =
    useState<ResidentNotice[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(Date.now());

  const userIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const savingRef = useRef(false);

  // Update relative timestamps while the page remains open.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  // Reload when the signed-in account changes.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT"
      ) {
        setReloadKey((value) => value + 1);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load only the current user's notifications.
  useEffect(() => {
    let active = true;
    const generation = ++generationRef.current;

    userIdRef.current = null;
    savingRef.current = false;

    async function loadNotifications() {
      setLoading(true);
      setSaving(false);
      setError("");
      setSaveError("");
      setNotifications([]);

      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (!active) return;

        if (!authData.user) {
          throw new Error(
            "Please sign in to view your notifications."
          );
        }

        if (authError) throw authError;

        const userId = authData.user.id;
        userIdRef.current = userId;

        const rows: NotificationRow[] = [];
        const pageSize = 200;
        let offset = 0;

        while (active) {
          const { data, error: queryError } =
            await supabase
              .from("notifications")
              .select(`
                notification_id,
                user_id,
                title,
                message,
                notification_type,
                is_read,
                created_at
              `)
              .eq("user_id", userId)
              .order("created_at", {
                ascending: false,
              })
              .order("notification_id")
              .range(offset, offset + pageSize - 1);

          if (queryError) throw queryError;

          const page = (data ?? []) as NotificationRow[];
          rows.push(...page);

          if (page.length < pageSize) break;
          offset += pageSize;
        }

        if (
          !active ||
          generation !== generationRef.current
        ) {
          return;
        }

        setNotifications(rows.map(mapNotification));
        setNow(Date.now());
      } catch (failure) {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load notifications."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadNotifications();

    return () => {
      active = false;

      if (generationRef.current === generation) {
        generationRef.current += 1;
        userIdRef.current = null;
      }
    };
  }, [reloadKey]);

  async function saveRead(ids: string[]) {
    const userId = userIdRef.current;

    if (
      !userId ||
      ids.length === 0 ||
      savingRef.current
    ) {
      return;
    }

    const generation = generationRef.current;

    savingRef.current = true;
    setSaving(true);
    setSaveError("");

    try {
      // Keep bulk requests reasonably sized.
      for (let index = 0; index < ids.length; index += 200) {
        if (generation !== generationRef.current) return;

        const batch = ids.slice(index, index + 200);

        const { data, error: updateError } =
          await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", userId)
            .in("notification_id", batch)
            .select("notification_id");

        if (generation !== generationRef.current) return;

        if (updateError) throw updateError;

        const updatedIds = new Set(
          (data ?? []).map(
            (row) => row.notification_id as string
          )
        );

        // Change the UI only for rows confirmed by Supabase.
        setNotifications((current) =>
          current.map((notification) =>
            updatedIds.has(notification.id)
              ? { ...notification, read: true }
              : notification
          )
        );

        if (updatedIds.size !== batch.length) {
          throw new Error(
            "Some notifications could not be marked as read. Check your notification update policy."
          );
        }
      }
    } catch (failure) {
      if (generation !== generationRef.current) return;

      setSaveError(
        failure instanceof Error
          ? failure.message
          : "Unable to update notifications."
      );
    } finally {
      if (generation === generationRef.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  function markAllRead() {
    const unreadIds = notifications
      .filter((notification) => !notification.read)
      .map((notification) => notification.id);

    void saveRead(unreadIds);
  }

  function markRead(id: string) {
    const notification = notifications.find(
      (item) => item.id === id
    );

    if (!notification || notification.read) return;

    void saveRead([id]);
  }

  const visibleNotifications = notifications.filter(
    (notification) =>
      activeFilter === "All" ||
      notification.category === activeFilter
  );

  const hasUnread = notifications.some(
    (notification) => !notification.read
  );

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-3 pt-7 sm:max-w-xl sm:px-5 sm:pt-9 lg:max-w-3xl">
        <h1 className="shrink-0 text-base font-bold text-black sm:text-xl">
          Notifications
        </h1>

        {/* Red information banner */}
        <section className="mt-3 flex shrink-0 items-center gap-3 rounded-lg bg-[#c90000] px-3 py-3 text-white sm:px-4">
          <div
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ff1024]"
          >
            <Bell
              size={23}
              fill="white"
              strokeWidth={1.7}
            />
          </div>

          <div>
            <h2 className="text-xs font-bold">
              Stay updated, stay informed.
            </h2>
            <p className="mt-1 text-[11px]">
              Here are the latest updates and alerts.
            </p>
          </div>
        </section>

        <div className="flex shrink-0 justify-end">
          <button
            type="button"
            onClick={markAllRead}
            disabled={
              loading ||
              saving ||
              !hasUnread ||
              !!error
            }
            className="min-h-9 px-2 text-xs text-[#ff0019] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600 disabled:text-neutral-400 disabled:no-underline"
          >
            {saving
              ? "Saving..."
              : hasUnread
                ? "Mark all read"
                : "All read"}
          </button>
        </div>

        {/* Category filters */}
        <div
          role="group"
          aria-label="Filter notifications"
          className="mb-3 flex shrink-0 flex-wrap items-center justify-center gap-4 sm:gap-6"
        >
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
              className={`min-h-8 rounded-full border border-[#a6b879] px-3 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82964e] sm:px-4 ${
                activeFilter === filter
                  ? "bg-[#a6b879] text-white"
                  : "bg-white text-neutral-600 hover:bg-[#f2f5e9]"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {saveError && (
          <p
            role="alert"
            className="mb-3 shrink-0 rounded-lg bg-red-50 p-3 text-xs text-red-700"
          >
            {saveError}
          </p>
        )}

        {/* Only the notification list scrolls */}
        <div
          role="region"
          aria-label="Notifications"
          aria-busy={loading}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5 pb-6"
        >
          {loading ? (
            <p
              role="status"
              className="py-8 text-center text-sm text-neutral-500"
            >
              Loading notifications...
            </p>
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4"
            >
              <p className="break-words text-xs text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  setReloadKey((value) => value + 1)
                }
                className="mt-3 min-h-9 text-xs font-semibold text-red-700"
              >
                Try Again
              </button>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              {notifications.length === 0
                ? "You have no notifications yet."
                : "No notifications in this category."}
            </p>
          ) : (
            <ul className="space-y-5 sm:space-y-6">
              {visibleNotifications.map((notification) => {
                const style =
                  appearance[notification.kind];

                const time = relativeTime(
                  notification.createdAt,
                  now
                );

                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() =>
                        markRead(notification.id)
                      }
                      disabled={saving}
                      aria-label={`${notification.title}, ${time}, ${
                        notification.read ? "read" : "unread"
                      }`}
                      className="relative flex min-h-[82px] w-full overflow-hidden rounded-[15px] border border-[#c9c9c9] bg-white text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-wait sm:min-h-[94px]"
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 w-[10px] ${style.stripe}`}
                      />

                      <div className="flex w-full items-start gap-2.5 py-3 pl-6 pr-3 sm:gap-3 sm:pl-7">
                        <div
                          aria-hidden="true"
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${style.iconBackground}`}
                        >
                          <NoticeIcon
                            kind={notification.kind}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center justify-end gap-2">
                            <time
                              dateTime={notification.createdAt}
                              className="text-[10px] text-[#8b7e7e]"
                            >
                              {time}
                            </time>

                            {notification.read ? (
                              <Check
                                size={12}
                                aria-hidden="true"
                                className="shrink-0 text-neutral-400"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                              />
                            )}
                          </div>

                          <h2
                            className={`break-words text-xs font-semibold leading-tight sm:text-sm ${style.title}`}
                          >
                            {notification.title}
                          </h2>

                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-snug text-[#737373]">
                            {notification.message}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

function NoticeIcon({
  kind,
}: {
  kind: NotificationKind;
}) {
  if (kind === "completed") {
    return (
      <Truck size={17} className="text-[#13ad91]" />
    );
  }

  if (kind === "overflow") {
    return (
      <span className="h-4 w-4 rounded-full bg-[#ff1329]" />
    );
  }

  if (kind === "delayed") {
    return (
      <svg
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M10.3 3.8a2 2 0 0 1 3.4 0l8.1 14A2 2 0 0 1 20.1 21H3.9a2 2 0 0 1-1.7-3.2l8.1-14Z"
          fill="#ff2638"
        />
        <path
          d="M12 8v6"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle
          cx="12"
          cy="17"
          r="1"
          fill="white"
        />
      </svg>
    );
  }

  if (kind === "reminder") {
    return (
      <span className="grid h-5 w-5 place-items-center rounded-md bg-[#ff942c] text-base font-bold leading-none text-white">
        !
      </span>
    );
  }

  return (
    <Info size={17} className="text-[#71863d]" />
  );
}