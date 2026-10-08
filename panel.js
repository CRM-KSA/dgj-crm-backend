'use strict';
(() => {
  const el = id => document.getElementById(id);
  let token = null, user = null, editing = null, createKey = null, query = '', offset = 0, total = 0, trashLimit = 50;
  let records = [], messageTimer;
  const errorText = {
    LOGIN_REQUIRED: 'انتهت الجلسة. سجّلي الدخول مرة ثانية.', ACCOUNT_DISABLED: 'هذا الحساب لا يملك وصولًا للـCRM.',
    EDIT_CONFLICT: 'السجل تغير عند شخص ثاني. اضغطي تحديث وافتحيه مرة ثانية قبل الحفظ.',
    REQUEST_KEY_REUSED: 'تغيرت البيانات بعد محاولة الحفظ. حدّثي القائمة للتأكد من النتيجة، ثم ابدئي إضافة جديدة.',
    EMAIL_EXISTS: 'البريد مستخدم لحساب موجود.', INVALID_INPUT: 'راجعي الحقول ثم حاولي مرة ثانية.',
    MANAGER_REQUIRED: 'هذه العملية للمديرة فقط.', NOT_FOUND: 'السجل غير متاح أو تم حذفه.',
    RATE_LIMITED: 'محاولات كثيرة. انتظري قليلًا ثم حاولي.', SELF_DISABLE: 'ما تقدرين تعطّلين حسابك الحالي.',
    LINKED_RECORDS: 'السجل مرتبط بسجلات أخرى. افصلي الروابط قبل الحذف النهائي.'
  };
  function message(text, error = false) {
    el('message').textContent = text; el('message').className = `message${error ? ' error' : ''}`; el('message').hidden = false;
    clearTimeout(messageTimer); messageTimer = setTimeout(() => { el('message').hidden = true; }, 9000);
  }
  async function request(path, {method = 'GET', body, version, key, authenticated = true} = {}) {
    const headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated && token) headers.Authorization = `Bearer ${token}`;
    if (version !== undefined) headers['If-Match'] = `"${version}"`;
    if (key) headers['Idempotency-Key'] = key;
    const response = await fetch(path, {method, headers, credentials: 'omit', cache: 'no-store', ...(body !== undefined ? {body: JSON.stringify(body)} : {})});
    const result = response.status === 204 ? {} : await response.json();
    if (!response.ok) {
      if (response.status === 401 && authenticated) clearSession();
      const code = result.error?.code || result.code;
      throw new Error(errorText[code] || (path.includes('sign-in') ? 'راجعي البريد وكلمة المرور.' : 'تعذّر إكمال العملية. حاولي مرة ثانية.'));
    }
    return {data: result, token: response.headers.get('set-auth-token')};
  }
  function resetContact() {
    editing = null; createKey = null; el('contact-form').reset(); el('contact-form-title').textContent = 'إضافة كونتاكت';
    el('cancel-edit').hidden = true; el('visibility-field').hidden = user?.role !== 'manager';
  }
  function clearSession() {
    token = null; user = null; records = []; editing = null; createKey = null;
    el('workspace').hidden = true; el('login-card').hidden = false; el('login-form').reset();
    el('contact-form').reset(); el('password-form').reset(); el('account-form').reset();
    for (const id of ['contact-list','account-list','trash-list']) el(id).replaceChildren();
  }
  function textNode(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
  function button(label, action, cls = 'secondary') {
    const btn = textNode('button', label); btn.type = 'button'; btn.className = cls;
    btn.addEventListener('click', () => busy(btn, action)); return btn;
  }
  async function busy(target, action) {
    const controls = target.matches('form') ? [...target.querySelectorAll('button')] : [target];
    controls.forEach(control => {control.disabled = true;});
    try {await action();} catch (error) {message(error.message || 'تعذّر الاتصال. حاولي مرة ثانية.', true);}
    finally {controls.forEach(control => {control.disabled = false;});
      el('previous').disabled = offset === 0; el('next').disabled = offset + records.length >= total;}
  }
  function edit(record) {
    editing = record; createKey = null;
    const form = el('contact-form'); form.reset();
    for (const field of ['name','company','jobTitle','email','phone','visibility']) form.elements[field].value = record[field] || (field === 'visibility' ? 'shared' : '');
    el('contact-form-title').textContent = 'تعديل الكونتاكت'; el('cancel-edit').hidden = false;
    el('visibility-field').hidden = user.role !== 'manager' || record.ownerId !== user.id;
    form.elements.name.focus();
  }
  async function loadContacts() {
    const {data} = await request(`/api/records/Contacts?limit=20&offset=${offset}&query=${encodeURIComponent(query)}`);
    records = data.records; total = data.total;
    el('records-meta').textContent = total ? `${offset + 1}–${Math.min(offset + records.length, total)} من ${total}` : 'ما فيه نتائج. أضيفي كونتاكت تجريبي.';
    el('previous').disabled = offset === 0; el('next').disabled = offset + records.length >= total;
    const list = el('contact-list'); list.replaceChildren();
    for (const record of records) {
      const row = document.createElement('article'); row.className = 'record';
      const info = document.createElement('div'); info.append(textNode('h3', record.name), textNode('p', [record.company,record.jobTitle].filter(Boolean).join(' · ')),
        textNode('p', [record.email,record.phone].filter(Boolean).join(' · ')), textNode('p', record.visibility === 'private' ? 'خاص بالمديرة' : 'مشترك'));
      const actions = document.createElement('div'); actions.className = 'buttons'; actions.append(button('تعديل', () => edit(record)));
      if (user.role === 'manager') actions.append(button('حذف', async () => {
        if (!confirm(`نقل «${record.name}» للمحذوفات؟`)) return;
        await request(`/api/records/Contacts/${record.id}/trash`, {method: 'POST', version: record.version});
        if (editing?.id === record.id) resetContact(); await refresh(); message('تم نقله للمحذوفات.');
      }, 'danger'));
      row.append(info, actions); list.append(row);
    }
    el('contact-count').textContent = (await request('/api/statistics')).data.counts.Contacts;
  }
  async function loadAccounts() {
    const {data} = await request('/api/users'), list = el('account-list'); list.replaceChildren();
    for (const account of data.users) {
      const row = document.createElement('article'); row.className = 'record';
      const info = document.createElement('div'); info.append(textNode('h3', account.name), textNode('p', account.email),
        textNode('p', `${account.role === 'manager' ? 'مديرة' : 'عضوة'} · ${account.enabled ? 'مفعّل' : 'معطّل'}`)); row.append(info);
      if (account.id !== user.id) row.append(button(account.enabled ? 'تعطيل الوصول' : 'تفعيل الوصول', async () => {
        if (account.enabled && !confirm(`تعطيل وصول «${account.name}»؟`)) return;
        await request(`/api/users/${account.id}/access`, {method: 'PATCH', body: {enabled: !account.enabled}}); await loadAccounts();
        message('تم تحديث الوصول.');
      }));
      list.append(row);
    }
  }
  async function loadTrash() {
    const all = [];
    for (let start = 0; start < trashLimit; start += 50) {
      const {data} = await request(`/api/trash?limit=50&offset=${start}`); all.push(...data.records);
      el('more-trash').hidden = all.length >= data.total;
      if (all.length >= data.total) break;
    }
    const list = el('trash-list'); list.replaceChildren();
    if (!all.length) list.append(textNode('p', 'ما فيه محذوفات.'));
    for (const record of all) {
      const row = document.createElement('article'); row.className = 'record'; row.append(textNode('h3', record.name));
      const actions = document.createElement('div'); actions.className = 'buttons';
      actions.append(button('استعادة', async () => {
        await request(`/api/trash/${record.entityType}/${record.id}/restore`, {method: 'POST', version: record.version}); await refresh(); message('تمت الاستعادة.');
      }), button('حذف نهائي', async () => {
        if (!confirm(`حذف «${record.name}» نهائيًا؟ ما تقدرين تستعيدينه من هذه الصفحة.`)) return;
        await request(`/api/trash/${record.entityType}/${record.id}`, {method: 'DELETE', version: record.version}); await refresh(); message('تم الحذف النهائي.');
      }, 'danger'));
      row.append(actions); list.append(row);
    }
  }
  async function refresh() {
    await loadContacts();
    if (user.role === 'manager') {await loadAccounts(); await loadTrash();}
  }
  el('login-form').addEventListener('submit', event => {
    event.preventDefault(); busy(event.currentTarget, async () => {
      const form = el('login-form'), body = {email: form.elements.email.value.trim(), password: form.elements.password.value, rememberMe: false};
      const result = await request('/api/auth/sign-in/email', {method: 'POST', body, authenticated: false});
      form.elements.password.value = ''; if (!result.token) throw new Error('تعذّر بدء الجلسة. حاولي مرة ثانية.');
      token = result.token;
      try { user = (await request('/api/me')).data.user; } catch (error) {clearSession(); throw error;}
      el('login-card').hidden = true; el('workspace').hidden = false; el('greeting').textContent = `أهلًا ${user.name}`;
      el('role-label').textContent = user.role === 'manager' ? 'حساب مديرة · إدارة الفريق والكونتاكت' : 'حساب عضوة · الكونتاكت المشترك';
      for (const id of ['account-section','trash-section','export']) el(id).hidden = user.role !== 'manager';
      offset = 0; query = ''; resetContact(); await refresh(); message('تم تسجيل الدخول.');
    });
  });
  el('logout').addEventListener('click', () => busy(el('logout'), async () => {
    await request('/api/auth/sign-out', {method: 'POST', body: {}}); clearSession(); message('تم تسجيل الخروج.');
  }));
  el('contact-form').addEventListener('submit', event => {
    event.preventDefault(); busy(event.currentTarget, async () => {
      const form = el('contact-form'), body = Object.fromEntries(['name','company','jobTitle','email','phone'].map(field => [field, form.elements[field].value.trim()]));
      if (user.role === 'manager' && (!editing || editing.ownerId === user.id)) body.visibility = form.elements.visibility.value;
      if (editing) await request(`/api/records/Contacts/${editing.id}`, {method: 'PATCH', body, version: editing.version});
      else {createKey ||= crypto.randomUUID(); await request('/api/records/Contacts', {method: 'POST', body, key: createKey});}
      resetContact(); offset = 0; await refresh(); message('تم حفظ الكونتاكت في قاعدة البيانات.');
    });
  });
  el('account-form').addEventListener('submit', event => {
    event.preventDefault(); busy(event.currentTarget, async () => {
      const body = Object.fromEntries(new FormData(el('account-form')));
      await request('/api/users', {method: 'POST', body}); el('account-form').reset(); await loadAccounts(); message('تم إنشاء الحساب.');
    });
  });
  el('password-form').addEventListener('submit', event => {
    event.preventDefault(); busy(event.currentTarget, async () => {
      const body = {...Object.fromEntries(new FormData(el('password-form'))), revokeOtherSessions: true};
      const result = await request('/api/auth/change-password', {method: 'POST', body});
      if (result.token) token = result.token; el('password-form').reset(); message('تم تغيير كلمة المرور.');
    });
  });
  el('search-form').addEventListener('submit', event => {event.preventDefault(); query = el('search-form').elements.query.value.trim(); offset = 0; busy(el('search-form'), loadContacts);});
  el('cancel-edit').addEventListener('click', resetContact);
  el('refresh').addEventListener('click', () => busy(el('refresh'), refresh));
  el('refresh-trash').addEventListener('click', () => busy(el('refresh-trash'), loadTrash));
  el('more-trash').addEventListener('click', () => busy(el('more-trash'), async () => {trashLimit += 50; await loadTrash();}));
  el('previous').addEventListener('click', () => {offset = Math.max(0, offset - 20); busy(el('previous'), loadContacts);});
  el('next').addEventListener('click', () => {offset += 20; busy(el('next'), loadContacts);});
  el('export').addEventListener('click', () => busy(el('export'), async () => {
    const {data} = await request(`/api/export/Contacts?query=${encodeURIComponent(query)}`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'DGJ-Contacts.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('تم تجهيز الملف.');
  }));
})();
