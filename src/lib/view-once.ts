/** A view-once photo's message text (the photo itself is kept apart: see open_view_once). */
export const VIEW_ONCE = "[view-once]";
export const isViewOnce = (m: { content?: string | null; view_once?: boolean | null }) => !!m.view_once || m.content === VIEW_ONCE;
