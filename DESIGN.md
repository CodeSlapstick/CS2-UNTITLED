---
name: "CS2 UNTITLED"
description: "The shipped navy, orange and cyan system for CS2 match review."
colors:
  accent: "#ff6b00"
  accent-hover-home: "#ff8a38"
  interactive: "#00e5ff"
  interactive-ink: "#06232a"
  bg: "#0b0e14"
  card: "#151a23"
  card-2: "#1e232d"
  line: "#2e3647"
  line-2: "#242b38"
  text: "#f2f5f9"
  muted: "#9aa4b5"
  home-soft: "#c8cfda"
  home-line-hi: "#46516a"
  ct: "#4f8cff"
  t: "#ff8a1e"
  ct-ink: "#8fb4ff"
  t-ink: "#ffb067"
  ok: "#55d69a"
  err: "#ff7180"
  light-bg: "#eef1f5"
  light-card: "#ffffff"
  light-card-2: "#e5eaf0"
  light-line: "#c9d1dc"
  light-line-2: "#dce2e9"
  light-text: "#17202c"
  light-muted: "#596575"
  light-interactive: "#007789"
  light-ct-ink: "#245fc9"
  light-t-ink: "#9a4900"
  light-ok: "#087a4e"
  light-err: "#b42334"
  home-light-panel: "#e2e7ed"
  home-light-soft: "#3f4b5a"
  home-light-muted: "#536174"
  home-light-cyan: "#006778"
  home-light-step: "#a34400"
  home-light-line-hi: "#9aa7b8"
typography:
  display:
    fontFamily: "Chakra Petch, Anuphan, sans-serif"
    fontSize: "clamp(42px, 4.5vw, 72px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-.025em"
  headline:
    fontFamily: "Chakra Petch, Anuphan, sans-serif"
    fontSize: "clamp(32px, 3.4vw, 50px)"
    fontWeight: 700
    lineHeight: 1.16
    letterSpacing: "-.02em"
  home-title:
    fontFamily: "Chakra Petch, Anuphan, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  app-title:
    fontFamily: "Chakra Petch, Anuphan, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.01em"
  app-headline:
    fontFamily: "Chakra Petch, Anuphan, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  home-body:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  home-card-body:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  body-small:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "13.5px"
  label:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
  mono:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "13.5px"
rounded:
  control: "4px"
  panel: "6px"
  ghost: "8px"
  pill: "999px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "24": "24px"
  "32": "32px"
  "48": "48px"
  "56": "56px"
  "72": "72px"
  "80": "80px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#291200"
    rounded: "{rounded.panel}"
    padding: "9px 15px"
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.ghost}"
    padding: "6px 12px"
  button-home:
    backgroundColor: "{colors.accent}"
    textColor: "#17100a"
    rounded: "{rounded.control}"
    padding: "0 22px"
  button-home-hover:
    backgroundColor: "{colors.accent-hover-home}"
    textColor: "#17100a"
  card-app:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "16px 18px"
  card-home:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  input-search:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "0 9px 0 11px"
    height: "36px"
  chip-ct:
    textColor: "{colors.ct-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
    typography: "{typography.label}"
  nav-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
---
# Design System: CS2 UNTITLED

## Overview

**Creative North Star: "CS2 match review"**

The incumbent system frames CS2 match evidence with dark navy surfaces, orange entry actions, cyan interaction states, and compact technical headings. Chakra Petch gives titles their angular character; Anuphan supports Thai and English reading. The existing target mark and CS2 UNTITLED name anchor the identity.

The application is dense and task-oriented; public Home opens the spacing and type scale around actual application recordings. Light mode changes surface and text assignments while retaining the action and team identities. These are variants of the shipped system, not a replacement identity.

This is a descriptive record of the confirmed incumbent world, not a newly chosen metaphor. Evidence: `frontend/src/app/styles.css` (theme, shell, primitives and Home base), `frontend/src/features/home/home.css` (final Home overrides), `frontend/src/features/home/HomePage.tsx`, `PRODUCT.md`, and `.impeccable/surfaces/frontend-src-homepage-tsx.md`. Current composition evidence is `.impeccable/review/home-cleanup/desktop.png` and `mobile.png`; the preceding `.impeccable/review/home-brand/mobile-light.png` records the unchanged light-theme colors. Typography weights reflect the loaded fonts and HTML heading defaults. Home-specific composition remains in its surface brief.

**Key Characteristics:**
- Navy tonal surfaces and thin borders.
- Orange primary actions; cyan interaction and focus.
- Chakra Petch headings with Anuphan Thai/English body text.
- Compact application controls and roomier public Home media cards.

## Colors

Orange and cyan sit against navy tonal layers in dark mode and cool pale surfaces in light mode. Frontmatter contains the exact source values; names below describe their use.

### Primary

- **Action orange** (`accent`): primary actions and the target-mark brackets. Home hover uses `accent-hover-home`.
- **Interaction cyan** (`interactive`): links, focus outlines, active navigation and language selection. Dark selected controls use `interactive-ink`.

### Secondary

- **CT blue / T orange** (`ct`, `t`): team markers and visualization identities. Use `ct-ink` and `t-ink` for readable team text; light mode has separate ink assignments.
- **Success green / error rose** (`ok`, `err`): status meaning, each with a light-theme variant.

### Neutral

- **Navy canvas / panel / raised panel** (`bg`, `card`, `card-2`): the application and Home dark surface ladder.
- **Slate borders** (`line`, `line-2`): outer boundaries and quieter table dividers. Home's stronger media border uses `home-line-hi`.
- **Near-white / muted slate** (`text`, `muted`): primary and supporting copy. Home adds `home-soft` between those levels.
- **Cool light canvas** (`light-bg`), **white panel** (`light-card`) and **pale secondary panel** (`light-card-2`): application light surface ladder, with dark text, readable muted text, and gray borders.
- Home light mode deliberately differs: `home-light-panel` is the card fill; the secondary panel is white. Use `home-light-soft`, `home-light-muted`, and `home-light-cyan` for copy and links. Small workflow numbers use `home-light-step`; media borders use `home-light-line-hi`. These final Home overrides supersede earlier declarations in the global stylesheet.
- White is the light application's selected interactive foreground. Home's language toggle instead retains dark interaction ink; this is a separate incumbent control variant, not a general text-color rule.

**The Action and Interaction Rule.** Use orange for primary entry actions and cyan for links, focus, and interactive selection. Keep CT/T side colors distinct from these interface roles.

## Typography

**Display Font:** Chakra Petch, with Anuphan and sans-serif fallbacks.
**Body Font:** Anuphan, with system-ui and sans-serif fallbacks.
**Label/Mono Font:** UI monospace / Consolas for the app's monospace utility; ordinary labels remain Anuphan and compact Home brand/sequence labels use Chakra Petch.

**Character:** Angular headings establish the match-analysis identity. Open Thai/English body text carries explanations and dense app data without introducing a second display voice.

### Hierarchy

- **Display:** Home hero, frontmatter `display`; at widths up to 760px it changes to `clamp(38px, 10vw, 58px)`. Home hero copy is 17px/1.75, capped at 49ch, and becomes 16px on mobile.
- **Headline:** Home feature introduction, frontmatter `headline`; mobile size is 34px. Closing headings use `clamp(30px, 3vw, 44px)`.
- **Title:** Home cards use `home-title`; application page headings use `app-title` and section headings use `app-headline`.
- **Body:** Application `body` is 15px/1.55; Home `home-body` is 16px/1.6; Home card explanations use `home-card-body` at 14px/1.65.
- **Small / label:** App supporting copy is 13.5px, compact labels and table headers are 12px. Table headers use uppercase with .8px tracking. Home feature links and hints use 13px; numbered workflow labels are 700 13px/1 Chakra Petch with tabular numerals.
- **Brand:** Chakra Petch 700, 18px/1 and .08em tracking; Home narrows to 15px on mobile, and its footer brand is 14px.

**The Surface Scope Rule.** Keep application and Home type scales scoped to their surfaces; a Home hero size is not an application page title.

## Layout

The application centers a 1180px maximum page with 22px 24px 64px padding. At 640px and below, padding becomes 16px 16px 48px. The replay page expands to 1560px. Application headers wrap, and narrow navigation can scroll horizontally. These patterns support dense tables and tools rather than a single universal grid.

Home uses a 1400px maximum container, including its closing section, with 24px side gutters on desktop and 16px at 760px and below. The navigation is 76px tall, becoming 68px on mobile. The feature section has 72px top and 32px bottom padding; the closing section has 32px top and 40px bottom padding. At 760px and below those become 48/24px and 24/32px. The closing heading sits 10px above its description, with a 32px horizontal gap to the action on desktop. Common small gaps cluster around 4/8/12/16/18/20/24px; the frontmatter records observed reusable steps, not a mathematical spacing mandate.

The current Home hero is a .83fr/1.17fr split with a `clamp(32px, 5vw, 80px)` gap, stacking at 1050px. Its seven feature cards form four equal columns with a 20px gap, two columns at 1050px, and one at 520px with a 16px gap. This is the implemented Home pattern, not a requirement for unrelated screens. The main recording uses 16:9; feature media uses 16:10 with `object-fit: contain` to preserve supplied content.

## Elevation & Depth

Tonal surfaces and thin borders establish most depth. App cards retain a soft low shadow and menus use a broader raised shadow. Home media cards are flat at rest; only the orange entry action has a soft accent glow and lifts by 2px on hover. The old simulated replay stage's heavy shadow is historical and is not a current Home pattern.

### Shadow Vocabulary

- **App low:** `0 8px 24px -20px rgba(0, 0, 0, .9)`; light variant `0 8px 24px -20px rgba(25, 35, 48, .35)`.
- **App raised:** `0 22px 52px -30px rgba(0, 0, 0, .95)`; light variant `0 22px 52px -30px rgba(25, 35, 48, .38)`.
- **Home action:** `0 12px 28px -16px rgba(255,107,0,.8)`; hover `0 18px 34px -17px rgba(255,107,0,.9)`.

**The Border First Rule.** Separate resting panels with tonal surfaces and thin borders. Preserve the restrained existing shadows on app panels and primary actions.

## Shapes

Small rectangular controls use the control radius (4px); app panels and the main demo frame use the panel radius (6px). The app ghost button is a confirmed softer exception (8px). Status badges, app language controls and user triggers use pill shapes; theme toggles and avatars are circular. Home cards keep their restrained 4px corners, 1px borders, and clipped media. Do not flatten these established shape variants into a single radius.

## Components

### Buttons

Orange primary actions carry dark text. App primary buttons have a 44px minimum height, 9px 15px padding, 6px corners and weight 800; hover is `#f07d0c`, active moves down 1px, and disabled uses .55 opacity. Home entry links use Chakra Petch 700 at 16px, 54px minimum height, 0 22px padding, 4px corners and the accent glow described above. Their hover transition lasts .2s; reduced motion removes it. Ghost buttons use panel fill, a thin border and 6px 12px padding, changing to secondary fill and CT border on hover.

Focus is a 2px cyan outline: 3px offset in the app, 4px in Home. Preserve the theme-scoped cyan source.

### Chips

Compact status and team badges use 12px bold text, 2px 9px padding and pill corners. CT badges tint blue at .16 alpha; T badges tint orange at .18 alpha. Text uses the theme-specific team ink. Status chips retain their green/rose/neutral semantic roles. App active language selection uses interactive fill and its corresponding ink.

### Cards / Containers

App panels use panel fill, 1px line borders, 6px corners, 16px 18px padding and the low app shadow. Home feature cards use Home panel fill, 1px borders, 4px corners and no resting shadow. Cyan border on hover or focus-within transitions over .18s; reduced motion removes it. Copy padding is 16px 18px 18px, becoming 18px at 520px. Explanations flex to keep links aligned within each row.

### Inputs / Fields

The app's compact player search is 36px high with 6px corners, canvas fill, a thin line border, and 0 9px 0 11px padding. Focus-within switches border and icon to interactive cyan and adds a 3px, 14%-cyan ring. Its input inherits the body font, uses 13.5px text, and has no independent border. Mobile expanded search is 44px high. This field is an application primitive; Home does not introduce a form.

### Navigation

The sticky application topbar uses a panel background and thin bottom border. Links are muted and semibold, with 6px 12px padding and 4px corners. Hover uses a quiet tonal fill; active uses cyan text, a faint cyan fill and cyan underline. Its narrow variants wrap and scroll. Home navigation is a separate spacious header: 14px medium text, soft foreground, cyan hover, and hidden section/sign-in links at 760px. Brand, theme and language controls remain visible.

### Recorded-media previews

The main recording has native controls, `preload="none"`, a poster and a caption separated by a thin border. Feature videos keep dark media beds in both themes. Their explicit play/pause button is 36px square on desktop and 44px at 760px; SVG icons use strokes, not font glyphs. Fine-pointer hover and keyboard-visible focus can start muted previews; explicit playback works on touch. Automatic play respects reduced motion. Offscreen previews pause and unload; hidden-tab previews pause. These behaviors belong with the media component.

## Do's and Don'ts

### Do:
- **Do** use the scoped light-theme text and interaction assignments when extending either surface.
- **Do** preserve the target mark, CS2 UNTITLED name, and Chakra Petch/Anuphan pairing.
- **Do** keep real media contained within its frame and retain explicit playback controls.
- **Do** carry keyboard focus and reduced-motion behavior into extensions.

### Don't:
- **Don't** substitute team CT/T marker colors for their theme-specific readable text inks.
- **Don't** use Home display sizing as the default for dense application pages.
- **Don't** treat unreferenced legacy replay styles as the current Home component system.

Not canonized or repaired: unreferenced legacy simulated replay components/CSS remain historical outside this Home extension; their staged statistics, glyph constructions and heavy frame shadow are not reusable Home rules. This record does not repair unrelated app drift or convert craft-floor defects into house style.

The pre-existing `.impeccable/design.json` is preserved byte-for-byte. It predates this Home extension; this document and the Home surface brief record the shipped additions without replacing that historical sidecar.
