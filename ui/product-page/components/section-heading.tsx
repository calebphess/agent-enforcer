type SectionHeadingProps = {
  eyebrow: string
  title: React.ReactNode
  description?: React.ReactNode
  align?: 'left' | 'center'
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: SectionHeadingProps) {
  return (
    <div
      className={`reveal flex max-w-2xl flex-col gap-4 ${
        align === 'center' ? 'mx-auto items-center text-center' : 'items-start text-left'
      }`}
    >
      <span className="eyebrow flex items-center gap-2">
        <span className="inline-block h-px w-6 bg-gold/60" aria-hidden />
        {eyebrow}
      </span>
      <h2 className="text-balance text-3xl font-extrabold tracking-tight text-paper sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="text-pretty text-base leading-relaxed text-muted-blue sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  )
}
