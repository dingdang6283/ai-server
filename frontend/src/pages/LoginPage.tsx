import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { authApi } from '../services/api'
import { useToast } from '../components/Toast'

type LoginType = 'password' | 'code'

export default function LoginPage() {
  const { login, register, setUser } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [loginType, setLoginType] = useState<LoginType>('password')
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('current_user')
    if (saved) {
      try {
        const user = JSON.parse(saved)
        if (user.api_key && user.is_verified) navigate('/')
      } catch {}
    }
  }, [navigate])

  const [loginAccount, setLoginAccount] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [codeAccount, setCodeAccount] = useState('')
  const [codeValue, setCodeValue] = useState('')
  const [codeSending, setCodeSending] = useState(false)
  const [codeCountdown, setCodeCountdown] = useState(0)

  const [regEmail, setRegEmail] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [regCode, setRegCode] = useState('')
  const [regCodeSending, setRegCodeSending] = useState(false)
  const [regCountdown, setRegCountdown] = useState(0)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [captchaInput, setCaptchaInput] = useState('')

  const isEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
  const isUsername = (val: string) => /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(val)

  const fetchCaptcha = async () => {
    try {
      const res = await authApi.getCaptcha()
      setCaptchaId(res.captcha_id)
      setCaptchaImage(res.image)
    } catch {
      // captcha load failed silently
    }
  }

  useEffect(() => {
    if (activeTab === 'register') {
      fetchCaptcha()
    }
  }, [activeTab])

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!loginAccount.trim()) {
      showToast('请输入邮箱或用户名', 'warning')
      return
    }
    setLoading(true)
    try {
      const userData = await login(loginAccount.trim(), loginPassword)
      if (userData && userData.is_verified) {
        navigate('/')
      } else {
        showToast('请先验证邮箱后再登录', 'warning')
      }
    } catch (err: any) {
      showToast(err.message || '登录失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!codeAccount.trim()) {
      showToast('请输入邮箱或用户名', 'warning')
      return
    }
    setLoading(true)
    try {
      const res = await authApi.loginWithCode({ email: codeAccount.trim(), code: codeValue })
      if (res.user && res.user.is_verified) {
        setUser(res.user)
        navigate('/')
      } else {
        showToast('请先验证邮箱后再登录', 'warning')
      }
    } catch (err: any) {
      showToast(err.message || '登录失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSendLoginCode = async () => {
    if (!codeAccount.trim()) {
      showToast('请输入邮箱或用户名', 'warning')
      return
    }
    setCodeSending(true)
    try {
      await authApi.sendVerification(codeAccount.trim(), 'login')
      showToast('验证码已发送到您的邮箱', 'success')
      setCodeCountdown(60)
      const timer = setInterval(() => {
        setCodeCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      showToast(err.message || '发送失败', 'error')
    } finally {
      setCodeSending(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!regUsername.trim()) {
      showToast('请输入用户名', 'warning')
      return
    }
    if (!isUsername(regUsername.trim())) {
      showToast('用户名格式不正确（2-20位，支持中英文、数字和下划线）', 'warning')
      return
    }
    if (!isEmail(regEmail.trim())) {
      showToast('请输入有效的邮箱地址', 'warning')
      return
    }
    if (regPassword !== regConfirmPassword) {
      showToast('两次输入的密码不一致', 'warning')
      return
    }
    if (regPassword.length < 8) {
      showToast('密码至少8位', 'warning')
      return
    }
    if (!/[a-z]/.test(regPassword)) {
      showToast('密码必须包含小写字母', 'warning')
      return
    }
    if (!/\d/.test(regPassword)) {
      showToast('密码必须包含数字', 'warning')
      return
    }
    if (!captchaInput.trim()) {
      showToast('请完成人机验证', 'warning')
      return
    }
    if (!regCode) {
      showToast('请先获取并输入邮箱验证码', 'warning')
      return
    }

    setLoading(true)
    try {
      const res = await register(
        regEmail, regPassword, regUsername,
        captchaId, captchaInput, regCode
      )
      if (res.user) {
        showToast('注册成功！', 'success')
        navigate('/')
      } else {
        showToast('注册成功，请登录', 'success')
        setActiveTab('login')
        setLoginAccount(regEmail)
      }
    } catch (err: any) {
      showToast(err.message || '注册失败', 'error')
      if (err.message?.includes('验证码')) {
        fetchCaptcha()
        setCaptchaInput('')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSendRegCode = async () => {
    if (!regEmail.trim()) {
      showToast('请输入邮箱', 'warning')
      return
    }
    if (!isEmail(regEmail.trim())) {
      showToast('请输入有效的邮箱地址', 'warning')
      return
    }
    if (!captchaInput.trim()) {
      showToast('请先完成图片验证码', 'warning')
      return
    }
    setRegCodeSending(true)
    try {
      await authApi.sendVerification(regEmail.trim(), 'register', captchaId, captchaInput.trim())
      showToast('验证码已发送到您的邮箱', 'success')
      setRegCountdown(60)
      const timer = setInterval(() => {
        setRegCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      if (err.message?.includes('验证码')) {
        fetchCaptcha()
        setCaptchaInput('')
      }
      showToast(err.message || '发送失败', 'error')
    } finally {
      setRegCodeSending(false)
    }
  }

  return (
    <div className="container" style={{
      display: 'flex', justifyContent: 'center',
      paddingTop: '4rem', minHeight: '100vh'
    }}>
      <div className="card" style={{
        width: '100%', maxWidth: 420, alignSelf: 'flex-start'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '2rem', fontWeight: 800,
            background: 'linear-gradient(135deg, #6366f1, #14b8a6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.25rem'
          }}>
            DingDang Cloud
          </div>
          <p style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>
            千问API 智能中转平台
          </p>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.7rem', marginTop: '0.15rem' }}>
            DingDang Cloud v4.0
          </p>
        </div>

        <div style={{
          display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)',
          marginBottom: '1.5rem'
        }}>
          {(['login', 'register'] as const).map(t => (
            <button key={t}
              onClick={() => { setActiveTab(t); setError(''); setSuccess('') }}
              style={{
                flex: 1, padding: '0.625rem', background: 'none', border: 'none',
                color: activeTab === t ? 'var(--primary-500)' : 'var(--gray-400)',
                borderBottom: activeTab === t
                  ? '2px solid var(--primary-500)'
                  : '2px solid transparent',
                cursor: 'pointer', fontWeight: activeTab === t ? 600 : 400,
                fontSize: '0.875rem', fontFamily: 'inherit',
                transition: 'all 0.2s'
              }}>
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {activeTab === 'login' && (
          <>
            <div style={{
              display: 'flex', gap: '0.5rem', marginBottom: '1rem',
              padding: '0.5rem',
              background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem'
            }}>
              <button onClick={() => setLoginType('password')}
                style={{
                  flex: 1, padding: '0.5rem',
                  background: loginType === 'password'
                    ? 'var(--primary-500)' : 'transparent',
                  border: 'none', borderRadius: '0.375rem',
                  color: loginType === 'password' ? 'white' : 'var(--gray-400)',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500
                }}>
                密码登录
              </button>
              <button onClick={() => setLoginType('code')}
                style={{
                  flex: 1, padding: '0.5rem',
                  background: loginType === 'code'
                    ? 'var(--primary-500)' : 'transparent',
                  border: 'none', borderRadius: '0.375rem',
                  color: loginType === 'code' ? 'white' : 'var(--gray-400)',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500
                }}>
                验证码登录
              </button>
            </div>

            {loginType === 'password' && (
              <form onSubmit={handlePasswordLogin}>
                <div className="form-group">
                  <label className="label">邮箱 / 用户名</label>
                  <input className="input" type="text"
                    placeholder="请输入邮箱或用户名"
                    value={loginAccount}
                    onChange={e => setLoginAccount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="label">密码</label>
                  <input className="input" type="password" placeholder="请输入密码"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)} required />
                </div>
                <button className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.5rem' }}
                  disabled={loading}>
                  {loading
                    ? <><span className="spinner" /> 登录中...</>
                    : '登录'}
                </button>
              </form>
            )}

            {loginType === 'code' && (
              <form onSubmit={handleCodeLogin}>
                <div className="form-group">
                  <label className="label">邮箱 / 用户名</label>
                  <input className="input" type="text"
                    placeholder="请输入邮箱或用户名"
                    value={codeAccount}
                    onChange={e => setCodeAccount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="label">验证码</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input className="input" type="text"
                      placeholder="请输入6位验证码" maxLength={6}
                      value={codeValue}
                      onChange={e => setCodeValue(
                        e.target.value.replace(/\D/g, ''))} required />
                    <button type="button" className="btn btn-secondary"
                      onClick={handleSendLoginCode}
                      disabled={codeSending || codeCountdown > 0}>
                      {codeCountdown > 0
                        ? `${codeCountdown}s`
                        : (codeSending ? '发送中...' : '获取验证码')}
                    </button>
                  </div>
                </div>
                <button className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.5rem' }}
                  disabled={loading}>
                  {loading
                    ? <><span className="spinner" /> 登录中...</>
                    : '验证码登录'}
                </button>
              </form>
            )}
          </>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label className="label">
                用户名
                <span style={{ color: 'var(--gray-500)',
                  fontSize: '0.7rem', marginLeft: '0.375rem' }}>
                  (2-20位, 中英文数字和下划线)
                </span>
              </label>
              <input className="input" type="text" placeholder="请输入用户名"
                value={regUsername}
                onChange={e => setRegUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="label">邮箱</label>
              <input className="input" type="email" placeholder="请输入邮箱"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="label">密码（至少8位，需包含小写字母和数字）</label>
              <input className="input" type="password" placeholder="至少8位，需包含小写字母和数字"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                minLength={8} required />
            </div>
            <div className="form-group">
              <label className="label">确认密码</label>
              <input className="input" type="password" placeholder="请再次输入密码"
                value={regConfirmPassword}
                onChange={e => setRegConfirmPassword(e.target.value)}
                minLength={8} required />
            </div>
            <div className="form-group">
              <label className="label">图片验证码</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {captchaImage ? (
                  <img src={captchaImage}
                    onClick={fetchCaptcha}
                    style={{ borderRadius: '0.375rem', cursor: 'pointer',
                      width: '100%', height: 'auto',
                      border: '1px solid rgba(255,255,255,0.1)' }}
                    alt="验证码" title="点击刷新" />
                ) : (
                  <div style={{ width: '100%', height: 120,
                    background: 'rgba(0,0,0,0.2)', borderRadius: '0.375rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                    加载中...
                  </div>
                )}
                <input className="input" type="text" placeholder="输入验证码"
                  maxLength={6} value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  style={{ width: '100%' }} required />
              </div>
            </div>
            <div className="form-group">
              <label className="label">邮箱验证码</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="input" type="text"
                  placeholder="输入6位验证码" maxLength={6}
                  value={regCode}
                  onChange={e => setRegCode(
                    e.target.value.replace(/\D/g, ''))} required />
                <button type="button" className="btn btn-secondary"
                  onClick={handleSendRegCode}
                  disabled={regCodeSending || regCountdown > 0}>
                  {regCountdown > 0
                    ? `${regCountdown}s`
                    : (regCodeSending ? '发送中...' : '获取验证码')}
                </button>
              </div>
            </div>
            <button className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={loading}>
              {loading
                ? <><span className="spinner" /> 注册中...</>
                : '注册'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}