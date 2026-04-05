import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    // 1. O wrapper principal força o background do CCO em todo o viewport
    // Isso elimina o "flash branco" durante a troca de rotas pesadas.
    <div className="min-h-screen w-full bg-[#080a0c] selection:bg-[#0054A6] selection:text-white">
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}