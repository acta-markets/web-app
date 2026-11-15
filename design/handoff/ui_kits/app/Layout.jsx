// Acta App — main layout pieces
// Uses globals from Primitives.jsx: Button, Tag, InfoBox, Tabs, Token, icons.

function Logo({ size = 26, showWord = true }) {
  const base = window.__ACTA_ASSET_BASE || '../../assets';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: size * 1.23, height: size * 1.23, background: '#F0F0F0',
        WebkitMask: `url(${base}/logomark.svg) center/contain no-repeat`,
        mask: `url(${base}/logomark.svg) center/contain no-repeat`,
      }}/>
      {showWord && <div style={{
        width: size * 2.5, height: size * 0.85, background: '#F0F0F0',
        WebkitMask: `url(${base}/wordmark.svg) center/contain no-repeat`,
        mask: `url(${base}/wordmark.svg) center/contain no-repeat`,
      }}/>}
    </div>
  );
}

function Header({ page, onPage, connected, onConnect, scrolled }) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: scrolled ? 'rgba(18,18,18,0.8)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid #282828' : '1px solid transparent',
      transition: 'all 160ms ease',
    }}>
      <div style={{
        maxWidth: 1320, margin: '0 auto', padding: '16px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Logo/>
        <nav style={{ display: 'flex', gap: 4 }}>
          {[['earn','Earn'],['markets','Markets'],['portfolio','Portfolio']].map(([v,l])=>(
            <button key={v} onClick={()=>onPage(v)}
              style={{
                padding: '8px 14px', border: '1px solid',
                borderColor: page===v ? 'rgba(240,240,240,0.15)' : 'transparent',
                background: page===v ? 'rgba(240,240,240,0.1)' : 'transparent',
                color: page===v ? '#F0F0F0' : '#8A8A8A',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500, letterSpacing: '-0.02em',
                cursor: 'pointer',
              }}>{l}</button>
          ))}
        </nav>
        {connected ? (
          <Button variant="secondary" icon={<Wallet size={14} stroke="#F0F0F0" style={{marginRight:6}}/>}>0xA4…7F2</Button>
        ) : (
          <Button variant="primary" onClick={onConnect}>Connect</Button>
        )}
      </div>
    </header>
  );
}

function Hero({ title = 'Earn', subtitle = 'Get instant yield on your assets' }) {
  return (
    <section style={{
      position: 'relative', overflow: 'hidden',
      padding: '120px 40px 80px', textAlign: 'center',
    }}>
      {/* dotted grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(240,240,240,0.06) 1px, transparent 1px)',
        backgroundSize: '10px 10px', pointerEvents: 'none',
      }}/>
      {/* noise/logomark composite */}
      <div style={{
        position: 'absolute', inset: '-5%',
        background: `url(${window.__ACTA_ASSET_BASE || '../../assets'}/hero-texture.png) center/cover no-repeat`,
        opacity: 0.22, mixBlendMode: 'hard-light', filter: 'grayscale(1) contrast(1.1)',
        pointerEvents: 'none',
      }}/>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1 style={{
          fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600,
          fontSize: 114, margin: 0, letterSpacing: '-0.02em', color: '#F0F0F0', lineHeight: 1,
        }}>{title}</h1>
        <p style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 16, color: '#8A8A8A',
          margin: '16px 0 4px', letterSpacing: '-0.02em',
        }}>{subtitle}</p>
        <a href="#" style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#80C9B6',
          letterSpacing: '-0.02em', textDecoration: 'none',
        }}>How it works »</a>
      </div>
    </section>
  );
}

function StrategyTiles({ value, onChange }) {
  const tiles = [
    { id: 'call', label: 'Calls ↗', copy: 'Deposit the asset and earn premium. If spot finishes above your selected price, you sell there, otherwise you keep your asset' },
    { id: 'put',  label: 'Puts ↘',  copy: 'Deposit USDC and earn premium. If spot finishes below your selected price, you buy the asset there, otherwise you keep your USDC' },
  ];
  return (
    <div style={{
      position: 'relative', zIndex: 2, maxWidth: 980, margin: '-20px auto 0',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '0 40px',
    }}>
      {tiles.map(t => {
        const active = value === t.id;
        return (
          <button key={t.id} onClick={()=>onChange(t.id)} style={{
            padding: 24,
            background: active ? 'rgba(42,162,134,0.2)' : 'rgba(18,18,18,0.6)',
            backdropFilter: 'blur(16px)',
            border: '1px solid',
            borderColor: active ? '#2AA286' : '#282828',
            textAlign: 'center', cursor: 'pointer',
            transition: 'all 160ms ease',
          }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 20,
              color: active ? '#80C9B6' : '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 8,
            }}>{t.label}</div>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#8A8A8A',
              letterSpacing: '-0.02em', lineHeight: 1.45,
            }}>{t.copy}</div>
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 style={{
    fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 40,
    color: '#F0F0F0', letterSpacing: '-0.02em', margin: '80px 0 24px',
  }}>{children}</h2>;
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #282828', marginTop: 80, padding: '28px 40px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo/>
        <div style={{ display: 'flex', gap: 28 }}>
          {['About','Docs','Security','Telegram','X'].map(l => (
            <a key={l} href="#" style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#8A8A8A',
              letterSpacing: '-0.02em', textDecoration: 'none',
            }}>{l}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Logo, Header, Hero, StrategyTiles, SectionTitle, Footer });
