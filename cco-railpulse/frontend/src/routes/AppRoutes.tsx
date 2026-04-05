import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';

// Páginas de Operação (Já refatoradas para o padrão SP Rail)
import { Dashboard } from '../pages/Dashboard';
import { Analytics } from '../pages/Analytics';
import { Alerts } from '../pages/Alerts';

/**
 * AppRoutes - Matriz de Roteamento RailPulse
 * * Esta malha de rotas garante que todas as visualizações técnicas 
 * sejam envelopadas pelo MainLayout (Deep Slate), mantendo a 
 * persistência do CCO em todas as transições.
 */
export const AppRoutes = () => {
  return (
    <Routes>
      {/* Route Container: Define o Layout Global do CCO */}
      <Route path="/" element={<MainLayout />}>
        
        {/* Ponto de Injeção: Telemetria em Tempo Real (Home Default) */}
        <Route index element={<Navigate to="/dashboard" replace />} />
        
        {/* Painel Sinótico (Visualização de Via) */}
        <Route path="dashboard" element={<Dashboard />} />
        
        {/* Business Intelligence (KPIs e Gráficos) */}
        <Route path="analytics" element={<Analytics />} />
        
        {/* Fila de Incidentes (Segurança CPTM) */}
        <Route path="alerts" element={<Alerts />} />
        
        {/* Fallback de Segurança: Redireciona rotas inexistentes para o Dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
};