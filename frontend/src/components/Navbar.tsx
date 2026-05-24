import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from './Toast'
import { useTheme } from '../context/ThemeContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { showConfirm } = useToast()
  const { theme, toggleTheme } = useTheme()

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
        <Link to="/" className="navbar-brand">DingDang Cloud</Link>
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
          <button className="btn btn-sm"
            onClick={toggleTheme}
            style={{ background: 'transparent', border: '1px solid var(--gray-600)',
              color: 'var(--gray-300)', cursor: 'pointer', fontSize: '1rem',
              lineHeight: 1, padding: '0.25rem 0.5rem' }}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="btn btn-secondary btn-sm"
            onClick={handleLogout}>
            退出
          </button>
        </div>
      </div>
    </nav>
  )
}