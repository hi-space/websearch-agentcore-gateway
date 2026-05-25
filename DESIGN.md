---
version: alpha
name: Realsee Galois New User Guide
description: "Professional LiDAR onboarding page with cool-blue instructional UI, modular cards, and high-clarity workflow storytelling."
meta:
  source_url: "https://www.realsee.ai/pages/galois-new-user-guide"
  extracted_on: "2026-05-15"
  extraction_method: "HTML/CSS structure parsing from live page"
colors:
  background: "#f6f8fb"
  on-background: "#172033"
  surface: "#ffffff"
  surface-soft: "#eaf2ff"
  surface-muted: "#e9f8ef"
  outline: "#dbe4f0"
  primary: "#2563eb"
  primary-strong: "#1d4ed8"
  primary-soft: "#eaf2ff"
  success: "#16a34a"
  success-soft: "#e9f8ef"
  dark-surface: "#0f172a"
  dark-panel: "#111827"
  dark-on-surface: "#ffffff"
  dark-on-surface-muted: "#cbd5e1"
typography:
  font-primary: "Roboto, sans-serif"
  hero-title:
    fontFamily: "Roboto, sans-serif"
    fontSize: "56px"
    fontWeight: 900
    lineHeight: 1.04
  section-title:
    fontFamily: "Roboto, sans-serif"
    fontSize: "36px"
    fontWeight: 900
    lineHeight: 1.15
  card-title:
    fontFamily: "Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 900
    lineHeight: 1.25
  body-lg:
    fontFamily: "Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label-sm:
    fontFamily: "Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.2
rounded:
  card: "20px"
  card-lg: "24px"
  panel: "28px"
  pill: "999px"
spacing:
  page-gutter-mobile: "16px"
  page-gutter-desktop: "24px"
  section-gap-mobile: "44px"
  section-gap-desktop: "72px"
  card-padding-mobile: "22px"
  card-padding-desktop: "24px"
layout:
  container-max: "1180px"
  mobile-breakpoint: "699px"
  tablet-breakpoint-min: "700px"
  desktop-breakpoint: "990px"
motion:
  hover-fast: "180ms"
  hover-normal: "200ms"
  flow-duration: "18s"
  easing-standard: "ease"
shadows:
  card: "0 18px 44px rgba(15, 23, 42, 0.08)"
  panel-dark: "0 22px 54px rgba(15, 23, 42, 0.24)"
  support: "0 22px 52px rgba(37, 99, 235, 0.2)"
components:
  hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-background}"
    rounded: "{rounded.panel}"
    borderColor: "{colors.outline}"
    shadow: "{shadows.card}"
    minHeightDesktop: "468px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    typography: "{typography.body-md}"
    height: "48px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.on-background}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.pill}"
    typography: "{typography.body-md}"
    height: "48px"
    padding: "0 20px"
  journey-step-badge:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "50%"
    sizeDesktop: "74px"
  journey-step-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-background}"
    rounded: "{rounded.card-lg}"
    paddingDesktop: "30px 34px"
  resource-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-background}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.card}"
    paddingDesktop: "22px"
  deliverables-panel:
    backgroundGradient: "linear-gradient(145deg, #172033 0%, #0f172a 58%, #111827 100%)"
    textColor: "{colors.dark-on-surface}"
    rounded: "{rounded.panel}"
    shadow: "{shadows.panel-dark}"
  faq-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-background}"
    borderColor: "{colors.outline}"
    rounded: "{rounded.card}"
  support-panel:
    backgroundGradient: "linear-gradient(135deg, #1e40af 0%, #2563eb 58%, #172033 100%)"
    textColor: "#ffffff"
    rounded: "{rounded.panel}"
    shadow: "{shadows.support}"
content_structure:
  sections:
    - hero
    - onboarding-journey
    - capture-standards
    - quick-access-resources
    - deliverables-showcase
    - faq-troubleshooting
    - support-cta
  journey_steps:
    - setup
    - hardware
    - connection
    - capture
    - deliver
    - refine
    - cloud
---

## Overview
Realsee Galois New User Guide is a conversion-oriented onboarding page for first-time LiDAR capture users. The interface combines instructional clarity with product confidence: light neutral canvas, dense modular cards, and controlled blue emphasis for guidance, navigation, and action.

The visual tone is professional and operational, not marketing-heavy. Information is grouped into sequential workflow blocks, practical resources, and troubleshooting support so users can move from installation to final deliverables without ambiguity.

## Design Intent
The page should feel like a field operations manual rendered as a modern web product.

- Prioritize scanability over decorative complexity.
- Keep hierarchy explicit: hero, process, standards, resources, outputs, troubleshooting.
- Use blue as the dominant instructional signal color.
- Reserve dark high-contrast panels for "outcome/value" blocks (deliverables, support).

## Foundations

### Color System
The palette is cool, technical, and trust-oriented.

- Light background and white cards establish reading comfort.
- Blue family (`#2563eb`, `#1d4ed8`, `#eaf2ff`) drives action and orientation.
- Green family (`#16a34a`, `#e9f8ef`) communicates checklist correctness.
- Dark gradients (`#172033` → `#0f172a` → `#111827`) emphasize final outputs.

### Typography
Roboto is used as a single-family system for consistency across instructional and product UI contexts.

- Heavy weights (800/900) are used for section titles and CTA emphasis.
- Body copy maintains generous line height for long-form operational guidance.
- Small labels remain compact but bold for quick category parsing.

### Shape and Elevation
Rounded geometry and soft shadows create approachable but structured information blocks.

- Card radii: 20-24px.
- Panel radius: 28px.
- Shadows are soft and broad to separate zones without harsh contrast.

## Layout and Responsiveness

### Desktop (`>= 990px`)
- Hero: two-column composition with visual background support.
- Journey: `4 + 3` step topology with animated dashed path.
- Resource cards: 4-column grids.
- Deliverable chips: 3-column grid.

### Tablet (`700px - 989px`)
- Resource and content grids collapse to 2 columns.
- Priority cards can span full width.

### Mobile (`<= 699px`)
- Single-column flow.
- CTA buttons become full width.
- VR showcase shifts to portrait ratio (`9:16`) for device ergonomics.

## Components

### Hero
- Eyebrow + headline + instructional paragraph + dual CTA.
- Must immediately answer: what this page is, who it is for, what to do first.

### Journey Step Cards
- Numbered sequence badges (`01`-`07`) with icon-coded labels.
- Hover lift interaction supports affordance without distracting from reading.
- Animated path indicates end-to-end workflow continuity.

### Checklist Cards
- Green check icon + concise operational rules.
- Used for "in-field execution" standards (distance, route, positioning).

### Resource Cards
- Structure: icon, micro-label, title, concise description, directional CTA.
- Grouped by task family: Capture, Console/Edit, Downloads.

### Deliverables Panel
- Dark emphasis section for value realization.
- Clickable chips switch or open output examples.
- Embedded VR preview supports immediate trust-building.

### FAQ Accordion
- `details/summary` pattern with explicit `+ / -` state symbol.
- Each item includes diagnosis, action path, and deep-link to full guide.

### Support CTA
- Final escalation zone with high contrast and clear support actions.
- Secondary action uses white-background inversion for contrast balance.

## Interaction and Motion
- Journey path animation: continuous dashed flow (`18s linear infinite`).
- Card hover: subtle `translateY` lift for discoverability.
- Resource CTA hover: slight `translateX` to reinforce "go deeper".
- Keep all motion short, meaningful, and operationally calm.

## Content Model (DesignMD-friendly)
- Hero value proposition
- Process map (7-step)
- Standards and checks
- Actionable resource matrix
- Deliverable proof block
- Troubleshooting knowledge base
- Support conversion block

## Implementation Guidance
- Convert `--guide-*` variables into your global token layer first.
- Implement components in this order: `hero -> journey -> resource-card -> faq -> deliverables-panel`.
- Keep content externalized (CMS/JSON) so links and FAQ can evolve without style drift.

## Do / Don't
- Do preserve the blue-led instructional hierarchy.
- Do keep heavy typography only for headings and CTA anchors.
- Do maintain large radii and soft shadows for modular clarity.
- Don't replace operational cards with generic marketing banners.
- Don't introduce multiple accent families that weaken process signaling.
- Don't over-animate; this page is a workflow guide, not a showcase microsite.
