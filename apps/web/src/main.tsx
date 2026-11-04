import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  Link,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './lib/auth';
import { Loading, ErrorState } from './components/feedback';
import { Button } from './components/ui/button';
import { navigation } from './navigation';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import './index.css';
const Login = lazy(() => import('./login'));
const Layout = lazy(() => import('./layout'));
const Dashboard = lazy(() => import('./dashboard'));
const Directory = lazy(() => import('./directory'));
const Traceability = lazy(() => import('./traceability'));
const Reports = lazy(() => import('./reports'));
const Stock = lazy(() => import('./stock'));
const Settings = lazy(() => import('./settings'));
const WhatsApp = lazy(() => import('./commercial').then((m) => ({ default: m.WhatsAppPage })));
const Recurring = lazy(() => import('./commercial').then((m) => ({ default: m.RecurringPage })));
const PublicTraceability = lazy(() =>
  import('./traceability').then((m) => ({ default: m.PublicTraceability })),
);
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false } },
});
function Protected() {
  const { user, loading, error, retry } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="p-8">
        <Loading />
      </div>
    );
  if (error) return <ErrorState message={error.message} retry={retry} />;
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return <Outlet />;
}
function Permission({ name, children }: { name: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user!.permissions.includes(name))
    return (
      <div className="card p-8">
        <h1 className="page-title">Acesso restrito</h1>
        <p className="my-5 text-sm text-muted">Seu papel não permite acessar esta área.</p>
        <Button asChild>
          <Link to={user!.role === 'DRIVER' ? '/deliveries' : '/'}>Voltar para minha área</Link>
        </Button>
      </div>
    );
  return children;
}
function Home() {
  const { user } = useAuth();
  return user!.role === 'DRIVER' ? <Navigate to="/deliveries" replace /> : <Dashboard />;
}
function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <a href="#main" className="skip-link">
            Ir para o conteúdo
          </a>
          <Suspense
            fallback={
              <div className="p-8">
                <Loading />
              </div>
            }
          >
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/rastreio/:code" element={<PublicTraceability />} />
              <Route element={<Protected />}>
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  {navigation
                    .filter((n) => n.key !== 'dashboard')
                    .map((n) => (
                      <Route
                        key={n.key}
                        path={n.path}
                        element={
                          <Permission name={n.key}>
                            {n.key === 'traceability' ? (
                              <Traceability />
                            ) : n.key === 'stock' ? (
                              <Stock />
                            ) : n.key === 'reports' ? (
                              <Reports />
                            ) : n.key === 'settings' ? (
                              <Settings />
                            ) : n.key === 'whatsapp' ? (
                              <WhatsApp />
                            ) : n.key === 'recurring' ? (
                              <Recurring />
                            ) : (
                              <Directory key={n.key} resource={n.key} />
                            )}
                          </Permission>
                        }
                      />
                    ))}
                  <Route
                    path="*"
                    element={
                      <div className="card p-10">
                        <h1 className="page-title">Página não encontrada</h1>
                        <p className="my-5 text-sm text-muted">O endereço informado não existe.</p>
                        <Button asChild>
                          <Link to="/">Voltar ao início</Link>
                        </Button>
                      </div>
                    }
                  />
                </Route>
              </Route>
            </Routes>
          </Suspense>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
