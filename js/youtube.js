// Grabs a video's description via the YouTube Data API and heuristically
// pulls out an "Ingredients" section, if the creator included one.
// This reads the description text only — it cannot transcribe spoken
// narration or on-screen text in the video itself.

export function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

export async function fetchVideoSnippet(videoId, apiKey) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 403) throw new Error('API key rejected (check it\'s enabled for YouTube Data API v3 and not domain-restricted away from this site)');
    throw new Error(`YouTube API error (${res.status})`);
  }
  const data = await res.json();
  if (!data.items || data.items.length === 0) throw new Error('Video not found or private');
  return data.items[0].snippet;
}

const HEADING_RE = /^\s*ingredients?\s*:?\s*$/i;
const INLINE_HEADING_RE = /^\s*ingredients?\s*:\s*(.*)$/i;
const STOP_RE = /^\s*(instructions?|directions?|method|steps?|preparation|prep\s*time|cook\s*time|nutrition|equipment|subscribe|follow\s|social|chapters?|timestamps?)\b.*$/i;

// Returns { ingredients: string[], raw: string }
export function parseIngredientsFromDescription(description) {
  if (!description) return { ingredients: [], raw: '' };
  const lines = description.split(/\r?\n/);

  let start = -1;
  let inlineFirst = null;
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) { start = i; break; }
    const inline = lines[i].match(INLINE_HEADING_RE);
    if (inline) { start = i; inlineFirst = inline[1].trim(); break; }
  }
  if (start === -1) return { ingredients: [], raw: description };

  const collected = [];
  if (inlineFirst) collected.push(inlineFirst);

  let sawContent = collected.length > 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (sawContent) break;
      continue;
    }
    if (STOP_RE.test(line)) break;
    if (/^https?:\/\//i.test(line)) continue;
    collected.push(line.replace(/^[-*•\u2022\d]+[.)]?\s*/, '').trim());
    sawContent = true;
  }

  return { ingredients: collected.filter(Boolean), raw: description };
}
