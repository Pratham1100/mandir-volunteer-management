/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        mandir: {
          saffron: "#A6531B",
          deep: "#71340F",
          cream: "#FFF9EF",
          gold: "#C69A43",
          ink: "#33271F"
        }
      },
      boxShadow: { soft: "0 12px 35px rgba(73, 43, 18, .08)" }
    }
  },
  plugins: []
};