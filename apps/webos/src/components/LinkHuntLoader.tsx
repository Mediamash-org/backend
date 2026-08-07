/** Animated pirate hunting for stream links while sources resolve. */
export function LinkHuntLoader({
  title,
  label = 'Looking for links…',
}: {
  title?: string
  label?: string
}) {
  return (
    <div className="link-hunt" role="status" aria-live="polite" aria-label={label}>
      <div className="link-hunt__sky" aria-hidden="true">
        <span className="link-hunt__spark link-hunt__spark--1" />
        <span className="link-hunt__spark link-hunt__spark--2" />
        <span className="link-hunt__spark link-hunt__spark--3" />
      </div>

      <div className="link-hunt__scene" aria-hidden="true">
        <svg
          className="link-hunt__art"
          viewBox="0 0 320 260"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
        >
          {/* floating link chips the lens is chasing */}
          <g className="link-hunt__links">
            <g className="link-hunt__chip link-hunt__chip--a">
              <rect x="218" y="48" width="54" height="22" rx="11" fill="#e50914" opacity="0.9" />
              <path
                d="M230 59h10M242 59h8"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="232" cy="59" r="4" stroke="#fff" strokeWidth="2" fill="none" />
              <circle cx="248" cy="59" r="4" stroke="#fff" strokeWidth="2" fill="none" />
            </g>
            <g className="link-hunt__chip link-hunt__chip--b">
              <rect x="40" y="168" width="48" height="20" rx="10" fill="rgba(255,255,255,0.14)" />
              <path
                d="M52 178h8M64 178h6"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.8"
              />
            </g>
            <g className="link-hunt__chip link-hunt__chip--c">
              <rect x="250" y="150" width="42" height="18" rx="9" fill="rgba(229,9,20,0.45)" />
              <path d="M260 159h14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          </g>

          {/* pirate body */}
          <g className="link-hunt__pirate">
            {/* boots */}
            <ellipse cx="118" cy="232" rx="22" ry="8" fill="#1a1a1a" />
            <ellipse cx="158" cy="232" rx="22" ry="8" fill="#1a1a1a" />
            <path d="M104 210c2 12 8 20 18 22h-8c-10-2-14-12-12-22Z" fill="#2a1810" />
            <path d="M146 210c2 12 8 20 18 22h-8c-10-2-14-12-12-22Z" fill="#2a1810" />

            {/* legs */}
            <path d="M112 168c0 22 2 36 10 44h-8c-10-8-12-26-10-44Z" fill="#1c3a5f" />
            <path d="M154 168c0 22 2 36 10 44h-8c-10-8-12-26-10-44Z" fill="#1c3a5f" />

            {/* coat */}
            <path
              d="M96 112c4-18 22-30 42-30s38 12 42 30l6 56c-8 14-28 22-48 22s-40-8-48-22l6-56Z"
              fill="#e50914"
            />
            <path
              d="M118 88c4 20 8 40 8 62M158 88c-4 20-8 40-8 62"
              stroke="#9b0610"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0.55"
            />
            <path d="M128 118h20l-4 48h-12l-4-48Z" fill="#f5e6c8" opacity="0.95" />
            <circle cx="138" cy="132" r="4" fill="#c9a227" />
            <circle cx="138" cy="148" r="4" fill="#c9a227" />

            {/* arms */}
            <path
              d="M96 120c-18 8-28 28-26 42 2 8 10 12 18 8l12-22c2-8 0-18-4-28Z"
              fill="#e50914"
            />
            <path
              d="M180 118c16 10 30 24 28 40-1 8-10 12-18 8l-14-24c-2-8 0-16 4-24Z"
              fill="#e50914"
            />

            {/* head */}
            <circle cx="138" cy="70" r="34" fill="#f0c9a0" />
            {/* bandana */}
            <path
              d="M104 62c6-28 28-40 48-36 10 2 18 10 22 20-18-4-36-2-52 4-6 2-12 6-18 12Z"
              fill="#111"
            />
            <path d="M104 64c-8 4-14 2-18-2 6 10 14 14 24 12Z" fill="#111" />
            <path
              d="M112 48c8-2 16-2 24 0M120 40c6-2 12-2 18 0"
              stroke="#e50914"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* eyepatch */}
            <path
              d="M108 66c10-2 18 0 26 6"
              stroke="#111"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <ellipse cx="124" cy="72" rx="11" ry="9" fill="#111" />
            {/* open eye */}
            <ellipse cx="152" cy="72" rx="7" ry="8" fill="#fff" />
            <circle cx="153" cy="73" r="3.5" fill="#1a1a1a" />
            <circle cx="154.5" cy="71.5" r="1.2" fill="#fff" />
            {/* smile + beard hint */}
            <path
              d="M132 88c6 8 16 8 22 0"
              stroke="#8a5a3a"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M118 92c4 14 16 20 28 18 6-8 4-16 0-22"
              stroke="#5c3a28"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.35"
            />
          </g>

          {/* magnifying glass in right hand */}
          <g className="link-hunt__lens">
            <line
              x1="188"
              y1="148"
              x2="228"
              y2="188"
              stroke="#c9a227"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <line
              x1="188"
              y1="148"
              x2="228"
              y2="188"
              stroke="#8a7018"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="176" cy="128" r="38" fill="rgba(120,200,255,0.12)" stroke="#d4af37" strokeWidth="8" />
            <circle cx="176" cy="128" r="30" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
            <path
              d="M158 112c8-10 22-14 32-8"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* glint inside lens */}
            <circle className="link-hunt__glint" cx="168" cy="120" r="5" fill="#fff" opacity="0.7" />
          </g>
        </svg>
      </div>

      <div className="link-hunt__copy">
        {title && <p className="link-hunt__title">{title}</p>}
        <h2 className="link-hunt__label">
          {label}
          <span className="link-hunt__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </h2>
        <p className="link-hunt__hint">Scouring the seven seas of servers</p>
      </div>
    </div>
  )
}
