
import { useEffect, useRef, useState } from "react";
import { Bell, Check, XCircle } from "lucide-react";

import { supabase } from "../../lib/supabase";

// ==========================================
// TYPES
// ==========================================

type NotificationKind = "rejected";

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
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

// ==========================================
// NOTIFICATION COLORS
// ==========================================

const appearance: Record<
  NotificationKind,
  {
    stripe: string;
    title: string;
    iconBackground: string;
  }
> = {
  rejected: {
    stripe: "bg-[#e41e35]",
    title: "text-[#c92438]",
    iconBackground: "bg-red-100",
  },
};

// ==========================================
// ONLY DISPLAY REJECTED NOTIFICATIONS
// ==========================================

function mapNotification(
  row: NotificationRow
): ResidentNotice | null {
  const type =
    row.notification_type?.toLowerCase() ?? "";

  const title =
    row.title?.toLowerCase() ?? "";

  const searchable = `${type} ${title}`;

  // Ignore all notification types except Rejected.
  if (!/reject|declin/.test(searchable)) {
    return null;
  }

  return {
    id: row.notification_id,
    kind: "rejected",
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    read: row.is_read,
  };
}

// ==========================================
// FORMAT NOTIFICATION TIME
// ==========================================

function relativeTime(
  value: string,
  now: number
): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Date unavailable";
  }

  const seconds = Math.max(
    0,
    Math.floor((now - timestamp) / 1000)
  );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} ${
      days === 1 ? "day" : "days"
    } ago`;
  }

  return new Date(value).toLocaleDateString(
    "en-US",
    {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

// ==========================================
// MAIN RESIDENT NOTIFICATION COMPONENT
// ==========================================

export default function ResidentNotification() {
  // ========================================
  // STATES
  // ========================================

  const [notifications, setNotifications] =
    useState<ResidentNotice[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(Date.now());

  // ========================================
  // REFERENCES
  // ========================================

  const userIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const savingRef = useRef(false);

  // ========================================
  // UPDATE RELATIVE TIMESTAMPS
  // ========================================

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  // ========================================
  // DETECT AUTHENTICATION CHANGES
  // ========================================

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event) => {
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT"
        ) {
          setReloadKey(
            (previous) => previous + 1
          );
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ========================================
  // FETCH RESIDENT NOTIFICATIONS
  // ========================================

  useEffect(() => {
    let active = true;

    const generation = ++generationRef.current;

    let notificationChannel:
      ReturnType<typeof supabase.channel> | null =
      null;

    userIdRef.current = null;
    savingRef.current = false;

    async function loadNotifications() {
      setLoading(true);
      setSaving(false);

      setError("");
      setSaveError("");
      setNotifications([]);

      try {
        // ==================================
        // GET CURRENT USER
        // ==================================

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (!active) {
          return;
        }

        if (authError) {
          throw authError;
        }

        if (!authData.user) {
          throw new Error(
            "Please sign in to view your notifications."
          );
        }

        const userId = authData.user.id;

        userIdRef.current = userId;

        // ==================================
        // LOAD NOTIFICATIONS FROM SUPABASE
        // ==================================

        const rows: NotificationRow[] = [];

        const pageSize = 200;
        let offset = 0;

        while (active) {
          const {
            data,
            error: queryError,
          } = await supabase
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
            .range(
              offset,
              offset + pageSize - 1
            );

          if (queryError) {
            throw queryError;
          }

          const page =
            (data ?? []) as NotificationRow[];

          rows.push(...page);

          if (page.length < pageSize) {
            break;
          }

          offset += pageSize;
        }

        if (
          !active ||
          generation !== generationRef.current
        ) {
          return;
        }

        // ==================================
        // FILTER REJECTED NOTIFICATIONS ONLY
        // ==================================

        const rejectedNotifications = rows
          .map(mapNotification)
          .filter(
            (
              notification
            ): notification is ResidentNotice =>
              notification !== null
          );

        setNotifications(rejectedNotifications);
        setNow(Date.now());

        // ==================================
        // SUPABASE REALTIME
        // ==================================

        // Enable Realtime for the notifications
        // table to receive new records.

        notificationChannel = supabase
          .channel(
            `resident-notices-${userId}`
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${userId}`,
            },
            () => {
              if (
                active &&
                generation === generationRef.current
              ) {
                setReloadKey(
                  (previous) => previous + 1
                );
              }
            }
          )
          .subscribe();
      } catch (failure) {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load notifications."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadNotifications();

    // ==================================
    // CLEAN UP REALTIME CONNECTION
    // ==================================

    return () => {
      active = false;

      if (notificationChannel) {
        void supabase.removeChannel(
          notificationChannel
        );
      }

      if (
        generationRef.current === generation
      ) {
        generationRef.current += 1;
        userIdRef.current = null;
      }
    };
  }, [reloadKey]);

  // ========================================
  // UPDATE READ STATUS IN SUPABASE
  // ========================================

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
      for (
        let index = 0;
        index < ids.length;
        index += 200
      ) {
        if (
          generation !== generationRef.current
        ) {
          return;
        }

        const batch = ids.slice(
          index,
          index + 200
        );

        // ==================================
        // SAVE TO SUPABASE
        // ==================================

        const {
          data,
          error: updateError,
        } = await supabase
          .from("notifications")
          .update({
            is_read: true,
          })
          .eq("user_id", userId)
          .in("notification_id", batch)
          .select("notification_id");

        if (
          generation !== generationRef.current
        ) {
          return;
        }

        if (updateError) {
          throw updateError;
        }

        const updatedIds = new Set(
          (data ?? []).map(
            (row) =>
              row.notification_id as string
          )
        );

        // ==================================
        // UPDATE UI AFTER SUCCESS
        // ==================================

        setNotifications((current) =>
          current.map((notification) =>
            updatedIds.has(notification.id)
              ? {
                  ...notification,
                  read: true,
                }
              : notification
          )
        );

        if (
          updatedIds.size !== batch.length
        ) {
          throw new Error(
            "Some notifications could not be marked as read. Check your notification update policy."
          );
        }
      }
    } catch (failure) {
      if (
        generation !== generationRef.current
      ) {
        return;
      }

      setSaveError(
        failure instanceof Error
          ? failure.message
          : "Unable to update notifications."
      );
    } finally {
      if (
        generation === generationRef.current
      ) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  // ========================================
  // MARK ALL REJECTED NOTIFICATIONS READ
  // ========================================

  function markAllRead() {
    const unreadIds = notifications
      .filter((notification) => !notification.read)
      .map((notification) => notification.id);

    void saveRead(unreadIds);
  }

  // ========================================
  // MARK SINGLE NOTIFICATION READ
  // ========================================

  function markRead(id: string) {
    const notification = notifications.find(
      (item) => item.id === id
    );

    if (
      !notification ||
      notification.read
    ) {
      return;
    }

    void saveRead([id]);
  }

  // ========================================
  // CHECK UNREAD NOTIFICATIONS
  // ========================================

  const hasUnread = notifications.some(
    (notification) => !notification.read
  );

  // ========================================
  // USER INTERFACE
  // ========================================

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-3 pt-7 sm:max-w-xl sm:px-5 sm:pt-9 lg:max-w-3xl">

        {/* ====================================
            NOTIFICATION TITLE
        ==================================== */}

        <h1 className="shrink-0 text-base font-bold text-black sm:text-xl">
          Notifications
        </h1>

        {/* ====================================
            RED INFORMATION BANNER
        ==================================== */}

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
              Only rejected waste reports are shown.
            </p>
          </div>
        </section>

        {/* ====================================
            MARK ALL READ
        ==================================== */}

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

        {/* ====================================
            ALL AND REJECTED FILTERS REMOVED
            NOTIFICATIONS DISPLAY DIRECTLY
        ==================================== */}

        {/* ====================================
            SAVE ERROR
        ==================================== */}

        {saveError && (
          <p
            role="alert"
            className="mb-3 shrink-0 rounded-lg bg-red-50 p-3 text-xs text-red-700"
          >
            {saveError}
          </p>
        )}

        {/* ====================================
            NOTIFICATION LIST
        ==================================== */}

        <div
          role="region"
          aria-label="Notifications"
          aria-busy={loading}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5 pb-6"
        >
          {/* ====================================
              LOADING
          ==================================== */}

          {loading ? (
            <p
              role="status"
              className="py-8 text-center text-sm text-neutral-500"
            >
              Loading notifications...
            </p>
          ) : error ? (

            // ====================================
            // ERROR STATE
            // ====================================

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
                  setReloadKey(
                    (previous) => previous + 1
                  )
                }
                className="mt-3 min-h-9 text-xs font-semibold text-red-700"
              >
                Try Again
              </button>
            </div>
          ) : notifications.length === 0 ? (

            // ====================================
            // EMPTY NOTIFICATIONS
            // ====================================

            <p className="py-8 text-center text-sm text-neutral-500">
              No rejected report notifications yet.
            </p>
          ) : (

            // ====================================
            // REJECTED NOTIFICATION CARDS
            // ====================================

            <ul className="space-y-5 sm:space-y-6">
              {notifications.map((notification) => {
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
                        notification.read
                          ? "read"
                          : "unread"
                      }`}
                      className="relative flex min-h-[82px] w-full overflow-hidden rounded-[15px] border border-[#c9c9c9] bg-white text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-wait sm:min-h-[94px]"
                    >
                      {/* ====================================
                          RED STRIPE
                      ==================================== */}

                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 w-[10px] ${style.stripe}`}
                      />

                      <div className="flex w-full items-start gap-2.5 py-3 pl-6 pr-3 sm:gap-3 sm:pl-7">

                        {/* ====================================
                            REJECTED ICON
                        ==================================== */}

                        <div
                          aria-hidden="true"
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${style.iconBackground}`}
                        >
                          <XCircle
                            size={18}
                            className="text-[#d21d35]"
                          />
                        </div>

                        <div className="min-w-0 flex-1">

                          {/* ====================================
                              TIME AND READ STATUS
                          ==================================== */}

                          <div className="mb-1 flex items-center justify-end gap-2">
                            <time
                              dateTime={
                                notification.createdAt
                              }
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

                          {/* ====================================
                              NOTIFICATION TITLE
                          ==================================== */}

                          <h2
                            className={`break-words text-xs font-semibold leading-tight sm:text-sm ${style.title}`}
                          >
                            {notification.title}
                          </h2>

                          {/* ====================================
                              NOTIFICATION MESSAGE
                          ==================================== */}

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