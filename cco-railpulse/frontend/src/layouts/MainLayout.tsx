import { Outlet } from 'react-router-dom';
// Caminhos perfeitamente mapeados para a sua estrutura de pastas
import { Sidebar } from '../components/common/Sidebar';
import { Header } from '../components/common/Header';

export const MainLayout = () => {
  return (
    <div className="app-container">
      {/* Sidebar encapsulada na sua própria semântica */}
      <aside className="sidebar-container">
        <Sidebar />
      </aside>

      {/* Invólucro da área de operação */}
      <div className="main-content-wrapper">
        <header className="header-container">
          <Header />
        </header>
        
        <main className="main-content custom-scrollbar">
          <Outlet />
        </main>
      </div>
    </div>
  );
};