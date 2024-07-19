import "../styles/globals.css";

export const metadata = {
  title: "Table Notes",
  description: "Your note-taking copilot.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
