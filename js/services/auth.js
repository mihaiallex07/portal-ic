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

  // Stil: păstrează fluxul existent de autentificare; sincronizarea profilului folosește datele Google și nu suprascrie datele HR.
  getGoogleAvatar(user) {
    return user?.user_metadata?.avatar_url
      || user?.user_metadata?.picture
      || user?.identities?.[0]?.identity_data?.avatar_url
      || user?.identities?.[0]?.identity_data?.picture
      || null;
  },

  getGoogleFullName(user) {
    return user?.user_metadata?.full_name
      || user?.user_metadata?.name
      || user?.identities?.[0]?.identity_data?.full_name
      || user?.identities?.[0]?.identity_data?.name
      || user?.email?.split('@')[0]
      || 'Utilizator';
  },

  async syncAvatar(sb, userId, profile, avatarUrl) {
    if (!avatarUrl || !profile || profile.avatar_url === avatarUrl) return profile;
    const { data: updatedProfile, error } = await sb.from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId)
      .select('*')
      .maybeSingle();
    if (!error && updatedProfile) return updatedProfile;
    if (error) console.warn('[Auth] Nu am putut sincroniza avatarul Google:', error.message);
    return profile;
  },

  async restoreOrphanedProjectLinks(sb, userId, email) {
    // Compatibilitate pentru date istorice: dacă project_members păstrează emailul,
    // remapează rândurile rămase de la ID-ul temporar la ID-ul Auth real.
    try {
      const { data: legacyMembers, error } = await sb.from('project_members')
        .select('id,project_id,user_id,email')
        .eq('email', email);
      if (error || !legacyMembers?.length) return;

      const oldIds = [...new Set(legacyMembers.map(row => row.user_id).filter(id => id && id !== userId))];
      for (const row of legacyMembers) {
        const { data: currentMember } = await sb.from('project_members')
          .select('id')
          .eq('project_id', row.project_id)
          .eq('user_id', userId)
          .maybeSingle();
        // Autentificarea nu șterge niciodată membri. Dacă există deja o
        // asociere pe ID-ul nou, păstrăm rândul istoric intact; altfel îl remapăm.
        if (!currentMember?.id && row.user_id !== userId) {
          await sb.from('project_members').update({ user_id: userId, is_pre_created: false }).eq('id', row.id);
        }
      }

      // Remapăm și asignările rămase, atunci când politicile RLS permit operația.
      for (const oldId of oldIds) {
        await sb.from('project_task_assignments').update({ user_id: userId }).eq('user_id', oldId);
        await sb.from('project_tasks').update({ assigned_user_id: userId }).eq('assigned_user_id', oldId);
        await sb.from('time_entries').update({ user_id: userId }).eq('user_id', oldId);
      }
    } catch (error) {
      // Recuperarea este best-effort; nu blocăm autentificarea dacă datele istorice nu mai există.
      console.warn('[Auth] Recuperarea legăturilor istorice nu a fost posibilă:', error.message);
    }
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

    // Fiecare încercare de login pornește curat; o eroare anterioară nu poate
    // bloca o autentificare ulterioară validă.
    this.currentProfile = null;
    this._accessDenied = false;
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
      const avatarUrl = this.getGoogleAvatar(user);
      this.currentProfile = await this.syncAvatar(sb, userId, profileById, avatarUrl);
      if (user?.email) await this.restoreOrphanedProjectLinks(sb, userId, user.email);
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
        // Profil pre-creat găsit: migrează cu RPC SECURITY DEFINER, păstrând datele HR și legăturile.
        console.log('[Auth] Profil pre-creat găsit, migrare cu RPC...', profileByEmail.email);
        const avatarUrl = this.getGoogleAvatar(user);
        const fullNameFromGoogle = this.getGoogleFullName(user);
        let migratedProfile = null;
        let rpcError = null;

        // Versiunea actuală primește și numele Google. Pentru baze care încă au
        // semnătura istorică de 3 parametri, încercăm compatibilitatea automat.
        const primaryRpc = await sb.rpc('migrate_pre_created_profile', {
          p_new_id: userId,
          p_email: user.email,
          p_avatar_url: avatarUrl,
          p_full_name: fullNameFromGoogle,
        });
        migratedProfile = primaryRpc.data;
        rpcError = primaryRpc.error;
        if (rpcError) {
          const legacyRpc = await sb.rpc('migrate_pre_created_profile', {
            p_new_id: userId,
            p_email: user.email,
            p_avatar_url: avatarUrl,
          });
          migratedProfile = legacyRpc.data;
          rpcError = legacyRpc.error;
        }

        if (rpcError) {
          console.error('[Auth] Migrarea profilului pre-creat a eșuat:', rpcError);
          // Nu folosim profilul cu ID-ul vechi ca profil activ: ar ascunde proiectele
          // deoarece interogările folosesc ID-ul real din Auth.
          const { data: profileAfterRpc } = await sb.from('profiles')
            .select('*').eq('id', userId).maybeSingle();
          if (!profileAfterRpc) {
            this.currentProfile = null;
            this._accessDenied = true;
            return;
          }
          migratedProfile = profileAfterRpc;
        }

        // Nu folosim obiectul returnat de RPC ca sursă de adevăr: unele versiuni
        // ale funcției întorc încă profilul vechi. Verificăm rândul pe ID-ul Auth real.
        const { data: verifiedProfile } = await sb.from('profiles')
          .select('*').eq('id', userId).maybeSingle();
        if (!verifiedProfile) {
          console.error('[Auth] Migrarea nu a creat profilul pe ID-ul Auth real.');
          this.currentProfile = null;
          this._accessDenied = true;
          return;
        }
        this.currentProfile = await this.syncAvatar(sb, userId, verifiedProfile, avatarUrl);
        await this.restoreOrphanedProjectLinks(sb, userId, user.email);
        return;
      }
    }

    // 3. Crează profil nou dacă nu există deloc
    const fullName = this.getGoogleFullName(user);
    const avatarUrl = this.getGoogleAvatar(user);
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
      name: fullName,
      avatar_url: avatarUrl,
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
    await this.restoreOrphanedProjectLinks(sb, userId, user.email);
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
