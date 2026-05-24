import type { Config } from 'tailwindcss';
import { colors, radius, shadow } from './src/ui/tokens.js';

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      borderRadius: radius,
      boxShadow: shadow,
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] }
    }
  }
} satisfies Config;
