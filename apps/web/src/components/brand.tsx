export function Brand({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 ${inverse ? 'text-white' : 'text-forest dark:text-green-100'}`}
    >
      <img src="/favicon.svg" alt="" className="h-10 w-10" />
      {!compact && (
        <div>
          <span className="font-heading text-[19px] font-extrabold tracking-[-.7px]">
            AGRO{' '}
            <span className={inverse ? 'text-[#b8d49b]' : 'text-primary dark:text-green-400'}>
              CERTA
            </span>
          </span>
          <p
            className={`mt-0.5 text-[9px] font-semibold uppercase tracking-[2.4px] ${inverse ? 'text-green-100/65' : 'text-stone-500 dark:text-slate-400'}`}
          >
            Do campo à mesa
          </p>
        </div>
      )}
    </div>
  );
}
