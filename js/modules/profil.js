// ============================================================
// Profil Module — Profilul meu + vizualizare profil angajat
// Comportament:
//   - render(userId)  → preview implicit (câmpuri read-only)
//   - render(userId, true) → mod editabil (apelat de butonul Editează)
//   - Profilul propriu și al altora: același comportament — preview → Editează → Salvează → preview
//   - "Profil negăsit" fix: render() fără userId = profilul propriu (nu null lookup)
// ============================================================
const Profil = {
  viewUserId: null,  // null = profilul propriu

  async render(userId, editMode) {
    // Dacă userId e undefined/null → profilul propriu
    this.viewUserId = userId || null;
    const currentProfile = Auth.currentProfile;
    const isAdmin = currentProfile?.role === 'admin';
    const isSelf = !this.viewUserId || this.viewUserId === Auth.currentUser?.id;

    // editMode: explicit true = editabil, orice altceva = preview
    const isEditing = editMode === true;
    const canSeeSensitive = isSelf || isAdmin;

    // Încarcă profilul (propriu sau al altui angajat)
    let profile = isSelf ? currentProfile : null;
    if (!isSelf && this.viewUserId) {
      const { data } = await DB.getProfile(this.viewUserId);
      profile = data;
    }
    if (!profile) {
      document.getElementById('page-content').innerHTML = `<div class="card p-6">Profil negăsit.</div>`;
      return;
    }

    const title = isSelf ? 'Profilul meu' : `Profil: ${profile.full_name || profile.name || profile.email}`;
    // ID-ul pe care îl pasăm la Editează/Salvează (string pentru onclick)
    const uidArg = this.viewUserId ? `'${this.viewUserId}'` : 'null';

    // Helper: afișează câmp ca text (preview) sau input (edit)
    const field = (id, value, opts = {}) => {
      if (!isEditing) {
        const display = (value !== null && value !== undefined && value !== '')
          ? String(value).replace(/</g,'&lt;')
          : `<span style="color:var(--text-muted);font-style:italic">—</span>`;
        return `<div class="input" style="background:var(--bg-secondary,#f5f5f5);cursor:default;border-color:transparent">${display}</div>`;
      }
      const ro = opts.readonly ? 'readonly' : '';
      const st = opts.style ? `style="${opts.style}"` : '';
      const ph = opts.placeholder ? `placeholder="${opts.placeholder}"` : '';
      const ml = opts.maxlength ? `maxlength="${opts.maxlength}"` : '';
      const pt = opts.pattern ? `pattern="${opts.pattern}" title="${opts.patternTitle||''}"` : '';
      const tp = opts.type || 'text';
      const val = (value !== null && value !== undefined) ? String(value).replace(/"/g,'&quot;') : '';
      return `<input type="${tp}" id="${id}" class="input" value="${val}" ${ro} ${ph} ${ml} ${pt} ${st} />`;
    };

    const selectField = (id, value, options) => {
      if (!isEditing) {
        const display = value || `<span style="color:var(--text-muted);font-style:italic">—</span>`;
        return `<div class="input" style="background:var(--bg-secondary,#f5f5f5);cursor:default;border-color:transparent">${display}</div>`;
      }
      const optHtml = options.map(o => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('');
      return `<select id="${id}" class="input"><option value="">— Selectează —</option>${optHtml}</select>`;
    };

    document.getElementById('page-content').innerHTML = `
      <div style="width:100%">
        <div class="page-header" style="margin-bottom:24px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:12px">
            <h1 class="page-title">${title}</h1>
            ${!isEditing ? `
              <button class="btn-brand" onclick="Profil.render(${uidArg}, true)" style="font-size:13px;padding:6px 16px">
                ✏️ Editează
              </button>
            ` : ''}
          </div>
          ${!isSelf ? `<button class="btn-secondary" onclick="navigate('admin-utilizatori',null)" style="font-size:13px">← Înapoi</button>` : ''}
        </div>

        <!-- Header card cu avatar și info de bază -->
        <div class="card p-6 mb-4" style="display:flex;align-items:center;gap:20px">
          <div class="avatar avatar-xl" style="width:72px;height:72px;font-size:24px;flex-shrink:0">
            ${profile.avatar_url
              ? `<img src="${profile.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
              : (profile.employee_code || Auth.getInitials(profile.full_name || profile.name))}
          </div>
          <div style="flex:1">
            <div style="font-size:20px;font-weight:700">${profile.full_name || profile.name || 'Utilizator'}</div>
            <div class="text-sm text-muted">${profile.email || ''}</div>
            <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
              ${roleBadge(profile.role || 'angajat')}
              ${profile.department ? `<span class="badge badge-gray">${profile.department}</span>` : ''}
              ${profile.job_title || profile.position ? `<span class="badge badge-gray">${profile.job_title || profile.position}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- 0. Rol utilizator — vizibil/editabil DOAR de admin pe profilul altui angajat -->
        ${isAdmin && !isSelf ? `
        <div class="card p-6 mb-4" style="border-left:3px solid var(--primary)">
          <div class="section-title" style="font-size:15px;font-weight:700;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--primary)">
            🔑 Rol în sistem
          </div>
          <div class="form-row form-row-2">
            <div>
              <label class="label">Rol</label>
              ${isEditing
                ? `<select id="prof-role" class="input">
                    <option value="angajat" ${(profile.role || 'angajat') === 'angajat' ? 'selected' : ''}>Angajat</option>
                    <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Admin</option>
                  </select>`
                : `<div class="input" style="background:var(--bg-secondary,#f5f5f5);cursor:default;border-color:transparent">${roleBadge(profile.role || 'angajat')}</div>`
              }
            </div>
          </div>
        </div>
        ` : ''}

        <!-- 1. Informații profesionale -->
        <div class="card p-6 mb-4">
          <div class="section-title" style="font-size:15px;font-weight:700;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--primary)">
            📋 Informații profesionale
          </div>
          <div class="form-row form-row-2">
            <div>
              <label class="label">Funcție</label>
              ${field('prof-position', profile.job_title || profile.position, { placeholder: 'Ex: Arhitect', readonly: !isAdmin && !isSelf })}
            </div>
            <div>
              <label class="label">Departament</label>
              ${field('prof-department', profile.department, { placeholder: 'Ex: Proiectare', readonly: !isAdmin && !isSelf })}
            </div>
          </div>
          <div class="form-row form-row-2 mt-3">
            <div>
              <label class="label">Telefon mobil</label>
              ${field('prof-phone-mobile', profile.phone_mobile, { type: 'tel', placeholder: '+40 7xx xxx xxx', maxlength: '15' })}
            </div>
            <div>
              <label class="label">Telefon de serviciu <span class="text-muted">(opțional)</span></label>
              ${field('prof-phone-work', profile.phone_work, { type: 'tel', placeholder: '+40 2xx xxx xxx', maxlength: '15' })}
            </div>
          </div>
          <div class="form-row form-row-2 mt-3">
            <div>
              <label class="label">Data angajării</label>
              ${field('prof-hire-date', profile.hire_date, { type: 'date', readonly: !isAdmin && !isSelf })}
              ${profile.hire_date ? `<div class="text-sm text-muted mt-1">Vechime: ${Profil.calcVechime(profile.hire_date)}</div>` : ''}
            </div>
            <div>
              <label class="label">Cod angajat</label>
              ${field('prof-employee-code', profile.employee_code, { placeholder: 'Ex: MP', maxlength: '5', style: 'text-transform:uppercase', readonly: !isAdmin })}
            </div>
          </div>
        </div>

        <!-- 2. Date personale -->
        <div class="card p-6 mb-4">
          <div class="section-title" style="font-size:15px;font-weight:700;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--primary)">
            👤 Date personale
          </div>
          <div class="form-row form-row-2">
            <div>
              <label class="label">Data nașterii</label>
              ${field('prof-birth-date', profile.birth_date, { type: 'date' })}
              ${profile.birth_date ? `<div class="text-sm text-muted mt-1">Vârstă: ${Profil.calcVarsta(profile.birth_date)}</div>` : ''}
            </div>
            <div>
              <label class="label">Adresă de reședință <span class="text-muted">(opțional)</span></label>
              ${field('prof-residence', profile.residence_address, { placeholder: 'Str. Exemplu nr. 1, Cluj-Napoca' })}
            </div>
          </div>
        </div>

        <!-- 3. Date act identitate — SENSIBIL: doar proprietar + admin -->
        ${canSeeSensitive ? `
        <div class="card p-6 mb-4" style="border-left:3px solid #f59e0b">
          <div class="section-title" style="font-size:15px;font-weight:700;margin-bottom:4px;padding-bottom:8px;border-bottom:2px solid #f59e0b">
            🔒 Date act de identitate
          </div>
          <div class="text-sm text-muted mb-3" style="font-style:italic">Vizibil doar pentru tine și administratori</div>
          <div class="form-row form-row-3 mb-3">
            <div>
              <label class="label">CNP</label>
              ${field('prof-cnp', profile.cnp, { placeholder: '1234567890123', maxlength: '13', pattern: '[0-9]{13}', patternTitle: 'CNP trebuie să conțină exact 13 cifre' })}
            </div>
            <div>
              <label class="label">Serie CI</label>
              ${field('prof-ci-series', profile.ci_series, { placeholder: 'CJ', maxlength: '2', style: 'text-transform:uppercase' })}
            </div>
            <div>
              <label class="label">Număr CI</label>
              ${field('prof-ci-number', profile.ci_number, { placeholder: '123456', maxlength: '6', pattern: '[0-9]{6}', patternTitle: 'Numărul CI trebuie să conțină exact 6 cifre' })}
            </div>
          </div>
          <div class="form-row form-row-2">
            <div>
              <label class="label">Data expirare CI</label>
              ${field('prof-ci-expiry', profile.ci_expiry_date, { type: 'date' })}
              ${profile.ci_expiry_date ? Profil.ciExpiryWarning(profile.ci_expiry_date) : ''}
            </div>
            <div>
              <label class="label">Eliberat de</label>
              ${field('prof-ci-issued-by', profile.ci_issued_by, { placeholder: 'SPCLEP Cluj-Napoca', maxlength: '60' })}
            </div>
          </div>
        </div>
        ` : ''}

        <!-- 4. Date financiare — SENSIBIL: doar proprietar + admin -->
        ${canSeeSensitive ? `
        <div class="card p-6 mb-4" style="border-left:3px solid #f59e0b">
          <div class="section-title" style="font-size:15px;font-weight:700;margin-bottom:4px;padding-bottom:8px;border-bottom:2px solid #f59e0b">
            💳 Date financiare
          </div>
          <div class="text-sm text-muted mb-3" style="font-style:italic">Vizibil doar pentru tine și administratori</div>
          <div class="form-row form-row-2">
            <div>
              <label class="label">IBAN</label>
              ${field('prof-iban', profile.iban, { placeholder: 'RO49AAAA1B31007593840000', maxlength: '24', style: 'text-transform:uppercase;letter-spacing:1px' })}
            </div>
            <div>
              <label class="label">Bancă</label>
              ${field('prof-bank', profile.bank_name, { placeholder: 'Ex: BCR, BRD, ING', maxlength: '50' })}
            </div>
          </div>
        </div>
        ` : ''}

        <!-- 5. Contact de urgență -->
        <div class="card p-6 mb-4">
          <div class="section-title" style="font-size:15px;font-weight:700;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--primary)">
            🆘 Contact de urgență
          </div>
          <div class="form-row form-row-3">
            <div>
              <label class="label">Nume complet</label>
              ${field('prof-emg-name', profile.emergency_contact_name, { placeholder: 'Ion Popescu', maxlength: '80' })}
            </div>
            <div>
              <label class="label">Telefon</label>
              ${field('prof-emg-phone', profile.emergency_contact_phone, { type: 'tel', placeholder: '+40 7xx xxx xxx', maxlength: '15' })}
            </div>
            <div>
              <label class="label">Relație</label>
              ${field('prof-emg-relation', profile.emergency_contact_relation, { placeholder: 'Ex: Soț/Soție, Părinte', maxlength: '40' })}
            </div>
          </div>
        </div>

        <!-- 6. Date medicale -->
        <div class="card p-6 mb-4">
          <div class="section-title" style="font-size:15px;font-weight:700;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--primary)">
            🩺 Date medicale
          </div>
          <div class="form-row form-row-2">
            <div>
              <label class="label">Grupă sanguină</label>
              ${selectField('prof-blood-type', profile.blood_type, ['O+','O-','A+','A-','B+','B-','AB+','AB-'])}
            </div>
            <div>
              <label class="label">Alergii cunoscute</label>
              ${field('prof-allergies', profile.known_allergies, { placeholder: 'Ex: Penicilină, Polen, Nickel', maxlength: '200' })}
            </div>
          </div>
        </div>

        <!-- 7. Preferințe Timer -->
        <div class="card p-6 mb-4">
          <div class="section-title" style="font-size:15px;font-weight:700;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #f59e0b">
            ⏱ Preferințe Timer
          </div>
          <div class="form-row form-row-2">
            <div>
              <label class="label">Auto-stop timer după (ore)</label>
              ${isEditing
                ? `<select id="prof-timer-auto-stop" class="input">
                    <option value="0" ${(profile.timer_auto_stop_hours || 4) === 0 ? 'selected' : ''}>Dezactivat (fără limită)</option>
                    <option value="2" ${(profile.timer_auto_stop_hours || 4) === 2 ? 'selected' : ''}>2 ore</option>
                    <option value="3" ${(profile.timer_auto_stop_hours || 4) === 3 ? 'selected' : ''}>3 ore</option>
                    <option value="4" ${(profile.timer_auto_stop_hours || 4) === 4 ? 'selected' : ''}>4 ore (implicit)</option>
                    <option value="6" ${(profile.timer_auto_stop_hours || 4) === 6 ? 'selected' : ''}>6 ore</option>
                    <option value="8" ${(profile.timer_auto_stop_hours || 4) === 8 ? 'selected' : ''}>8 ore</option>
                  </select>`
                : `<div class="input" style="background:var(--bg-secondary,#f5f5f5);cursor:default;border-color:transparent">${profile.timer_auto_stop_hours === 0 ? 'Dezactivat' : (profile.timer_auto_stop_hours || 4) + ' ore'}</div>`
              }
              <p style="font-size:11px;color:var(--text-muted);margin-top:4px">Timerul se va opri automat după intervalul selectat pentru a evita uitările.</p>
            </div>
          </div>
        </div>

        <!-- Butoane de acțiune — doar în mod editabil -->
        ${isEditing ? `
        <div class="flex justify-between items-center mb-6">
          ${isSelf
            ? `<button class="btn-danger" onclick="Auth.logout()">Deconectare</button>`
            : `<button class="btn-secondary" onclick="Profil.render(${uidArg}, false)">✕ Anulează</button>`
          }
          <button class="btn-brand" onclick="Profil.save()">💾 Salvează toate modificările</button>
        </div>
        ` : `
        ${isSelf ? `
        <div class="flex justify-end mb-6">
          <button class="btn-danger" onclick="Auth.logout()">Deconectare</button>
        </div>
        ` : ''}
        `}
      </div>
    `;
  },

  // Calculează vechimea în ani și luni
  calcVechime(hireDateStr) {
    if (!hireDateStr) return '';
    const hire = new Date(hireDateStr);
    const now = new Date();
    let years = now.getFullYear() - hire.getFullYear();
    let months = now.getMonth() - hire.getMonth();
    if (months < 0) { years--; months += 12; }
    if (years === 0 && months === 0) return 'mai puțin de o lună';
    const y = years > 0 ? `${years} an${years !== 1 ? 'i' : ''}` : '';
    const m = months > 0 ? `${months} lun${months !== 1 ? 'i' : 'ă'}` : '';
    return [y, m].filter(Boolean).join(' și ');
  },

  // Calculează vârsta
  calcVarsta(birthDateStr) {
    if (!birthDateStr) return '';
    const birth = new Date(birthDateStr);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return `${age} ani`;
  },

  // Avertisment expirare CI
  ciExpiryWarning(expiryDateStr) {
    if (!expiryDateStr) return '';
    const expiry = new Date(expiryDateStr);
    const now = new Date();
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return `<div class="text-sm mt-1" style="color:var(--danger)">⚠️ CI expirat!</div>`;
    if (daysLeft < 90) return `<div class="text-sm mt-1" style="color:#f59e0b">⚠️ Expiră în ${daysLeft} zile</div>`;
    return '';
  },

  async save() {
    const currentProfile = Auth.currentProfile;
    const isAdmin = currentProfile?.role === 'admin';
    const isSelf = !this.viewUserId || this.viewUserId === Auth.currentUser?.id;
    // Salvează ÎNTOTDEAUNA pe angajatul vizualizat (nu pe cel logat)
    const targetId = isSelf ? Auth.currentUser?.id : this.viewUserId;

    if (!targetId) { showToast('Eroare: ID utilizator lipsă', 'error'); return; }

    const updates = {};

    // Câmpuri de bază
    const phoneM = document.getElementById('prof-phone-mobile')?.value?.trim();
    const phoneW = document.getElementById('prof-phone-work')?.value?.trim();
    const hireD = document.getElementById('prof-hire-date')?.value;
    const birthD = document.getElementById('prof-birth-date')?.value;
    const resid = document.getElementById('prof-residence')?.value?.trim();
    const emgN = document.getElementById('prof-emg-name')?.value?.trim();
    const emgP = document.getElementById('prof-emg-phone')?.value?.trim();
    const emgR = document.getElementById('prof-emg-relation')?.value?.trim();
    const blood = document.getElementById('prof-blood-type')?.value;
    const allerg = document.getElementById('prof-allergies')?.value?.trim();

    if (phoneM !== undefined) updates.phone_mobile = phoneM || null;
    if (phoneW !== undefined) updates.phone_work = phoneW || null;
    if (hireD !== undefined) updates.hire_date = hireD || null;
    if (birthD !== undefined) updates.birth_date = birthD || null;
    if (resid !== undefined) updates.residence_address = resid || null;
    if (emgN !== undefined) updates.emergency_contact_name = emgN || null;
    if (emgP !== undefined) updates.emergency_contact_phone = emgP || null;
    if (emgR !== undefined) updates.emergency_contact_relation = emgR || null;
    if (blood !== undefined) updates.blood_type = blood || null;
    if (allerg !== undefined) updates.known_allergies = allerg || null;

    // Câmpuri sensibile — doar proprietar sau admin
    if (isSelf || isAdmin) {
      const cnp = document.getElementById('prof-cnp')?.value?.trim();
      const ciS = document.getElementById('prof-ci-series')?.value?.toUpperCase().trim();
      const ciN = document.getElementById('prof-ci-number')?.value?.trim();
      const ciE = document.getElementById('prof-ci-expiry')?.value;
      const ciI = document.getElementById('prof-ci-issued-by')?.value?.trim();
      const iban = document.getElementById('prof-iban')?.value?.toUpperCase().trim();
      const bank = document.getElementById('prof-bank')?.value?.trim();

      if (cnp !== undefined) updates.cnp = cnp || null;
      if (ciS !== undefined) updates.ci_series = ciS || null;
      if (ciN !== undefined) updates.ci_number = ciN || null;
      if (ciE !== undefined) updates.ci_expiry_date = ciE || null;
      if (ciI !== undefined) updates.ci_issued_by = ciI || null;
      if (iban !== undefined) updates.iban = iban || null;
      if (bank !== undefined) updates.bank_name = bank || null;

      // Validări
      if (cnp && cnp.length !== 13) { showToast('CNP-ul trebuie să conțină exact 13 cifre', 'error'); return; }
      if (ciN && ciN.length !== 6) { showToast('Numărul CI trebuie să conțină exact 6 cifre', 'error'); return; }
      if (iban && iban.length !== 24) { showToast('IBAN-ul trebuie să conțină exact 24 caractere', 'error'); return; }
    }

    // Câmpuri editabile de admin
    if (isAdmin) {
      const pos = document.getElementById('prof-position')?.value?.trim();
      const dep = document.getElementById('prof-department')?.value?.trim();
      const ec = document.getElementById('prof-employee-code')?.value?.toUpperCase().trim();
      if (pos !== undefined) updates.job_title = pos || null;
      if (dep !== undefined) updates.department = dep || null;
      if (ec !== undefined) updates.employee_code = ec || null;
    }

    // Câmpul Rol — editabil doar de admin pe profilul altui angajat
    if (isAdmin && !isSelf) {
      const rolEl = document.getElementById('prof-role');
      if (rolEl && rolEl.value) updates.role = rolEl.value;
    }
    // Timer auto-stop — editabil de oricine pe profilul propriu
    const timerStopEl = document.getElementById('prof-timer-auto-stop');
    if (timerStopEl) updates.timer_auto_stop_hours = parseInt(timerStopEl.value) || 0;

    const { error } = await DB.updateProfile(targetId, updates);
    if (error) { showToast('Eroare la salvare: ' + error.message, 'error'); return; }

    // Actualizează cache-ul local doar dacă e profilul propriu
    if (isSelf) {
      Object.assign(Auth.currentProfile, updates);
      if (typeof updateSidebarUser === 'function') updateSidebarUser();
    }
    showToast('Profil actualizat cu succes!', 'success');
    // Revino în mod preview după salvare
    setTimeout(() => this.render(this.viewUserId, false), 400);
  },
};
