import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from './Toast'
import ThemeToggle from './ThemeToggle'
import './ThemeToggle.css'

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { showConfirm } = useToast()

  const isActive = (path: string) =>
    location.pathname === path ? 'nav-link active' : 'nav-link'

  const handleLogout = () => {
    showConfirm('确定要退出登录吗？', () => {
      logout()
      navigate('/login')
    })
  }

  return (
    <nav className="navbar">
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <Link to="/" className="navbar-brand">DingDang Cloud</Link>
        </div>
        <div className="navbar-nav">
          <Link to="/" className={isActive('/')}>控制台</Link>
          <Link to="/playground" className={isActive('/playground')}>API调试</Link>
          {user?.role === 'admin' && (
            <Link to="/admin" className={isActive('/admin')}>管理中心</Link>
          )}
          <span style={{
            color: 'var(--gray-500)', fontSize: '0.8rem',
            display: 'flex', alignItems: 'center', gap: '0.25rem'
          }}>
            {user?.username}
            {user?.role === 'admin' && (
              <span className="tag tag-admin"
                style={{ marginLeft: '0.25rem' }}>管理员</span>
            )}
          </span>
          <ThemeToggle />
          <button className="btn btn-secondary btn-sm"
            onClick={handleLogout}>
            退出
          </button>
        </div>
      </div>
    </nav>
  )
}