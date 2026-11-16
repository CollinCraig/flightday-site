/* Inline SVG icon set (24×24 grid, 1.75 stroke, currentColor). Vector, so it
 * stays crisp from 720p to 4K and never depends on a device's emoji font. */
(function () {
  'use strict';
  const P = {
    thermostat: '<path d="M9 14.8V5a3 3 0 0 1 6 0v9.8a5 5 0 1 1-6 0Z"/><path d="M12 8v9"/>',
    rocket: '<path d="M12 2.5c3.2 2.6 4.8 6.2 4.8 10.4v2.6H7.2v-2.6C7.2 8.700 8.8 5.100 12 2.500z"/><circle cx="12" cy="9.500" r="1.800"/><path d="M7.2 12.500 4.200 16v3.500l3-1.500M16.800 12.500l3 3.500v3.500l-3-1.500M10.200 18.500 12 22l1.800-3.500"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7.500 4v16M16.500 4v16M3 9h4.500M3 15h4.500M16.500 9H21M16.500 15H21"/>',
    dinner: '<path d="M6 3v7a2 2 0 0 0 2 2v9M4 3v5.500M8 3v5.500M17 21V3c-2.200 1.200-3.500 3.600-3.500 6.500V13H17"/>',
    moon: '<path d="M20 14.300A8.200 8.200 0 0 1 9.700 4 8.200 8.200 0 1 0 20 14.300z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2.200M12 19.300v2.200M2.500 12h2.200M19.300 12h2.200M5.300 5.300l1.600 1.600M17.100 17.100l1.600 1.600M5.300 18.700l1.600-1.600M17.100 6.900l1.600-1.600"/>',
    sunrise: '<path d="M4 18h16M7.200 18a4.800 4.800 0 0 1 9.600 0M12 5v4M9.500 7.500 12 5l2.500 2.500M3.500 13.500l1.800.8M20.500 13.500l-1.800.8M2.500 21h19"/>',
    cloud: '<path d="M7 18.500h10.200a4.300 4.300 0 0 0 .5-8.570A6 6 0 0 0 6.200 11 3.800 3.800 0 0 0 7 18.500z"/>',
    rain: '<path d="M7 15.500h10.200a4.300 4.300 0 0 0 .5-8.570A6 6 0 0 0 6.200 8 3.800 3.800 0 0 0 7 15.500zM8.500 18.500l-1 2.500M12.500 18.500l-1 2.500M16.500 18.500l-1 2.500"/>',
    storm: '<path d="M7 14.500h1.500M15.500 14.500h1.700a4.300 4.300 0 0 0 .5-8.570A6 6 0 0 0 6.200 7 3.800 3.800 0 0 0 7 14.500zM12.500 11.500l-2.500 4.500h4l-2.500 4.500"/>',
    snow: '<path d="M12 3v18M4.200 7.500l15.600 9M19.800 7.500l-15.600 9M9.500 4.500 12 6.500l2.500-2M9.500 19.500l2.500-2 2.500 2"/>',
    play: '<path d="M7.500 4.800v14.400L19 12z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    prev: '<path d="M18.500 5.500v13L8.500 12zM5.500 5.500v13"/>',
    next: '<path d="M5.500 5.500v13L15.500 12zM18.500 5.500v13"/>',
    up: '<path d="M6 14.500l6-6 6 6"/>',
    down: '<path d="M6 9.500l6 6 6-6"/>',
    volume: '<path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM15.500 9a4.200 4.200 0 0 1 0 6M18 6.500a7.800 7.800 0 0 1 0 11"/>',
    mute: '<path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16 9.500l5 5M21 9.500l-5 5"/>',
    minus: '<path d="M5.500 12h13"/>',
    plus: '<path d="M12 5.500v13M5.500 12h13"/>',
    power: '<path d="M12 3v8.500M7 6.300a7.500 7.500 0 1 0 10 0"/>',
    input: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 21h6M12 17v4M9.500 9v4l3.500-2z"/>',
    grid: '<rect x="4" y="4" width="6.500" height="6.500" rx="1.200"/><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.200"/><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.200"/><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.200"/>',
    remote: '<rect x="7.500" y="2.500" width="9" height="19" rx="2.500"/><circle cx="12" cy="8" r="2.200"/><path d="M10.500 14h.01M13.500 14h.01M10.500 17.500h.01M13.500 17.500h.01"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.600 10.800c.6.5 1 1.200 1 2V16h5.200v-.2c0-.8.400-1.500 1-2A6 6 0 0 0 12 3z"/>',
    plug: '<path d="M9 3v5M15 3v5M6.500 8h11v3.500a5.500 5.500 0 0 1-11 0zM12 17v4"/>',
    music: '<path d="M9 18V5.500l10-2V16"/><circle cx="6.500" cy="18" r="2.500"/><circle cx="16.500" cy="16" r="2.500"/>',
    speaker: '<rect x="5.500" y="2.500" width="13" height="19" rx="2.500"/><circle cx="12" cy="14.500" r="3.200"/><path d="M12 7h.01"/>',
    tv: '<rect x="2.500" y="4.500" width="19" height="12.500" rx="2"/><path d="M8 20.500h8M12 17v3.500"/>',
    camera: '<rect x="2.500" y="6.500" width="13" height="11" rx="2"/><path d="M15.500 10.500 21.500 7.500v9l-6-3"/>',
    shield: '<path d="M12 2.800 4.500 5.500V11c0 4.800 3 8.600 7.500 10.200 4.500-1.600 7.500-5.400 7.500-10.200V5.500z"/>',
    eyeoff: '<path d="M3.500 3.500l17 17M10.300 6.200A9.500 9.500 0 0 1 12 6c4.500 0 8 3 9.500 6a12 12 0 0 1-2.600 3.400M14.200 14.300A3.200 3.200 0 0 1 9.700 9.800M6.300 7.700A12 12 0 0 0 2.500 12c1.500 3 5 6 9.500 6 1.300 0 2.500-.2 3.600-.7"/>',
    person: '<circle cx="12" cy="7.500" r="3.500"/><path d="M5 20.500a7 7 0 0 1 14 0"/>',
    people: '<circle cx="9" cy="8" r="3.200"/><path d="M2.800 20a6.200 6.200 0 0 1 12.400 0M15.500 5.200a3.200 3.200 0 0 1 0 5.800M17.500 14.300a6.200 6.200 0 0 1 3.700 5.700"/>',
    package: '<path d="M12 2.800 3.500 7.200v9.600l8.500 4.400 8.500-4.400V7.200zM3.500 7.200 12 11.600l8.500-4.400M12 11.600v9.600M7.700 5l8.600 4.400"/>',
    motion: '<path d="M2.500 12h4l2.500-7 4.500 14 2.500-7h5.500"/>',
    desktop: '<rect x="2.500" y="3.500" width="19" height="13" rx="2"/><path d="M8 20.500h8M12 16.500v4"/>',
    laptop: '<rect x="4.500" y="4.500" width="15" height="10.500" rx="1.800"/><path d="M2 18.500h20"/>',
    server: '<rect x="3.500" y="3.500" width="17" height="7" rx="1.800"/><rect x="3.500" y="13.500" width="17" height="7" rx="1.800"/><path d="M7 7h.01M7 17h.01M11 7h5.500M11 17h5.500"/>',
    cpu: '<rect x="6.500" y="6.500" width="11" height="11" rx="1.800"/><rect x="10" y="10" width="4" height="4" rx=".6"/><path d="M9.500 3v3.500M14.500 3v3.500M9.500 17.500V21M14.500 17.500V21M3 9.500h3.500M3 14.500h3.500M17.500 9.500H21M17.500 14.500H21"/>',
    bolt: '<path d="M13.500 2.500 5 13.500h6l-1 8 8.500-11h-6z"/>',
    bot: '<rect x="4.500" y="8" width="15" height="11" rx="2.500"/><path d="M12 4.500V8M9.500 13v1.500M14.500 13v1.500M2.500 13v2.500M21.500 13v2.500"/><circle cx="12" cy="3.500" r="1"/>',
    branch: '<circle cx="6.500" cy="5.500" r="2.200"/><circle cx="6.500" cy="18.500" r="2.200"/><circle cx="17.500" cy="8.500" r="2.200"/><path d="M6.500 7.700v8.600M17.500 10.700c0 3.300-4.500 3.300-8.500 4.800"/>',
    check: '<path d="M4.500 12.500 9.500 17.500 19.500 6.500"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    box: '<rect x="4.500" y="4.500" width="15" height="15" rx="2.500"/>',
    boxcheck: '<rect x="4.500" y="4.500" width="15" height="15" rx="2.500"/><path d="M8.500 12.200 11 14.700 15.700 9.500"/>',
    home: '<path d="M3.500 11 12 3.500 20.500 11M5.500 9.500V20h13V9.500M10 20v-5.500h4V20"/>',
    wifi: '<path d="M2.500 9a14 14 0 0 1 19 0M5.500 12.500a9.500 9.500 0 0 1 13 0M8.500 16a5 5 0 0 1 7 0M12 19.500h.01"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.800 2.500 4.200 5.500 4.200 9s-1.400 6.500-4.200 9c-2.800-2.500-4.200-5.500-4.200-9S9.200 5.500 12 3z"/>',
    mic: '<rect x="9" y="2.500" width="6" height="11.500" rx="3"/><path d="M5.500 11.500a6.500 6.500 0 0 0 13 0M12 18v3.500"/>',
    calendar: '<rect x="3.500" y="5" width="17" height="15.500" rx="2"/><path d="M3.500 10h17M8 2.800V7M16 2.800V7"/>',
    gear: '<circle cx="12" cy="12" r="3.200"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
    orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.200" transform="rotate(-28 12 12)"/>',
    satellite: '<path d="M9 9l6 6M7.200 10.800 3 6.600 6.600 3l4.200 4.200zM13.200 16.800l4.200 4.200 3.600-3.600-4.200-4.200zM8.500 15.500l-2 2M14.500 5.500a4 4 0 0 1 4 4M14.500 2.500a7 7 0 0 1 7 7"/>',
    news: '<rect x="3.500" y="4.500" width="17" height="15" rx="2"/><path d="M7 8.500h5v4H7zM15 8.500h2.500M15 12.500h2.500M7 16h10.500"/>',
    flag: '<path d="M5.500 21V3.500M5.500 4.500h12l-2.500 4 2.500 4h-12"/>',
    pin: '<path d="M12 21.500s-6.500-6-6.500-11a6.500 6.500 0 0 1 13 0c0 5-6.500 11-6.500 11z"/><circle cx="12" cy="10.500" r="2.300"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.300l3.500 2"/>',
    gauge: '<path d="M4 17a8.500 8.500 0 1 1 16 0M12 14l4-5"/><circle cx="12" cy="14.500" r="1.300"/>',
    spark: '<path d="M12 3l1.800 5.700L19.500 10.500l-5.700 1.800L12 18l-1.800-5.700L4.500 10.500l5.700-1.800z"/>',
    link: '<path d="M10 14a4.200 4.200 0 0 0 6 0l3-3a4.200 4.200 0 0 0-6-6l-1 1M14 10a4.200 4.200 0 0 0-6 0l-3 3a4.200 4.200 0 0 0 6 6l1-1"/>',
    exit: '<path d="M14 4.500h4.500a1.500 1.500 0 0 1 1.500 1.500v12a1.500 1.500 0 0 1-1.500 1.500H14M4 12h11M11 8l4 4-4 4"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.600-5.900M20 4.500v4.200h-4.200"/>',
    door: '<path d="M6.500 21V4.500a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V21M3.500 21h17M14 12.500h.01"/>',
    car: '<path d="M4 16.500v-3l2-5.500a1.500 1.500 0 0 1 1.400-1h9.200A1.500 1.500 0 0 1 18 8l2 5.500v3M4 13.500h16M3.500 16.500h17v2.500h-3v-1.500h-11V19h-3zM7.500 15h.01M16.500 15h.01"/>',
    sofa: '<path d="M5 11V8a2.500 2.500 0 0 1 2.500-2.500h9A2.500 2.500 0 0 1 19 8v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 18v2M18 18v2"/>',
    backup: '<path d="M4 7c0-1.700 3.600-3 8-3s8 1.300 8 3-3.600 3-8 3-8-1.300-8-3zM4 7v5c0 1.700 3.600 3 8 3s8-1.300 8-3V7M4 12v5c0 1.700 3.600 3 8 3s8-1.300 8-3v-5"/>',
    party: '<path d="M4 20l4.500-12 7.500 7.500zM13 4v2M19 5l-1.500 1.500M20 11h-2M15.500 8.500c1-1 2.500-1 3.500 0"/>',
  };

  // Semantic extension vocabulary: design/contracts/icons.v1.json.
  Object.assign(P,{"recycle":"<path d=\"m9 5 3-3 3 5M12 2l-4 7M19 10l4 1-2 4M23 11h-8M13 21l-4 1-2-4M9 22l4-7\"/><path d=\"M17 4l3 5M21 17l-3 4h-3M5 17l-2-4 3-5\"/>","trash":"<path d=\"M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7\"/>","alarm":"<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"m3 5 3-3M18 2l3 3M6 20l-2 2M18 20l2 2M12 9v4l3 2\"/>","bell":"<path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2V1\"/>","window":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"1\"/><path d=\"M12 3v18M3 12h18\"/>","lock":"<rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2\"/><path d=\"M8 10V6a4 4 0 0 1 8 0v4M12 14v3\"/>","key":"<circle cx=\"7\" cy=\"8\" r=\"5\"/><path d=\"m11 12 9 9 2-2-3-3-2 2M4 7h.01\"/>","light":"<path d=\"M9 17c0-3-4-3-4-8a7 7 0 0 1 14 0c0 5-4 5-4 8ZM9 21h6M9 18h6\"/>","lamp":"<path d=\"M7 3h10l4 11H3ZM12 14v7M7 21h10M18 14v4\"/>","battery":"<rect x=\"2\" y=\"6\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M23 10v4M6 10v4M10 10v4M14 10v4\"/>","water":"<path d=\"M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13ZM8 15a4 4 0 0 0 4 4\"/>","leak":"<path d=\"M12 2S6 9 6 12a6 6 0 0 0 12 0c0-3-6-10-6-10ZM2 22l4-2 4 2 4-2 4 2 4-2\"/>","thermometer":"<path d=\"M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0ZM12 8v10M18 5h3M18 9h2\"/>","fan":"<circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M10 10C3 4 10-1 13 3c2 2 0 6-1 7M14 11c9-3 10 5 5 7-3 1-5-3-6-4M11 14c-2 9-9 5-8 1 1-3 5-3 7-3\"/>","air-filter":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M7 7h10M7 12h10M7 17h10M9 5v14M15 5v14\"/>","wind":"<path d=\"M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5a3 3 0 1 1-3 3\"/>","pet":"<ellipse cx=\"12\" cy=\"17\" rx=\"6\" ry=\"4\"/><ellipse cx=\"5\" cy=\"10\" rx=\"2\" ry=\"3\"/><ellipse cx=\"10\" cy=\"6\" rx=\"2\" ry=\"3\"/><ellipse cx=\"16\" cy=\"6\" rx=\"2\" ry=\"3\"/><ellipse cx=\"21\" cy=\"10\" rx=\"2\" ry=\"3\"/>","plant":"<path d=\"M12 21V10M12 13C3 14 2 9 3 4c7 0 10 3 9 9ZM12 17c8 0 9-5 9-10-7 0-10 3-9 10M7 21h10\"/>","wrench":"<path d=\"m14 4-4 4 2 4 4 2 4-4a7 7 0 0 1-9 9l-6 3-3-3 7-7a7 7 0 0 1 5-8Z\"/>","vacuum":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M5 6h14M10 10h4M5 19l3-3M16 16l3 3\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>","phone":"<rect x=\"6\" y=\"2\" width=\"12\" height=\"20\" rx=\"2\"/><path d=\"M10 5h4M11 19h2\"/>","mail":"<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/><path d=\"m3 5 9 8 9-8\"/>","cart":"<path d=\"M2 3h3l3 13h12l2-9H6M9 20h.01M19 20h.01\"/>","food":"<path d=\"M4 3v6a2 2 0 0 0 4 0V3M6 3v18M20 21V3c-4 2-5 6-5 10h5\"/>","coffee":"<path d=\"M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM17 9h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3\"/>","medicine":"<path d=\"m5 19 14-14M3 13 13 3a6 6 0 0 1 8 8L11 21a6 6 0 0 1-8-8Z\"/>","school":"<path d=\"m2 8 10-5 10 5-10 5ZM6 10v7c4 4 8 4 12 0v-7M22 8v9\"/>","briefcase":"<rect x=\"2\" y=\"7\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M8 7V3h8v4M2 12c5 5 15 5 20 0M10 14h4\"/>","star":"<path d=\"m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z\"/>","info":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 11v6M12 7h.01\"/>","warning":"<path d=\"m12 2 10 19H2ZM12 9v5M12 18h.01\"/>"});
  function icon(name, cls) {
    const body = P[name] || P.spark;
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  window.OW.icon = icon;
  window.OW.icons = P;
  const extensionNames=new Set(["recycle", "trash", "calendar", "clock", "alarm", "bell", "door", "window", "lock", "key", "light", "lamp", "plug", "power", "battery", "water", "leak", "thermometer", "fan", "air-filter", "snow", "sun", "moon", "cloud", "rain", "wind", "storm", "car", "package", "person", "pet", "plant", "wrench", "vacuum", "camera", "wifi", "phone", "mail", "cart", "food", "coffee", "medicine", "school", "briefcase", "star", "info", "warning", "check"]);
  window.OW.extensionIcon=value=>{const name=typeof value==='string'?value.replace(/^mdi:/,''):'';return extensionNames.has(name)&&P[name]?'<svg class="ic extension-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+P[name]+'</svg>':'';};
})();
