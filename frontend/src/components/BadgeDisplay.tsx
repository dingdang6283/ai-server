import { useState, useEffect } from 'react'
import { badgeApi } from '../services/api'
import type { Badge } from '../types/api'

interface BadgeDisplayProps {
  userId?: number
}

export default function BadgeDisplay({ userId }: BadgeDisplayProps) {
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    loadBadges()
  }, [])

  const loadBadges = async () => {
    setLoading(true)
    try {
      const res = await badgeApi.getBadges()
      setBadges(res.badges || [])
    } catch (err: any) {
      console.error('加载称号失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const normalEasyBadges = badges.filter(b => b.type === 'normal_easy')
  const normalHardBadges = badges.filter(b => b.type === 'normal_hard')
  const hackerBadges = badges.filter(b => b.type === 'hacker')

  const displayedBadges = showAll ? badges : badges.slice(0, 8)

  const getBadgeStyle = (type: string) => {
    if (type === 'normal_easy') {
      return {
        background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.15))',
        border: '1px solid rgba(59,130,246,0.3)',
        color: '#60a5fa'
      }
    }
    if (type === 'normal_hard') {
      return {
        background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(147,51,234,0.15))',
        border: '1px solid rgba(168,85,247,0.3)',
        color: '#c084fc'
      }
    }
    if (type === 'hacker') {
      return {
        background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.15))',
        border: '1px solid rgba(239,68,68,0.3)',
        color: '#f87171'
      }
    }
    return {}
  }

  if (loading) {
    return (
      <div style={{ 
        padding: '1rem', 
        textAlign: 'center', 
        color: 'var(--gray-400)',
        fontSize: '0.875rem'
      }}>
        <span className="spinner" style={{ marginRight: '0.5rem' }} />
        加载称号中...
      </div>
    )
  }

  if (badges.length === 0) {
    return (
      <div style={{ 
        padding: '1.5rem', 
        textAlign: 'center',
        color: 'var(--gray-500)',
        fontSize: '0.875rem'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏆</div>
        <div>暂无称号</div>
        <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--gray-600)' }}>
          多探索页面以解锁更多称号
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '0.75rem'
      }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gray-200)' }}>
          我的称号 ({badges.length})
        </h4>
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
          普通：{normalEasyBadges.length + normalHardBadges.length} | 黑客：{hackerBadges.length}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '0.5rem',
        marginBottom: '0.75rem'
      }}>
        {displayedBadges.map(badge => {
          const style = getBadgeStyle(badge.type)
          return (
            <div
              key={badge.id}
              className="badge-item"
              title={`${badge.name}\n${badge.desc}\n获得时间：${badge.unlocked_at || '未知'}`}
              style={{
                padding: '0.5rem 0.625rem',
                borderRadius: '0.375rem',
                background: style.background,
                border: style.border,
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
                minHeight: '48px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <span style={{ fontSize: '1rem' }}>{badge.icon}</span>
              <span style={{ 
                color: style.color,
                fontWeight: 600,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {badge.name}
              </span>
            </div>
          )
        })}
      </div>

      {badges.length > 8 && (
        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setShowAll(!showAll)}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
          >
            {showAll ? '收起' : `查看全部 ${badges.length} 个称号`}
          </button>
        </div>
      )}

      <style>{`
        .badge-item:hover {
          z-index: 1;
        }
      `}</style>
    </div>
  )
}
