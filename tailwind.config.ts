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
  				'DM Sans',
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif',
  				'Apple Color Emoji',
  				'Segoe UI Emoji',
  				'Segoe UI Symbol',
  				'Noto Color Emoji'
  			],
  			display: [
  				'DM Sans',
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
  			background: 'hsl(var(--background))',
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
