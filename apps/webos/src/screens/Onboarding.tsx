import { useEffect, useMemo, useRef, useState } from 'react'
import { getApiBaseUrl } from '../api/client'
import { Focusable } from '../components/Focusable'
import { useSession } from '../store/SessionContext'
import type { UserProfile } from '../store/session'

type Step = 'server' | 'profiles' | 'create'

interface OnboardingScreenProps {
  /** First-time setup vs returning profile picker */
  mode: 'setup' | 'profiles'
}

async function probeServer(url: string): Promise<boolean> {
  const base = url.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/`, { headers: { Accept: 'application/json' } })
    return res.ok
  } catch {
    return false
  }
}

function ProfileAvatar({ user, large }: { user: Pick<UserProfile, 'name' | 'color'>; large?: boolean }) {
  return (
    <div
      className={`profile-avatar${large ? ' profile-avatar--lg' : ''}`}
      style={{ background: user.color }}
      aria-hidden="true"
    >
      {user.name.slice(0, 1).toUpperCase()}
    </div>
  )
}

export function OnboardingScreen({ mode }: OnboardingScreenProps) {
  const { session, completeOnboarding, addUser, selectUser, setServerUrl } = useSession()
  const [step, setStep] = useState<Step>(mode === 'setup' ? 'server' : 'profiles')
  const [serverUrl, setServerUrlLocal] = useState(session.apiBaseUrl || getApiBaseUrl())
  const [profileName, setProfileName] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const serverInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setStep(mode === 'setup' ? 'server' : 'profiles')
  }, [mode])

  const title = useMemo(() => {
    if (step === 'server') return 'Connect your server'
    if (step === 'create') return 'Create a profile'
    return "Who's watching?"
  }, [step])

  const continueServer = async () => {
    const url = serverUrl.trim().replace(/\/$/, '')
    if (!url) {
      setError('Enter your OMSS server address.')
      return
    }
    setChecking(true)
    setError(null)
    const ok = await probeServer(url)
    setChecking(false)
    if (!ok) {
      setError('Unable to reach that server. Check the address and try again.')
      return
    }
    setServerUrl(url)
    if (mode === 'setup' && session.users.length === 0) {
      setStep('create')
      return
    }
    setStep('profiles')
  }

  const finishCreate = () => {
    const name = profileName.trim()
    if (!name) {
      setError('Enter a profile name.')
      return
    }
    setError(null)
    if (mode === 'setup' && !session.onboarded) {
      completeOnboarding(serverUrl.trim().replace(/\/$/, ''), name)
      return
    }
    addUser(name)
    setProfileName('')
    setStep('profiles')
  }

  return (
    <div className="onboard">
      <div className="onboard__panel">
        <p className="onboard__eyebrow">OMSS Stream</p>
        <h1 className="onboard__title">{title}</h1>

        {step === 'server' && (
          <>
            <p className="onboard__copy">
              Enter the address of your OMSS server. The TV app only talks to this server for
              catalog and playback.
            </p>
            <Focusable
              id="onboard-server-wrap"
              className="search-box"
              autoFocus
              onSelect={() => serverInputRef.current?.focus()}
            >
              <input
                ref={serverInputRef}
                className="search-input"
                value={serverUrl}
                placeholder="http://192.168.1.10:3000"
                tabIndex={-1}
                onChange={(e) => {
                  setServerUrlLocal(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void continueServer()
                  }
                  if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    document.getElementById('onboard-server-wrap')?.focus()
                  }
                }}
              />
            </Focusable>
            {error && <p className="onboard__error">{error}</p>}
            <div className="onboard__actions">
              <Focusable
                id="onboard-server-next"
                className="btn btn--play"
                onSelect={() => void continueServer()}
              >
                {checking ? 'Checking…' : 'Continue'}
              </Focusable>
            </div>
          </>
        )}

        {step === 'profiles' && (
          <>
            <p className="onboard__copy">Select a profile to continue, or add another one.</p>
            <div className="profile-grid">
              {session.users.map((user, index) => (
                <Focusable
                  key={user.id}
                  id={`profile-${user.id}`}
                  className="profile-card"
                  autoFocus={index === 0}
                  onSelect={() => selectUser(user.id)}
                >
                  <ProfileAvatar user={user} large />
                  <span className="profile-card__name">{user.name}</span>
                </Focusable>
              ))}
              <Focusable
                id="profile-add"
                className="profile-card profile-card--add"
                autoFocus={session.users.length === 0}
                onSelect={() => {
                  setError(null)
                  setProfileName('')
                  setStep('create')
                }}
              >
                <div className="profile-avatar profile-avatar--lg profile-avatar--add" aria-hidden="true">
                  +
                </div>
                <span className="profile-card__name">Add Profile</span>
              </Focusable>
            </div>
            <div className="onboard__actions">
              <Focusable
                id="onboard-edit-server"
                className="btn btn--ghost"
                onSelect={() => {
                  setError(null)
                  setStep('server')
                }}
              >
                Server settings
              </Focusable>
            </div>
          </>
        )}

        {step === 'create' && (
          <>
            <p className="onboard__copy">Give this profile a name for the TV. You can add more later.</p>
            <Focusable
              id="onboard-name-wrap"
              className="search-box"
              autoFocus
              onSelect={() => nameInputRef.current?.focus()}
            >
              <input
                ref={nameInputRef}
                className="search-input"
                value={profileName}
                placeholder="e.g. Living Room"
                maxLength={24}
                tabIndex={-1}
                onChange={(e) => {
                  setProfileName(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    finishCreate()
                  }
                  if (e.key === 'Escape' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    document.getElementById('onboard-name-wrap')?.focus()
                  }
                }}
              />
            </Focusable>
            {error && <p className="onboard__error">{error}</p>}
            <div className="onboard__actions">
              <Focusable id="onboard-create" className="btn btn--play" onSelect={finishCreate}>
                {mode === 'setup' && !session.onboarded ? 'Start watching' : 'Add profile'}
              </Focusable>
              {(mode === 'profiles' || session.users.length > 0) && (
                <Focusable
                  id="onboard-create-back"
                  className="btn btn--ghost"
                  onSelect={() => setStep('profiles')}
                >
                  Back
                </Focusable>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
