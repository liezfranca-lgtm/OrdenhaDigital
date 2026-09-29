// ============================================================
// OrdenhaDigital — Configuração do Supabase
// Inclua este arquivo em todas as páginas, antes dos demais scripts
// ============================================================

const SUPABASE_URL = 'https://vnlaxudshuzmwnvoyybv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubGF4dWRzaHV6bXdudm95eWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NjI1NDAsImV4cCI6MjEwNjIzODU0MH0.FnMsGXqM7ylhohJpAYzWhPqtw0IQZ2Pu0zFbiefmEjU';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Proteção de página: redireciona para login se não autenticado
async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}
