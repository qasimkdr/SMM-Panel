# Design system

Direction: **warm paper & ink with one ember accent**. Calm, editorial and tactile. It deliberately avoids the "generated" look: no purple gradients, no glassmorphism, no emoji, no identical three-card rows. Depth comes from layered warm shadows, CSS 3D and a subtle paper grain.

All tokens live in `apps/web/app/globals.css` as CSS variables, mapped to Tailwind utilities via `@theme inline`. Never hard-code hex values in components.

## Color tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #f6f5f2 | #0f0e0d | Page background |
| `bg-subtle` | #efede8 | #151413 | Sidebars, wells, skeletons |
| `surface` / `surface-2` | #ffffff / #fbfaf8 | #1a1917 / #201f1c | Cards / card headers |
| `line` / `line-strong` | #e6e3dc / #d6d2c8 | #2b2926 / #3b3834 | Borders |
| `ink` / `ink-2` / `ink-3` | #1b1a17 / #45423b / #6b675f | #f2f0eb / #c9c4ba / #8e897f | Text: primary / secondary / muted |
| `accent` | #c4461c (ember) | #f07a4e | Primary actions, focus, highlights |
| `accent-soft` / `accent-line` | #f8e6dd / #efc6b3 | #2c1910 / #5a2f1d | Tinted backgrounds |
| `success` `warning` `danger` `info` (+ `-soft`) | | | Order statuses and feedback |

Contrast (WCAG AA): ink/bg 15.9:1, ink-3/bg 5.2:1, white on accent 4.95:1, dark-mode accent text 7:1.

## Typography
- **Geist Sans** for UI and headings; **Geist Mono** only for IDs, code, links and small data labels.
- Money and counts use the sans font with `tabular` (tabular figures).
- Headings: `font-semibold`, tight tracking (`-0.03em`); hero uses `clamp()` sizing.
- Eyebrow labels: mono, 12px, uppercase, `tracking-[0.14em]`, accent color.

## Shape & depth
- Radii: `sm 8` · `md 12` · `lg 16` (cards) · `xl 22` (large panels). Buttons 9–13px.
- Shadows: `shadow-1` (resting), `shadow-2` (cards), `shadow-3` (lifted / hovered / floating), `shadow-press` (inset, active).

## Motion
- Easing: `--ease-out-soft` cubic-bezier(.22,1,.36,1) for nearly everything; springs only for drawers.
- Durations: 90–200ms for press/hover, 450–700ms for entrances.
- Only `transform` and `opacity` animate. `prefers-reduced-motion` disables tilt, marquee and entrance motion.

## Components
| Component | File | Notes |
|---|---|---|
| Button | `components/ui/button.tsx` | `primary` / `secondary` / `ghost` / `danger`; `sm` / `md` / `lg`; `loading`. Lifts 1px on hover, presses in on active. `buttonClass()` styles links. |
| Field | `components/ui/input.tsx` | Label, hint, error (`aria-invalid`, `aria-describedby`), optional trailing slot. |
| TiltCard | `components/ui/tilt-card.tsx` | 3D tilt following the mouse (rAF → CSS vars), cursor glare, `pressable` press-in. Children can use `depth-1/2/3` to float above the surface. Disabled for touch and reduced motion. |
| Reveal / Stagger | `components/ui/reveal.tsx` | Fade and rise when scrolled into view; staggered children. |
| Badge | `components/ui/badge.tsx` | Tones: neutral, accent, success, warning, danger, info. |
| Logo | `components/ui/logo.tsx` | Custom mark: two offset planes with an ember core. |
| ThemeToggle | `components/theme-toggle.tsx` | Light / dark / system, applied before paint (no flash). |
| Shell | `components/dashboard/shell.tsx` | Sidebar with animated active indicator, mobile drawer, balance pill. Shared by the user and admin panels. |

## Do / don't
| Do | Don't |
|---|---|
| Keep tilt subtle (3–8°) | Tilt more than 10° or tilt whole pages |
| Use one accent per view for the main action | Add new accent colors |
| Write specific, plain copy ("Refill if it drops") | Use filler ("supercharge", "seamless", "unleash") |
| Use empty states that say what happens next | Leave blank tables |
