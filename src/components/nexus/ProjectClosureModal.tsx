import React, { useState } from 'react';
import { TS_TOKENS } from '../../styles/theme.tokens';

interface ProjectClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  onProjectClosed?: (result: any) => void;
}

export const ProjectClosureModal: React.FC<ProjectClosureModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  onProjectClosed
}) => {
  const [signOffName, setSignOffName] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [comments, setComments] = useState('');
  const [finalRoi, setFinalRoi] = useState<number>(120000);
  const [cycleTimeDays, setCycleTimeDays] = useState<number>(14);
  const [sigmaLevel, setSigmaLevel] = useState<number>(5.9);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signOffName.trim()) {
      setErrorMsg('El nombre de quien otorga la conformidad es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_sign_off_name: signOffName.trim(),
          client_feedback_rating: rating,
          client_comments: comments.trim() || undefined,
          final_roi_amount: Number(finalRoi) || 0,
          final_cycle_time_days: Number(cycleTimeDays) || 0,
          final_sigma_level: Number(sigmaLevel) || 5.9
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al ejecutar el cierre inmutable del proyecto.');
      }

      if (onProjectClosed) {
        onProjectClosed(data);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(6, 9, 15, 0.88)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '650px',
          backgroundColor: TS_TOKENS.colors.negroProfundo,
          border: `2px solid ${TS_TOKENS.colors.naranjaEnergy}`,
          borderRadius: TS_TOKENS.radii.radiusLarge,
          boxShadow: TS_TOKENS.glows.glowEnergy,
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span
              style={{
                fontFamily: TS_TOKENS.typography.fontMono,
                fontSize: '0.68rem',
                color: TS_TOKENS.colors.naranjaEnergy,
                textTransform: 'uppercase'
              }}
            >
              Auditoría y Archivado Inmutable
            </span>
            <h2
              style={{
                fontFamily: TS_TOKENS.typography.fontBruno,
                fontSize: '1.2rem',
                color: TS_TOKENS.colors.blancoPuro,
                margin: '4px 0 0 0'
              }}
            >
              CIERRE FORMAL DE PROYECTO
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: TS_TOKENS.colors.humoSlate, fontSize: '1.4rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            backgroundColor: 'rgba(255, 107, 0, 0.1)',
            borderLeft: `4px solid ${TS_TOKENS.colors.naranjaEnergy}`,
            padding: '12px 16px',
            borderRadius: '4px',
            fontSize: '0.8rem',
            color: TS_TOKENS.colors.blancoPerla,
            lineHeight: 1.5
          }}
        >
          <strong>Aviso de Inmutabilidad:</strong> Al confirmar el cierre, el proyecto <strong>{projectName}</strong> pasará al estado <code>ARCHIVED</code>. Todas las mutaciones en tareas, DAG y OPEX quedarán bloqueadas de forma permanente (modo solo lectura), se creará el Snapshot Inmutable y BullMQ asimilará los aprendizajes en el cerebro de <strong>Nexus</strong>.
        </div>

        {errorMsg && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #EF4444',
              color: '#EF4444',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '0.8rem'
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: TS_TOKENS.colors.humoSlate, marginBottom: '6px' }}>
              Nombre del Representante o Cliente (Sign-Off Oficial) *
            </label>
            <input
              type="text"
              required
              value={signOffName}
              onChange={e => setSignOffName(e.target.value)}
              placeholder="Ej: Ing. Carlos Mendoza - Director de Operaciones"
              style={{
                width: '100%',
                backgroundColor: TS_TOKENS.colors.midnightPanel,
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                padding: '10px 14px',
                color: '#FFF',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate, marginBottom: '4px' }}>
                Calificación (1 a 5)
              </label>
              <select
                value={rating}
                onChange={e => setRating(Number(e.target.value))}
                style={{
                  width: '100%',
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#F59E0B',
                  fontWeight: 'bold',
                  fontSize: '0.82rem'
                }}
              >
                <option value={5}>★★★★★ (5 - Excelente)</option>
                <option value={4}>★★★★☆ (4 - Muy Bueno)</option>
                <option value={3}>★★★☆☆ (3 - Aceptable)</option>
                <option value={2}>★★☆☆☆ (2 - Regular)</option>
                <option value={1}>★☆☆☆☆ (1 - Deficiente)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate, marginBottom: '4px' }}>
                ROI Final ($ USD)
              </label>
              <input
                type="number"
                min="0"
                value={finalRoi}
                onChange={e => setFinalRoi(Number(e.target.value))}
                style={{
                  width: '100%',
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: TS_TOKENS.colors.naranjaEnergy,
                  fontWeight: 'bold',
                  fontSize: '0.82rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', color: TS_TOKENS.colors.humoSlate, marginBottom: '4px' }}>
                Nivel Six Sigma (σ)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="6"
                value={sigmaLevel}
                onChange={e => setSigmaLevel(Number(e.target.value))}
                style={{
                  width: '100%',
                  backgroundColor: TS_TOKENS.colors.midnightPanel,
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: TS_TOKENS.colors.aquaTurquesa,
                  fontWeight: 'bold',
                  fontSize: '0.82rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: TS_TOKENS.colors.humoSlate, marginBottom: '6px' }}>
              Retroalimentación y Comentarios Finales del Cliente
            </label>
            <textarea
              rows={3}
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Comentarios sobre el cumplimiento de expectativas, transferencia tecnológica y lecciones aprendidas..."
              style={{
                width: '100%',
                backgroundColor: TS_TOKENS.colors.midnightPanel,
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                padding: '10px 14px',
                color: '#FFF',
                fontSize: '0.82rem',
                resize: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                color: TS_TOKENS.colors.humoSlate,
                padding: '10px 18px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                backgroundColor: TS_TOKENS.colors.naranjaEnergy,
                color: '#FFF',
                border: 'none',
                padding: '10px 22px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
                boxShadow: TS_TOKENS.glows.glowEnergy
              }}
            >
              {isSubmitting ? 'Sellando e Ingestando en Nexus...' : 'Sellar y Archivar Proyecto 🔒'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
