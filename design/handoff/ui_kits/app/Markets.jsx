// Market cards, tables, and deposit sheet

function TokenAvatar({ symbol, size = 40 }) {
  const colors = {
    jitoSOL: { bg: '#F0F0F0', fg: '#121212' },
    JLP:     { bg: 'conic-gradient(from 200deg, #2AA286, #80C9B6, #2AA286 75%, #0A4A3C)', fg: '#F0F0F0' },
    BTC:     { bg: '#FF611B', fg: '#F0F0F0', glyph: '₿' },
    SOL:     { bg: '#14131F', fg: '#F0F0F0' },
    USDC:    { bg: '#2775CA', fg: '#F0F0F0', glyph: '$' },
  };
  const c = colors[symbol] || { bg: '#F0F0F0', fg: '#121212' };
  const label = c.glyph || (symbol.length > 3 ? symbol.slice(0,3) : symbol);
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: c.bg, color: c.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600,
      fontSize: size === 40 ? (c.glyph ? 18 : 11) : 10,
      letterSpacing: '-0.02em', flexShrink: 0,
    }}>{label}</div>
  );
}

function MarketCard({ symbol, apr, capFilled, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      position: 'relative', border: '1px solid #282828', padding: 0,
      background: '#121212', textAlign: 'left', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        height: 110, position: 'relative', overflow: 'hidden',
        background: '#0a0a0a',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `url(${window.__ACTA_ASSET_BASE || '../../assets'}/hero-texture.png) center/cover no-repeat`,
          opacity: 0.28, mixBlendMode: 'hard-light',
          filter: symbol === 'BTC' ? 'hue-rotate(-30deg) saturate(1.2)' : symbol === 'JLP' ? 'hue-rotate(140deg)' : 'grayscale(1)',
        }}/>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, #121212)'}}/>
        <div style={{ position: 'absolute', left: '50%', bottom: -20, transform: 'translateX(-50%)' }}>
          <TokenAvatar symbol={symbol} size={56}/>
        </div>
      </div>
      <div style={{ padding: '32px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 28,
          color: '#F0F0F0', letterSpacing: '-0.02em', textAlign: 'center',
        }}>{symbol}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#8A8A8A', letterSpacing: '-0.02em' }}>APR range</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 16, color: '#F0F0F0', letterSpacing: '-0.02em', marginTop: 4 }}>{apr}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#8A8A8A', letterSpacing: '-0.02em' }}>Cap filled</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 16, color: '#F0F0F0' }}>{capFilled}%</div>
              <div style={{ width: 60, height: 6, background: 'rgba(42,162,134,0.2)', border: '1px solid #2AA286' }}>
                <div style={{ width: `${capFilled}%`, height: '100%', background: '#2AA286' }}/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function MarketsTable({ rows, onOpen }) {
  return (
    <div style={{ border: '1px solid #282828' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 40px',
        padding: '14px 24px', gap: 8, borderBottom: '1px solid #282828',
      }}>
        {['Asset','Type','Min APR ▾','Max APR ▾','Cap filled ▾',''].map((h,i) => (
          <span key={i} style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
            color: '#8A8A8A', letterSpacing: '-0.02em',
          }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <button key={i} onClick={()=>onOpen?.(r)} style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 40px',
          padding: '18px 24px', gap: 8, alignItems: 'center',
          borderBottom: i < rows.length-1 ? '1px solid #282828' : 'none',
          background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer',
          width: '100%',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#F0F0F0', fontWeight: 500, letterSpacing: '-0.02em',
          borderLeft: '1px solid transparent', borderRight: '1px solid transparent',
        }}
          onMouseEnter={(e)=>e.currentTarget.style.background='rgba(240,240,240,0.03)'}
          onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TokenAvatar symbol={r.symbol} size={28}/>{r.symbol}
          </span>
          <span>{r.type}</span>
          <span>{r.minApr}</span>
          <span>{r.maxApr}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {r.capFilled}%
            <div style={{ width: 60, height: 6, background: 'rgba(42,162,134,0.2)', border: '1px solid #2AA286' }}>
              <div style={{ width: `${r.capFilled}%`, height: '100%', background: '#2AA286' }}/>
            </div>
          </span>
          <span style={{ color: '#8A8A8A', textAlign: 'right', fontSize: 16 }}>»</span>
        </button>
      ))}
    </div>
  );
}

function DepositSheet({ market, onClose, onConfirm }) {
  const [side, setSide] = React.useState('deposit');
  const [strikeIdx, setStrikeIdx] = React.useState(1);
  const [amount, setAmount] = React.useState('1000.00');
  if (!market) return null;

  const strikes = [
    { price: '$180', apr: '12%' },
    { price: '$200', apr: '18%' },
    { price: '$220', apr: '24%' },
    { price: '$240', apr: '34%' },
  ];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        width: 480, background: '#121212', border: '1px solid #282828',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* header */}
        <div style={{
          padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #282828',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TokenAvatar symbol={market.symbol} size={32}/>
            <div>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 20, color: '#F0F0F0', letterSpacing: '-0.02em' }}>{market.symbol} {market.type}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#8A8A8A', letterSpacing: '-0.02em' }}>Matures 2026/02/19 · 28d</div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#8A8A8A', cursor: 'pointer', background: 'transparent', border: 'none', padding: 4 }}>
            <Close size={20}/>
          </button>
        </div>
        {/* deposit/withdraw tabs */}
        <div style={{ padding: 16, borderBottom: '1px solid #282828' }}>
          <Tabs variant="deposit" value={side} onChange={setSide} options={[
            { value: 'deposit', label: 'Deposit' }, { value: 'withdraw', label: 'Withdraw' },
          ]}/>
        </div>
        {/* strike picker */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#8A8A8A', letterSpacing: '-0.02em' }}>Target price</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {strikes.map((s,i) => (
              <button key={i} onClick={()=>setStrikeIdx(i)} style={{
                padding: '10px 8px', cursor: 'pointer',
                background: strikeIdx===i ? 'rgba(42,162,134,0.2)' : 'transparent',
                border: '1px solid', borderColor: strikeIdx===i ? '#2AA286' : '#282828',
                display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 14, color: '#F0F0F0', letterSpacing: '-0.02em' }}>{s.price}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: strikeIdx===i ? '#80C9B6' : '#8A8A8A', letterSpacing: '-0.02em' }}>APR {s.apr}</span>
              </button>
            ))}
          </div>
        </div>
        {/* amount input */}
        <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#8A8A8A' }}>Amount</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#8A8A8A' }}>Bal 12,340.00 USDC</span>
          </div>
          <div style={{
            border: '1px solid #282828', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <input value={amount} onChange={e=>setAmount(e.target.value)} style={{
              background: 'transparent', border: 'none', outline: 'none', color: '#F0F0F0',
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 24, letterSpacing: '-0.02em', flex: 1,
            }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TokenAvatar symbol="USDC" size={24}/>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 20, color: '#F0F0F0' }}>USDC</span>
            </div>
          </div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#8A8A8A' }}>~${amount}</div>
        </div>
        {/* summary */}
        <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #282828', paddingTop: 16 }}>
          <Row k="Target price" v={strikes[strikeIdx].price}/>
          <Row k="APR" v={strikes[strikeIdx].apr} accent/>
          <Row k="Est. premium" v={`+$${(parseFloat(amount||0) * parseFloat(strikes[strikeIdx].apr)/100 * 28/365).toFixed(2)}`}/>
          <Row k="Maturity" v="2026/02/19"/>
        </div>
        {/* action */}
        <div style={{ padding: 16, borderTop: '1px solid #282828' }}>
          <Button variant="primary" size="lg" onClick={onConfirm} style={{ width: '100%' }}>
            {side === 'deposit' ? 'Deposit' : 'Withdraw'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#8A8A8A', letterSpacing: '-0.02em' }}>{k}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 14, color: accent ? '#80C9B6' : '#F0F0F0', letterSpacing: '-0.02em' }}>{v}</span>
    </div>
  );
}

function Toast({ message, onDone }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24, zIndex: 200,
      background: '#121212', border: '1px solid #282828', padding: '14px 18px',
      boxShadow: '0 1px 2px rgba(16,24,40,0.06)',
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#F0F0F0', letterSpacing: '-0.02em',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: '#2AA286' }}/>
      {message}
    </div>
  );
}

Object.assign(window, { TokenAvatar, MarketCard, MarketsTable, DepositSheet, Toast });
