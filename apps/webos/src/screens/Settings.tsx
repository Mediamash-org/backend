import { useRef, useState } from 'react'
import { Focusable } from '../components/Focusable'
import { useSession } from '../store/SessionContext'
import type { AppPreferences } from '../store/session'
import { getAppVersion, isWebOs, platformBack } from '../webos/lifecycle'

const SUB_OPTIONS: Array<{ id: AppPreferences['preferredSubtitle']; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'auto', label: 'Auto (English when available)' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'hi', label: 'Hindi' },
  { id: 'de', label: 'German' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
]

function ToggleRow({
  id,
  label,
  description,
  value,
  onToggle,
}: {
  id: string
  label: string
  description: string
  value: boolean
  onToggle: () => void
}) {
  return (
    <Focusable
      id={id}
      className={`settings-toggle${value ? ' is-on' : ''}`}
      onSelect={onToggle}
      role="switch"
      aria-label={`${label}: ${value ? 'On' : 'Off'}`}
    >
      <div className="settings-toggle__copy">
        <span className="settings-toggle__label">{label}</span>
        <span className="settings-toggle__desc">{description}</span>
      </div>
      <span className="settings-toggle__switch" aria-hidden="true">
        <span className="settings-toggle__knob" />
      </span>
    </Focusable>
  )
}

export function SettingsScreen() {
  const {
    session,
    activeUser,
    setServerUrl,
    signOutProfile,
    addUser,
    removeUser,
    updatePreferences,
    clearLocalData,
    resetOnboarding,
  } = useSession()
  const prefs = session.preferences
  const [url, setUrl] = useState(session.apiBaseUrl)
  const [newName, setNewName] = useState('')
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  return (
    <div className="screen screen--settings">
      <header className="screen__header">
        <h1>Settings</h1>
        {activeUser && (
          <p className="muted">
            Signed in as <strong style={{ color: '#fff' }}>{activeUser.name}</strong>
          </p>
        )}
      </header>

      <h2 className="section-label">Server</h2>
      <label className="settings-label" htmlFor="api-base">
        Server API address
      </label>
      <Focusable
        id="settings-api-wrap"
        className="search-box"
        autoFocus
        onSelect={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          id="api-base"
          className="search-input"
          value={url}
          tabIndex={-1}
          onChange={(e) => {
            setUrl(e.target.value)
            setSaved(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              document.getElementById('settings-api-wrap')?.focus()
            }
          }}
        />
      </Focusable>
      <div className="hero__actions" style={{ marginTop: 20 }}>
        <Focusable
          id="settings-save"
          className="btn btn--primary"
          onSelect={() => {
            setServerUrl(url.trim())
            setSaved(true)
            setMessage(null)
          }}
        >
          Save server
        </Focusable>
        <Focusable id="settings-switch" className="btn btn--ghost" onSelect={() => signOutProfile()}>
          Switch profile
        </Focusable>
      </div>
      {saved && <p className="muted">Server address saved.</p>}

      <h2 className="section-label" style={{ marginTop: 40 }}>
        Playback
      </h2>
      <div className="settings-stack">
        <ToggleRow
          id="settings-autoplay"
          label="Autoplay next episode"
          description="When an episode ends, count down and play the next one."
          value={prefs.autoplayNext}
          onToggle={() => updatePreferences({ autoplayNext: !prefs.autoplayNext })}
        />
        <ToggleRow
          id="settings-splash-sound"
          label="Splash sound"
          description="Play the MediaMash jingle when the app launches."
          value={prefs.splashSound}
          onToggle={() => updatePreferences({ splashSound: !prefs.splashSound })}
        />
      </div>

      <h2 className="section-label" style={{ marginTop: 36 }}>
        Subtitles
      </h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Preferred language when a title loads (stream tracks still win when present).
      </p>
      <div className="settings-stack">
        {SUB_OPTIONS.map((opt) => (
          <Focusable
            key={opt.id}
            id={`settings-sub-${opt.id}`}
            className={`settings-choice${prefs.preferredSubtitle === opt.id ? ' is-active' : ''}`}
            onSelect={() => updatePreferences({ preferredSubtitle: opt.id })}
          >
            <span>{opt.label}</span>
            {prefs.preferredSubtitle === opt.id && <span className="settings-choice__check">✓</span>}
          </Focusable>
        ))}
      </div>

      <h2 className="section-label" style={{ marginTop: 40 }}>
        Profiles
      </h2>
      <div className="profile-grid profile-grid--settings">
        {session.users.map((user) => (
          <div key={user.id} className="profile-settings-row">
            <div className="profile-avatar" style={{ background: user.color }} aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <span className="profile-card__name">{user.name}</span>
            {session.users.length > 1 && (
              <Focusable
                id={`settings-remove-${user.id}`}
                className="btn btn--ghost btn--compact"
                onSelect={() => {
                  removeUser(user.id)
                  setMessage(`Removed ${user.name}`)
                }}
              >
                Remove
              </Focusable>
            )}
          </div>
        ))}
      </div>

      <label className="settings-label" htmlFor="new-profile" style={{ marginTop: 20 }}>
        Add another profile
      </label>
      <Focusable
        id="settings-name-wrap"
        className="search-box"
        onSelect={() => nameRef.current?.focus()}
      >
        <input
          ref={nameRef}
          id="new-profile"
          className="search-input"
          value={newName}
          placeholder="Profile name"
          maxLength={24}
          tabIndex={-1}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              document.getElementById('settings-name-wrap')?.focus()
            }
          }}
        />
      </Focusable>
      <div className="hero__actions" style={{ marginTop: 16 }}>
        <Focusable
          id="settings-add-profile"
          className="btn btn--play"
          onSelect={() => {
            if (!newName.trim()) {
              setMessage('Enter a profile name.')
              return
            }
            addUser(newName.trim())
            setNewName('')
            setMessage('Profile added.')
          }}
        >
          Add profile
        </Focusable>
      </div>
      {message && <p className="muted">{message}</p>}

      <h2 className="section-label" style={{ marginTop: 40 }}>
        Data & app
      </h2>
      <div className="settings-stack">
        {!confirmClear ? (
          <Focusable
            id="settings-clear"
            className="settings-choice"
            onSelect={() => setConfirmClear(true)}
          >
            Clear local data (profiles & preferences)
          </Focusable>
        ) : (
          <div className="hero__actions">
            <Focusable
              id="settings-clear-confirm"
              className="btn btn--primary"
              autoFocus
              onSelect={() => {
                clearLocalData()
                resetOnboarding()
                setConfirmClear(false)
                setMessage('Local data cleared.')
              }}
            >
              Confirm clear
            </Focusable>
            <Focusable
              id="settings-clear-cancel"
              className="btn btn--ghost"
              onSelect={() => setConfirmClear(false)}
            >
              Cancel
            </Focusable>
          </div>
        )}
        <Focusable
          id="settings-exit"
          className="settings-choice settings-choice--danger"
          onSelect={() => platformBack()}
        >
          {isWebOs() ? 'Exit MediaMash' : 'Close window'}
        </Focusable>
      </div>

      <p className="muted" style={{ marginTop: 40 }}>
        MediaMash · v{getAppVersion()}
        {isWebOs() ? ' · webOS' : ''} · catalog and playback come from your server.
      </p>
    </div>
  )
}
