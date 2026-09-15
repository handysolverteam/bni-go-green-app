/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Overrides Tailwind's built-in `slate` scale rather than adding a new palette name.
        // The app already uses `slate-*` utilities as its dark-theme neutral scale in ~800
        // places across 25 components (backgrounds, text, borders) — remapping the scale
        // itself cascades this navy palette everywhere that already uses it, with no risk of
        // missed spots from a manual per-file pass. Light mode is unaffected: it overrides
        // every dark surface via explicit `body.light-mode` rules in index.css (hardcoded
        // #ffffff/#0f172a etc. with !important), so it never actually renders these hex
        // values regardless of what they're set to here.
        //
        // Anchored on the 7 supplied reference shades (950/800/600/500/400/300/100); the
        // remaining 4 stops (900/700/200/50) are linear-interpolated between their neighbours
        // to keep the ramp smooth. 950 is the darkest reference shade, 50 the lightest tinted
        // just short of white so near-white text keeps full contrast.
        slate: {
          50: '#DBEAF3',
          100: '#BDD8E9',  // reference
          200: '#9CCBE9',
          300: '#7BBDE8',  // reference
          400: '#6EA2B3',  // reference
          500: '#4E8EA2',  // reference
          600: '#49769F',  // reference
          700: '#2A5C8A',
          800: '#0A4174',  // reference
          900: '#052F57',
          950: '#001D39',  // reference — darkest
        },
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        traffic: {
          green: '#22c55e',
          amber: '#f59e0b',
          red: '#ef4444',
          grey: '#9ca3af',
        },
        dark: {
          bg: '#001D39',
          card: 'rgba(5, 47, 87, 0.75)',
          border: 'rgba(255, 255, 255, 0.1)',
        }
      },
      backdropBlur: {
        xs: '2px',
        glass: '16px',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        glow: '0 0 20px rgba(34, 197, 94, 0.35)',
      }
    },
  },
  plugins: [],
}
