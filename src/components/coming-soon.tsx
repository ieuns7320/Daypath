export function ComingSoon({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <h1 className="text-base font-medium">{title}</h1>
      <p className="text-sm text-fg-muted">{stage}에서 만들 예정이에요.</p>
    </div>
  );
}
