# Design Guidelines

This document details the visual style system for the light-themed, organic redesign of ShortAI.

## Color System (Nature & Earth Palettes)

We use soft beige and cream backgrounds with rich leaf and forest greens to create a clean, premium, food/nature-focused style.

### Color Tokens
- `--bg-base`: `#FBF5DD` — Base light beige/yellow background. (OKLCH: `oklch(0.96 0.04 88)`)
- `--bg-surface-1`: `#FFFDF7` — Lighter, warm off-white cream for card backgrounds. (OKLCH: `oklch(0.99 0.01 90)`)
- `--bg-surface-2`: `#E7E1B1` — Slightly darker beige/neutral for secondary elements/dividers. (OKLCH: `oklch(0.89 0.08 92)`)
- `--accent-primary`: `#306D29` — Vibrant leaf green for links, action buttons, progress bars. (OKLCH: `oklch(0.44 0.14 138)`)
- `--accent-dark`: `#0D530E` — Forest green for headings, high-contrast states, and primary actions. (OKLCH: `oklch(0.33 0.13 138)`)
- `--text-solid`: `#1C2E1A` — Very dark forest-black for body copy. (OKLCH: `oklch(0.20 0.04 138)`)
- `--text-subtle`: `rgba(13, 83, 14, 0.65)` — Semi-transparent forest green for captions.
- `--border-subtle`: `rgba(48, 109, 41, 0.15)` — Very light green-tinted borders.

---

## Typography

- **Font Stack - Headings**: `'Outfit'`, `'Playfair Display'`, `'Sora'`, serif/sans-serif
- **Font Stack - Body & Code**: `'Inter'`, system-ui, sans-serif

### Scale
- **Display 1 (Hero)**: `3.5rem` / `line-height: 1.15` / `font-weight: 800`
- **Heading 1**: `2.25rem` / `line-height: 1.2` / `font-weight: 700`
- **Heading 2**: `1.5rem` / `line-height: 1.3` / `font-weight: 700`
- **Heading 3**: `1.125rem` / `line-height: 1.4` / `font-weight: 600`
- **Body Standard**: `0.875rem` / `line-height: 1.5` / `font-weight: 400`
- **Caption/Small**: `0.75rem` / `line-height: 1.4` / `font-weight: 500`

---

## Spatial System
We use a strict 4px grid. Spacing tokens:
- `4px` (xs)
- `8px` (sm)
- `12px` (md)
- `16px` (lg)
- `24px` (xl)
- `32px` (xxl)

---

## Layout & Components

### Buttons
- **Primary Action**: Solid background `#306D29` (leaf green) with white text, transitioning to `#0D530E` on hover.
- **Secondary Action**: Border `1px solid #306D29`, transparent center, leaf-green text, with a light cream hover state.

### Cards & Container Panels
- Border radius of `12px`.
- Card background: `#FFFDF7` (clean warm cream).
- Divider/Border: `1px solid rgba(48, 109, 41, 0.15)`.

### Editor Track
- Timeline background: `#FBF5DD` with forest-green boundary ticks.
- Selection range: highlighted in a light green transparent wash `rgba(48, 109, 41, 0.12)`.
