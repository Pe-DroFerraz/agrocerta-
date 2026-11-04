import { AlertCircle, Leaf, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-4 p-10 text-center">
      <AlertCircle className="text-red-600" />
      <h2 className="font-heading font-bold">Não conseguimos carregar os dados</h2>
      <p className="text-sm text-muted">{message}</p>
      <Button variant="outline" onClick={retry}>
        <RefreshCw size={16} />
        Tentar novamente
      </Button>
    </div>
  );
}
export function EmptyState({
  title = 'Nenhum registro encontrado',
  description = 'Experimente ajustar a busca ou o período selecionado.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 p-12 text-center">
      <div className="rounded-full bg-primary/10 p-5">
        <Leaf className="text-primary" />
      </div>
      <h2 className="font-heading font-bold">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" aria-label="Carregando dados" className="space-y-5">
      <div className="skeleton h-9 w-64" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
      <div className="skeleton h-80" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
