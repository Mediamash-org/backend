import { Focusable } from './Focusable'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <Focusable id="error-retry" className="btn btn--primary" onSelect={onRetry} autoFocus>
          Retry
        </Focusable>
      )}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-state">{label}</div>
}
