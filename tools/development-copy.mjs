// Pre-release marketing copy. Real app/demo status text is outside this site-copy gate.
export function developmentCopyProblems(html, {betaApproved=false}={}) {
 const errors=[];
 for(const m of html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
  const label=m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  if(/^(?:download now|install now|get it|get the app)$/i.test(label))errors.push('finished-product availability CTA before public release');
  if(/join.*(?:public )?beta.*TestFlight/i.test(label)&&!betaApproved)errors.push('public-beta CTA is held until approval');
 }
 const text=html.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ');
 if(/\b(?:Flight Day|the app)\s+(?:is\s+)?(?:now\s+)?available\b/i.test(text))errors.push('product availability claim before public release');
 if(/class="st st-live">Live<\/span>/.test(html))errors.push('unqualified Live release badge before public release');
 if(/https?:\/\/(?:www\.)?flightday\.app|www\.flightday\.app/i.test(text))errors.push('visible site address must be bare flightday.app');
 return errors;
}
