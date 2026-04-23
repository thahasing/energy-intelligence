
import React from 'react'
import Head from 'next/head'
import Layout from '@/components/layout/Layout'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'How many solar projects are there?',
  'What is ERCOT region?',
  'Show me projects in Texas',
  'What does lifecycle stage mean?',
  'How do I search for wind projects?',
  'What is EIA approval?',
]

export default function ChatbotPage() {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I am your Energy Intelligence Assistant. I can help you understand renewable energy projects, navigate the dashboard, and answer questions about ERCOT, MISO, solar, wind, battery, and more. What would you like to know?'
    }
  ])
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text?: string) => {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I could not connect. Please make sure the backend is running.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <Head><title>AI Assistant · Energy Intelligence</title></Head>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>
            AI Assistant
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            Ask me anything about renewable energy projects, the dashboard, or how to find specific data.
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
          padding: '16px 0', marginBottom: 16
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: 'var(--b1)',
                  border: '1px solid rgba(34,197,94,0.25)', display: 'grid', placeItems: 'center',
                  fontSize: 14, flexShrink: 0, marginRight: 8, marginTop: 2
                }}>
                  ⚡
                </div>
              )}
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user' ? 'rgba(34,197,94,0.15)' : 'var(--bg2)',
                border: msg.role === 'user' ? '1px solid rgba(34,197,94,0.25)' : '1px solid var(--t5)',
                fontSize: 13, color: 'var(--tw)', lineHeight: 1.6,
                whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--b1)',
                border: '1px solid rgba(34,197,94,0.25)', display: 'grid', placeItems: 'center', fontSize: 14
              }}>⚡</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--g4)',
                    animation: 'pulse-dot 1.2s ease-in-out infinite',
                    animationDelay: i * 0.2 + 's'
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 8,
                  border: '1px solid var(--t5)', color: 'var(--t2)',
                  background: 'transparent', cursor: 'pointer', transition: 'all .15s'
                }}
                onMouseEnter={e => {
                  (e.target as HTMLElement).style.borderColor = 'rgba(34,197,94,0.3)'
                  ;(e.target as HTMLElement).style.color = 'var(--g4)'
                }}
                onMouseLeave={e => {
                  (e.target as HTMLElement).style.borderColor = 'var(--t5)'
                  ;(e.target as HTMLElement).style.color = 'var(--t2)'
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          display: 'flex', gap: 10, padding: '12px 14px',
          background: 'var(--bg2)', border: '1px solid var(--t5)', borderRadius: 14
        }}>
          <input
            className="input"
            style={{ flex: 1, background: 'transparent', border: 'none', padding: '0', fontSize: 13 }}
            placeholder="Ask about projects, regions, approvals..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          />
          <button
            className="btn-primary"
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{ opacity: loading || !input.trim() ? .4 : 1 }}
          >
            Send
          </button>
        </div>
      </div>
    </Layout>
  )
}
