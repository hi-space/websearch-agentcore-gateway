import type { Config } from 'tailwindcss';
import { colors, radius, shadow, spacing, fontSize, fontFamily } from './src/ui/tokens.js';

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      borderRadius: radius,
      boxShadow: shadow,
      spacing,
      fontSize,
      fontFamily
    }
  }
} satisfies Config;
