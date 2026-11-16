export const STARFIELD_CREDIT = "Generated · Tonight's sky, HYG star data (CC BY-SA 4.0)";

export function starfieldCreditProblems(html) {
  const content=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'');
  const decode=s=>s.replace(/&(?:apos|#39|#x27);/gi,"'").replace(/&rsquo;|&#8217;|&#x2019;/gi,'’').replace(/&middot;|&#183;|&#xb7;/gi,'·').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/g,'&');
  const text=decode(content.replace(/<\/(?:p|li|figcaption|figure|tr|section|h[1-6])\s*>/gi,'\n').replace(/<[^>]+>/g,' '));
  const stars=/\bstarfield\b|\btonight['’]s sky\b/i;
  if(!stars.test(decode(content)))return [];
  const problems=[];
  if(!text.replace(/\s+/g,' ').includes(STARFIELD_CREDIT))problems.push('Starfield must carry the exact credit: '+STARFIELD_CREDIT);
  for(const figure of content.matchAll(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi)) {
    if(stars.test(decode(figure[0]))&&!decode(figure[0].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').includes(STARFIELD_CREDIT))problems.push('Each Starfield figure must carry its own exact HYG credit');
  }
  if(/\bYale\b|\bBSC\b|Bright Star Catalog(?:ue)?/i.test(text))problems.push('Starfield star data must credit HYG, never Yale BSC');
  for(const paragraph of text.split('\n')) {
    if(/\bGenerated\s*·\s*Tonight['’]s sky\b/i.test(paragraph)&&!paragraph.replace(/\s+/g,' ').includes(STARFIELD_CREDIT))problems.push('Incorrect Tonight\'s sky credit; use the exact HYG CC BY-SA 4.0 literal');
    if(/\bpublic[ -]+domain\b/i.test(paragraph)&&(/\bstar(?:s| data| catalog(?:ue)?)?\b|\bHYG\b/i.test(paragraph)||stars.test(paragraph))) {
      problems.push('Star data is CC BY-SA 4.0, never public domain');break;
    }
  }
  return problems;
}
