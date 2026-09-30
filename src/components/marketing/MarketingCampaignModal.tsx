import React, { useState } from 'react';

export const MarketingCampaignModal: React.FC<{
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}> = ({ projectId, isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('<h2>Hola {{first_name}},</h2><p>Tenemos novedades exclusivas para ti.</p>');
  const [isDispatching, setIsDispatching] = useState(false);
  const [metrics, setMetrics] = useState({
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    progressPercent: 0
  });

  if (!isOpen) return null;

  const handleDispatch = async () => {
    setIsDispatching(true);
    try {
      await fetch(`/api/v1/marketing/campaigns/${projectId}/dispatch`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('Dispatch error:', err);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: 8, padding: 24, width: 620, color: '#F8FAFC', fontFamily: "'JetBrains Mono', sans-serif" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Módulo de Mercadotecnia Masiva</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <label style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Nombre de Campaña:</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Lanzamiento Q4"
            style={{ padding: '8px 12px', background: '#1E293B', border: '1px solid #334155', borderRadius: 6, color: '#FFF' }}
          />

          <label style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Asunto del Correo:</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Novedades de la plataforma"
            style={{ padding: '8px 12px', background: '#1E293B', border: '1px solid #334155', borderRadius: 6, color: '#FFF' }}
          />

          <label style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{"Cuerpo HTML (Variables: {{first_name}}, {{email}}):"}</label>
          <textarea
            value={htmlBody}
            onChange={e => setHtmlBody(e.target.value)}
            rows={5}
            style={{ padding: '8px 12px', background: '#1E293B', border: '1px solid #334155', borderRadius: 6, color: '#FFF', resize: 'vertical' }}
          />
        </div>

        {/* Panel de Métricas en Vivo */}
        <div style={{ background: '#070B14', padding: 12, borderRadius: 6, border: '1px solid #1E293B', marginBottom: 16 }}>
          <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginBottom: 6 }}>Telemetría en Vivo de Envíos:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Enviados</span>
              <div style={{ fontWeight: 700, color: '#38BDF8' }}>{metrics.sent}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Entregados</span>
              <div style={{ fontWeight: 700, color: '#10B981' }}>{metrics.delivered}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Aperturas</span>
              <div style={{ fontWeight: 700, color: '#F59E0B' }}>{metrics.opened}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Clics</span>
              <div style={{ fontWeight: 700, color: '#00F2FE' }}>{metrics.clicked}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#1E293B', border: '1px solid #334155', borderRadius: 6, color: '#FFF', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={handleDispatch}
            disabled={isDispatching}
            style={{
              padding: '8px 16px',
              background: '#10B981',
              border: 'none',
              borderRadius: 6,
              color: '#000',
              fontWeight: 700,
              cursor: isDispatching ? 'not-allowed' : 'pointer'
            }}
          >
            {isDispatching ? 'Despachando Lote...' : 'Disparar Envío Masivo'}
          </button>
        </div>
      </div>
    </div>
  );
};
