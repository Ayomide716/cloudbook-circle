# Ember redesign plan

The owner approved a redesign of the phone app in November 2026. This file records every
decision so the build can continue in any session without the original conversation.

**Mockups:** https://claude.ai/artifact/4jwQdogn2Gfp8SqPMpevxL (a private canvas with 36 phone
screens; only the owner can open it). The mockups are the reference for layout. Where a mockup
and this file disagree, this file wins.

## Ground rules

- Keep the current architecture (React, Vite, Tailwind, Supabase, Capacitor). This is a restyle
  and a re-arrangement, not a rewrite.
- Keep Ember's identity: the orange brand colour, the "ember." wordmark with its orange full
  stop, and the "e." app icon. Do not introduce a new logo.
- Look: sleek and modern. A soft grey page (`bg-secondary`) with white cards
  (`rounded-[20px] bg-card`, a border only in dark mode), small pills (32px tall, 13px text),
  one title size for main screens (24px, extra bold), plain header icons with no circle behind
  them.
- Dark mode is a colour swap done with the existing tokens. It does not need separate designs.
- Every redesigned screen gets a loading skeleton that matches its new layout.
- Ship in stages. Each stage is its own pull request, merged when CI is green. Web changes
  reach phones on the next app restart; only the splash needs a new APK.
- The owner follows on a phone and is not a developer. Explain changes in plain language.
- Usage is limited. Open only the files a stage touches, and do not re-render the whole mockup
  canvas.

## Decisions

| Topic | Decision |
|---|---|
| Tab bar | Home, Reels, Create, Chats, Menu. 52px tall. Active tab in the brand colour. |
| Chats | A tab in the bottom bar. No chat icon at the top (a clean switch). |
| Friends | First shortcut in Menu. Waiting requests show as a badge on the Menu tab. |
| Home feed | One mixed feed. Remove the "For you / Friends" switch. Stories stay at the top. |
| Friends' posts | Move to the Friends screen as a "Posts" pill: friends only, newest first. |
| Friends screen | Pills: Posts, Requests, Suggestions, All friends. Open on Requests when any are waiting, otherwise on Posts. |
| Groups | Merge the two kinds. One group has a Discussion tab and a Chat tab. Today's group chats (`groups.is_chat`) become groups that open on Chat. Community groups get a Chat tab an admin can switch on. Group chats still appear in the Chats list. No messages or posts may be lost. Needs one small database update. |
| Tab bar on inner screens | As Facebook does: keep it on Explore, Events, Marketplace, Watch, Pages, Saved, Story archive, Offline videos, Settings, Admin, Search and the group page. Hide it where something else owns the bottom of the screen: an open chat, comments, create post, stories, calls, the editors. |
| Chat photos | A sent photo is a rounded picture with no coloured frame. |
| Splash | Pure black, only the "e." mark. The orange dot glows in alone, pulses twice, slides right as the white "e" rises, and settles as the full stop. Plays once. Needs a new APK. |
| Calls | Do not show an "End-to-end encrypted" label. It has not been verified. |

## Top bar behaviour (done, PR after #159)

The "ember." bar shows only on Home, where it hides while scrolling down and comes back on
scrolling up. Every other screen has its own header instead (`src/lib/sub-pages.ts`):

- **Chats and Menu (tabs):** the screen's title row, no back arrow.
- **Friends, Groups, Notifications and other inner screens:** a back arrow and the title
  (`PageHeader back`).
- **Full-screen views (Reels, stories, an open chat, calls, editors):** no top bar.

## Features the mockups show that do not exist yet

| Feature | Decision | Database update |
|---|---|---|
| Comment sorting ("Top comments") | Done | No |
| "Friends" tab in Reels | Already there (For you / Friends switch) | No |
| Live numbers on the Admin screen | Done: new users, active and posts today, open reports | No |
| Saved collections | Done; turns on once `supabase/setup/ember-update-saved-collections.sql` is run | Yes, small |
| Scheduling a post | Later, after the redesign. Leave it off the Create post screen until then. | Yes |

## Build order

1. **Done:** tab bar, Menu, Chats as a tab (PR #157), then a smaller bar (PR #158).
2. **Done:** top bar behaviour.
3. **Done:** Home is one feed with the stories row always on top; the Friends screen has a
   Posts pill with friends' posts, newest first. Post cards have 15px text, a 40px picture and
   bold names.
4. **Done:** Friends: orange Confirm and Add friend, grey Delete and ⋯, all 40px with rounded
   corners, as in the mockup.
5. **Done:** groups are one kind. Every group already had a Chat tab, so no database update was
   needed: group chats show under Your groups and have a page (opening on Chat), and any group
   where people chat shows in the Chats list. The admin switch for chat is not built; chat
   stays on for every group. Groups hub: "For you" pill, square 64px tiles. Group page: the
   info card overlaps the cover, white round buttons on the cover, underlined section tabs, and
   "You, Tolu and 4 others are members" beside the faces.
6. **Done:** Chats list and open chat. Photos sent on their own have no coloured frame; group
   chats have rounded-square pictures.
7. **Done:** Profile has one friends row (faces, count, arrow). Post comments have a Top
   comments / Newest switch. Notifications already matched. Create post: the cursor starts in
   the text box, the title sits beside the close button; scheduling stays off for now.
8. **Checked, no change needed:** Reels, story viewer and editor, photo editor, calls (no
   "end-to-end encrypted" label anywhere).
9. **Done:** Search, Explore, Events, Saved (with collections), Story archive, Offline videos
   all use the shared header with a back arrow. Header icons are plain on phones (no grey
   circle); `HeaderAction filled` keeps the circle for buttons beside other buttons.
10. **Done:** Marketplace, Watch, Pages, Settings, Admin.
11. **Done:** Log in has no Log in / Sign up switch; "Create new account" is a button under Log
    in, and sign up ends with "Already have an account? Log in". `/auth?mode=signup` opens on
    sign up. Reset password and the welcome flow already matched.
12. Splash, then a new APK. **On hold at the owner's request.**

## Open points

- **Decided:** Menu has no "Settings & privacy" row (the settings icon at the top is enough);
  Chats has one new-chat button, top right (the floating one is gone).
- The friend-request badge on the Menu tab and the unread badge on Chats use the same style.

## Earlier list, still wanted after the redesign

Feed improvements the owner agreed to consider: saved collections (now part of the redesign),
pin a post to your profile, sort comments (now part of the redesign), the feed remembering
your place, seen posts ranking lower, a tidier post menu with undo after hiding, scheduling a
post, and translating a post (needs a paid service; confirm first).
