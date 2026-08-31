import { Outlet, Link } from 'react-router-dom'
import './App.css'

function App() {
  return (
    <div>
      <nav style={{ padding: '1rem', borderBottom: '1px solid var(--line)', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', margin: 0, padding: 0 }}>
          <li><Link to="/">Home</Link></li>
          <li><Link to="/about">About</Link></li>
        </ul>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/signup" className="btn btn-primary">Sign up</Link>
        </div>
      </nav>

      <main style={{ padding: '0 1rem' }}>
        <Outlet />
      </main>
    </div>
  )
}

export default App
