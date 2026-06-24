import React, { useId } from 'react';

const PALETTES = {
  home: ['#7C3AED', '#A78BFA', '#F0ABFC'],
  games: ['#7C3AED', '#C084FC', '#F59E0B'],
  profile: ['#6D28D9', '#8B5CF6', '#38BDF8'],
  resources: ['#7C3AED', '#A855F7', '#F9A8D4'],
  chat: ['#6D28D9', '#8B5CF6', '#22D3EE'],
  shared: ['#7C3AED', '#D946EF', '#F9A8D4'],
  story: ['#7C3AED', '#8B5CF6', '#FBBF24'],
  links: ['#6D28D9', '#A78BFA', '#34D399'],
};

function Background({ idPrefix, palette, transparent = false }) {
  const [primary, secondary, accent] = palette;

  return (
    <>
      <defs>
        <linearGradient id={`${idPrefix}-card`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="54%" stopColor="#F8F1FF" />
          <stop offset="100%" stopColor="#FFF4FA" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-main`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={primary} />
          <stop offset="58%" stopColor={secondary} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
        <radialGradient id={`${idPrefix}-glow`} cx="50%" cy="45%" r="66%">
          <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0" />
        </radialGradient>
        <filter id={`${idPrefix}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#6D28D9" floodOpacity="0.16" />
        </filter>
      </defs>

      {!transparent && (
        <>
          <rect width="420" height="170" rx="28" fill={`url(#${idPrefix}-card)`} />
          <circle cx="208" cy="82" r="112" fill={`url(#${idPrefix}-glow)`} />
          <path
            d="M43 44 C85 12 124 86 168 48 C212 9 254 72 305 38 C336 16 363 20 386 36"
            fill="none"
            stroke="#C4B5FD"
            strokeWidth="2"
            strokeDasharray="5 7"
            opacity="0.55"
          />
          <circle cx="54" cy="128" r="4" fill={primary} opacity="0.34" />
          <circle cx="356" cy="121" r="5" fill={accent} opacity="0.72" />
          <path d="M376 64 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4z" fill={secondary} opacity="0.55" />
          <path d="M64 28 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" fill={accent} opacity="0.75" />
        </>
      )}
    </>
  );
}


function WideBackground({ idPrefix, palette }) {
  const [primary, secondary, accent] = palette;

  return (
    <>
      <defs>
        <linearGradient id={`${idPrefix}-wide-card`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDFBFF" />
          <stop offset="28%" stopColor="#EEE7FF" />
          <stop offset="58%" stopColor="#ECFEFF" />
          <stop offset="82%" stopColor="#FFF2C7" />
          <stop offset="100%" stopColor="#FFE8F6" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-wide-main`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={primary} />
          <stop offset="44%" stopColor={secondary} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-wide-bright`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6D28D9" />
          <stop offset="52%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-wide-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#FDE68A" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-wide-pink`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#F0ABFC" />
        </linearGradient>
        <radialGradient id={`${idPrefix}-wide-glow-a`} cx="24%" cy="42%" r="48%">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.44" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-wide-glow-b`} cx="72%" cy="34%" r="44%">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idPrefix}-wide-glow-c`} cx="52%" cy="83%" r="40%">
          <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
        </radialGradient>
        <filter id={`${idPrefix}-wide-shadow`} x="-22%" y="-22%" width="144%" height="155%">
          <feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#4C1D95" floodOpacity="0.22" />
        </filter>
        <filter id={`${idPrefix}-soft-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#7C3AED" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect width="840" height="360" rx="34" fill={`url(#${idPrefix}-wide-card)`} />
      <circle cx="210" cy="150" r="235" fill={`url(#${idPrefix}-wide-glow-a)`} />
      <circle cx="635" cy="112" r="200" fill={`url(#${idPrefix}-wide-glow-b)`} />
      <circle cx="438" cy="312" r="160" fill={`url(#${idPrefix}-wide-glow-c)`} />
      <path d="M0 74 C118 31 238 77 337 40 C472 -11 545 89 690 37 C762 11 810 20 840 36 V0 H0z" fill="#EDE9FE" opacity="0.62" />
      <path d="M0 290 C116 246 226 301 342 245 C467 184 568 299 697 226 C766 187 810 196 840 208 V360 H0z" fill="#DCFCE7" opacity="0.34" />
      <path
        d="M52 79 C126 22 217 138 306 77 C404 10 492 113 594 61 C679 17 759 44 811 86"
        fill="none"
        stroke="#8B5CF6"
        strokeWidth="3"
        strokeDasharray="8 10"
        opacity="0.72"
      />
      <path
        d="M84 262 C160 208 258 303 350 238 C465 157 568 294 704 214 C759 181 798 190 824 203"
        fill="none"
        stroke="#06B6D4"
        strokeWidth="2.8"
        strokeDasharray="7 9"
        opacity="0.62"
      />
      <g opacity="0.9">
        <circle cx="66" cy="119" r="5" fill={primary} opacity="0.42" />
        <circle cx="166" cy="55" r="6" fill="#F59E0B" opacity="0.72" />
        <circle cx="470" cy="58" r="5" fill="#06B6D4" opacity="0.72" />
        <circle cx="758" cy="133" r="6" fill="#EC4899" opacity="0.62" />
        <circle cx="552" cy="300" r="5" fill={primary} opacity="0.5" />
        <path d="M716 58 l5 10 10 5 -10 5 -5 10 -5 -10 -10 -5 10 -5z" fill="#F59E0B" opacity="0.76" />
        <path d="M110 214 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4z" fill="#EC4899" opacity="0.78" />
        <path d="M399 108 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4z" fill="#7C3AED" opacity="0.54" />
      </g>
    </>
  );
}

function HomeWideVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-wide-shadow)`} transform="rotate(-4 174 184)">
        <rect x="46" y="105" width="300" height="188" rx="36" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2" />
        <path d="M88 158 C121 136 158 138 193 160 V255 C157 234 122 235 88 255z" fill="#F5F3FF" stroke="#A78BFA" strokeWidth="4" />
        <path d="M193 160 C230 136 266 139 301 158 V255 C266 234 230 234 193 255z" fill="#ECFEFF" stroke="#A78BFA" strokeWidth="4" />
        <path d="M120 188 h50 M120 214 h39 M229 188 h48 M229 214 h36" stroke="#7C3AED" strokeWidth="8" strokeLinecap="round" opacity="0.82" />
        <rect x="116" y="270" width="155" height="14" rx="7" fill="#C4B5FD" opacity="0.82" />
        <rect x="139" y="296" width="110" height="12" rx="6" fill="#EDE9FE" />
        <circle cx="300" cy="122" r="25" fill={`url(#${idPrefix}-wide-gold)`} />
        <path d="M300 107 l5 11 12 2 -9 8 2 12 -10 -6 -10 6 2 -12 -9 -8 12 -2z" fill="#FFFFFF" opacity="0.95" />
      </g>

      <g filter={`url(#${idPrefix}-wide-shadow)`} transform="rotate(5 460 154)">
        <rect x="363" y="52" width="238" height="166" rx="34" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2" />
        <rect x="394" y="82" width="94" height="24" rx="12" fill={`url(#${idPrefix}-wide-bright)`} opacity="0.92" />
        <text x="441" y="100" textAnchor="middle" fontSize="13" fontWeight="900" fill="#FFFFFF">תרגול יומי</text>
        <rect x="394" y="124" width="145" height="15" rx="7.5" fill="#EDE9FE" />
        <rect x="394" y="153" width="111" height="14" rx="7" fill="#CFFAFE" />
        <rect x="394" y="180" width="132" height="14" rx="7" fill="#FEF3C7" />
        <path d="M554 198 l25 26 -40 -15" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2" />
        <circle cx="552" cy="95" r="18" fill={`url(#${idPrefix}-wide-pink)`} />
        <path d="M544 95 h16 M552 87 v16" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
      </g>

      <g filter={`url(#${idPrefix}-soft-shadow)`} transform="translate(88 50)">
        <rect width="130" height="52" rx="26" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="1.8" />
        <text x="65" y="34" textAnchor="middle" fontSize="22" fontWeight="900" fill="#160A52">שלום</text>
      </g>

      <g filter={`url(#${idPrefix}-soft-shadow)`} transform="translate(226 40)">
        <rect width="126" height="52" rx="26" fill="#FFFFFF" stroke="#BAE6FD" strokeWidth="1.8" />
        <text x="63" y="33" textAnchor="middle" fontSize="20" fontWeight="900" fill="#0891B2">مرحبا</text>
      </g>

      <g filter={`url(#${idPrefix}-soft-shadow)`} transform="translate(626 45)">
        <rect width="122" height="50" rx="25" fill={`url(#${idPrefix}-wide-bright)`} />
        <text x="61" y="32" textAnchor="middle" fontSize="18" fontWeight="900" fill="#FFFFFF">AI מדבר</text>
      </g>

      <g filter={`url(#${idPrefix}-wide-shadow)`} transform="rotate(6 674 185)">
        <rect x="610" y="110" width="142" height="160" rx="34" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2" />
        <circle cx="681" cy="181" r="52" fill="#EEF2FF" />
        <path d="M647 181 h68 M681 147 v68" stroke={`url(#${idPrefix}-wide-bright)`} strokeWidth="14" strokeLinecap="round" />
        <circle cx="681" cy="181" r="68" fill="none" stroke="#C4B5FD" strokeWidth="10" opacity="0.7" />
        <rect x="644" y="247" width="75" height="13" rx="6.5" fill="#DDD6FE" />
      </g>

      <g filter={`url(#${idPrefix}-soft-shadow)`} transform="translate(510 246)">
        <rect width="126" height="56" rx="28" fill="#FFFFFF" stroke="#FDE68A" strokeWidth="2" />
        <path d="M31 29 h64" stroke={`url(#${idPrefix}-wide-gold)`} strokeWidth="8" strokeLinecap="round" />
        <path d="M63 15 v28" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round" />
        <circle cx="99" cy="29" r="15" fill="#FEF3C7" />
      </g>

      <g filter={`url(#${idPrefix}-soft-shadow)`} transform="translate(345 250)">
        <rect width="118" height="58" rx="29" fill="#FFFFFF" stroke="#BAE6FD" strokeWidth="2" />
        <path d="M33 22 c0 -9 10 -15 22 -15 c12 0 22 6 22 15 v16 c0 9 -10 15 -22 15 c-12 0 -22 -6 -22 -15z" fill="#ECFEFF" stroke="#06B6D4" strokeWidth="4" />
        <path d="M55 39 v12 M42 51 h26" stroke="#06B6D4" strokeWidth="5" strokeLinecap="round" />
      </g>

      <g filter={`url(#${idPrefix}-soft-shadow)`} transform="translate(608 286)">
        <rect width="118" height="43" rx="21.5" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="1.7" />
        <text x="59" y="28" textAnchor="middle" fontSize="17" fontWeight="900" fill="#7C3AED">מילה חדשה</text>
      </g>

      <g opacity="0.88">
        <path d="M38 323 C94 294 146 337 205 305 C268 271 323 319 382 288" fill="none" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
        <path d="M532 316 C558 292 591 292 618 316" fill="none" stroke="#06B6D4" strokeWidth="6" strokeLinecap="round" />
        <path d="M548 335 C568 321 585 321 603 335" fill="none" stroke="#7C3AED" strokeWidth="6" strokeLinecap="round" />
        <circle cx="584" cy="281" r="12" fill="#8B5CF6" />
      </g>
    </>
  );
}

function HomeVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-5 150 92)">
        <rect x="68" y="34" width="176" height="116" rx="24" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M98 73 C116 61 137 61 156 73 V126 C137 114 116 114 98 126z" fill="#F5F0FF" stroke="#DDD6FE" strokeWidth="2" />
        <path d="M156 73 C176 61 197 61 215 73 V126 C197 114 176 114 156 126z" fill="#FFF1F8" stroke="#DDD6FE" strokeWidth="2" />
        <path d="M116 86 h25 M116 100 h21 M174 86 h24 M174 100 h17" stroke="#A78BFA" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
        <rect x="115" y="132" width="84" height="8" rx="4" fill="#DDD6FE" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(7 296 88)">
        <rect x="256" y="47" width="84" height="88" rx="23" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M277 91 h43 M298 70 v43" stroke={`url(#${idPrefix}-main)`} strokeWidth="8" strokeLinecap="round" />
        <circle cx="298" cy="91" r="26" fill="none" stroke="#F1E9FF" strokeWidth="6" />
      </g>
      <g transform="translate(249 27)">
        <rect width="62" height="30" rx="15" fill={`url(#${idPrefix}-main)`} />
        <text x="31" y="20" textAnchor="middle" fontSize="12" fontWeight="900" fill="#FFFFFF">AI</text>
      </g>
    </>
  );
}

function GamesVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-5 148 92)">
        <rect x="70" y="39" width="180" height="100" rx="30" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="118" cy="91" r="24" fill="#F5F0FF" />
        <path d="M105 91 h26 M118 78 v26" stroke={`url(#${idPrefix}-main)`} strokeWidth="7" strokeLinecap="round" />
        <circle cx="186" cy="85" r="8" fill="#8B5CF6" opacity="0.86" />
        <circle cx="209" cy="104" r="8" fill="#F59E0B" opacity="0.82" />
        <path d="M93 126 C80 145 62 138 73 117" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M229 126 C242 145 260 138 249 117" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(7 296 91)">
        <rect x="258" y="44" width="86" height="92" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <text x="301" y="80" textAnchor="middle" fontSize="21" fontWeight="900" fill="#160A52">בית</text>
        <text x="301" y="104" textAnchor="middle" fontSize="13" fontWeight="900" fill="#7C3AED">بيت</text>
        <rect x="279" y="116" width="44" height="8" rx="4" fill="#DDD6FE" />
      </g>
    </>
  );
}

function ProfileVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-5 146 86)">
        <rect x="76" y="28" width="154" height="118" rx="26" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="153" cy="77" r="25" fill="#F5F0FF" />
        <circle cx="153" cy="68" r="10" fill={`url(#${idPrefix}-main)`} />
        <path d="M128 103 C135 83 171 83 178 103" fill={`url(#${idPrefix}-main)`} opacity="0.9" />
        <rect x="112" y="123" width="82" height="9" rx="4.5" fill="#DDD6FE" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(7 294 96)">
        <rect x="252" y="50" width="90" height="90" rx="24" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="297" cy="95" r="28" fill="none" stroke="#F1E9FF" strokeWidth="10" />
        <circle cx="297" cy="95" r="28" fill="none" stroke={`url(#${idPrefix}-main)`} strokeWidth="10" strokeLinecap="round" strokeDasharray="122 176" transform="rotate(-90 297 95)" />
        <text x="297" y="100" textAnchor="middle" fontSize="20" fontWeight="900" fill="#160A52">A2</text>
      </g>
    </>
  );
}

function ResourcesVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-6 145 92)">
        <rect x="84" y="37" width="132" height="96" rx="20" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M111 66 h78 M111 86 h56 M111 106 h72" stroke="#C4B5FD" strokeWidth="7" strokeLinecap="round" />
        <path d="M176 37 v36 l-13 -8 -13 8 V37" fill={`url(#${idPrefix}-main)`} opacity="0.9" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(8 287 91)">
        <rect x="246" y="55" width="90" height="26" rx="13" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <rect x="238" y="86" width="112" height="27" rx="13.5" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <rect x="252" y="118" width="78" height="25" rx="12.5" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <rect x="257" y="63" width="42" height="6" rx="3" fill="#DDD6FE" />
        <rect x="252" y="95" width="64" height="7" rx="3.5" fill={`url(#${idPrefix}-main)`} opacity="0.86" />
        <rect x="265" y="126" width="42" height="6" rx="3" fill="#DDD6FE" />
      </g>
    </>
  );
}

function ChatVisual({ idPrefix }) {
  return (
    <>
      <defs>
        <linearGradient id={`${idPrefix}-chat-panel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="46%" stopColor="#F3EEFF" />
          <stop offset="100%" stopColor="#E0F7FF" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-chat-cyan`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-chat-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#FDE68A" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-chat-pink`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#F0ABFC" />
        </linearGradient>
      </defs>

      <g opacity="0.92">
        <circle cx="92" cy="31" r="56" fill="#DDD6FE" opacity="0.34" />
        <circle cx="326" cy="108" r="72" fill="#BAE6FD" opacity="0.34" />
        <path
          d="M47 113 C93 73 129 120 174 82 C222 42 256 110 310 66 C347 36 376 47 398 75"
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="7 9"
          opacity="0.46"
        />
      </g>

      <g filter={`url(#${idPrefix}-shadow)`} transform="translate(18 12)">
        <rect x="34" y="12" width="318" height="137" rx="38" fill={`url(#${idPrefix}-chat-panel)`} stroke="#FFFFFF" strokeWidth="3" />
        <rect x="34" y="12" width="318" height="137" rx="38" fill="#FFFFFF" opacity="0.34" />
        <path d="M63 47 C103 20 148 60 189 36 C241 6 284 37 330 25" fill="none" stroke="#C4B5FD" strokeWidth="2" strokeDasharray="5 8" opacity="0.55" />
      </g>

      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-3 151 85)">
        <rect x="61" y="35" width="194" height="102" rx="30" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2.4" />
        <rect x="85" y="51" width="88" height="23" rx="11.5" fill={`url(#${idPrefix}-main)`} opacity="0.95" />
        <text x="129" y="67" textAnchor="middle" fontSize="12" fontWeight="900" fill="#FFFFFF">שיחה בעברית</text>
        <rect x="94" y="84" width="108" height="16" rx="8" fill="#EDE9FE" />
        <rect x="106" y="106" width="88" height="15" rx="7.5" fill="#CFFAFE" />
        <circle cx="222" cy="62" r="16" fill={`url(#${idPrefix}-chat-cyan)`} />
        <path d="M214 62 h16 M222 54 v16" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
        <path d="M238 126 l22 20 -34 -12" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2.4" />
      </g>

      <g filter={`url(#${idPrefix}-shadow)`} transform="translate(151 24)">
        <rect x="0" y="0" width="118" height="38" rx="19" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2" />
        <text x="37" y="25" textAnchor="middle" fontSize="16" fontWeight="900" fill="#6D28D9">שלום</text>
        <text x="82" y="25" textAnchor="middle" fontSize="15" fontWeight="900" fill="#0891B2">مرحبا</text>
      </g>

      <g filter={`url(#${idPrefix}-shadow)`} transform="translate(238 34)">
        <circle cx="61" cy="58" r="50" fill="#FFFFFF" stroke="#DDD6FE" strokeWidth="2.5" />
        <circle cx="61" cy="58" r="38" fill="#EEF2FF" />
        <path d="M61 28 v38" stroke={`url(#${idPrefix}-main)`} strokeWidth="12" strokeLinecap="round" />
        <path d="M38 57 c0 31 46 31 46 0" fill="none" stroke="#6D28D9" strokeWidth="7" strokeLinecap="round" />
        <path d="M61 93 v15 M45 108 h32" stroke="#6D28D9" strokeWidth="6" strokeLinecap="round" />
        <circle cx="25" cy="37" r="12" fill={`url(#${idPrefix}-chat-gold)`} />
        <path d="M25 29 l3 7 7 1 -5 5 1 8 -6 -4 -6 4 1 -8 -5 -5 7 -1z" fill="#FFFFFF" />
        <rect x="85" y="20" width="58" height="31" rx="15.5" fill={`url(#${idPrefix}-main)`} />
        <text x="114" y="41" textAnchor="middle" fontSize="15" fontWeight="900" fill="#FFFFFF">AI</text>
      </g>

      <g filter={`url(#${idPrefix}-shadow)`} transform="translate(47 118)">
        <rect width="112" height="36" rx="18" fill="#FFFFFF" stroke="#BAE6FD" strokeWidth="2" />
        <path d="M27 13 c0 -8 9 -13 20 -13 c11 0 20 5 20 13 v9 c0 8 -9 13 -20 13 c-11 0 -20 -5 -20 -13z" transform="translate(7 1) scale(.72)" fill="#ECFEFF" stroke="#06B6D4" strokeWidth="4" />
        <text x="72" y="23" textAnchor="middle" fontSize="13" fontWeight="900" fill="#0891B2">דברי בקול</text>
      </g>

      <g filter={`url(#${idPrefix}-shadow)`} transform="translate(276 119)">
        <rect width="102" height="36" rx="18" fill="#FFFFFF" stroke="#FDE68A" strokeWidth="2" />
        <circle cx="22" cy="18" r="12" fill="#FEF3C7" />
        <path d="M22 11 v12 M16 17 h12" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
        <text x="66" y="23" textAnchor="middle" fontSize="13" fontWeight="900" fill="#B45309">מילים חדשות</text>
      </g>

      <g opacity="0.85">
        <path d="M188 126 C217 105 242 105 270 126" fill="none" stroke="#22D3EE" strokeWidth="5" strokeLinecap="round" />
        <path d="M201 143 C222 130 239 130 258 143" fill="none" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" />
        <path d="M385 42 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4z" fill="#F59E0B" opacity="0.72" />
        <path d="M37 63 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" fill="#EC4899" opacity="0.7" />
      </g>
    </>
  );
}

function SharedVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-4 147 90)">
        <rect x="74" y="40" width="150" height="98" rx="26" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        {[0, 1, 2].map((index) => (
          <g key={index} transform={`translate(${106 + index * 40} 88)`}>
            <circle cx="0" cy="-9" r="13" fill="#F5F0FF" />
            <circle cx="0" cy="-13" r="5" fill="#8B5CF6" />
            <path d="M-10 4 C-7 -8 7 -8 10 4" fill="#8B5CF6" opacity="0.86" />
          </g>
        ))}
        <path d="M107 119 h74" stroke="#DDD6FE" strokeWidth="7" strokeLinecap="round" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(7 296 95)">
        <rect x="246" y="52" width="100" height="80" rx="25" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M316 132 l18 18 -8 -26" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="278" cy="91" r="7" fill="#D946EF" opacity="0.82" />
        <circle cx="299" cy="91" r="7" fill="#8B5CF6" opacity="0.82" />
        <circle cx="320" cy="91" r="7" fill="#F9A8D4" opacity="0.95" />
      </g>
    </>
  );
}

function StoryVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-6 150 91)">
        <rect x="78" y="34" width="154" height="110" rx="25" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M112 63 C128 53 145 53 158 63 V121 C143 112 126 112 112 121z" fill="#F5F0FF" stroke="#DDD6FE" strokeWidth="2" />
        <path d="M158 63 C174 53 191 53 204 63 V121 C189 112 172 112 158 121z" fill="#FFF7ED" stroke="#DDD6FE" strokeWidth="2" />
        <path d="M126 78 h20 M126 92 h16 M174 78 h19 M174 92 h14" stroke="#C4B5FD" strokeWidth="5" strokeLinecap="round" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(8 296 96)">
        <rect x="256" y="54" width="82" height="82" rx="23" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M297 73 l6 14 15 5 -15 5 -6 14 -6 -14 -15 -5 15 -5z" fill={`url(#${idPrefix}-main)`} />
        <rect x="278" y="119" width="38" height="7" rx="3.5" fill="#DDD6FE" />
      </g>
    </>
  );
}

function LinksVisual({ idPrefix }) {
  return (
    <>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(-6 146 88)">
        <rect x="72" y="32" width="164" height="116" rx="26" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <circle cx="126" cy="82" r="22" fill="#F5F0FF" />
        <circle cx="181" cy="102" r="22" fill="#ECFDF5" />
        <path d="M142 90 l24 7" stroke={`url(#${idPrefix}-main)`} strokeWidth="8" strokeLinecap="round" />
        <path d="M119 82 h14 M174 102 h14" stroke="#7C3AED" strokeWidth="6" strokeLinecap="round" />
      </g>
      <g filter={`url(#${idPrefix}-shadow)`} transform="rotate(7 299 92)">
        <rect x="258" y="49" width="86" height="92" rx="22" fill="#FFFFFF" stroke="#EEE5FF" strokeWidth="1.4" />
        <path d="M284 78 h34 M284 98 h34 M284 118 h22" stroke="#C4B5FD" strokeWidth="7" strokeLinecap="round" />
      </g>
    </>
  );
}

const CONTENT = {
  home: HomeVisual,
  games: GamesVisual,
  profile: ProfileVisual,
  resources: ResourcesVisual,
  chat: ChatVisual,
  shared: SharedVisual,
  story: StoryVisual,
  links: LinksVisual,
};

export default function StudentHeroVisual({
  type = 'home',
  className = '',
  wide = false,
  fadeRight = true,
  transparentBackground = false,
}) {
  const safeType = CONTENT[type] ? type : 'home';
  const palette = PALETTES[safeType] || PALETTES.home;
  const reactId = useId().replace(/:/g, '');
  const idPrefix = `student-hero-${safeType}-${reactId}`;
  const Visual = CONTENT[safeType];
  const useWideHome = wide && safeType === 'home';

  return (
    <div className={`relative h-full min-h-[140px] w-full overflow-hidden ${className}`} aria-hidden="true">
      <svg
        viewBox={useWideHome ? '0 0 840 360' : '0 0 420 170'}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        {useWideHome ? (
          <>
            <WideBackground idPrefix={idPrefix} palette={palette} />
            <HomeWideVisual idPrefix={idPrefix} />
          </>
        ) : (
          <>
            <Background idPrefix={idPrefix} palette={palette} transparent={transparentBackground} />
            <Visual idPrefix={idPrefix} />
          </>
        )}
      </svg>
      {fadeRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white/70 to-transparent" />
      )}
    </div>
  );
}
