
# UI Redesign Plan — "Casa" Design Language

**Initiated**: 2026-05-28  
**Status**: ✅ Phase 1 complete (2026-05-28)  
**Why**: App is feature-complete and beta-ready. UI is stock MUI with identity crisis: green brand, purple hero gradient, pink CTAs, generic Inter/Roboto fonts, minimal animation. Needs pro-grade overhaul before real users.

---

## Design Direction

**Name**: "Casa" — Brazilian modernism meets premium domestic service.  
**Memorable element**: Feels built specifically for Brazil — warm, trusted, alive. Not another purple-gradient SaaS.  
**Tone**: Earthy luxury / organic premium.

### Color Palette
```
earth:       #1B3D2F   ← deep botanical green — primary brand
earthLight:  #2D6147
earthDark:   #0F2319
terra:       #C4532A   ← terracotta — CTA / action
terraLight:  #D4724F
terraDark:   #9E3E1A
cream:       #FAF8F4   ← warm ivory — page background (replaces #F8F9FA)
paper:       #F2EDE6   ← linen — card background (replaces white)
paperDark:   #E8E0D5   ← dividers, borders
stone:       #6B5E52   ← warm brown — secondary text (replaces #757575)
stoneLight:  #8B7B6E
gold:        #D4A853   ← champagne — premium accent
night:       #0D1F17   ← dark mode page bg
nightCard:   #132B1E   ← dark mode card bg
nightBorder: #1F3D2A   ← dark mode dividers
```

### Typography
- **Headings**: `Fraunces` (variable, optical sizes 9–144) — premium editorial serif with personality
- **Body/UI**: `DM Sans` (variable, opsz 9–40) — clean humanist sans
- **Prices/codes/timestamps**: `DM Mono`
- **Google Fonts URL**:
  ```
  https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..500&family=DM+Sans:opsz,wght@9..40,300..700&family=DM+Mono:wght@400;500&display=swap
  ```

### Motion
- Ease-out-expo entrances: `cubic-bezier(0.16, 1, 0.3, 1)`
- 300ms standard, 500ms page transitions — no bounce for data/action feedback
- Staggered list reveals: `delay: index * 0.06s`
- Shared element transitions on cards: Framer Motion `layoutId`
- Framer Motion v12 already installed — needs systematic wiring

### Texture
- 4% opacity grain overlay on cream backgrounds — adds depth without busyness

---

## Tech Stack Changes

### Definite (Phase 1)
| Change | Why |
|--------|-----|
| **CRA → Vite** | 10× faster HMR, unlocks TypeScript 5 (fixes `react-i18next` type workaround in CLAUDE.md), smaller bundles |
| **Complete MUI theme overhaul** | New palette/typography propagates to all 20 pages instantly, zero component-level changes needed |
| **Tailwind CSS v4** (alongside MUI) | Layout/structural utilities — avoids `sx` prop sprawl on non-MUI elements |
| **Framer Motion (already v12)** — systematic | `AnimatePresence` page transitions in `App.tsx`, staggered lists, bottom sheets |
| **Dark mode** | `paletteMode` toggle in `AuthContext`, localStorage persist |
| **Google Fonts** | Fraunces + DM Sans + DM Mono via `index.html` `<link>` |

### Bold Path (Phase 6, optional evaluation)
Replace MUI (except DatePicker + DataGrid) with **Radix UI primitives + shadcn/ui + Tailwind v4** for full design freedom. Evaluate after Phase 1 theme results.

---

## New `theme.ts` — Full Replacement

```typescript
// frontend/src/theme/theme.ts
import { createTheme } from '@mui/material/styles';

export const tokens = {
  color: {
    earth:      '#1B3D2F',
    earthLight: '#2D6147',
    earthDark:  '#0F2319',
    terra:      '#C4532A',
    terraLight: '#D4724F',
    terraDark:  '#9E3E1A',
    cream:      '#FAF8F4',
    paper:      '#F2EDE6',
    paperDark:  '#E8E0D5',
    stone:      '#6B5E52',
    stoneLight: '#8B7B6E',
    gold:       '#D4A853',
    night:      '#0D1F17',
    nightCard:  '#132B1E',
    nightBorder:'#1F3D2A',
  },
  font: {
    display: '"Fraunces", Georgia, serif',
    body:    '"DM Sans", system-ui, sans-serif',
    mono:    '"DM Mono", "Courier New", monospace',
  },
  radius: {
    sm:  '8px',
    md:  '16px',
    lg:  '24px',
    xl:  '32px',
    full:'9999px',
  },
} as const;

export const createAppTheme = (mode: 'light' | 'dark' = 'light') =>
  createTheme({
    palette: {
      mode,
      primary:    { main: tokens.color.earth,    light: tokens.color.earthLight, dark: tokens.color.earthDark,   contrastText: '#FFFFFF' },
      secondary:  { main: tokens.color.terra,    light: tokens.color.terraLight, dark: tokens.color.terraDark,   contrastText: '#FFFFFF' },
      background: {
        default: mode === 'dark' ? tokens.color.night     : tokens.color.cream,
        paper:   mode === 'dark' ? tokens.color.nightCard : tokens.color.paper,
      },
      text: {
        primary:   mode === 'dark' ? '#F0EBE3' : '#1A1410',
        secondary: mode === 'dark' ? '#A89B8E' : tokens.color.stone,
      },
      divider: mode === 'dark' ? tokens.color.nightBorder : tokens.color.paperDark,
    },
    typography: {
      fontFamily: tokens.font.body,
      h1: { fontFamily: tokens.font.display, fontWeight: 500 },
      h2: { fontFamily: tokens.font.display, fontWeight: 500 },
      h3: { fontFamily: tokens.font.display, fontWeight: 500 },
      h4: { fontFamily: tokens.font.display, fontWeight: 400 },
      h5: { fontFamily: tokens.font.body,    fontWeight: 600 },
      h6: { fontFamily: tokens.font.body,    fontWeight: 600 },
      button: { fontFamily: tokens.font.body, fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
    },
    shape: { borderRadius: 16 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.full,
            padding: '10px 28px',
            fontSize: '0.9375rem',
            boxShadow: 'none',
            '&:hover': { boxShadow: '0 4px 16px rgba(27,61,47,0.2)' },
          },
          containedPrimary:   { background: `linear-gradient(135deg, ${tokens.color.earthLight} 0%, ${tokens.color.earth} 100%)` },
          containedSecondary: { background: `linear-gradient(135deg, ${tokens.color.terraLight} 0%, ${tokens.color.terra} 100%)` },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.lg,
            border: `1px solid ${mode === 'dark' ? tokens.color.nightBorder : tokens.color.paperDark}`,
            boxShadow: mode === 'dark' ? '0 2px 12px rgba(0,0,0,0.4)' : '0 2px 16px rgba(27,61,47,0.06)',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper:     { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiChip:      { styleOverrides: { root: { borderRadius: tokens.radius.sm, fontWeight: 600 } } },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: tokens.radius.md,
              backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)',
            },
          },
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: tokens.radius.xl } } },
      MuiAppBar:  { styleOverrides: { root: { backgroundColor: mode === 'dark' ? tokens.color.nightCard : tokens.color.earth, boxShadow: 'none', borderBottom: `1px solid ${mode === 'dark' ? tokens.color.nightBorder : 'rgba(255,255,255,0.1)'}` } } },
    },
  });
```

---

## Mobile Strategy

1. **Bottom navigation bar** on `xs`/`sm` — replaces AppBar links. 5 tabs: Home, Buscar, Reservas, Mensagens, Perfil. Thumb-zone optimized.
2. **Bottom sheets** (via `vaul` package or custom Framer Motion drag) — `BookingDialog`, `QuoteRequestDialog`, `ReviewDialog` slide up from bottom on mobile.
3. **Floating "Filtros" FAB** on `FindProvidersPage` mobile → fullscreen filter drawer.
4. **Native page transitions**: slide-right for drill-down, slide-up for modals, fade for tabs.

---

## Page-by-Page Key Changes

### HomePage (highest impact)
- Remove purple gradient hero → editorial cream layout, large Fraunces heading
- Word-by-word animated headline (Framer Motion stagger on mount)
- Services grid: asymmetric paper-texture cards, terracotta hover border
- Replace pink CTA section → earth green + cream
- Alternating text/image feature rows (not icon grid)

### Navigation (global)
- Earth green AppBar, slim 64px, logo left / links center / avatar+notifs right
- Mobile: bottom navigation bar (MUI `BottomNavigation`)
- Notification badge: animated pulse ring on unread count

### FindProvidersPage (core UX)
- Provider cards: 4:3 photo ratio, Fraunces name, DM Mono price, star rating (not MUI `<Rating>`)
- AI Assistant as slide-out panel right side (desktop), bottom sheet (mobile)
- Mobile: full-width card stack, floating Filtros FAB, bottom sheet filters

### MyBookingsPage
- Card layout with colored left-border by status: gold=pending, green=confirmed, stone=cancelled

### BookingDialog
- Desktop: step indicator at top, terracotta primary button
- Mobile: bottom sheet (vaul), full viewport height, drag handle

### ProviderDashboardPage
- Fraunces stat numbers, terracotta for revenue, gold for rating
- Recharts: earth green fill, cream background, no gridlines

---

## Implementation Phases & Checklist

### Phase 1 — Foundation ✅ DONE (2026-05-28)
- [x] Vite migration: CRA removed, `vite` + `@vitejs/plugin-react` installed
  - `package.json` scripts: `"dev": "vite"`, `"build": "tsc --noEmit && vite build"`
  - `vite.config.ts` — port 3001, proxy /api + /socket.io → localhost:3000, `build.outDir: 'build'`
  - `index.html` moved to repo root (Vite standard), `%PUBLIC_URL%` removed
  - All `REACT_APP_*` → `VITE_*`, all `process.env.REACT_APP_*` → `import.meta.env.VITE_*`
  - TypeScript upgraded to ^5.4.0; `moduleResolution: "bundler"` in tsconfig.json
  - `react-app-env.d.ts` deleted; `react-i18next.d.ts` deleted (TS5 makes workaround unnecessary)
  - `vite-env.d.ts` added with `ImportMetaEnv` type declarations for all 3 env vars
  - Test files excluded from tsconfig (vitest migration is Phase 6)
- [x] Google Fonts added to `index.html`: Fraunces + DM Sans + DM Mono
- [x] `frontend/src/theme/theme.ts` fully replaced with `createAppTheme(mode)` + `tokens` export
- [x] `App.tsx`: `ColorModeContext` + `useColorMode` hook, `createAppTheme`, `GlobalStyles` grain texture
- [x] Dark mode toggle in Navigation (sun/moon icon), persists via localStorage
- [x] Smoke test: homepage ✅, login ✅, register ✅ — dark mode persists across routes

> **Phase reorder decided 2026-05-29**: "Restructure first, refine later."
> Original phases 2 (Shell) and 3 (Homepage) swapped. New execution order below.

### Phase 2 — Homepage + Provider Cards ✅ DONE (2026-05-29)
- [x] Hero: purple gradient killed → editorial split layout (text left, geometric composition right)
  - Terracotta eyebrow label, Fraunces h1 headline, cream bg, dot-grid texture overlay
  - Geometric shapes: terra circle, earth rotated square, gold dot, ring outline, accent lines
  - Terracotta pill CTA (ArrowForward icon), welcome-back branch for auth users
- [x] Services: flat icon grid → bento 4-col grid
  - Asymmetric spans (Limpeza + Reparos span 2 cols)
  - Colored left-border accent per service, faint Fraunces ordinal watermarks (01–06)
  - Left-aligned layout, `cursor: pointer` → navigates to /providers
- [x] Features: 6 checklist items → 3 pillar cards (grouped: Trust / Booking / Payments)
  - Faint large ordinal background, accent dots, Fraunces headings, bullet list, bottom accent bar
- [x] CTA: pink gradient killed → solid earth green (#1B3D2F)
  - Fraunces heading left, big stat numbers right (4.8/5 gold suffix, 50+, 100%)
  - Decorative concentric rings in background
- [x] `FindProvidersPage`: provider card full structural rebuild
  - 4:3 colored header block, Fraunces initials, deterministic accent per provider name
  - Price in DM Mono (frosted glass pill, bottom-right of header)
  - Trust badges (Verificado/Segurado) as frosted pills, bottom-left of header
  - Distance badge top-right of header
  - Custom star rendering (gold ★ chars + DM Mono rating), replaces MUI `<Rating>`
  - Service chips use card accent color
  - Two pill-button footer grid (Outlined quote / Contained secondary book)
  - Default coords changed to Florianópolis (-27.5954, -48.5480) to match seed data
- [x] Vite `server.host: true` — app now accessible on LAN (192.168.1.98:3001)

### Phase 3 — Core Bookings + Dashboard ⬜ (next session)
- [ ] `MyBookingsPage`: status-border card layout (gold=pending, green=confirmed, stone=cancelled)
- [ ] `ProviderDashboardPage`: Fraunces stat numbers, terracotta revenue, gold rating, styled Recharts
- [ ] `BookingDialog`: step indicator at top, terracotta primary button
- [ ] Provider-facing booking cards (accept/reject actions)

### Phase 4 — Navigation Shell ⬜
- [ ] `Navigation.tsx`: center links on desktop, slim 64px
- [ ] `BottomNavigation` component for mobile (xs/sm) — 5 tabs
- [ ] Page transition system: `<AnimatePresence>` in `App.tsx`, `motion.div` per route
- [ ] Notification badge pulse animation

### Phase 5 — Admin + Polish ✅ DONE (2026-05-30)
- [x] Admin layout: earth green sidebar, white text, gold active indicator, terra avatar
- [x] Consistent skeleton loading states — PageSkeleton component (dashboard/list/detail/cards variants), wired into ProviderDashboardPage + MyBookingsPage
- [x] Error boundary fallback UI in brand style — Fraunces heading, terra CTA button
- [x] 18 defects fixed from full CX audit (see audit report in session)

---

## Files Affected (Phase 1 — critical path)
| File | Change |
|------|--------|
| `frontend/package.json` | Replace react-scripts, add vite, upgrade TS to 5.x |
| `frontend/vite.config.ts` | NEW — Vite config |
| `frontend/index.html` | Move from `public/`, add Google Fonts `<link>` |
| `frontend/src/theme/theme.ts` | Full replacement with `createAppTheme` |
| `frontend/src/App.tsx` | ColorModeContext, GlobalStyles grain |
| `frontend/src/react-i18next.d.ts` | DELETE |
| All `REACT_APP_*` references | Rename to `VITE_*` |
| `frontend/.env.production` | Update env var name |
| `frontend/src/services/api.ts` | `VITE_API_URL` instead of `REACT_APP_API_URL` |
| `frontend/src/services/socketService.ts` | `VITE_API_URL` |
