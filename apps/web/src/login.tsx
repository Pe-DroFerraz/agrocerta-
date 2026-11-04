import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sprout, Loader2 } from 'lucide-react';
import { useAuth } from './lib/auth';
import { Brand } from './components/brand';
import { Button } from './components/ui/button';
import { ErrorState, Loading } from './components/feedback';
const schema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});
export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });
  if (auth.loading)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Loading />
      </div>
    );
  if (auth.error) return <ErrorState message={auth.error.message} retry={auth.retry} />;
  if (auth.user) return <Navigate to={auth.user.role === 'DRIVER' ? '/deliveries' : '/'} replace />;
  const demo = (role: string) => {
    form.setValue('email', `${role}@agrocerta.com`, { shouldValidate: true });
    form.setValue('password', 'agro123', { shouldValidate: true });
  };
  return (
    <div className="login-page min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden min-h-dvh overflow-hidden bg-forest p-12 text-white lg:flex lg:flex-col xl:p-16">
        <Brand inverse />
        <div className="relative z-10 my-auto max-w-lg py-20">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs text-green-100">
            <Sprout size={15} /> Feito para quem produz com cuidado
          </div>
          <h1 className="font-heading text-5xl font-bold leading-[1.18] tracking-[-2px]">
            O cuidado do campo.
            <br />
            <span className="text-[#d6e4b6]">A clareza na gestão.</span>
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-green-100/80">
            Cada litro tem uma origem. Cada produto, uma história. Tenha sua produção inteira em
            boas mãos.
          </p>
          <div className="mt-10 flex gap-7 text-xs text-green-100">
            <span className="flex items-center gap-2">
              <ShieldCheck size={18} />
              Origem rastreável
            </span>
            <span className="flex items-center gap-2">
              <Sprout size={18} />
              Gestão mais simples
            </span>
          </div>
        </div>
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-40"
          viewBox="0 0 700 280"
          aria-hidden="true"
        >
          <circle cx="550" cy="80" r="42" fill="#E9B949" />
          <path d="M0 170Q180 40 370 160T700 100V280H0" fill="#4f8b5b" />
          <path d="M0 230Q270 90 470 220T700 170V280H0" fill="#93ae68" />
          <path d="m0 258 700-30m-700 48 700-30" stroke="#d6e4b6" strokeWidth="2" />
        </svg>
        <p className="relative z-10 text-xs text-green-100/75">
          Minas Gerais, Brasil · Do campo à mesa.
        </p>
      </aside>
      <main id="main" className="flex min-h-dvh flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[390px]">
          <div className="mb-12 lg:hidden">
            <Brand />
          </div>
          <span className="eyebrow">BEM-VINDO À AGRO CERTA</span>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-[-1px]">
            Sua gestão começa aqui.
          </h2>
          <p className="mb-8 mt-3 text-sm leading-6 text-muted">
            Entre na sua conta e acompanhe o que faz seu negócio crescer.
          </p>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              setError('');
              try {
                await auth.login(values.email, values.password);
                const target = (location.state as { from?: string } | null)?.from;
                navigate(target && target !== '/login' ? target : '/', { replace: true });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
              }
            })}
            className="space-y-5"
          >
            <div>
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="seuemail@empresa.com"
                {...form.register('email')}
                aria-invalid={!!form.formState.errors.email}
                aria-describedby="email-error"
              />
              <p id="email-error" className="field-error">
                {form.formState.errors.email?.message}
              </p>
            </div>
            <div>
              <label htmlFor="password">Senha</label>
              <div className="relative">
                <input
                  id="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Sua senha de acesso"
                  className="pr-12"
                  {...form.register('password')}
                  aria-invalid={!!form.formState.errors.password}
                  aria-describedby="password-error"
                />
                <button
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-3 text-muted"
                >
                  {visible ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              <p id="password-error" className="field-error">
                {form.formState.errors.password?.message}
              </p>
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="h-12 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  Entrar na minha conta
                  <ArrowRight size={18} />
                </>
              )}
            </Button>
          </form>
          <div className="mt-8 rounded-2xl border border-primary/15 bg-primary/[.04] p-4">
            <p className="text-xs font-semibold text-primary dark:text-green-300">
              Explore o ambiente de demonstração
            </p>
            <p className="mt-2 text-[11px] leading-5 text-muted">
              dono@agrocerta.com · senha: agro123
              <br />
              Escolha um perfil para preencher o acesso:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['dono', 'Gestor'],
                ['producao', 'Produção'],
                ['comercial', 'Comercial'],
                ['entregador', 'Entregador'],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => demo(key)}
                  className="rounded-lg border border-primary/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-forest transition-colors hover:bg-green-50 dark:bg-slate-900 dark:text-green-200"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-8 text-center text-[11px] text-muted">
            Agro Certa · Gestão que valoriza cada origem.
          </p>
        </div>
      </main>
    </div>
  );
}
