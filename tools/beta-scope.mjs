// Availability labels refer only to the approved public IPA surfaces.
export function betaScopeProblems(html) {
 const errors=[];
 for(const m of html.matchAll(/<(p|li|tr|article)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
  const text=m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
  if(!/Live\s*\(public beta\)/i.test(text))continue;
  if(!/iPhone|iPad|Apple Watch|iOS|watchOS/.test(text))errors.push('Public-beta Live label lacks an approved iOS/watchOS surface');
  if(/\bMac\b|Apple TV|Systems check|live wallpapers/i.test(text))errors.push('Public-beta Live label includes a surface outside the approved IPA');
 }
 return errors;
}
