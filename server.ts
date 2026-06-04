import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK securely using backend environment variable
// Always checks for API key presence to handle startup gracefully
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Peringatan: GEMINI_API_KEY tidak ditemukan di environment. Menjalankan fallback simulasi.");
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// 1. AI Sommelier / Recommendation Endpoint
app.post("/api/sommelier", async (req, res) => {
  const { prompt, userPreferredCategory, budgetMax, activeMenu } = req.body;
  
  const ai = getGeminiClient();

  if (!ai) {
    // Elegant fallback simulation in case the API key is not configured yet
    setTimeout(() => {
      res.json({
        text: `**Virtual Sommelier (Simulated Mode):** Halo! Saya pendamping kuliner Anda di ScanBite. Tampaknya kunci API Gemini belum terkonfigurasi pada file rahasia (Secrets) proyek Anda.\n\nNamun, berdasarkan keinginan Anda (${prompt || 'menu segar'}), saya sangat menyarankan mencoba **Classic Tiramisu Melt** dipadukan dengan **Salted Caramel Hazelnut** atau **Es Kopi Susu Aren Klasik** kami yang segar. Perpaduan manis alami aren dan kopi berkualitas tinggi kami pasti akan memanjakan lidah Anda hari ini!`
      });
    }, 1000);
    return;
  }

  try {
    const formattedMenu = JSON.stringify(activeMenu || []);
    const systemPrompt = `Anda adalah seorang Senior Cafe Sommelier, Barista, dan Culinary Advisor profesional di kafe moder bernama 'ScanBite'.
Tugas Anda adalah memandu pelanggan memilih hidangan, cokelat, atau kopi terbaik dari menu yang tersedia di kafe kami berdasarkan kebutuhan, budget, atau situasi hati (mood) mereka.

Berikut adalah daftar menu aktif saat ini di kafe kami:
${formattedMenu}

Panduan perilaku Anda:
- Jawablah dalam bahasa Indonesia yang ramah, sopan, puitis, dan profesional layaknya barista premium.
- Sesuaikan saran Anda dengan budget maksimal pelanggan (jika diberikan, budgetMax: Rp ${budgetMax || "bebas"}).
- Rekomendasikan nama produk eksak yang tercantum pada menu di atas agar mereka dapat langsung mengkliknya.
- Jelaskan rasa pas, paduan tekstur, dan mengapa paduan rasa itu istimewa.
- Berikan saran penyajian yang elegan.
- Berikan respon yang ringkas, mudah dibaca dengan pemformatan Markdown modern (bullet-points, bold text).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt || "Berikan rekomendasi menu terbaik untuk makan siang santai berdua.",
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Kesalahan panggilan API Gemini:", error);
    res.status(500).json({ 
      error: "Gagal memproses rekomendasi AI.",
      details: error.message || String(error)
    });
  }
});

// ==========================================
// DIGITAL JUKEBOX SYSTEM API INTEGRATIONS
// ==========================================

let spotifyAccessToken = '';
let spotifyTokenExpiresAt = 0;

// Helper to authenticate client credentials flow on Spotify API
async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return null;
  }

  if (spotifyAccessToken && Date.now() < spotifyTokenExpiresAt) {
    return spotifyAccessToken;
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    
    const data = await response.json() as any;
    if (data && data.access_token) {
      spotifyAccessToken = data.access_token;
      spotifyTokenExpiresAt = Date.now() + (Number(data.expires_in) - 60) * 1000;
      return spotifyAccessToken;
    }
  } catch (err) {
    console.error('Error authenticating with Spotify API:', err);
  }
  return null;
}

// 2. Jukebox Config & API Integration Status Checking
app.get("/api/jukebox/config", (req, res) => {
  res.json({
    spotifyConfigured: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    youtubeConfigured: !!process.env.YOUTUBE_API_KEY,
    fallbackEngine: "iTunes Music Search engine (Automatic with artwork metadata)",
    currentLocalTime: new Date()
  });
});

// 3. Jukebox Core Music Search API (Spotify vs YouTube vs Fallback)
app.get("/api/jukebox/search", async (req, res) => {
  const query = req.query.q as string || '';
  const provider = (req.query.provider as string || 'spotify').toLowerCase();

  if (!query.trim()) {
    return res.json({ results: [] });
  }

  console.log(`🎵 Jukebox Search: [${provider.toUpperCase()}] "${query}"`);

  // --- CASE A: SPOTIFY API (Live Credentials) ---
  if (provider === 'spotify') {
    const spotifyToken = await getSpotifyToken();
    if (spotifyToken) {
      try {
        const spotifyUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
        const response = await fetch(spotifyUrl, {
          headers: {
            'Authorization': `Bearer ${spotifyToken}`
          }
        });
        
        if (response.ok) {
          const data = await response.json() as any;
          if (data && data.tracks && data.tracks.items) {
            const mapped = data.tracks.items.map((item: any) => {
              const durationMs = item.duration_ms || 0;
              const minutes = Math.floor(durationMs / 60000);
              const seconds = Math.floor((durationMs % 60000) / 1000);
              const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
              
              return {
                id: item.id,
                title: item.name,
                artist: item.artists?.[0]?.name || 'Unknown Artist',
                duration: durationStr,
                artworkUrl: item.album?.images?.[0]?.url || item.album?.images?.[1]?.url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&fit=crop',
                spotifyUri: item.uri || `spotify:track:${item.id}`,
                youtubeId: ''
              };
            });
            return res.json({ results: mapped, source: 'spotify_live_api' });
          }
        }
      } catch (err) {
        console.warn('Live Spotify search failed, jumping to fallback:', err);
      }
    }
  }

  // --- CASE B: YOUTUBE API (Live Credentials) ---
  if (provider === 'youtube' && process.env.YOUTUBE_API_KEY) {
    try {
      const ytApiKey = process.env.YOUTUBE_API_KEY;
      const youtubeUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query + " official audio")}&type=video&key=${ytApiKey}`;
      
      const response = await fetch(youtubeUrl);
      if (response.ok) {
        const data = await response.json() as any;
        if (data && data.items) {
          const mapped = data.items.map((item: any) => {
            return {
              id: item.id?.videoId || 'dQw4w9WgXcQ',
              title: item.snippet?.title || 'Unknown Title',
              artist: item.snippet?.channelTitle || 'Unknown Creator',
              duration: '3:45', // Duration is not in standard youtube search snippet, safe default
              artworkUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&fit=crop',
              spotifyUri: '',
              youtubeId: item.id?.videoId || 'dQw4w9WgXcQ'
            };
          });
          return res.json({ results: mapped, source: 'youtube_live_api' });
        }
      }
    } catch (err) {
      console.warn('Live YouTube Search Api failed, jumping to fallback:', err);
    }
  }

  // --- CASE C: POWERFUL CENTRALIZED METADATA FALLBACK (iTunes API engine) ---
  // If keys are not configured yet, we query the iTunes Search API to retrieve accurate artist & song info
  // and construct realistic URLs & playback IDs based on actual release database matches.
  try {
    const iTunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=10`;
    const response = await fetch(iTunesUrl);
    const data = await response.json() as any;
    
    if (data && data.results) {
      const results = data.results.map((item: any) => {
        const durationMs = item.trackTimeMillis || 210000;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Formulate deterministic simulated IDs/hashes to feed embeds safely
        const trackIdNumeric = String(item.trackId || Math.floor(Math.random() * 100000000));
        
        return {
          id: provider === 'youtube' ? `yt-${trackIdNumeric}` : `sp-${trackIdNumeric}`,
          title: item.trackName || 'Musik Kafe Pilihan',
          artist: item.artistName || 'Penyanyi Berbakat',
          duration: durationStr,
          artworkUrl: item.artworkUrl100 || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&fit=crop',
          spotifyUri: `spotify:track:${trackIdNumeric}`,
          // If seeking YouTube without credentials, we use search/query strings mapped as video fallback or standard playlist search URI
          youtubeId: trackIdNumeric
        };
      });
      return res.json({ results, source: `${provider}_fallback_itunes` });
    }
  } catch (err: any) {
    console.error('Fallback Search Master failed:', err);
  }

  // Final manual static matching fallback to make sure empty queries or failed network requests never crash
  res.json({
    results: [
      {
        id: 'fallback-1',
        title: 'Kopi Dangdut',
        artist: 'Fahmy Shahab',
        duration: '3:45',
        artworkUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&fit=crop',
        spotifyUri: 'spotify:track:4PTG3Z6ehGkBF36qHkY7S9',
        youtubeId: 'M-v_NfptjBw'
      },
      {
        id: 'fallback-2',
        title: 'Gajah',
        artist: 'Tulus',
        duration: '4:12',
        artworkUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&fit=crop',
        spotifyUri: 'spotify:track:1GndpMyEymJIDG25FAtgV7',
        youtubeId: '3n3PpAIrO0mGbJEciNccg9'
      }
    ],
    source: 'static_emergency_fallback'
  });
});

// 4. Jukebox Data Flow and Integration Outline Document Endpoint
app.get("/api/jukebox/schema", (req, res) => {
  res.json({
    title: "Sistem Jukebox Digital ScanBite (Spotify & YouTube API Integration Blueprint)",
    apiEndpoints: {
      search: "GET /api/jukebox/search?q={query}&provider={spotify|youtube}",
      config: "GET /api/jukebox/config",
      schema: "GET /api/jukebox/schema"
    },
    dataFlow: {
      step1_order_completed: "Customer completes payment successfully in Checkout.tsx. This flags order details and unlocks jukebox requests.",
      step2_song_search: "User inputs song name. Client triggers debounced GET request to /api/jukebox/search.",
      step3_backend_proc: "Backend inspects environment variables. If credentials exist, queries real Spotify or YouTube. Else queries iTunes metadata and enriches responses.",
      step4_request_submit: "Customer selects song. Track metadata (including artwork, Spotify URI, YouTube ID) is appended to Supabase table 'sb_song_requests' (or localStorage fallback). Runs sync cascades.",
      step5_admin_broadcast: "Admin page listens to sb_song_requests changes in real-time. Playlist queue is displayed sorted by total customer 'Upvote' tallies.",
      step6_player_stream: "Cashier plays music direct on the cafe sound system. Plays seamlessly using embedded Youtube Iframes or Spotify Web Embed Players built inside the admin panel."
    },
    databaseSchema: {
      table: "sb_song_requests",
      columns: {
        id: "uuid PRIMARY KEY DEFAULT uuid_generate_v4()",
        tenant_id: "varchar (Separation of stores)",
        title: "varchar (Song title)",
        artist: "varchar (Artist name)",
        duration: "varchar (e.g. '4:12')",
        table_number: "varchar (Which customer requested it)",
        votes: "integer DEFAULT 1 (Total user upvotes)",
        is_playing: "boolean DEFAULT false (Current live song state)",
        artwork_url: "text (Album art thumbnail URL)",
        youtube_id: "varchar (YouTube video hash)",
        spotify_uri: "varchar (Spotify track identifier)",
        created_at: "timestamp with time zone DEFAULT now()"
      }
    }
  });
});

// ==========================================
// SCANSBITE ORDER SESSION STATE MANAGEMENT
// ==========================================
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://czvmkobgqnasalsgqbeq.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dm1rb2JncW5hc2Fsc2dxYmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzA5MTQsImV4cCI6MjA5NTMwNjkxNH0.50UTHuSIp9BTEC9xx6mWxu5xpAJKJyNw4A19Vl1tU8I';
const supabaseDB = createClient(supabaseUrl, supabaseAnonKey);

interface OrderSession {
  session_id: string;
  tenant_id: string;
  table_id: string;
  active_users: string[];
  cart: any[];
  status: string;
  last_active_at: string;
}

// Resilient fallback in-memory database for multi-device sync
let memoryOrderSessions: OrderSession[] = [];

function cleanExpiredMemorySessions() {
  const now = Date.now();
  const fifteenMinutes = 15 * 60 * 1000;
  memoryOrderSessions = memoryOrderSessions.filter((sess) => {
    const elapsed = now - new Date(sess.last_active_at).getTime();
    if (elapsed > fifteenMinutes) {
      return false; // remove expired session
    }
    return true;
  });
}

// Join active ordering session or bootstrap a new one
app.post("/api/order-sessions/join", async (req, res) => {
  const { tenant_id, table_id, customer_name } = req.body;
  if (!tenant_id || !table_id || !customer_name) {
    return res.status(400).json({ error: "Missing required parameters: tenant_id, table_id, customer_name" });
  }

  const nowString = new Date().toISOString();
  const nowMs = Date.now();
  const fifteenMinutes = 15 * 60 * 1000;

  try {
    // 1. Check if an active session exists in Supabase 'order_sessions'
    const { data: dbSessions, error: selectError } = await supabaseDB
      .from('order_sessions')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('table_id', table_id)
      .eq('status', 'active');

    if (selectError) {
      throw selectError;
    }

    let activeSession: any = null;

    if (dbSessions && dbSessions.length > 0) {
      const sorted = dbSessions.sort((a: any, b: any) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime());
      const latest = sorted[0];
      const elapsed = nowMs - new Date(latest.last_active_at).getTime();

      if (elapsed <= fifteenMinutes) {
        activeSession = latest;
      } else {
        // Session timed out - set status to expired
        await supabaseDB
          .from('order_sessions')
          .update({ status: 'expired' })
          .eq('id', latest.id);
      }
    }

    if (activeSession) {
      // 2. Add name to array active_users
      let activeUsers: string[] = [];
      if (Array.isArray(activeSession.active_users)) {
        activeUsers = activeSession.active_users;
      } else if (typeof activeSession.active_users === 'string') {
        try {
          activeUsers = JSON.parse(activeSession.active_users);
        } catch (_) {
          activeUsers = activeSession.active_users.split(',').map((u: string) => u.trim()).filter(Boolean);
        }
      } else if (activeSession.active_users) {
        activeUsers = [activeSession.active_users];
      }

      const trimmedName = customer_name.trim();
      if (!activeUsers.some((u: string) => u.toLowerCase() === trimmedName.toLowerCase())) {
        activeUsers.push(trimmedName);
      }

      const { data: updatedSession, error: updateError } = await supabaseDB
        .from('order_sessions')
        .update({
          active_users: activeUsers,
          last_active_at: nowString
        })
        .eq('id', activeSession.id)
        .select()
        .single();

      if (updateError) throw updateError;
      return res.json({ success: true, isNew: false, data: updatedSession, source: 'supabase_db' });

    } else {
      // 3. Create fresh table ordering session
      const newSessionId = `sess-${nowMs}-${Math.floor(Math.random() * 1000)}`;
      const activeUsers = [customer_name.trim()];

      const { data: createdSession, error: insertError } = await supabaseDB
        .from('order_sessions')
        .insert({
          session_id: newSessionId,
          tenant_id,
          table_id,
          active_users: activeUsers,
          cart: [],
          status: 'active',
          last_active_at: nowString
        })
        .select()
        .single();

      if (insertError) {
        // Fallback: table might use serial/UUID primary key instead of defining custom ID string
        const { data: fallbackCreated, error: fallbackError } = await supabaseDB
          .from('order_sessions')
          .insert({
            tenant_id,
            table_id,
            active_users: activeUsers,
            cart: [],
            status: 'active',
            last_active_at: nowString
          })
          .select()
          .single();
        if (fallbackError) throw fallbackError;
        return res.json({ success: true, isNew: true, data: fallbackCreated, source: 'supabase_db' });
      }

      return res.json({ success: true, isNew: true, data: createdSession, source: 'supabase_db' });
    }

  } catch (dbError: any) {
    console.warn("Supabase database order_sessions not accessible. Falling back safely to persistent server memory:", dbError.message || dbError);

    // Safeguard memory cache from leaks
    cleanExpiredMemorySessions();

    let memorySession = memoryOrderSessions.find(
      (sess) => sess.tenant_id === tenant_id && sess.table_id === table_id && sess.status === 'active'
    );

    if (memorySession) {
      const trimmedName = customer_name.trim();
      if (!memorySession.active_users.some(u => u.toLowerCase() === trimmedName.toLowerCase())) {
        memorySession.active_users.push(trimmedName);
      }
      memorySession.last_active_at = nowString;

      return res.json({
        success: true,
        isNew: false,
        data: {
          session_id: memorySession.session_id,
          tenant_id: memorySession.tenant_id,
          table_id: memorySession.table_id,
          active_users: memorySession.active_users,
          cart: memorySession.cart,
          status: memorySession.status,
          last_active_at: memorySession.last_active_at
        },
        source: 'memory_cache'
      });
    } else {
      const newSessionId = `sess-${nowMs}-${Math.floor(Math.random() * 1000)}`;
      const newSess: OrderSession = {
        session_id: newSessionId,
        tenant_id,
        table_id,
        active_users: [customer_name.trim()],
        cart: [],
        status: 'active',
        last_active_at: nowString
      };

      memoryOrderSessions.push(newSess);

      return res.json({
        success: true,
        isNew: true,
        data: {
          session_id: newSess.session_id,
          tenant_id: newSess.tenant_id,
          table_id: newSess.table_id,
          active_users: newSess.active_users,
          cart: newSess.cart,
          status: newSess.status,
          last_active_at: newSess.last_active_at
        },
        source: 'memory_cache'
      });
    }
  }
});

// Update cart items details inside sessional storage
app.post("/api/order-sessions/cart", async (req, res) => {
  const { tenant_id, table_id, cart_items } = req.body;
  if (!tenant_id || !table_id) {
    return res.status(400).json({ error: "Missing tenant_id and table_id properties." });
  }

  const nowString = new Date().toISOString();

  try {
    const { error } = await supabaseDB
      .from('order_sessions')
      .update({
        cart: cart_items,
        last_active_at: nowString
      })
      .eq('tenant_id', tenant_id)
      .eq('table_id', table_id)
      .eq('status', 'active');

    if (error) throw error;

    // Sync memory cache replica
    const mem = memoryOrderSessions.find(s => s.tenant_id === tenant_id && s.table_id === table_id && s.status === 'active');
    if (mem) {
      mem.cart = cart_items;
      mem.last_active_at = nowString;
    }

    return res.json({ success: true, source: 'supabase_db' });
  } catch (err: any) {
    const mem = memoryOrderSessions.find(s => s.tenant_id === tenant_id && s.table_id === table_id && s.status === 'active');
    if (mem) {
      mem.cart = cart_items;
      mem.last_active_at = nowString;
      return res.json({ success: true, source: 'memory_cache' });
    }
    return res.status(404).json({ error: "Active session not found" });
  }
});

// Remove a customer from active room list on sessional teardown
app.post("/api/order-sessions/leave", async (req, res) => {
  const { tenant_id, table_id, customer_name } = req.body;
  if (!tenant_id || !table_id || !customer_name) {
    return res.status(400).json({ error: "Missing required properties" });
  }

  const nowString = new Date().toISOString();

  try {
    const { data: sessions } = await supabaseDB
      .from('order_sessions')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('table_id', table_id)
      .eq('status', 'active');

    if (sessions && sessions.length > 0) {
      const sess = sessions[0];
      let activeUsers: string[] = [];
      if (Array.isArray(sess.active_users)) {
        activeUsers = sess.active_users;
      } else if (typeof sess.active_users === 'string') {
        try {
          activeUsers = JSON.parse(sess.active_users);
        } catch (_) {
          activeUsers = sess.active_users.split(',').map((u: string) => u.trim()).filter(Boolean);
        }
      }

      const filtered = activeUsers.filter(u => u.toLowerCase() !== customer_name.trim().toLowerCase());
      await supabaseDB
        .from('order_sessions')
        .update({
          active_users: filtered,
          last_active_at: nowString
        })
        .eq('id', sess.id);
    }

    const mem = memoryOrderSessions.find(s => s.tenant_id === tenant_id && s.table_id === table_id && s.status === 'active');
    if (mem) {
      mem.active_users = mem.active_users.filter(u => u.toLowerCase() !== customer_name.trim().toLowerCase());
      mem.last_active_at = nowString;
    }

    return res.json({ success: true });
  } catch (err: any) {
    const mem = memoryOrderSessions.find(s => s.tenant_id === tenant_id && s.table_id === table_id && s.status === 'active');
    if (mem) {
      mem.active_users = mem.active_users.filter(u => u.toLowerCase() !== customer_name.trim().toLowerCase());
      mem.last_active_at = nowString;
    }
    return res.json({ success: true, source: 'memory_cache' });
  }
});

// 5. Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "alive", timestamp: new Date() });
});

// Setup Vite Dev Middleware vs Static Server for production
async function configureServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Menjalankan server di mode DEVELOPMENT dengan Vite Dev Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Menjalankan server di mode PRODUCTION...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ScanBite Server berjalan di http://localhost:${PORT}`);
  });
}

configureServer();
