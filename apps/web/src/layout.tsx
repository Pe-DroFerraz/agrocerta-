import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  Bell,
  Search,
  Sun,
  Moon,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  ArrowUpRight,
  Check,
  Leaf,
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Brand } from './components/brand';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog';
import { useAuth } from './lib/auth';
import { api, type PageData } from './lib/api';
import { cn, roleLabels, date } from './lib/utils';
import { navigation } from './navigation';
interface Notification {
  id: string;
  title: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}
function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('agro-theme', dark ? 'dark' : 'light');
    } catch {
      /* Sem armazenamento persistente, o tema vale para esta sessão. */
    }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}
export default function Layout() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [tour, setTour] = useState(() => {
    try {
      return localStorage.getItem(`agro-tour-${user!.id}`) !== 'done';
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const nav = navigation.filter((n) => user!.permissions.includes(n.key));
  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch((s) => !s);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    setMobile(false);
  }, [location.pathname]);
  const notifications = useQuery({
    queryKey: ['notifications', user!.id],
    queryFn: () => api<{ rows: Notification[] }>('/notifications'),
  });
  const mark = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const results = useQuery({
    queryKey: ['search', user!.id, query],
    queryFn: async () => {
      const resources = nav.filter((n) => n.key !== 'dashboard');
      const pages = await Promise.all(
        resources.map(async (n) => ({
          nav: n,
          data: await api<PageData>(`/${n.key}?limit=3&search=${encodeURIComponent(query)}`),
        })),
      );
      return pages.flatMap(({ nav, data }) =>
        data.rows.map((row) => ({
          id: String(row.id),
          label: String(row.name ?? row.code ?? row.title ?? row.producer ?? row.customer),
          nav,
        })),
      );
    },
    enabled: search && query.length >= 2,
  });
  const current = nav.find((n) => n.path === location.pathname);
  const finishTour = () => {
    setTour(false);
    try {
      localStorage.setItem(`agro-tour-${user!.id}`, 'done');
    } catch {
      /* Persistência opcional. */
    }
  };
  const tours = [
    {
      title: 'Boas-vindas à sua gestão',
      text: 'A Agro Certa reúne a origem do leite, a produção e os resultados do negócio em um só lugar.',
    },
    {
      title: 'Comece pelo painel',
      text: 'Escolha um período para acompanhar os indicadores reais do banco. Seu papel define quais informações estão disponíveis.',
    },
    {
      title: 'Encontre tudo com facilidade',
      text: 'Use o menu para consultar os registros ou pressione Ctrl + K para pesquisar. As listas permitem buscar, ordenar e exportar os resultados.',
    },
    {
      title: 'Explore com tranquilidade',
      text: 'Este ambiente usa dados de demonstração. Você pode trocar o tema, consultar alertas e acessar os dados permitidos ao seu perfil.',
    },
  ];
  return (
    <div className="min-h-dvh">
      {mobile && (
        <button
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Fechar navegação"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={cn(
          'sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-stone-200/80 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-slate-950',
          collapsed ? 'lg:w-[86px]' : 'lg:w-[252px]',
          mobile ? 'w-[268px] translate-x-0' : 'w-[252px] -translate-x-full lg:translate-x-0',
        )}
      >
        <div className={cn('flex h-[90px] items-center px-6', collapsed && 'lg:px-5')}>
          <Brand compact={collapsed && !mobile} />
          <button
            className="ml-auto lg:hidden"
            aria-label="Fechar menu"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div
          className={cn(
            'mx-4 mb-5 flex items-center gap-3 rounded-xl border border-stone-200/70 bg-cream/70 p-3 dark:border-slate-800 dark:bg-slate-900',
            collapsed && 'lg:justify-center lg:p-2',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Leaf size={17} className="text-primary dark:text-green-400" />
          </div>
          {(!collapsed || mobile) && (
            <div>
              <p className="text-xs font-semibold">Agro Certa</p>
              <p className="mt-1 text-[10px] text-muted">Ambiente de demonstração</p>
            </div>
          )}
        </div>
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 pb-6">
          {nav.map((n, i) => {
            const group = i === 0 || nav[i - 1].group !== n.group;
            return (
              <div key={n.key}>
                {group && (!collapsed || mobile) && (
                  <p className="mb-2 mt-5 px-3 text-[9px] font-bold tracking-[1.8px] text-stone-400 dark:text-slate-500">
                    {n.group}
                  </p>
                )}
                <NavLink
                  to={n.path}
                  end={n.path === '/'}
                  title={collapsed ? n.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'nav-item group my-1 flex items-center gap-3 rounded-xl px-3 py-3 text-[12px] font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 font-semibold text-forest dark:bg-green-500/15 dark:text-green-300'
                        : 'text-stone-600 hover:bg-stone-50 hover:text-forest dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-green-300',
                      collapsed && 'lg:justify-center',
                    )
                  }
                >
                  <n.icon size={18} strokeWidth={1.7} />
                  {(!collapsed || mobile) && <span>{n.label}</span>}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-stone-100 p-4 dark:border-slate-800">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden w-full items-center gap-3 rounded-xl px-2 py-2 text-xs text-muted hover:bg-stone-50 dark:hover:bg-slate-900 lg:flex"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? (
              <ChevronsRight size={18} />
            ) : (
              <>
                <ChevronsLeft size={18} />
                Recolher menu
              </>
            )}
          </button>
        </div>
      </aside>
      <div
        className={cn(
          'transition-[margin] duration-200',
          collapsed ? 'lg:ml-[86px]' : 'lg:ml-[252px]',
        )}
      >
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between gap-3 border-b border-stone-200/70 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-7 xl:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </Button>
            <div className="hidden items-center gap-2 text-xs text-muted md:flex">
              Meu negócio <span className="px-1 text-stone-300">/</span>
              <span className="font-medium text-stone-800 dark:text-slate-100">
                {current?.label ?? 'Página'}
              </span>
            </div>
            <span className="font-heading font-bold md:hidden">Agro Certa</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <button
              onClick={() => setSearch(true)}
              aria-label="Buscar no sistema"
              className="flex h-9 items-center gap-2 rounded-lg text-xs text-muted sm:border sm:border-stone-200 sm:px-3 dark:sm:border-slate-700"
            >
              <Search size={16} />
              <span className="hidden xl:inline">Buscar no sistema</span>
              <kbd className="ml-4 hidden rounded bg-stone-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800 sm:inline">
                ⌘ K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={theme.dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              onClick={theme.toggle}
            >
              {theme.dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notificações"
              className="relative"
              onClick={() => setAlerts(true)}
            >
              <Bell size={18} />
              {notifications.data?.rows.some((n) => !n.readAt) && (
                <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-white dark:ring-slate-950" />
              )}
            </Button>
            <div className="mx-1 hidden h-7 w-px bg-stone-200 dark:bg-slate-700 sm:block" />
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <button
                  aria-label="Menu da conta"
                  className="flex items-center gap-2.5 rounded-xl px-1 py-1"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#edf0df] text-xs font-bold text-forest dark:border-slate-800">
                    {user!.name
                      .split(' ')
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join('')}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-xs font-semibold">{user!.name}</span>
                    <span className="mt-1 block text-[10px] text-muted">
                      {roleLabels[user!.role]}
                    </span>
                  </span>
                  <ChevronDown size={13} className="hidden text-muted sm:block" />
                </button>
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content
                  align="end"
                  sideOffset={10}
                  className="z-50 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="px-3 py-2 text-xs text-muted">{user!.email}</p>
                  <Dropdown.Item
                    onSelect={() => {
                      setStep(0);
                      setTour(true);
                    }}
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none focus:bg-stone-100 dark:focus:bg-slate-800"
                  >
                    Conhecer o painel
                  </Dropdown.Item>
                  <Dropdown.Item
                    onSelect={() => {
                      void logout().catch((e: Error) => toast.error(e.message));
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 outline-none focus:bg-red-50 dark:text-red-300 dark:focus:bg-red-950"
                  >
                    <LogOut size={15} />
                    Sair da conta
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1600px] px-4 pb-28 pt-7 sm:px-7 lg:pb-12 xl:px-9">
          <Outlet />
        </main>
        <footer className="hidden items-center justify-between border-t border-stone-200/60 px-9 py-5 text-[10px] text-muted dark:border-slate-800 lg:flex">
          <span>Agro Certa · Do campo à mesa, com confiança.</span>
          <span>Demonstração · Etapa 1</span>
        </footer>
      </div>
      <nav
        aria-label="Navegação móvel"
        className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-stone-200 bg-white px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 dark:border-slate-800 dark:bg-slate-950 lg:hidden"
      >
        {nav.slice(0, 3).map((n) => (
          <NavLink
            key={n.key}
            to={n.path}
            end
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 rounded-lg p-2 text-[9px]',
                isActive ? 'font-semibold text-primary dark:text-green-300' : 'text-muted',
              )
            }
          >
            <n.icon size={19} />
            {n.label.split(' e ')[0]}
          </NavLink>
        ))}
        <button
          className="flex flex-1 flex-col items-center gap-1 p-2 text-[9px] text-muted"
          onClick={() => setMobile(true)}
        >
          <Menu size={19} />
          Menu
        </button>
      </nav>
      <Dialog open={search} onOpenChange={setSearch}>
        <DialogContent>
          <DialogTitle className="font-heading text-lg font-bold">
            Encontre no seu negócio
          </DialogTitle>
          <DialogDescription className="mb-4 mt-2 text-xs text-muted">
            Busque registros ou acesse uma área permitida ao seu perfil.
          </DialogDescription>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-3 text-muted" />
            <input
              autoFocus
              aria-label="Busca global"
              placeholder="Nome, produto ou código do lote…"
              className="pl-10"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="mt-3 max-h-[50dvh] overflow-auto">
            {query.length < 2 ? (
              nav.map((n) => (
                <button
                  key={n.key}
                  className="search-result"
                  onClick={() => {
                    navigate(n.path);
                    setSearch(false);
                  }}
                >
                  <n.icon size={17} />
                  {n.label}
                  <ArrowUpRight size={14} className="ml-auto" />
                </button>
              ))
            ) : results.isPending ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted">
                <Loader2 className="animate-spin" size={16} />
                Buscando registros…
              </p>
            ) : results.error ? (
              <p role="alert" className="p-4 text-sm text-red-700">
                {results.error.message}
              </p>
            ) : results.data?.length ? (
              results.data.map((r) => (
                <button
                  key={`${r.nav.key}-${r.id}`}
                  className="search-result"
                  onClick={() => {
                    navigate(`${r.nav.path}?search=${encodeURIComponent(query)}`);
                    setSearch(false);
                  }}
                >
                  <r.nav.icon size={17} />
                  <span className="min-w-0 text-left">
                    <span className="block truncate">{r.label}</span>
                    <span className="text-[10px] text-muted">{r.nav.label}</span>
                  </span>
                  <ArrowUpRight size={14} className="ml-auto shrink-0" />
                </button>
              ))
            ) : (
              <p className="p-5 text-center text-sm text-muted">Nenhum registro encontrado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={alerts} onOpenChange={setAlerts}>
        <DialogContent>
          <DialogTitle className="font-heading text-lg font-bold">Suas notificações</DialogTitle>
          <DialogDescription className="mt-2 text-xs text-muted">
            Avisos direcionados ao seu usuário.
          </DialogDescription>
          <div className="mt-5 space-y-3">
            {notifications.isPending ? (
              <p className="text-sm text-muted">Carregando…</p>
            ) : notifications.error ? (
              <p role="alert">{notifications.error.message}</p>
            ) : notifications.data?.rows.length ? (
              notifications.data.rows.map((n) => (
                <article
                  key={n.id}
                  className={cn(
                    'rounded-xl border p-4',
                    n.readAt
                      ? 'border-stone-200 dark:border-slate-700'
                      : 'border-primary/20 bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{n.title}</h3>
                    {n.readAt ? (
                      <Check size={15} className="text-primary" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={mark.isPending}
                        onClick={() => mark.mutate(n.id)}
                      >
                        Marcar lida
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">{n.content}</p>
                  <p className="mt-2 text-[10px] text-muted">{date(n.createdAt)}</p>
                </article>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                Tudo em dia. Você não tem notificações.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={tour}
        onOpenChange={(open) => {
          if (!open) finishTour();
        }}
      >
        <DialogContent>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Leaf className="text-primary" />
          </div>
          <p className="eyebrow">SEU PRIMEIRO ACESSO · {step + 1} DE 4</p>
          <DialogTitle className="mt-3 font-heading text-xl font-bold">
            {tours[step].title}
          </DialogTitle>
          <DialogDescription className="mt-4 text-sm leading-7 text-muted">
            {tours[step].text}
          </DialogDescription>
          <div className="mt-7 flex items-center justify-between">
            <div className="flex gap-1.5">
              {tours.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full',
                    i === step ? 'w-6 bg-primary' : 'w-1.5 bg-stone-200 dark:bg-slate-700',
                  )}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={finishTour}>
                Pular tour
              </Button>
              <Button onClick={() => (step === 3 ? finishTour() : setStep(step + 1))}>
                {step === 3 ? 'Vamos começar' : 'Próximo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
