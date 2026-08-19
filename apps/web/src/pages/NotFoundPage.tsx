import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="center-page">
      <section className="form-card">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>The page may have moved or you may not have access to it.</p>
        <Link className="primary-button" to="/">
          Go to dashboard
        </Link>
      </section>
    </main>
  );
}
