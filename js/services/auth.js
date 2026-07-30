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

      // Auth state changes sunt gestionate în app.js (DOMContentLoaded)

      return null;
    } catch (err) {
      console.error('[Auth] Init error:', err);
      return null;
    }
  },

  async loadProfile(userId) {
    const sb = getSupabase();
    if (!sb) return;

    const user = this.currentUser;
    // SECURITATE: verifică domeniul înainte de orice altă operație
    const isInternalDomain = user?.email?.endsWith('@ingineriecreativa.ro');

    // 1. Caută profilul după id (cazul normal)
    const { data: profileById } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (profileById) {
      // SECURITATE: dacă emailul nu e intern, verifică că este colaborator_extern invitat
      if (!isInternalDomain) {
        if (profileById.role !== 'colaborator_extern') {
          console.warn('[Auth] Acces refuzat (profil existent, rol invalid):', user.email);
          this.currentProfile = null;
          this._accessDenied = true;
          return;
        }
      }
      this.currentProfile = profileById;
      return;
    }

    // 2. Caută profilul după email (profil pre-creat de admin) și transformă-l în profil activ
    if (user?.email) {
      const { data: profileByEmail } = await sb.from('profiles').select('*').eq('email', user.email).single();
      if (profileByEmail) {
        // SECURITATE: dacă emailul nu e intern, verifică că este colaborator_extern
        if (!isInternalDomain && profileByEmail.role !== 'colaborator_extern') {
          console.warn('[Auth] Acces refuzat (profil by email, rol invalid):', user.email);
          this.currentProfile = null;
          this._accessDenied = true;
          return;
        }
        // Profil pre-creat găsit: migrează cu funcția RPC (SECURITY DEFINER, bypass RLS)
        console.log('[Auth] Profil pre-creat găsit, migrare cu RPC...', profileByEmail.email);
        const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
        const { data: migratedProfile, error: rpcError } = await sb.rpc('migrate_pre_created_profile', {
          p_new_id: userId,
          p_email: user.email,
          p_avatar_url: avatarUrl,
        });
        if (rpcError) {
          console.error('[Auth] Eroare migrare profil pre-creat (RPC):', rpcError);
          // Fallback: folosește profilul pre-creat direct (fără migrare de ID)
          // Asta permite accesul chiar dacă migrarea eșuează
          this.currentProfile = profileByEmail;
          return;
        }
        console.log('[Auth] RPC migrare rezultat:', migratedProfile);
        // RPC returnează profilul migrat ca JSON
        if (migratedProfile && migratedProfile.id) {
          this.currentProfile = migratedProfile;
          // Dacă avatar-ul din RPC e null dar avem avatar din Google, actualizează
          if (!migratedProfile.avatar_url && avatarUrl) {
            console.log('[Auth] Actualizez avatar din Google...');
            await sb.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
            this.currentProfile.avatar_url = avatarUrl;
          }
        } else {
          // Reîncarcă profilul după migrare
          const { data: freshProfile } = await sb.from('profiles').select('*').eq('id', userId).single();
          if (freshProfile) {
            this.currentProfile = freshProfile;
            // Actualizează avatar dacă lipsește
            if (!freshProfile.avatar_url && avatarUrl) {
              console.log('[Auth] Actualizez avatar din Google (retry)...');
              await sb.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
              this.currentProfile.avatar_url = avatarUrl;
            }
          } else {
            // Fallback final: folosește profilul pre-creat
            this.currentProfile = profileByEmail;
          }
        }
        return;
      }
    }

    // 3. Crează profil nou dacă nu există deloc
    const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
    const employeeCode = fullName
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w[0].toUpperCase())
      .join('')
      .slice(0, 4);
    // Dacă emailul nu este @ingineriecreativa.ro, verifică dacă este colaborator extern invitat
    // SECURITATE: doar emailurile @ingineriecreativa.ro SAU colaboratorii externi invitați explicit pot accesa HUB-ul
    if (!isInternalDomain) {
      // Verifică dacă există un profil pre-creat cu role='colaborator_extern' pentru acest email
      const { data: extProfile } = await sb.from('profiles').select('*').eq('email', user.email).eq('role', 'colaborator_extern').limit(1);
      if (extProfile && extProfile.length > 0) {
        // Colaborator extern invitat — upsert cu ID-ul real din Google Auth
        const updatedProfile = { ...extProfile[0], id: userId, is_pre_created: false };
        delete updatedProfile.created_at;
        await sb.from('profiles').upsert(updatedProfile, { onConflict: 'email' });
        this.currentProfile = updatedProfile;
        return;
      }
      // Email extern fără invitație — REFUZĂ ACCESUL (securitate)
      console.warn('[Auth] Acces refuzat: email extern fără invitație:', user.email);
      this.currentProfile = null;
      this._accessDenied = true;
      return;
    }
    const newProfile = {
      id: userId,
      email: user.email,
      full_name: fullName,
      role: 'angajat',
      department: '',
      position: '',
      employee_code: employeeCode,
      is_pre_created: false,
      is_active: true,
      work_hours_per_day: 8,
    };
    const { error: insertError } = await sb.from('profiles').insert(newProfile);
    if (insertError) {
      console.error('[Auth] Eroare creare profil:', insertError);
      // Încercă upsert ca fallback
      await sb.from('profiles').upsert(newProfile, { onConflict: 'email' });
    }
    this.currentProfile = newProfile;
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
