import { type ReactElement, useId } from 'react'

export interface SabakiLogoIconProps {
  className?: string
  title?: string
}

/**
 * Sabaki brand icon atom featuring the flat-vector "Sabatora Paw Card Sorting"
 * (猫の手カードさばき) mark.
 */
export function SabakiLogoIcon({
  className = 'h-9 w-9',
  title = 'Sabaki'
}: SabakiLogoIconProps): ReactElement {
  const uid = useId()
  const squircleClipId = `${uid}-squircle`
  const pawClipId = `${uid}-paw`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={squircleClipId}>
          <rect x="16" y="16" width="224" height="224" rx="52" />
        </clipPath>
        <clipPath id={pawClipId}>
          <path d="M58 248 L80 165 C84 147 102 137 120 142 C138 147 148 164 143 182 L126 248 Z" />
        </clipPath>
      </defs>

      <rect x="16" y="16" width="224" height="224" rx="52" fill="#D1FAE5" />

      <g clipPath={`url(#${squircleClipId})`}>
        <g transform="rotate(-24 118 148)">
          <rect
            x="64"
            y="50"
            width="88"
            height="112"
            rx="16"
            fill="#38BDF8"
            stroke="#1E293B"
            strokeWidth="7.5"
          />
          <circle cx="91" cy="79" r="9" fill="#E0F2FE" />
        </g>

        <g transform="rotate(-4 128 148)">
          <rect
            x="82"
            y="46"
            width="90"
            height="114"
            rx="16"
            fill="#FBBF24"
            stroke="#1E293B"
            strokeWidth="7.5"
          />
          <circle cx="109" cy="75" r="9" fill="#FEF3C7" />
        </g>

        <g transform="rotate(16 138 148)">
          <path
            d="M116 50 H170 L192 72 V146 C192 155 185 162 176 162 H116 C107 162 100 155 100 146 V66 C100 57 107 50 116 50 Z"
            fill="#10B981"
            stroke="#1E293B"
            strokeWidth="7.5"
            strokeLinejoin="round"
          />
          <path
            d="M125 97 L123 81 L136 90 H154 L167 81 L165 97"
            fill="#D1FAE5"
            stroke="#064E3B"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <rect
            x="121"
            y="93"
            width="48"
            height="36"
            rx="16"
            fill="#D1FAE5"
            stroke="#064E3B"
            strokeWidth="5"
          />
          <circle cx="136" cy="109" r="3.5" fill="#064E3B" />
          <circle cx="154" cy="109" r="3.5" fill="#064E3B" />
          <path
            d="M140 117 Q145 122 150 117"
            fill="none"
            stroke="#064E3B"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>

        <g clipPath={`url(#${pawClipId})`}>
          <path
            d="M58 248 L80 165 C84 147 102 137 120 142 C138 147 148 164 143 182 L126 248 Z"
            fill="#CBD5E1"
          />
          <path
            d="M72 183 C78 156 100 140 121 145 C141 151 150 170 143 194 C124 198 92 193 72 183 Z"
            fill="#F8FAFC"
          />
          <path d="M62 199 L95 207" stroke="#475569" strokeWidth="8.5" strokeLinecap="round" />
          <path d="M57 217 L92 225" stroke="#475569" strokeWidth="8.5" strokeLinecap="round" />
          <path d="M142 215 L112 208" stroke="#475569" strokeWidth="8.5" strokeLinecap="round" />
          <ellipse cx="109" cy="176" rx="11" ry="8" transform="rotate(14 109 176)" fill="#FB7185" />
          <circle cx="94" cy="162" r="5" fill="#FB7185" />
          <circle cx="111" cy="158" r="5" fill="#FB7185" />
          <circle cx="126" cy="165" r="5" fill="#FB7185" />
        </g>
        <path
          d="M58 248 L80 165 C84 147 102 137 120 142 C138 147 148 164 143 182 L126 248 Z"
          fill="none"
          stroke="#1E293B"
          strokeWidth="8"
          strokeLinejoin="round"
        />

        <path
          d="M202 158 C211 166 216 176 216 188"
          fill="none"
          stroke="#10B981"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M212 145 C220 151 225 159 227 169"
          fill="none"
          stroke="#10B981"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </g>

      <rect
        x="16"
        y="16"
        width="224"
        height="224"
        rx="52"
        fill="none"
        stroke="#10B981"
        strokeWidth="6"
      />
    </svg>
  )
}
