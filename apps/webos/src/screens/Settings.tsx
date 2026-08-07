import { useRef, useState } from 'react'
import { Focusable } from '../components/Focusable'
import { useSession } from '../store/SessionContext'

export function SettingsScreen() {
  const { session, activeUser, setServerUrl, signOutProfile, addUser, removeUser } = useSession()
  const [url, setUrl] = useState(session.apiBaseUrl)
  const [newName, setNewName] = useState('')
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  return (
    <div className="screen">
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

      <p className="muted" style={{ marginTop: 40 }}>
        MediaMash · catalog and playback come from your server.
      </p>
    </div>
  )
}
