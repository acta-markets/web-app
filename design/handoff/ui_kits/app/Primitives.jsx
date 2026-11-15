// Buttons ——————————————————————————————————————————————————
function Button({ variant = 'primary', size = 'md', state, children, icon, onClick, style }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: size === 'lg' ? '14px 20px' : size === 'sm' ? '6px 12px' : '10px 16px',
    fontFamily: 'JetBrains Mono, monospace', fontWeight: 500,
    fontSize: size === 'lg' ? 16 : size === 'sm' ? 12 : 14,
    letterSpacing: '-0.02em', lineHeight: 1.2,
    border: '1px solid transparent', borderRadius: 0,
    cursor: state === 'disabled' ? 'not-allowed' : 'pointer',
    transition: 'background 120ms ease, border-color 120ms ease, opacity 120ms ease',
    opacity: state === 'disabled' ? 0.4 : 1,
  };
  const variants = {
    primary: { background: state === 'hover' ? '#078568' : '#2AA286', color: '#F0F0F0', borderColor: '#2AA286' },
    secondary: { background: 'rgba(240,240,240,0.1)', color: '#F0F0F0', borderColor: 'rgba(240,240,240,0.15)' },
    ghost: { background: 'transparent', color: state === 'active' ? '#F0F0F0' : '#8A8A8A', borderColor: state === 'active' ? '#282828' : 'transparent' },
    accent: { background: 'rgba(42,162,134,0.2)', color: '#80C9B6', borderColor: '#2AA286' },
    outline: { background: 'transparent', color: '#F0F0F0', borderColor: '#282828' },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }} disabled={state === 'disabled'}>
      {children}{icon}
    </button>
  );
}

// Tag ————————————————————————————————————————————————————————
function Tag({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { background: 'rgba(240,240,240,0.1)', color: '#F0F0F0', borderColor: 'rgba(240,240,240,0.15)' },
    accent:  { background: 'rgba(42,162,134,0.2)', color: '#80C9B6', borderColor: 'rgba(42,162,134,0.3)' },
    muted:   { background: 'transparent', color: '#8A8A8A', borderColor: '#282828' },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', border: '1px solid transparent', borderRadius: 999,
      fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 500, letterSpacing: '-0.02em',
      ...tones[tone],
    }}>{children}</span>
  );
}

// Info box ————————————————————————————————————————————————————
function InfoBox({ header, value, sub, subMuted }) {
  return (
    <div style={{
      border: '1px solid #282828', background: 'rgba(18,18,18,0.01)',
      backdropFilter: 'blur(16px)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
      minWidth: 188,
    }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: 'rgba(240,240,240,0.5)', letterSpacing: '-0.02em' }}>{header}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 16, color: '#F0F0F0', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, letterSpacing: '-0.02em' }}>
          <span style={{ color: '#F0F0F0' }}>{sub}</span>
          {subMuted && <span style={{ color: 'rgba(240,240,240,0.5)' }}>{subMuted}</span>}
        </div>
      )}
    </div>
  );
}

// Tabs ————————————————————————————————————————————————————————
function Tabs({ options, value, onChange, variant = 'ghost' }) {
  return (
    <div style={{ display: 'inline-flex', gap: variant === 'deposit' ? 0 : 8, alignItems: 'center' }}>
      {options.map((o) => {
        const active = o.value === value;
        const isDeposit = variant === 'deposit';
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{
              padding: isDeposit ? '10px 16px' : '8px 14px',
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 14, letterSpacing: '-0.02em',
              color: active ? '#F0F0F0' : '#8A8A8A',
              background: isDeposit ? (active ? 'rgba(42,162,134,0.2)' : 'transparent') : (active ? 'rgba(240,240,240,0.1)' : 'transparent'),
              border: '1px solid',
              borderColor: isDeposit ? (active ? '#2AA286' : '#282828') : (active ? 'rgba(240,240,240,0.15)' : 'transparent'),
              cursor: 'pointer', flex: isDeposit ? 1 : 'none',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Token circle ————————————————————————————————————————————————
function Token({ src, letter, bg = '#F0F0F0', size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#121212', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: size * 0.42,
      overflow: 'hidden',
    }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : letter}
    </div>
  );
}

// Icons — 1.5px stroke, 24px ————————————————————————————————————
const IconBase = ({ size = 20, stroke = '#8A8A8A', children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>{children}</svg>
);
const ChevronDown = (p) => <IconBase {...p}><path d="M6 9l6 6 6-6"/></IconBase>;
const ChevronRightDuo = (p) => <IconBase {...p}><path d="M7 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/></IconBase>;
const TrendUp = (p) => <IconBase {...p}><path d="M3 17l6-6 4 4 7-8"/><path d="M14 7h6v6"/></IconBase>;
const TrendDown = (p) => <IconBase {...p}><path d="M3 7l6 6 4-4 7 8"/><path d="M14 17h6v-6"/></IconBase>;
const Wallet = (p) => <IconBase {...p}><rect x="3" y="6" width="18" height="14" rx="0"/><path d="M3 10h18"/><circle cx="17" cy="15" r="1"/></IconBase>;
const Menu = (p) => <IconBase {...p}><path d="M4 7h16M4 12h10M4 17h16"/></IconBase>;
const Close = (p) => <IconBase {...p}><path d="M6 6l12 12M18 6L6 18"/></IconBase>;
const Exit = (p) => <IconBase {...p}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h12"/></IconBase>;

Object.assign(window, {
  Button, Tag, InfoBox, Tabs, Token,
  ChevronDown, ChevronRightDuo, TrendUp, TrendDown, Wallet, Menu, Close, Exit,
});
