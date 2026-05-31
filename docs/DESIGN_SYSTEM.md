# Lisan Design System

## Product Direction

Lisan should feel like a calm, premium AI learning product for beginner Hebrew learners who move between Arabic and Hebrew. The interface should communicate:

- trust
- gentle progress
- AI assistance without chaos
- RTL-first fluency
- clear learning focus instead of generic chatbot energy

## Visual Identity

### Core Palette

- `--color-primary`: `#6c4fd3`
- `--color-primary-700`: `#5435bc`
- `--color-primary-100`: `#f3efff`
- `--color-primary-50`: `#faf8ff`
- `--color-ink`: `#171327`
- `--color-ink-soft`: `#30284a`
- `--color-text`: `#2a2438`
- `--color-muted`: `#726985`
- `--color-border`: `#ded4f1`
- `--color-input`: `#f7f3ff`
- `--color-gold`: `#d7b96a`
- `--color-emerald`: `#2f8f7d`
- `--color-danger`: `#b42318`
- `--color-danger-soft`: `#fef3f2`

### Surface Rules

- Primary pages use layered soft gradients, not flat white.
- Main cards use translucent white with blur and soft borders.
- High-value actions use a violet gradient or a strong violet fill.
- Secondary actions stay bright, quiet, and elevated.

## Typography

### Fonts

- Body: `"Segoe UI", Arial, sans-serif`
- Display: `Georgia, "Times New Roman", serif`

### Scale

- Hero H1: `clamp(3rem, 6vw, 4.8rem)`
- Section H1/H2: `2.4rem` to `3.4rem`
- Card titles: `1.45rem` to `1.8rem`
- Body: `1rem`
- Caption/meta: `0.78rem` to `0.9rem`

### Rules

- No negative letter spacing.
- Display type reserved for hero moments and major surfaces.
- Compact panels use tighter body text and stronger label contrast.

## Spacing

- Base spacing scale uses `4 / 8 / 16 / 24 / 32 / 48 / 64`.
- Large page sections should breathe with `24px` to `32px` internal padding.
- Card groups should use `24px` gaps on desktop and `16px` on mobile.

## Radius

- Small controls: `12px` to `16px`
- Standard cards: `24px` to `32px`
- Pills and badges: `999px`

## Shadows

- Light: `0 10px 30px rgba(34, 24, 66, 0.08)`
- Medium: `0 18px 48px rgba(36, 22, 73, 0.14)`
- Heavy: `0 32px 80px rgba(25, 17, 49, 0.22)`

Use depth to separate layers, not to create ornamental clutter.

## Motion Language

Use `framer-motion` for major transitions and CSS for micro-feedback.

### Motion Rules

- Page entrance: fade + `y` from `18px`, about `0.45s`
- Card entrance: stagger children by `0.08s`
- Chat bubbles: subtle fade + `y` from `10px`
- Buttons/cards: hover lift `1px` to `2px` or scale `0.98` on tap
- Thinking indicator: dots pulse, never spin large elements
- Respect reduced motion in future polish if expanded further

### Avoid

- big parallax
- looping decorative animations
- glowing blobs/orbs
- anything that delays interaction

## Layout

### App Shell

- Use a centered page shell with a max width around `1200px`
- Keep top header in a glass surface
- Bottom nav stays floating and premium on mobile/tablet

### Student Home

- Two-column hero: message + AI preview
- Quick-start strip under hero
- Premium feature cards
- Clear CTA into chatbot

### Chat Page

- Sidebar for history on desktop
- Main hero strip above messages
- Composer fixed near bottom
- Empty state should teach the student what to ask

## Component States

### Buttons

- Primary: violet/gradient, white text
- Secondary: white/glass, violet text
- Ghost: low emphasis, clean border
- Disabled: reduced opacity, no movement

### Chat Bubbles

- User: violet gradient
- Assistant: white with soft border
- Fallback: warm tinted surface with clear but calm warning tone

### Error States

- Always friendly and instructional
- Never expose backend/provider wording

### Loading States

- Use short labels like “Lisan is thinking”
- Support with subtle dot pulse

## Chat UI Structure

- Hero badge
- Learning-trust bullets
- History sidebar
- Empty-state suggested prompts
- Animated message stack
- Floating composer

## RTL Behavior

- Primary experience is RTL-first
- Hebrew and Arabic text blocks should explicitly set `dir="rtl"`
- Mixed UI chrome can remain visually balanced with standard flex/grid
- Avoid left/right hard-coding when CSS logical directions are possible

## Figma Translation Notes

If this design system is copied into Figma:

1. Create color styles from the palette above
2. Create type styles for hero, section title, card title, body, caption
3. Create effects for light, medium, and heavy shadows
4. Create components for:
   - primary button
   - secondary button
   - glass card
   - chat bubble user
   - chat bubble assistant
   - history item
   - floating bottom nav
5. Use a 12-column desktop grid and 4-column mobile grid
6. Keep spacing based on the documented scale

## Notes

- No fake backend features should be implied by UI.
- Chat history and progress can be framed as learning support, not fabricated analytics.
- The chatbot remains the hero feature across all student-facing surfaces.
