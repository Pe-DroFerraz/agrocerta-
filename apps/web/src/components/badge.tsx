import { cn } from '../lib/utils';
export function Badge({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold',
        ['DELIVERED', 'RELEASED', 'ACTIVE', 'true'].includes(value)
          ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
          : ['BLOCKED', 'EXPIRED', 'CANCELLED', 'false'].includes(value)
            ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
            : ['MATURING', 'NEW', 'IN_ROUTE'].includes(value)
              ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-stone-100 text-stone-700 dark:bg-slate-800 dark:text-slate-200',
      )}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {children}
    </span>
  );
}
