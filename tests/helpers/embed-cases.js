// Odkazy na klipy (IG, TikTok, YouTube): rovnaké prípady pre klienta (assets/game/logic.js, parseEmbed)
// aj pre databázu (016, game_embed_url). [vstup, normalizovaný odkaz alebo null = odmietnutý]
export const EMBED_OK = [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=12s', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ?si=abc123', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['  https://youtu.be/dQw4w9WgXcQ  ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://www.instagram.com/p/C1a2B3c4D5e/', 'https://www.instagram.com/p/C1a2B3c4D5e/'],
  ['https://instagram.com/reel/C1a2B3c4D5e?igsh=MTc4', 'https://www.instagram.com/reel/C1a2B3c4D5e/'],
  ['https://www.instagram.com/reels/C1a2B3c4D5e/', 'https://www.instagram.com/reel/C1a2B3c4D5e/'],
  ['https://www.instagram.com/gosko.sk/reel/C1a2B3c4D5e/', 'https://www.instagram.com/reel/C1a2B3c4D5e/'],
  ['https://www.tiktok.com/@gosko.sk/video/7212345678901234567', 'https://www.tiktok.com/@gosko.sk/video/7212345678901234567'],
  ['https://m.tiktok.com/@ghost_rider/video/7212345678901234567?lang=sk', 'https://www.tiktok.com/@ghost_rider/video/7212345678901234567'],
  ['https://vm.tiktok.com/ZMabc123/', 'https://vm.tiktok.com/ZMabc123/'],
];

export const EMBED_BAD = [
  'http://www.youtube.com/watch?v=dQw4w9WgXcQ',             // bez https
  'https://www.youtube.com.evil.sk/watch?v=dQw4w9WgXcQ',    // podvrhnutá doména
  'https://evil.sk/?u=https://youtu.be/dQw4w9WgXcQ',
  'https://youtube.com@evil.sk/watch?v=dQw4w9WgXcQ',        // userinfo
  'https://www.youtube.com/watch?v=short',                  // zlé id
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>',
  'javascript:alert(1)',
  'https://www.instagram.com/stories/gosko/123/',
  'https://www.instagram.com/gosko.sk/',
  'https://www.tiktok.com/@gosko/live',
  'https://www.facebook.com/watch?v=123',
  'https://vimeo.com/123456',
  '',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ#' + 'a'.repeat(400),
];
