import { writeFileSync } from 'node:fs';

const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7ebf5"/><stop offset=".48" stop-color="#b3e5f2"/><stop offset="1" stop-color="#aee8e1"/></linearGradient>
  <linearGradient id="ice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#c6eef7" stop-opacity=".25"/></linearGradient>
  <linearGradient id="deep" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a749c"/><stop offset="1" stop-color="#1b3b5a"/></linearGradient>
  <linearGradient id="sky" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7dc8eb"/><stop offset="1" stop-color="#8cd3f2"/></linearGradient>
  <linearGradient id="mint" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9ce0d8"/><stop offset="1" stop-color="#aee8e1"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".45" r=".55"><stop offset="0" stop-color="#ffffff" stop-opacity=".8"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <filter id="blur"><feGaussianBlur stdDeviation="28"/></filter>
</defs>`;

const cover = (name, inner) => writeFileSync(`public/assets/images/news/${name}.svg`,
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="">
${defs}
<rect width="1200" height="675" fill="url(#bg)"/>
${inner}
<rect width="1200" height="675" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="2"/>
</svg>`);

cover('welcome', `
<path d="M-90 452C120 340 284 388 438 458C614 538 770 526 930 410C1044 326 1164 318 1290 354V720H-90Z" fill="#8cd3f2" opacity=".52"/>
<path d="M-60 520C122 428 300 466 472 542C646 618 818 592 984 488C1088 421 1188 416 1270 446V720H-60Z" fill="#5ea8ce" opacity=".42"/>
<path d="M-40 598C166 500 344 548 544 618C738 686 914 662 1082 566C1158 522 1236 508 1280 520V720H-40Z" fill="#1b3b5a" opacity=".82"/>
<circle cx="938" cy="188" r="278" fill="url(#glow)" filter="url(#blur)"/>
<circle cx="938" cy="188" r="124" fill="none" stroke="#ffffff" stroke-opacity=".48" stroke-width="2"/>
<circle cx="938" cy="188" r="172" fill="none" stroke="#ffffff" stroke-opacity=".24" stroke-width="1.5"/>
<path d="M111 173C111 116 157 70 214 70" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
<path d="M178 462h416" stroke="#ffffff" stroke-width="2" opacity=".26"/>
<g font-family="Arial, sans-serif" fill="#1b3b5a">
<text x="110" y="290" font-size="26" letter-spacing="8" fill="#1b3b5a" opacity=".78">PROJECT / JOURNAL</text>
<text x="106" y="394" font-size="84" font-weight="700" letter-spacing="-2">НОВАЯ ВОЛНА</text>
<text x="112" y="438" font-size="25" fill="#1b3b5a" opacity=".68">Открытие пространства PROJECT</text>
</g>
<g transform="translate(110 514)" fill="#ffffff" opacity=".9">
<rect width="48" height="4" rx="2"/><rect x="60" width="18" height="4" rx="2" opacity=".5"/><rect x="90" width="18" height="4" rx="2" opacity=".25"/>
</g>
`);

cover('store', `
<rect width="1200" height="675" fill="#1b3b5a" opacity=".08"/>
<circle cx="900" cy="322" r="360" fill="url(#glow)" filter="url(#blur)"/>
<g transform="translate(908 318)">
<circle r="218" fill="none" stroke="#ffffff" stroke-opacity=".3" stroke-width="1.5"/>
<circle r="168" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="2"/>
<circle r="118" fill="url(#ice)" opacity=".8"/>
<path d="M-132 9C-105 -35 -68 -35 -41 9C-14 53 23 53 50 9C77 -35 114 -35 141 9" fill="none" stroke="#1b3b5a" stroke-opacity=".65" stroke-width="6" stroke-linecap="round"/>
<path d="M-132 59C-105 15 -68 15 -41 59C-14 103 23 103 50 59C77 15 114 15 141 59" fill="none" stroke="#5ea8ce" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>
<circle cx="207" cy="-105" r="9" fill="#ffffff"/><circle cx="-204" cy="98" r="6" fill="#ffffff" opacity=".7"/>
</g>
<g font-family="Arial, sans-serif" fill="#1b3b5a">
<text x="105" y="245" font-size="24" letter-spacing="8" opacity=".72">PROJECT / STORE</text>
<text x="100" y="348" font-size="86" font-weight="700" letter-spacing="-2">ПРИВИЛЕГИИ</text>
<text x="105" y="398" font-size="25" opacity=".68">Прозрачно. Без подписок по умолчанию.</text>
</g>
<path d="M105 460h255" stroke="#1b3b5a" stroke-opacity=".22" stroke-width="2"/>
<g transform="translate(105 502)" fill="#1b3b5a" opacity=".72" font-family="Arial, sans-serif" font-size="18" letter-spacing="3">
<text>01 / ВЫБОР</text><text x="154">02 / ЗАЯВКА</text><text x="330">03 / ДОСТУП</text>
</g>
<path d="M-100 592C160 474 412 570 606 628C786 682 986 636 1160 546C1220 516 1260 512 1300 522V720H-100Z" fill="#aee8e1" opacity=".45"/>
`);

cover('security', `
<circle cx="1000" cy="140" r="280" fill="url(#glow)" filter="url(#blur)"/>
<g transform="translate(916 334)">
<circle r="234" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="1"/>
<circle r="196" fill="none" stroke="#ffffff" stroke-opacity=".32" stroke-width="1" stroke-dasharray="4 12"/>
<path d="M0 -150L110 -108V14C110 92 62 146 0 178C-62 146 -110 92 -110 14V-108Z" fill="url(#ice)" opacity=".82" stroke="#ffffff" stroke-width="2"/>
<path d="M-48 8L-9 47L56 -31" fill="none" stroke="#1b3b5a" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="-134" cy="-150" r="7" fill="#9ce0d8"/><circle cx="166" cy="106" r="5" fill="#ffffff"/>
</g>
<g font-family="Arial, sans-serif" fill="#1b3b5a">
<text x="105" y="242" font-size="24" letter-spacing="8" opacity=".72">PROJECT / SAFETY</text>
<text x="100" y="344" font-size="82" font-weight="700" letter-spacing="-2">БЕЗОПАСНОСТЬ</text>
<text x="105" y="394" font-size="25" opacity=".68">Steam OpenID. Без паролей и лишних данных.</text>
</g>
<rect x="105" y="456" width="178" height="46" rx="23" fill="#ffffff" opacity=".45"/>
<text x="133" y="486" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#1b3b5a" letter-spacing="2">STEAM OPENID</text>
<path d="M-80 618C142 532 352 592 558 642C756 690 958 650 1140 570C1200 544 1250 542 1300 552V720H-80Z" fill="#7dc8eb" opacity=".38"/>
`);

const privilege = (name, inner) => writeFileSync(`public/assets/images/privileges/${name}.svg`,
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" role="img" aria-label="">
${defs}
<rect width="800" height="520" fill="url(#bg)"/>
${inner}
<rect width="800" height="520" fill="none" stroke="#ffffff" stroke-opacity=".2" stroke-width="2"/>
</svg>`);

privilege('wave', `
<circle cx="620" cy="120" r="200" fill="url(#glow)" opacity=".5"/>
<path d="M-40 326C90 262 186 294 286 344C394 398 500 390 610 318C688 266 756 260 830 282V560H-40Z" fill="#c6eef7" opacity=".82"/>
<path d="M-40 384C120 300 234 348 354 400C474 452 582 430 690 362C746 326 794 322 840 334V560H-40Z" fill="#8cd3f2" opacity=".62"/>
<path d="M-40 442C106 374 258 408 386 456C512 504 638 478 840 394V560H-40Z" fill="#5ea8ce" opacity=".72"/>
<path d="M70 164C112 130 158 112 206 112C254 112 300 130 342 164" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".85"/>
<path d="M98 197C130 172 166 160 206 160C246 160 282 172 314 197" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".5"/>
<circle cx="600" cy="170" r="76" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="1.5"/>
<circle cx="600" cy="170" r="56" fill="url(#ice)" opacity=".6"/>
<path d="M572 181C582 158 596 158 608 181C618 200 630 200 640 181" fill="none" stroke="#1b3b5a" stroke-width="4" stroke-linecap="round"/>
`);

privilege('tide', `
<circle cx="400" cy="260" r="230" fill="url(#glow)" filter="url(#blur)"/>
<g transform="translate(592 150)">
<circle r="120" fill="none" stroke="#ffffff" stroke-opacity=".36" stroke-width="1.5"/>
<circle r="88" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="2"/>
<circle r="56" fill="url(#ice)" opacity=".8"/>
<path d="M-42 8C-27 -15 -7 -15 8 8C23 31 43 31 58 8" fill="none" stroke="#1b3b5a" stroke-opacity=".6" stroke-width="4" stroke-linecap="round"/>
</g>
<path d="M-40 366C142 258 298 336 436 402C556 460 674 444 840 346V560H-40Z" fill="#aee8e1" opacity=".65"/>
<path d="M-40 426C134 334 306 392 462 460C602 520 720 492 840 418V560H-40Z" fill="#7dc8eb" opacity=".62"/>
<path d="M-40 482C152 410 334 458 500 506C642 548 746 522 840 476V560H-40Z" fill="#1b3b5a" opacity=".72"/>
<g transform="translate(82 94)" fill="none" stroke="#1b3b5a" stroke-opacity=".35" stroke-width="2">
<path d="M0 54h116M0 78h58"/>
</g>
`);

privilege('abyss', `
<rect width="800" height="520" fill="#1b3b5a" opacity=".06"/>
<circle cx="412" cy="286" r="246" fill="url(#glow)" filter="url(#blur)"/>
<g transform="translate(558 230)">
<path d="M0 -156L154 0L0 156L-154 0Z" fill="url(#ice)" opacity=".64" stroke="#ffffff" stroke-opacity=".55" stroke-width="2"/>
<path d="M0 -96L94 0L0 96L-94 0Z" fill="none" stroke="#1b3b5a" stroke-opacity=".35" stroke-width="2"/>
<path d="M0 -42L42 0L0 42L-42 0Z" fill="#1b3b5a" opacity=".72"/>
</g>
<path d="M-40 400C112 318 246 382 378 444C508 506 652 490 840 384V560H-40Z" fill="#4a749c" opacity=".7"/>
<path d="M-40 446C136 370 286 420 438 476C582 528 704 500 840 430V560H-40Z" fill="#1b3b5a" opacity=".9"/>
<g fill="none" stroke="#ffffff" stroke-width="1.5" opacity=".5">
<circle cx="148" cy="162" r="56"/><circle cx="148" cy="162" r="78" stroke-opacity=".5"/>
</g>
<path d="M92 162h112M148 106v112" stroke="#ffffff" stroke-opacity=".5" stroke-width="1.5"/>
`);

privilege('legacy', `
<circle cx="400" cy="260" r="250" fill="url(#glow)" filter="url(#blur)"/>
<g transform="translate(596 158)">
<circle r="130" fill="none" stroke="#ffffff" stroke-opacity=".3" stroke-width="1.5"/>
<circle r="104" fill="url(#ice)" opacity=".72" stroke="#ffffff" stroke-width="2"/>
<path d="M-42 32L-54 -40L-18 -16L0 -48L18 -16L54 -40L42 32H-42Z" fill="#1b3b5a" opacity=".78"/>
<circle cx="-83" cy="86" r="6" fill="#ffffff"/><circle cx="98" cy="-70" r="4" fill="#ffffff" opacity=".6"/>
</g>
<path d="M-40 352C122 280 248 332 382 392C514 450 660 438 840 340V560H-40Z" fill="#b3e5f2" opacity=".78"/>
<path d="M-40 412C142 334 300 382 444 440C584 496 702 470 840 398V560H-40Z" fill="#9ce0d8" opacity=".7"/>
<path d="M-40 470C134 406 304 444 472 492C616 532 734 508 840 462V560H-40Z" fill="#5ea8ce" opacity=".75"/>
<g transform="translate(78 92)" fill="#1b3b5a" opacity=".34">
<rect width="42" height="3" rx="1.5"/><rect y="14" width="24" height="3" rx="1.5"/><rect y="28" width="32" height="3" rx="1.5"/>
</g>
`);

console.log('artwork written');
