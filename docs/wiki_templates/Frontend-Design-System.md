# Frontend Design System

The Lisan frontend design system lives in `frontend/src/components/ui/` and is shared by student and admin pages.

## Tokens

- Primary color: `#5d3587`
- Typography: h1, h2, h3, body, caption tokens are defined in `frontend/src/styles/global.css`
- Spacing: 4, 8, 16, 24, 32, 48, 64 px
- Border radius: small 4px, medium 8px, large 16px
- Shadows: light, medium, heavy

## Components

- `Button.jsx`: primary, secondary, danger variants; sm, md, lg sizes; supports loading and standard button props.
- `Input.jsx`: label, error message, slots for icons/actions, RTL-ready input layout, and standard input props.
- `Card.jsx`: reusable surface wrapper with tokenized radius, border, padding, and shadow.
- `Modal.jsx`: accessible dialog wrapper for future confirmation and alert flows.
- `Spinner.jsx`: compact loading indicator.

## Usage

Use these components for new screens before adding page-specific controls. Page styles should use the CSS variables in `global.css` instead of hardcoded colors, spacing, radii, or shadows.

## RTL and Languages

Hebrew and Arabic translations are in `frontend/src/i18n/`. The i18n setup sets `lang` and `dir="rtl"` globally whenever the selected language changes.
