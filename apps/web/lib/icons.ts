/**
 * Every Material Symbols glyph this app renders.
 *
 * Google's stylesheet serves the *whole* family unless it is told otherwise —
 * around 3,600 icons in one variable font, and with all four axes requested
 * that file is **3.87 MB**. It was by a wide margin the largest thing the page
 * downloaded, larger than every script, stylesheet and poster put together,
 * and it is loaded `display=block` because the glyph name is the element's own
 * text content: until it arrives, the icons are blank. Naming the icons brings
 * the same file down to about 71 KB.
 *
 * The catch is that an icon missing from this list does not fall back to
 * anything — the ligature never forms and the raw word "account_circle"
 * appears on screen. `npm run check:icons` scans the components for every name
 * passed to `<Icon>` and fails on anything not listed here, so adding an icon
 * without adding it here breaks the build rather than the page.
 *
 * Sorted, because the list is also the cache key: the same set in a different
 * order is a different URL to Google and a fresh download for every visitor.
 */
export const ICON_NAMES = [
  "account_circle",
  "add",
  "alternate_email",
  "api",
  "auto_awesome",
  "bar_chart",
  "bookmark",
  "bookmark_add",
  "bookmark_added",
  "bookmark_remove",
  "calendar_month",
  "check",
  "check_circle",
  "chevron_left",
  "chevron_right",
  "close",
  "cloud_off",
  "code",
  "delete",
  "delete_forever",
  "download",
  "edit_note",
  "emoji_events",
  "event_busy",
  "expand_more",
  "explore",
  "format_quote",
  "group",
  "history",
  "info",
  "key",
  "link",
  "list",
  "lock",
  "logout",
  "mail",
  "manage_accounts",
  "mark_email_read",
  "movie",
  "notifications",
  "notifications_active",
  "notifications_off",
  "open_in_new",
  "palette",
  "person",
  "person_add",
  "person_remove",
  "photo_camera",
  "play_arrow",
  "play_circle",
  "playlist_add",
  "playlist_remove",
  "progress_activity",
  "public",
  "radio_button_unchecked",
  "recommend",
  "refresh",
  "search",
  "search_off",
  "settings",
  "star",
  "subscriptions",
  "swap_horiz",
  "sync",
  "travel_explore",
  "upcoming",
  "upload_file",
  "verified",
  "visibility",
  "visibility_off",
  "workspace_premium",
] as const;

/**
 * The stylesheet URL for exactly those glyphs.
 *
 * The axis ranges are unchanged: `fill` on `<Icon>` sets `FILL` at runtime and
 * the type scale leans on `opsz`, so subsetting the icons must not also
 * subset the axes.
 */
export const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" +
  `&icon_names=${ICON_NAMES.join(",")}` +
  "&display=block";
