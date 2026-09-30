import React, { useState, useEffect, useMemo } from 'react';

export type ProjectArchetype = 
  | 'BIOLINK' 
  | 'LANDING_PAGE' 
  | 'DIGITAL_MENU' 
  | 'BRAND_IDENTITY' 
  | 'CORPORATE_WEB' 
  | 'WEB_WITH_API' 
  | 'ECOMMERCE' 
  | 'SAAS_WEBAPP' 
  | 'OPEX_MANAGEMENT';

export interface ServiceCatalogPackage {
  id: string;
  domain: string;
  archetype: ProjectArchetype;
  package_name: string;
  package_code: string;
  price_amount: number | string;
  currency: string;
  billing_scheme: string;
  maintenance_fee: number | string;
  description: string;
  contract_template_type: string;
  estimated_delivery_days: number;
  tech_stack_preset: {
    technologies?: string[];
    hosting?: string;
  };
  features: string[];
}

export interface NexusOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (provisionedData: any) => void;
}

export const NexusOnboardingModal: React.FC<NexusOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  // Estado del catálogo cargado
  const [catalog, setCatalog] = useState<ServiceCatalogPackage[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  // Vector 1: Arquetipo
  const [selectedArchetype, setSelectedArchetype] = useState<ProjectArchetype>('LANDING_PAGE');
  const [selectedPackageCode, setSelectedPackageCode] = useState<string>('LANDING_HIGH_CONVERSION');

  // Vector 2: Datos del Cliente
  const [projectName, setProjectName] = useState<string>('Portal Corporativo Nexus');
  const [clientName, setClientName] = useState<string>('Lic. Fernando Almonte');
  const [clientEmail, setClientEmail] = useState<string>('falmonte@empresa-cliente.com');
  const [companyName, setCompanyName] = useState<string>('Almonte Logistics S.A. de C.V.');
  const [targetDomain, setTargetDomain] = useState<string>('www.almontelogistics.mx');

  // Vector 3: Matriz RACI
  const [techLeadName, setTechLeadName] = useState<string>('Ing. David Gómez (Tech Lead)');
  const [techLeadEmail, setTechLeadEmail] = useState<string>('dgomez@tsolutionsipidd.com');
  const [pmName, setPmName] = useState<string>('Mtra. Sofía Valenzuela (PM)');
  const [pmEmail, setPmEmail] = useState<string>('svalenzuela@tsolutionsipidd.com');

  // Vector 4: Requerimientos Técnicos
  const [repoProvider, setRepoProvider] = useState<'GITHUB' | 'GITLAB' | 'BLUEPRINT_GENERATED'>('BLUEPRINT_GENERATED');
  const [githubRepo, setGithubRepo] = useState<string>('whoiselgallo/antigravity-instruction-architect');
  const [paymentGateway, setPaymentGateway] = useState<'NONE' | 'STRIPE' | 'CLIP' | 'MERCADOPAGO'>('NONE');
  const [enableGoogleTasks, setEnableGoogleTasks] = useState<boolean>(false);

  // Vector 5: Comercial & Pagos
  const [paymentTerms, setPaymentTerms] = useState<'50/50' | '30/30/40' | 'MONTHLY_LICENSE' | 'ANNUAL'>('50/50');
  const [deliveryDate, setDeliveryDate] = useState<string>('');

  // Cargar catálogo desde la API
  useEffect(() => {
    if (!isOpen) return;

    const fetchCatalog = async () => {
      try {
        setLoadingCatalog(true);
        const res = await fetch('/api/v1/nexus/onboarding/catalog');
        if (res.ok) {
          const data = await res.json();
          setCatalog(data);
          if (data.length > 0) {
            // Seleccionar primer paquete del arquetipo activo si existe
            const defaultPkg = data.find((p: ServiceCatalogPackage) => p.archetype === selectedArchetype) || data[0];
            setSelectedPackageCode(defaultPkg.package_code);
          }
        }
      } catch (err) {
        console.warn('Error loading service catalog, using defaults:', err);
      } finally {
        setLoadingCatalog(false);
      }
    };

    fetchCatalog();
  }, [isOpen]);

  // Actualizar paquete seleccionado al cambiar de arquetipo
  const handleArchetypeChange = (arch: ProjectArchetype) => {
    setSelectedArchetype(arch);
    const matchingPkg = catalog.find(p => p.archetype === arch);
    if (matchingPkg) {
      setSelectedPackageCode(matchingPkg.package_code);
    }
  };

  // Paquete actualmente activo
  const activePackage = useMemo(() => {
    return catalog.find(p => p.package_code === selectedPackageCode) || {
      package_name: `${selectedArchetype} Setup`,
      price_amount: 15000,
      currency: 'MXN',
      domain: 'www.tsolutionsipidd.com',
      estimated_delivery_days: 14,
      contract_template_type: 'CONTRACT_MASTER',
      tech_stack_preset: {
        technologies: ['TypeScript', 'React', 'Neon PostgreSQL', 'BullMQ'],
        hosting: 'Google Cloud Run + Vercel'
      },
      description: 'Arquitectura completa y despliegue llave en mano con tokens de TSolutions IPIDD.'
    } as any;
  }, [catalog, selectedPackageCode, selectedArchetype]);

  // Manejo de envío del formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    const payload = {
      archetype: selectedArchetype,
      client_name: clientName,
      client_email: clientEmail,
      company_name: companyName || null,
      target_domain: targetDomain || null,
      raci: {
        tech_lead_name: techLeadName || null,
        tech_lead_email: techLeadEmail || null,
        project_manager_name: pmName || null,
        project_manager_email: pmEmail || null,
        collaborators: []
      },
      technical: {
        repository_provider: repoProvider,
        github_repo: repoProvider !== 'BLUEPRINT_GENERATED' ? githubRepo : null,
        payment_gateway: paymentGateway,
        enable_google_tasks: enableGoogleTasks
      },
      commercial: {
        package_code: selectedPackageCode,
        payment_terms: paymentTerms,
        target_delivery_date: deliveryDate || null
      },
      project_name: projectName,
      project_description: `Aprovisionado automáticamente para ${clientName} bajo arquetipo ${selectedArchetype}`
    };

    try {
      const res = await fetch('/api/v1/nexus/onboarding/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fallo durante el aprovisionamiento atómico');
      }

      setSuccessResult(data);
      if (onSuccess) {
        onSuccess(data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error en la llamada de red');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 13, 20, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#121722',
        border: '1px solid rgba(0, 229, 255, 0.3)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1240px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 229, 255, 0.15)',
        overflow: 'hidden',
        color: '#F8FAFC',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}>
        {/* CABECERA NEXUS ONBOARDING */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.10)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, #0A0D14 0%, #121722 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              border: '2px solid #FF6B00',
              boxShadow: '0 0 15px rgba(255, 107, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 107, 0, 0.1)'
            }}>
              <span style={{ fontSize: '1.4rem' }}>🧠</span>
            </div>
            <div>
              <div style={{
                fontFamily: "'Bruno Ace', cursive",
                fontSize: '1.25rem',
                color: '#FFFFFF',
                letterSpacing: '0.05em'
              }}>
                NEXUS ARCHITECT STUDIO <span style={{ color: '#00E5FF' }}>•</span> ONBOARDING ENGINE
              </div>
              <div style={{
                fontSize: '0.8rem',
                color: '#94A3B8',
                fontFamily: "'Space Grotesk', sans-serif"
              }}>
                Clasificación de Requerimiento, Aprovisionamiento RLS, Contrato Oficial & Topología DAG
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              color: '#94A3B8',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#FFFFFF')}
            onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}
          >
            ✕ Cerrar
          </button>
        </div>

        {/* CUERPO DEL ASISTENTE: 2 COLUMNAS (FORMULARIO INTERACTIVO + RESUMEN EN VIVO) */}
        {successResult ? (
          <div style={{ padding: '40px', textAlign: 'center', overflowY: 'auto' }}>
            <div style={{
              fontSize: '3.5rem',
              marginBottom: '16px'
            }}>🎉</div>
            <h2 style={{
              fontFamily: "'Bruno Ace', cursive",
              color: '#00E5FF',
              fontSize: '1.8rem',
              marginBottom: '8px'
            }}>
              ¡PROYECTO & WORKSPACE APROVISIONADOS CON ÉXITO!
            </h2>
            <p style={{ color: '#94A3B8', maxWidth: '600px', margin: '0 auto 24px auto', fontSize: '0.95rem' }}>
              El espacio de trabajo ha sido aislado con RLS, el contrato comercial ha sido generado y sellado, y el grafo DAG de dependencias técnicas ha sido sembrado en estado RED para inicio de desarrollo.
            </p>

            <div style={{
              background: '#0A0D14',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '750px',
              margin: '0 auto 32px auto',
              textAlign: 'left',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px'
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Workspace Creado</span>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#FF6B00', fontWeight: 'bold' }}>
                  {successResult.workspace?.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>slug: {successResult.workspace?.slug}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Cliente (Owner)</span>
                <div style={{ color: '#FFFFFF', fontWeight: 'bold' }}>{successResult.clientUser?.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{successResult.clientUser?.email}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Contrato Oficial</span>
                <div style={{ color: '#00E5FF', fontSize: '0.9rem' }}>{successResult.contract?.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#FF6B00' }}>
                  ${Number(successResult.contract?.total_amount || 0).toLocaleString()} {successResult.contract?.currency}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Grafo DAG Sembrado</span>
                <div style={{ color: '#EF4444', fontWeight: 'bold' }}>
                  {successResult.dag?.nodeCount} Nodos en RED
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  {successResult.dag?.edgeCount} Conexiones secuenciales
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Webhook CI/CD Routing Key</span>
                <div style={{
                  background: 'rgba(0, 229, 255, 0.08)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  color: '#00E5FF',
                  marginTop: '4px'
                }}>
                  {successResult.webhookConfig?.webhook_url}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
              <button
                onClick={() => {
                  window.location.reload();
                }}
                style={{
                  background: '#FF6B00',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 28px',
                  fontWeight: 'bold',
                  fontFamily: "'Space Grotesk', sans-serif",
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(255, 107, 0, 0.4)'
                }}
              >
                Ir al Dashboard con el Nuevo DAG
              </button>
              <button
                onClick={() => {
                  setSuccessResult(null);
                  onClose();
                }}
                style={{
                  background: 'transparent',
                  color: '#94A3B8',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '12px 20px',
                  cursor: 'pointer'
                }}
              >
                Finalizar y Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 380px',
            flex: 1,
            overflow: 'hidden'
          }}>
            {/* COLUMNA IZQUIERDA: LOS 5 VECTORES DE CONFIGURACIÓN */}
            <div style={{
              padding: '24px 32px',
              overflowY: 'auto',
              borderRight: '1px solid rgba(255, 255, 255, 0.10)'
            }}>
              {errorMessage && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #EF4444',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  color: '#FCA5A5',
                  fontSize: '0.9rem',
                  marginBottom: '20px'
                }}>
                  ⚠️ {errorMessage}
                </div>
              )}

              {/* VECTOR 1: SELECCIÓN DE ARQUETIPO */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: '#00E5FF',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ background: '#00E5FF', color: '#0A0D14', width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>1</span>
                  Arquetipo de Proyecto & Dominio Oficial
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '10px'
                }}>
                  {[
                    { id: 'BIOLINK', label: 'Biolink / vCard NFC', domain: 'vc.tsolutionsipidd.com', icon: '📇', badge: 'vCard Engine' },
                    { id: 'LANDING_PAGE', label: 'Landing Page Conversión', domain: 'www.tsolutionsipidd.com', icon: '🚀', badge: 'Next.js' },
                    { id: 'DIGITAL_MENU', label: 'Menú Digital QR', domain: 'www.tsolutionsipidd.com', icon: '🍽️', badge: 'Real-Time' },
                    { id: 'BRAND_IDENTITY', label: 'Identidad & Branding', domain: 'identidad.tsolutionsipidd.com', icon: '🎨', badge: 'Tokens JSON' },
                    { id: 'CORPORATE_WEB', label: 'Web Corporativa / SEO', domain: 'www.tsolutionsipidd.com', icon: '🏛️', badge: 'Headless' },
                    { id: 'WEB_WITH_API', label: 'Sitio Web con API REST', domain: 'www.tsolutionsipidd.com', icon: '⚡', badge: 'Neon DB' },
                    { id: 'ECOMMERCE', label: 'E-commerce Completo', domain: 'www.tsolutionsipidd.com', icon: '🛍️', badge: 'Stripe/Clip' },
                    { id: 'SAAS_WEBAPP', label: 'Aplicación Web (SaaS)', domain: 'www.tsolutionsipidd.com', icon: '💻', badge: 'Multi-Tenant' },
                    { id: 'OPEX_MANAGEMENT', label: 'Herramienta OPEX / DMAIC', domain: 'www.tsolutionsipidd.com', icon: '📊', badge: 'pgvector' }
                  ].map(arch => {
                    const isSelected = selectedArchetype === arch.id;
                    return (
                      <div
                        key={arch.id}
                        onClick={() => handleArchetypeChange(arch.id as ProjectArchetype)}
                        style={{
                          background: isSelected ? 'rgba(0, 229, 255, 0.12)' : '#0A0D14',
                          border: isSelected ? '1px solid #00E5FF' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '8px',
                          padding: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: isSelected ? '0 0 15px rgba(0, 229, 255, 0.2)' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '1.2rem' }}>{arch.icon}</span>
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: isSelected ? '#00E5FF' : 'rgba(255,255,255,0.06)',
                            color: isSelected ? '#0A0D14' : '#94A3B8',
                            fontFamily: "'Space Grotesk', sans-serif",
                            fontWeight: 'bold'
                          }}>
                            {arch.badge}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: isSelected ? '#FFFFFF' : '#E2E8F0' }}>
                          {arch.label}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                          {arch.domain}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* VECTOR 2: DATOS DEL CLIENTE Y PROYECTO */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: '#00E5FF',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ background: '#00E5FF', color: '#0A0D14', width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>2</span>
                  Datos del Propietario (Cliente & Empresa)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Nombre del Proyecto *
                    </label>
                    <input
                      type="text"
                      required
                      value={projectName}
                      onChange={e => setProjectName(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Razón Social o Empresa
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Nombre del Representante Legal *
                    </label>
                    <input
                      type="text"
                      required
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Correo Electrónico (Notificaciones) *
                    </label>
                    <input
                      type="email"
                      required
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Dominio Objetivo o URL Prevista
                    </label>
                    <input
                      type="text"
                      value={targetDomain}
                      onChange={e => setTargetDomain(e.target.value)}
                      placeholder="ejemplo.com o subdominio.tsolutionsipidd.com"
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* VECTOR 3: MATRIZ RACI */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: '#00E5FF',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ background: '#00E5FF', color: '#0A0D14', width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>3</span>
                  Matriz RACI del Equipo (Roles & Gobernanza)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Tech Lead / Implementador (Responsable)
                    </label>
                    <input
                      type="text"
                      value={techLeadName}
                      onChange={e => setTechLeadName(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem',
                        marginBottom: '6px'
                      }}
                    />
                    <input
                      type="email"
                      value={techLeadEmail}
                      onChange={e => setTechLeadEmail(e.target.value)}
                      placeholder="email@tsolutionsipidd.com"
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#94A3B8',
                        fontSize: '0.75rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Project Manager / Calidad (Accountable)
                    </label>
                    <input
                      type="text"
                      value={pmName}
                      onChange={e => setPmName(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem',
                        marginBottom: '6px'
                      }}
                    />
                    <input
                      type="email"
                      value={pmEmail}
                      onChange={e => setPmEmail(e.target.value)}
                      placeholder="pm@tsolutionsipidd.com"
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#94A3B8',
                        fontSize: '0.75rem'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* VECTOR 4: REQUERIMIENTOS TÉCNICOS */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: '#00E5FF',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ background: '#00E5FF', color: '#0A0D14', width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>4</span>
                  Requerimientos Técnicos e Integraciones
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Origen de Repositorio
                    </label>
                    <select
                      value={repoProvider}
                      onChange={e => setRepoProvider(e.target.value as any)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="BLUEPRINT_GENERATED">Generación Directa (Blueprint DAG)</option>
                      <option value="GITHUB">GitHub CI/CD Conectado</option>
                      <option value="GITLAB">GitLab Pipelines</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Pasarela de Pagos
                    </label>
                    <select
                      value={paymentGateway}
                      onChange={e => setPaymentGateway(e.target.value as any)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="NONE">No Aplica / Sin Pasarela</option>
                      <option value="STRIPE">Stripe Payments (Tarjetas & Checkout)</option>
                      <option value="CLIP">Clip API (MSI & Pagos Locales)</option>
                      <option value="MERCADOPAGO">MercadoPago Wallet</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
                    <input
                      type="checkbox"
                      id="googleTasks"
                      checked={enableGoogleTasks}
                      onChange={e => setEnableGoogleTasks(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: '#00E5FF' }}
                    />
                    <label htmlFor="googleTasks" style={{ fontSize: '0.85rem', color: '#E2E8F0', cursor: 'pointer' }}>
                      Sincronización Bidireccional Google Tasks
                    </label>
                  </div>
                </div>
              </div>

              {/* VECTOR 5: ESQUEMA COMERCIAL & PAQUETE */}
              <div>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: '#00E5FF',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ background: '#00E5FF', color: '#0A0D14', width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>5</span>
                  Marco Comercial & Términos de Contratación
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Términos de Pago Pactados
                    </label>
                    <select
                      value={paymentTerms}
                      onChange={e => setPaymentTerms(e.target.value as any)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="50/50">50% Anticipo / 50% Finiquito contra Entrega</option>
                      <option value="30/30/40">30% Anticipo / 30% Hito DMAIC / 40% Cierre</option>
                      <option value="ANNUAL">Licenciamiento Anual Anticipado</option>
                      <option value="MONTHLY_LICENSE">Mensualidad Recurrente / Póliza OPEX</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>
                      Fecha Contractual de Entrega (Último Tollgate)
                    </label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={e => setDeliveryDate(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#0A0D14',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#FFFFFF',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA: RESUMEN DINÁMICO EN VIVO */}
            <div style={{
              backgroundColor: '#0A0D14',
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflowY: 'auto'
            }}>
              <div>
                <div style={{
                  fontFamily: "'Bruno Ace', cursive",
                  fontSize: '1rem',
                  color: '#FFFFFF',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  paddingBottom: '12px',
                  marginBottom: '20px'
                }}>
                  RESUMEN DE ARQUITECTURA
                </div>

                {/* Tarjeta de Inversión */}
                <div style={{
                  background: 'rgba(18, 23, 34, 0.9)',
                  border: '1px solid rgba(255, 107, 0, 0.3)',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '18px',
                  boxShadow: '0 0 20px rgba(255, 107, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>Inversión Total Estimada</div>
                  <div style={{
                    fontFamily: "'Bruno Ace', cursive",
                    fontSize: '1.8rem',
                    color: '#FF6B00',
                    margin: '6px 0 2px 0'
                  }}>
                    ${Number(activePackage.price_amount || 0).toLocaleString()} {activePackage.currency || 'MXN'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#00E5FF', fontFamily: "'Space Grotesk', sans-serif" }}>
                    {paymentTerms} • {activePackage.billing_scheme === 'ANNUAL' ? 'Anualidad' : 'Pago Único'}
                  </div>
                </div>

                {/* Detalles técnicos y de hosting */}
                <div style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
                  <div style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase' }}>Arquetipo & Dominio</div>
                  <div style={{ color: '#FFFFFF', fontWeight: 'bold', marginTop: '2px' }}>{selectedArchetype}</div>
                  <div style={{ color: '#00E5FF', fontSize: '0.75rem' }}>{activePackage.domain}</div>
                </div>

                <div style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
                  <div style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase' }}>Hosting / Entorno Cloud</div>
                  <div style={{ color: '#E2E8F0', marginTop: '2px' }}>
                    {activePackage.tech_stack_preset?.hosting || 'Google Cloud Run + Vercel'}
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
                  <div style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase' }}>Tiempo Estimado de Entrega</div>
                  <div style={{ color: '#E2E8F0', marginTop: '2px' }}>
                    ~{activePackage.estimated_delivery_days || 14} días hábiles (Sujeto a Tollgates)
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
                  <div style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '6px' }}>Stack Sugerido</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(activePackage.tech_stack_preset?.technologies || ['React', 'Node.js', 'PostgreSQL']).map((t: string) => (
                      <span key={t} style={{
                        background: 'rgba(0, 229, 255, 0.1)',
                        border: '1px solid rgba(0, 229, 255, 0.3)',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        color: '#00E5FF',
                        fontFamily: "'Space Grotesk', sans-serif"
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', marginBottom: '24px' }}>
                  <div style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase' }}>Marco Contractual</div>
                  <div style={{ color: '#A7F3D0', fontSize: '0.8rem', marginTop: '2px' }}>
                    📜 {activePackage.contract_template_type === 'CONTRACT_VCARD_LICENSE' ? 'Licencia SaaS vCard' : activePackage.contract_template_type === 'CONTRACT_BRAND_ASSIGNMENT' ? 'Cesión de Derechos de Diseño' : 'Contrato Maestro de Software'}
                  </div>
                </div>
              </div>

              {/* Botón de Confirmación y Aprovisionamiento */}
              <div>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    background: submitting ? '#94A3B8' : '#FF6B00',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '14px',
                    color: '#FFFFFF',
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 'bold',
                    fontSize: '0.95rem',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    boxShadow: submitting ? 'none' : '0 0 25px rgba(255, 107, 0, 0.4)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                  onMouseEnter={e => {
                    if (!submitting) e.currentTarget.style.boxShadow = '0 0 35px rgba(255, 107, 0, 0.7)';
                  }}
                  onMouseLeave={e => {
                    if (!submitting) e.currentTarget.style.boxShadow = '0 0 25px rgba(255, 107, 0, 0.4)';
                  }}
                >
                  {submitting ? (
                    <>⏳ Aprovisionando Workspace & DAG...</>
                  ) : (
                    <>🚀 Confirmar & Aprovisionar Proyecto</>
                  )}
                </button>
                <div style={{
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  color: '#64748B',
                  marginTop: '10px',
                  fontFamily: "'Space Grotesk', sans-serif"
                }}>
                  Transacción Atómica • RLS Multi-Tenant • TSolutions IPIDD
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
