import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import { ThemeProvider } from './context/ThemeContext'
import Navbar from './components/Navbar'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import AdminPanel from './pages/AdminPanel'
import Playground from './pages/Playground'
import ErrorPage from './pages/errors/ErrorPage'

function SkeletonScreen() {
  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <div className="skeleton skeleton-title" style={{ marginBottom: '1.5rem' }} />
      <div className="grid-2">
        <div>
          <div className="card">
            <div className="skeleton skeleton-line" style={{ width: '30%', marginBottom: '1rem' }} />
            <div className="skeleton-text">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" style={{ width: '75%' }} />
            </div>
          </div>
        </div>
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="skeleton skeleton-line" style={{ width: '40%', marginBottom: '1rem' }} />
            <div className="skeleton-text">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" style={{ width: '50%' }} />
            </div>
          </div>
          <div className="card">
            <div className="skeleton skeleton-line" style={{ width: '35%', marginBottom: '1rem' }} />
            <div className="skeleton-text">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return <SkeletonScreen />
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <div className="container" style={{ paddingTop: '2rem' }}><div className="alert alert-error">需要管理员权限</div></div>
  return <>{children}</>
}

function AppContent() {
  const { user, loading } = useAuth()

  return (
    <ThemeProvider>
      <ToastProvider>
        {user && !loading && <Navbar />}
        <div className="page-content" style={{ padding: '2rem 0' }}>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/playground" element={<ProtectedRoute><Playground /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />
            <Route path="/error/:code" element={<ErrorPage />} />
            <Route path="/400" element={<ErrorPage />} />
            <Route path="/401" element={<ErrorPage />} />
            <Route path="/403" element={<ErrorPage />} />
            <Route path="/404" element={<ErrorPage />} />
            <Route path="/409" element={<ErrorPage />} />
            <Route path="/423" element={<ErrorPage />} />
            <Route path="/429" element={<ErrorPage />} />
            <Route path="/500" element={<ErrorPage />} />
            <Route path="*" element={<ErrorPage />} />
          </Routes>
        </div>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}