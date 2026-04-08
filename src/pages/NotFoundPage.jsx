import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-grid" />

      <main className="login-container" style={{ gridTemplateColumns: '1fr', maxWidth: '400px' }}>
        <section className="login-auth-panel" style={{ borderRight: 'none', textAlign: 'center' }}>
          <h1 style={{ fontSize: '4rem', color: '#fff', marginBottom: '10px' }}>404</h1>
          <h2 style={{ color: '#fff', marginBottom: '20px' }}>Path Not Found</h2>
          <p className="muted" style={{ marginBottom: '30px' }}>The page you're looking for doesn't exist.</p>
          <Link to="/" className="login-submit" style={{ display: 'block', textDecoration: 'none' }}>
            Return Home
          </Link>
        </section>
      </main>
    </div>
  )
}
