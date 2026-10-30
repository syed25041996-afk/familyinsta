/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				brand: {
					50: '#fdf4f3',
					100: '#fbe6e4',
					200: '#f8d1cd',
					300: '#f2b1aa',
					400: '#e88378',
					500: '#dc5b4d',
					600: '#c84031',
					700: '#a83326',
					800: '#8b2d23',
					900: '#742b23'
				}
			},
			fontFamily: {
				sans: [
					'Inter',
					'system-ui',
					'-apple-system',
					'BlinkMacSystemFont',
					'Segoe UI',
					'Noto Sans Devanagari',
					'Noto Sans Kannada',
					'Noto Sans Tamil',
					'sans-serif'
				]
			}
		}
	},
	plugins: []
};
