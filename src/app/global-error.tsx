"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 40, background: "#f5f7fa", color: "#0f1b2a" }}>
        <h1 style={{ fontSize: 22 }}>The application could not load</h1>
        <p style={{ color: "#5b6b7f" }}>{error.message || "Unexpected error."}</p>
        {error.digest && <p style={{ color: "#5b6b7f", fontSize: 12 }}>Reference: {error.digest}</p>}
        <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", background: "#1f3952", color: "#fff", border: 0, borderRadius: 6 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
