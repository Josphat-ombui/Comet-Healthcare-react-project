import { Link } from 'react-router-dom'

// Polymorphic button — renders a <Link>, <a> or <button> based on `to`/`href`.
const VARIANTS = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  outline: 'btn btn-outline',
  outlineLight: 'btn btn-outline-light',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger',
}

const SIZES = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

export default function Button({
  to,
  href,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const content = loading ? (
    <>
      <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      {children}
    </>
  ) : (
    children
  )

  if (to) {
    return (
      <Link to={to} className={classes} aria-busy={loading} {...rest}>
        {content}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={classes} aria-busy={loading} {...rest}>
        {content}
      </a>
    )
  }
  return (
    <button type={rest.type || 'button'} className={classes} aria-busy={loading} {...rest}>
      {content}
    </button>
  )
}