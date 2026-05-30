import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationPhase, setAnimationPhase] = useState<'lowering' | 'cat-enter' | 'press-switch' | 'retracting'>('lowering')

  const handleToggle = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setAnimationPhase('lowering')
    
    setTimeout(() => {
      setAnimationPhase('cat-enter')
    }, 1500)
    
    setTimeout(() => {
      setAnimationPhase('press-switch')
      toggleTheme()
    }, 2800)
    
    setTimeout(() => {
      setAnimationPhase('retracting')
    }, 3800)
    
    setTimeout(() => {
      setIsAnimating(false)
    }, 5000)
  }

  return (
    <div className="theme-toggle-container">
      <button 
        className="theme-toggle-btn"
        onClick={handleToggle}
        disabled={isAnimating}
        title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      
      {isAnimating && (
        <div className="theme-animation-overlay">
          {/* 灯的绳子 */}
          <div className={`lamp-rope ${animationPhase === 'retracting' ? 'retracting' : ''}`}>
            <div className="lamp-rope-line"></div>
          </div>
          
          {/* 灯 */}
          <div className={`lamp ${animationPhase === 'retracting' ? 'retracting' : ''}`}>
            <div className="lamp-top"></div>
            <div className="lamp-body">
              <div className={`lamp-switch ${animationPhase === 'press-switch' ? 'pressing' : ''}`}></div>
            </div>
            <div className={`lamp-light ${animationPhase === 'press-switch' ? 'on' : animationPhase === 'retracting' ? 'retracting' : ''}`}>
              <div className="light-rays"></div>
            </div>
          </div>
          
          {/* 小猫 */}
          <div className={`cat ${animationPhase}`}>
            <div className="cat-body">
              <div className="cat-head">
                <div className="cat-ear cat-ear-left"></div>
                <div className="cat-ear cat-ear-right"></div>
                <div className="cat-face">
                  <div className="cat-eye cat-eye-left"></div>
                  <div className="cat-eye cat-eye-right"></div>
                  <div className="cat-nose"></div>
                  <div className="cat-mouth"></div>
                </div>
              </div>
              <div className="cat-body-main"></div>
              <div className="cat-tail"></div>
              <div className="cat-paw cat-paw-front-left"></div>
              <div className="cat-paw cat-paw-front-right"></div>
              <div className="cat-paw cat-paw-back-left"></div>
              <div className="cat-paw cat-paw-back-right"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}