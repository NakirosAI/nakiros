# Nakiros UI/UX Design Specification (App + Landing)

## Product Direction
- Nakiros is visual-first orchestration, not CLI-first.
- Users pilot projects, context, and specialized agents from one interface.
- Agents are embedded by default and each agent is role-focused.
- Tone: technical, direct, precise, no over-marketing.

## Design Tokens
- `#080808`: page background
- `#111111`: card/surface
- `#1A1A1A`: borders/separators
- `#0D9E9E`: primary accent
- `#2ECFCF`: highlight accent
- `#F0F0F0`: primary text
- `#FF8E8E`: error

### Usage
- Primary CTA: `#0D9E9E`, hover `#2ECFCF`
- Secondary button: bg `#111111`, border `#1A1A1A`, hover border `#0D9E9E`
- Muted text: `#F0F0F0/70`
- Helper text: `#F0F0F0/50`
- Metadata: `#F0F0F0/30`

## Typography
- Titles/headings/key labels: `Space Mono`
- Body/general UI: `DM Sans`

## Layout
- Main container: `max-w-7xl`
- Showcase: `max-w-5xl`
- Early access: `max-w-2xl`
- Standard section spacing: `py-24`
- Social proof: `py-12`

## Components
- Navbar: fixed, `#080808/95`, blur, bottom border `#1A1A1A`.
- Buttons:
  - Primary: rounded-lg, teal background, teal hover glow.
  - Secondary: dark surface, bordered.
- Cards:
  - Dark surfaces with subtle borders and rounded corners.
  - Hover states increase border contrast and accent cues.
- Inputs:
  - Dark surface, dark border, focus border `#0D9E9E`.
  - Success `#2ECFCF`, error `#FF8E8E`.
- Language selector:
  - Compact dark segmented control, hover/focus on accent.

## Motion
- Subtle, purposeful, technical.
- Emphasize orchestration/data flow.
- Avoid playful/noisy motion.

## i18n
- Languages: EN and FR.
- Language switch in top navbar.
- No mixed-language states.
- Locale files target:
  - `src/i18n/locales/en.json`
  - `src/i18n/locales/fr.json`
