import React from 'react';

const PALETTES = {
  dashboard: ['#7C3AED', '#C084FC', '#F0ABFC'],
  students: ['#7C3AED', '#A78BFA', '#F0ABFC'],
  teachers: ['#6D28D9', '#8B5CF6', '#F9A8D4'],
  conversations: ['#7C3AED', '#D946EF', '#F9A8D4'],
  words: ['#8B5CF6', '#A855F7', '#FBBF24'],
  materials: ['#7C3AED', '#8B5CF6', '#38BDF8'],
};

function Background({ idPrefix, palette }) {
  const [primary, secondary, accent] = palette;

  return (
    <>
      <defs>
        <linearGradient id={`${idPrefix}-card`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="54%" stopColor="#F7F0FF" />
          <stop offset="100%" stopColor="#FFF1F8" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-main`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={primary} />
          <stop offset="62%" stopColor={secondary} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
        <radialGradient id={`${idPrefix}-glow`} cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0" />
        </radialGradient>
        <filter id={`${idPrefix}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#6D28D9" floodOpacity="0.16" />
        </filter>
      </defs>

      <rect width="420" height="170" rx="26" fill={`url(#${idPrefix}-card)`} />
      <circle cx="210" cy="82" r="112" fill={`url(#${idPrefix}-glow)`} />
      <path
        d="M42 46 C85 10 128 88 169 48 C213 5 258 74 305 38 C335 14 360 21 384 36"
        fill="none"
        stroke="#C4B5FD"
        strokeWidth="2"
        strokeDasharray="5 7"
        opacity="0.55"
      />
      <circle cx="54" cy="130" r="4" fill={primary} opacity="0.34" />
      <circle cx="358" cy="121" r="5" fill={accent} opacity="0.75" />
      <path d="M376 65 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4z" fill={secondary} opacity="0.55" />
      <path d="M64 28 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" fill={accent} opacity="0.75" />
    </>
  );
}

function DashboardVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-4 154 88)">
        <rect x="66" y="30" width="184" height="116" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <rect x="88" y="54" width="48" height="34" rx="13" fill="#F5F0FF" />
        <rect x="148" y="54" width="76" height="34" rx="13" fill="#FDF2F8" />
        <rect x="88" y="101" width="136" height="14" rx="7" fill="#EDE9FE" />
        <rect x="88" y="124" width="96" height="12" rx="6" fill="#F5D0FE" opacity="0.9" />
        <path d="M100 76 l10 -12 12 8 24 -20" fill="none" stroke={`url(#${idPrefix}-main)`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(5 292 96)">
        <rect x="250" y="48" width="94" height="94" rx="23" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="297" cy="95" r="30" fill="none" stroke="#F1E9FF" strokeWidth="10" />
        <circle cx="297" cy="95" r="30" fill="none" stroke={`url(#${idPrefix}-main)`} strokeWidth="10" strokeLinecap="round" strokeDasharray="124 190" transform="rotate(-90 297 95)" />
        <text x="297" y="100" textAnchor="middle" fontSize="22" fontWeight="900" fill="#160A52">75%</text>
      </g>
    </>
  );
}

function StudentsVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-5 145 88)">
        <rect x="70" y="25" width="170" height="120" rx="24" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        {[0, 1, 2].map((row) => (
          <g key={row} transform={`translate(92 ${52 + row * 30})`}>
            <circle cx="0" cy="0" r="10" fill="#EDE9FE" />
            <circle cx="0" cy="-3" r="4" fill="#7C3AED" opacity="0.82" />
            <path d="M-7 7 C-5 1 5 1 7 7" fill="#7C3AED" opacity="0.82" />
            <rect x="20" y="-7" width="82" height="7" rx="3.5" fill="#EDE9FE" />
            <rect x="20" y="5" width="58" height="6" rx="3" fill="#F5D0FE" />
            <rect x="118" y="-10" width="26" height="20" rx="10" fill={`url(#${idPrefix}-main)`} opacity="0.88" />
          </g>
        ))}
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(7 292 92)">
        <rect x="250" y="47" width="86" height="90" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="293" cy="84" r="23" fill="#F5F0FF" />
        <circle cx="293" cy="76" r="9" fill="#8B5CF6" />
        <path d="M275 103 C281 87 305 87 311 103" fill="#8B5CF6" opacity="0.9" />
        <text x="293" y="126" textAnchor="middle" fontSize="13" fontWeight="900" fill="#7C3AED">A2</text>
      </g>
    </>
  );
}

function TeachersVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-4 160 88)">
        <rect x="76" y="29" width="176" height="116" rx="24" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <rect x="100" y="50" width="128" height="70" rx="16" fill="#F8F5FF" stroke="#EDE9FE" />
        <path d="M119 76 h72 M119 96 h50" stroke="#C4B5FD" strokeWidth="6" strokeLinecap="round" />
        <path d="M197 68 l18 -9 18 9 -18 9z" fill={`url(#${idPrefix}-main)`} />
        <path d="M204 75 v13 c7 5 15 5 22 0 V75" fill="none" stroke="#7C3AED" strokeWidth="4" strokeLinecap="round" />
        <rect x="115" y="128" width="100" height="8" rx="4" fill="#DDD6FE" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(6 304 95)">
        <rect x="265" y="47" width="78" height="96" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="304" cy="78" r="16" fill="#EDE9FE" />
        <path d="M289 113 C294 96 314 96 319 113" fill="#8B5CF6" opacity="0.88" />
        <circle cx="304" cy="75" r="8" fill="#8B5CF6" />
        <rect x="284" y="123" width="40" height="8" rx="4" fill="#F5D0FE" />
      </g>
    </>
  );
}

function ConversationsVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-5 153 86)">
        <rect x="61" y="39" width="178" height="86" rx="28" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M101 125 l-18 23 35 -18" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="104" cy="82" r="9" fill={`url(#${idPrefix}-main)`} />
        <rect x="126" y="67" width="80" height="10" rx="5" fill="#EDE9FE" />
        <rect x="126" y="88" width="58" height="9" rx="4.5" fill="#F5D0FE" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(5 278 100)">
        <rect x="214" y="66" width="142" height="72" rx="26" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M318 138 l20 20 -9 -28" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="247" cy="101" r="7" fill="#D946EF" opacity="0.82" />
        <circle cx="279" cy="101" r="7" fill="#8B5CF6" opacity="0.82" />
        <circle cx="311" cy="101" r="7" fill="#F9A8D4" opacity="0.95" />
      </g>
      <g transform="translate(278 30)">
        <rect width="58" height="30" rx="15" fill={`url(#${idPrefix}-main)`} />
        <text x="29" y="20" textAnchor="middle" fontSize="13" fontWeight="900" fill="#FFFFFF">AI</text>
      </g>
    </>
  );
}

function WordsVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-8 145 88)">
        <rect x="82" y="32" width="132" height="96" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <text x="148" y="76" textAnchor="middle" fontSize="24" fontWeight="900" fill="#160A52">שלום</text>
        <text x="148" y="100" textAnchor="middle" fontSize="14" fontWeight="900" fill="#7C3AED">مرحبا</text>
        <rect x="112" y="111" width="72" height="8" rx="4" fill="#DDD6FE" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(7 260 92)">
        <rect x="204" y="50" width="132" height="92" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M237 93 l17 17 42 -48" fill="none" stroke={`url(#${idPrefix}-main)`} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="228" y="118" width="82" height="8" rx="4" fill="#F5D0FE" />
      </g>
      <g transform="translate(73 132)">
        <rect width="82" height="26" rx="13" fill={`url(#${idPrefix}-main)`} />
        <text x="41" y="18" textAnchor="middle" fontSize="12" fontWeight="900" fill="#FFFFFF">מילים</text>
      </g>
    </>
  );
}

function MaterialsVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-6 150 86)">
        <rect x="88" y="26" width="142" height="120" rx="24" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M190 26 v32 h40" fill="#F5F0FF" />
        <path d="M190 26 l40 32" fill="none" stroke="#DDD6FE" strokeWidth="2" />
        <path d="M117 92 h8 l8 -24 12 49 12 -36 9 22 h38" fill="none" stroke={`url(#${idPrefix}-main)`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="124" y="124" width="70" height="9" rx="4.5" fill="#DDD6FE" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(7 298 94)">
        <rect x="258" y="54" width="86" height="88" rx="24" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M301 112 V75" fill="none" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round" />
        <path d="M283 92 l18 -18 18 18" fill="none" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="281" y="121" width="40" height="8" rx="4" fill="#DDD6FE" />
      </g>
    </>
  );
}

const CONTENT = {
  dashboard: DashboardVisual,
  students: StudentsVisual,
  teachers: TeachersVisual,
  conversations: ConversationsVisual,
  words: WordsVisual,
  materials: MaterialsVisual,
};

export default function AdminHeroVisual({ type = 'dashboard', className = '' }) {
  const safeType = CONTENT[type] ? type : 'dashboard';
  const palette = PALETTES[safeType] || PALETTES.dashboard;
  const idPrefix = `lisan-hero-${safeType}`;
  const Visual = CONTENT[safeType];

  return (
    <div className={`relative h-full min-h-[140px] w-full overflow-hidden ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 420 170"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <Background idPrefix={idPrefix} palette={palette} />
        <Visual idPrefix={idPrefix} />
      </svg>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white/75 to-transparent" />
    </div>
  );
}
