/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './tests/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dce7ff',
          200: '#c0d5ff',
          500: '#3b6ef5',
          600: '#2554e8',
          700: '#1d42c4',
          900: '#15286e',
        },
      },
    },
  },
  plugins: [],
};

