// Tokens mirror DESIGN.md (Realsee Galois New User Guide, alpha).
// Cool-blue instructional UI, modular cards, large radii, soft shadows.

export const colors = {
  // Canvas / surfaces
  background: '#f6f8fb',
  canvas: '#ffffff',
  surface: '#ffffff',
  surfaceSoft: '#eaf2ff',
  surfaceMuted: '#e9f8ef',
  outline: '#dbe4f0',

  // Brand blue (instructional signal)
  primary: '#2563eb',
  primaryStrong: '#1d4ed8',
  primarySoft: '#eaf2ff',
  primaryDeep: '#1e40af',
  onPrimary: '#ffffff',

  // Status
  success: '#16a34a',
  successSoft: '#e9f8ef',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  error: '#b91c1c',
  errorSoft: '#fee2e2',

  // Dark surfaces (deliverables / support)
  darkSurface: '#0f172a',
  darkPanel: '#111827',
  darkSurfaceMid: '#172033',
  darkOnSurface: '#ffffff',
  darkOnSurfaceMuted: '#cbd5e1',
  darkOnSurfaceSubtle: '#94a3b8',
  darkOutline: '#334155',

  // Ink scale on light
  onBackground: '#172033',
  ink: '#172033',
  inkDeep: '#0f172a',
  charcoal: '#1f2937',
  slate: '#475569',
  steel: '#64748b',
  stone: '#94a3b8',
  muted: '#cbd5e1',

  // Aliases used elsewhere in the app (kept for compatibility, mapped to new tones)
  hairline: '#dbe4f0',
  hairlineSoft: '#e6ecf5',
  hairlineStrong: '#b8c4d6',
  linkBlue: '#2563eb',
  linkBluePressed: '#1d4ed8',
  semanticSuccess: '#16a34a',
  semanticWarning: '#b45309',
  semanticError: '#b91c1c',
  onDark: '#ffffff',
  onDarkMuted: '#cbd5e1',
  onDarkSubtle: '#94a3b8',
  brandNavy: '#0f172a',
  brandNavyDeep: '#0a0f1d',
  brandNavyMid: '#172033',
  brandNavyHairline: '#334155'
} as const;

export const radius = {
  xs: '6px',
  sm: '10px',
  md: '14px',
  lg: '20px',
  xl: '24px',
  '2xl': '28px',
  '3xl': '32px',
  full: '9999px'
} as const;

export const spacing = {
  xxs: '4px',
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '20px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '40px',
  'section-sm': '44px',
  section: '72px',
  'section-lg': '96px',
  hero: '120px',
  gutter: '24px'
} as const;

export const shadow = {
  card: '0 18px 44px rgba(15, 23, 42, 0.08)',
  hover: '0 22px 52px rgba(15, 23, 42, 0.12)',
  panelDark: '0 22px 54px rgba(15, 23, 42, 0.24)',
  support: '0 22px 52px rgba(37, 99, 235, 0.20)',
  modal: '0 24px 64px rgba(15, 23, 42, 0.20)',
  mockup: '0 24px 64px rgba(15, 23, 42, 0.18)'
} as const;

type FontEntry = [string, { lineHeight: string; letterSpacing?: string; fontWeight?: string }];

export const fontSize: Record<string, FontEntry> = {
  'hero-title': ['56px', { lineHeight: '1.04', letterSpacing: '-1px', fontWeight: '900' }],
  'hero-display': ['56px', { lineHeight: '1.04', letterSpacing: '-1px', fontWeight: '900' }],
  'display-lg': ['48px', { lineHeight: '1.10', letterSpacing: '-0.5px', fontWeight: '900' }],
  'section-title': ['36px', { lineHeight: '1.15', letterSpacing: '-0.25px', fontWeight: '900' }],
  'heading-1': ['44px', { lineHeight: '1.10', fontWeight: '900' }],
  'heading-2': ['36px', { lineHeight: '1.15', fontWeight: '900' }],
  'heading-3': ['28px', { lineHeight: '1.20', fontWeight: '800' }],
  'card-title': ['22px', { lineHeight: '1.25', fontWeight: '900' }],
  'heading-4': ['22px', { lineHeight: '1.25', fontWeight: '800' }],
  'heading-5': ['18px', { lineHeight: '1.35', fontWeight: '700' }],
  subtitle: ['18px', { lineHeight: '1.55', fontWeight: '400' }],
  'body-lg': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
  'body-md': ['15px', { lineHeight: '1.6', fontWeight: '400' }],
  'body-md-medium': ['15px', { lineHeight: '1.6', fontWeight: '500' }],
  'body-sm': ['14px', { lineHeight: '1.55', fontWeight: '400' }],
  'body-sm-medium': ['14px', { lineHeight: '1.55', fontWeight: '500' }],
  caption: ['13px', { lineHeight: '1.45', fontWeight: '400' }],
  'caption-bold': ['13px', { lineHeight: '1.45', fontWeight: '700' }],
  'label-sm': ['12px', { lineHeight: '1.20', letterSpacing: '0.4px', fontWeight: '800' }],
  micro: ['12px', { lineHeight: '1.40', fontWeight: '600' }],
  'micro-uppercase': ['11px', { lineHeight: '1.40', letterSpacing: '1.2px', fontWeight: '800' }],
  'button-md': ['15px', { lineHeight: '1.30', fontWeight: '700' }]
};

export const fontFamily = {
  sans: [
    'Roboto',
    '-apple-system',
    'system-ui',
    'Segoe UI',
    'Helvetica',
    'Arial',
    'sans-serif'
  ]
} as const;
