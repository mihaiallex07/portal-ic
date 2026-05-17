// ============================================================
// Auth Service — Portal Inginerie Creativă
// ============================================================

const Auth = {
  currentUser: null,
  currentProfile: null,

  // Utilizator demo implicit
  demoUser: {
    id: 'demo-user-001',
    email: 'demo@inginerie-creativa.ro',
    user_metadata: { full_name: 'Demo Utilizator' },
  },
  demoProfile: {
    id: 'demo-user-001',
    email: 'demo@inginerie-creativa.ro',
    full_name: 'Demo Utilizator',
    role: 'admin',
    department: 'Management',
    position: 'Administrator',
    phone: '+40 700 000 000',
    avatar_url: null,
  },

  async init() {
    if (APP_CONFIG.demoMode) {
      // În demo mode, verificăm dacă utilizatorul a ales să intre
      const demoLoggedIn = sessionStorage.getItem('ic_demo_logged_in');
      if (demoLoggedIn) {
        this.currentUser = this.demoUser;
        this.currentProfile = this.demoProfile;
        return this.currentProfile;
      }
      return null;
    }

    const sb = getSupabase();
    if (!sb) return null;

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        this.currentUser = session.user;
        this.providerToken = session.provider_token || null;
        await this.loadProfile(session.user.id);
        return this.currentProfile;
      }

      // Listen for auth changes
      sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          this.currentUser = session.user;
          this.providerToken = session.provider_token || null;
          await this.loadProfile(session.user.id);
          App.onAuthSuccess();
        } else if (event === 'SIGNED_OUT') {
          this.currentUser = null;
          this.currentProfile = null;
          this.providerToken = null;
          App.onAuthLogout();
        }
      });

      return null;
    } catch (err) {
      console.error('[Auth] Init error:', err);
      return null;
    }
  },

  async loadProfile(userId) {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      this.currentProfile = data;
    } else {
      // Crează profil dacă nu există
      const user = this.currentUser;
      const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
      // Generează codul angajat din inițialele prenume+nume (ex: Mihai Porumboiu → MP)
      const employeeCode = fullName
        .split(' ')
        .filter(w => w.length > 0)
        .map(w => w[0].toUpperCase())
        .join('')
        .slice(0, 4);
      const newProfile = {
        id: userId,
        email: user.email,
        full_name: fullName,
        role: 'angajat',
        department: '',
        position: '',
        employee_code: employeeCode,
      };
      await sb.from('profiles').upsert(newProfile);
      this.currentProfile = newProfile;
    }
  },

  async loginWithEmail(email, password) {
    if (APP_CONFIG.demoMode) {
      // Demo: acceptă orice email/parolă
      sessionStorage.setItem('ic_demo_logged_in', '1');
      this.currentUser = { ...this.demoUser, email };
      this.currentProfile = { ...this.demoProfile, email, full_name: email.split('@')[0] };
      return { success: true };
    }

    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    this.currentUser = data.user;
    await this.loadProfile(data.user.id);
    return { success: true };
  },

  async registerWithEmail(email, password, fullName) {
    if (APP_CONFIG.demoMode) {
      sessionStorage.setItem('ic_demo_logged_in', '1');
      this.currentUser = { ...this.demoUser, email };
      this.currentProfile = { ...this.demoProfile, email, full_name: fullName };
      return { success: true };
    }

    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { success: false, error: error.message };
    if (data.user) {
      this.currentUser = data.user;
      await this.loadProfile(data.user.id);
    }
    return { success: true, needsConfirmation: !data.session };
  },

  async loginWithGoogle() {
    if (APP_CONFIG.demoMode) {
      sessionStorage.setItem('ic_demo_logged_in', '1');
      this.currentUser = this.demoUser;
      this.currentProfile = this.demoProfile;
      return { success: true };
    }

    const sb = getSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: 'https://www.googleapis.com/auth/drive.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async forgotPassword(email) {
    if (APP_CONFIG.demoMode) {
      return { success: true };
    }
    const sb = getSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async logout() {
    if (APP_CONFIG.demoMode) {
      sessionStorage.removeItem('ic_demo_logged_in');
      this.currentUser = null;
      this.currentProfile = null;
      return;
    }
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    this.currentUser = null;
    this.currentProfile = null;
  },

  isAdmin() {
    return this.currentProfile?.role === 'admin';
  },

  isCoordinator() {
    return this.currentProfile?.role === 'admin';
  },

  getInitials(name) {
    if (!name) return 'IC';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  },
};
