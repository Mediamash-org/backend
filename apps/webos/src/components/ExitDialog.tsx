import { Focusable } from './Focusable'

interface ExitDialogProps {
  onConfirm: () => void
  onCancel: () => void
}

export function ExitDialog({ onConfirm, onCancel }: ExitDialogProps) {
  return (
    <div className="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <div className="exit-dialog__card">
        <p className="exit-dialog__brand">MEDIAMASH</p>
        <h2 id="exit-title" className="exit-dialog__title">
          Exit MediaMash?
        </h2>
        <p className="exit-dialog__copy">Press Back again or choose Exit to close the app.</p>
        <div className="exit-dialog__actions">
          <Focusable id="exit-confirm" className="btn btn--primary" autoFocus onSelect={onConfirm}>
            Exit
          </Focusable>
          <Focusable id="exit-cancel" className="btn btn--ghost" onSelect={onCancel}>
            Cancel
          </Focusable>
        </div>
      </div>
    </div>
  )
}
