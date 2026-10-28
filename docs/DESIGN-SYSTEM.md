# LifeOS design system (Phase 1 foundation)

Everything visual is built from a few shared pieces, so changing one place changes the whole app.

## Where things live
| What | File |
|---|---|
| Colours, font, shadows, motion tokens, animations, skeletons, reduced-motion | `client/src/index.css` |
| Shared components | `client/src/components/ui.jsx` |
| Count-up numbers | `client/src/hooks/useCountUp.js`, `client/src/utils/motion.js` |

## Tokens (`@theme` in index.css)
* **Brand colour**: `brand-50 … brand-700` (indigo today). Change them once to re-colour new components.
* **Font**: Inter (loaded in `index.html`) with a system fallback.
* **Shadows**: `shadow-sm/md/lg/xl` are redefined as soft, layered shadows, which refines every existing use.
* **Motion**: `ease-out-expo`, `ease-spring`; utilities `animate-fade-up`, `animate-scale-in`, `animate-pop`.

## Components (`ui.jsx`)
`Button` (variants `primary | secondary | ghost | soft | danger`, sizes `sm | md | lg`, `loading`, `icon`) ·
`Input / Select / Textarea` (label linked by id, `error` announced to screen readers) ·
`Card` (`interactive` = lifts on hover) · `Modal` (Esc, focus trap, focus restore, animated, `data-autofocus`) ·
`Badge` · `Spinner` · `EmptyState` · **`ErrorState`** · **`Skeleton / SkeletonText / SkeletonCard / SkeletonList`** ·
**`AnimatedNumber`** · **`ProgressBar`** · `StatCard` (`loading`, `animate`). Bold = new.

## Rules
1. Use these components before writing new markup. Controls are 40px tall (44px on phones).
2. Cards use `rounded-2xl`; controls use `rounded-xl`. These shapes sit in a CSS layer, so a page can still override them with its own `rounded-*` class.
3. Motion is short and subtle. Never animate layout-heavy elements. Everything respects `prefers-reduced-motion` automatically.
4. Show a **Skeleton** that matches the real layout while loading, an **EmptyState** when there is nothing, and an **ErrorState** (plain words + Try again) on failure. Log the technical error to the console.
5. Keyboard focus must stay visible. Do not add `outline-none` without adding a `focus-visible:ring-*`.
