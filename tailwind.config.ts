import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			sans: [
  				'Manrope',
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif',
  				'Apple Color Emoji',
  				'Segoe UI Emoji',
  				'Segoe UI Symbol',
  				'Noto Color Emoji'
  			],
  			display: [
  				'Manrope',
  				'sans-serif'
  			],
  			serif: [
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			],
  			mono: [
  				'Space Mono',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			]
  		},
  		colors: {
  			border: {
  				DEFAULT: 'hsl(var(--border))',
  				light: 'hsl(var(--border-light))'
  			},
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: {
  				DEFAULT: 'hsl(var(--background))',
  				secondary: 'hsl(var(--background-secondary))'
  			},
  			surface: 'hsl(var(--surface))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				dark: 'hsl(var(--primary-dark))',
  				hover: 'hsl(var(--primary-hover))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			accentdark: 'hsl(var(--accentdark))',
  			secondaryaccent: {
  				DEFAULT: 'hsl(var(--secondaryaccent))',
  				foreground: 'hsl(var(--secondaryaccent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				light: 'hsl(var(--card-light))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			forest: {
  				DEFAULT: 'hsl(var(--forest))',
  				light: 'hsl(var(--forest-light))'
  			},
  			sand: {
  				DEFAULT: 'hsl(var(--sand))',
  				dark: 'hsl(var(--sand-dark))'
  			},
  			terracotta: {
  				DEFAULT: 'hsl(var(--terracotta))',
  				dark: 'hsl(var(--terracotta-dark))'
  			},
  			earth: 'hsl(var(--earth))',
  			cream: 'hsl(var(--cream))',
  			// Custom accent colors for map markers and UI
  			pinesoft: 'hsl(var(--accent-pinesoft))',
  			aquateal: 'hsl(var(--accent-aquateal))',
  			skyblue: 'hsl(var(--accent-skyblue))',
  			lavenderslate: 'hsl(var(--accent-lavenderslate))',
  			softamber: 'hsl(var(--accent-softamber))',
  			blushorchid: 'hsl(var(--accent-blushorchid))',
  			wildviolet: 'hsl(var(--accent-wildviolet))',
  			mossgreen: 'hsl(var(--accent-mossgreen))',
  			coralred: 'hsl(var(--accent-coralred))',

  			// 2026 Redesign tokens — Pine + Paper
  			cream:    'hsl(var(--cream))',
  			paper:    'hsl(var(--paper))',
  			'paper-2': 'hsl(var(--paper-2))',
  			line:     'hsl(var(--line))',
  			'line-2': 'hsl(var(--line-2))',
  			ink: {
  				DEFAULT: 'hsl(var(--ink))',
  				pine:    'hsl(var(--ink-pine))',
  				2:       'hsl(var(--ink-2))',
  				3:       'hsl(var(--ink-3))',
  				ondark:  'hsl(var(--ink-on-dark))',
  			},
  			pine: {
  				1: 'hsl(var(--pine-1))',
  				2: 'hsl(var(--pine-2))',
  				3: 'hsl(var(--pine-3))',
  				4: 'hsl(var(--pine-4))',
  				5: 'hsl(var(--pine-5))',
  				6: 'hsl(var(--pine-6))',
  				7: 'hsl(var(--pine-7))',
  				8: 'hsl(var(--pine-8))',
  				9: 'hsl(var(--pine-9))',
  				DEFAULT: 'hsl(var(--pine-6))',
  			},
  			clay:  'hsl(var(--clay))',
  			sage:  'hsl(var(--sage))',
  			ember: 'hsl(var(--ember))',
  			water: 'hsl(var(--water))',

  			// Functional palette
  			pin: {
  				easy:       'hsl(var(--pin-easy))',
  				safe:       'hsl(var(--pin-safe))',
  				campground: 'hsl(var(--pin-campground))',
  				moderate:   'hsl(var(--pin-moderate))',
  				hard:       'hsl(var(--pin-hard))',
  			},
  			land: {
  				blm:        { DEFAULT: 'hsl(var(--land-blm-fill))',        stroke: 'hsl(var(--land-blm-stroke))' },
  				usfs:       { DEFAULT: 'hsl(var(--land-usfs-fill))',       stroke: 'hsl(var(--land-usfs-stroke))' },
  				nps:        { DEFAULT: 'hsl(var(--land-nps-fill))',        stroke: 'hsl(var(--land-nps-stroke))' },
  				statepark:  { DEFAULT: 'hsl(var(--land-statepark-fill))',  stroke: 'hsl(var(--land-statepark-stroke))' },
  				statetrust: { DEFAULT: 'hsl(var(--land-statetrust-fill))', stroke: 'hsl(var(--land-statetrust-stroke))' },
  				landtrust:  { DEFAULT: 'hsl(var(--land-landtrust-fill))',  stroke: 'hsl(var(--land-landtrust-stroke))' },
  			},
  			road: {
  				paved:     'hsl(var(--road-paved))',
  				passenger: 'hsl(var(--road-passenger))',
  				highclear: 'hsl(var(--road-highclear))',
  				fourwd:    'hsl(var(--road-fourwd))',
  				atv:       'hsl(var(--road-atv))',
  			},
  			// Refreshed decorative palette (lower-saturation v2)
  			'accent-sage-2':  'hsl(var(--accent-sage))',
  			'accent-mist':    'hsl(var(--accent-mist))',
  			'accent-sky':     'hsl(var(--accent-sky))',
  			'accent-iris':    'hsl(var(--accent-iris))',
  			'accent-amber-2': 'hsl(var(--accent-amber-soft))',
  			'accent-rose':    'hsl(var(--accent-rose))',
  			'accent-plum':    'hsl(var(--accent-plum))',
  			'accent-moss-2':  'hsl(var(--accent-moss))',
  			'accent-clay-2':  'hsl(var(--accent-clay-soft))',

  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'fade-in': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(10px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'slide-in': {
  				from: {
  					opacity: '0',
  					transform: 'translateX(-20px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateX(0)'
  				}
  			},
  			'pulse-soft': {
  				'0%, 100%': {
  					opacity: '1'
  				},
  				'50%': {
  					opacity: '0.7'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.5s ease-out forwards',
  			'slide-in': 'slide-in 0.4s ease-out forwards',
  			'pulse-soft': 'pulse-soft 2s ease-in-out infinite'
  		},
  		boxShadow: {
  			card: '0 4px 20px -4px hsl(var(--forest) / 0.1)',
  			'card-hover': '0 8px 30px -4px hsl(var(--forest) / 0.15)',
  			search: '0 8px 40px -8px hsl(var(--forest) / 0.2)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
