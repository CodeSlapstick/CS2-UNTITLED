# CS2 UNTITLED

CS2 UNTITLED is the user-confirmed name of this CS2 demo-analysis application. User-facing navigation, login, Home, footer, document title and report attribution use this name.

Players and teams import `.dem` match files and review recorded match events and statistics. The public Home introduces the application and leads to Steam sign-in or the existing guest flow. It presents the capabilities already implemented; it must not invent results, professional comparisons, model accuracy or performance claims.

The confirmed Home workflow is: upload a demo → 2D replay → heatmap → economy → analysis → opening routes → PDF reports. Scoreboard remains an application feature but the user removed its Home preview. The two analysis tools are separate adjacent previews so that both supplied recordings are visible.

The user supplied `Media/demoweb1.mp4` for the main demonstration and seven GIFs in `Media/` for feature previews. Originals remain unchanged. Derived, web-sized assets and their source manifest live in `frontend/public/media/home/`.

The user restored the original Home slogan: “See the whole round before judging one moment” / “ดูให้ครบทั้งรอบ ก่อนสรุปจากจังหวะเดียว”. Home omits the Watch-the-demo navigation link, feature-introduction description and playback hint, and footer tagline at the user's request.

The existing navy, orange and cyan visual system, Chakra Petch headings, Anuphan body, Thai/English content and light/dark themes are the visual authority. The reference feature-card screenshot supplies a structural example; its wording, colors and unrelated product claims are not authorized content.

This task extends the existing Home and updates visible branding. It does not replace application behavior, authentication, permissions, stored match data or the existing visual identity. Route-specific composition and review evidence belong in `.impeccable/surfaces/frontend-src-homepage-tsx.md`.

Home precedes sign-in: visitors opening a protected app URL see Home first, then use its entry action to reach Login. The internal destination is preserved through sign-in. Logging out returns Home; the Login brand links Home. Direct Login links remain usable, including Steam error returns. The Login radar has no source-caption copy.
