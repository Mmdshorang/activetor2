import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserPlus, Edit2, Save, X, Loader2, AlertCircle, Search, RefreshCw } from 'lucide-react';
import { loadUserApiConfig, userApi } from '../services/users';
import { clearAuth, getAuthToken, getAuthUser, setAuth } from '../utils/auth';

const emptyForm = () => ({ RowID: '0', RowName: '', UserName: '', Password: '', UseType: '', Mobile: '', IsActive: true });
export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editID, setEditID] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const formHeading = useRef(null);
  const inFlight = useRef(false);
  const busy = saving || detailLoading || listLoading;
  const isEditing = editID !== null;

  const loadUsers = useCallback(async signal => {
    setListLoading(true); setLoadError('');
    try {
      const loadedConfig = await loadUserApiConfig();
      if (signal?.aborted) return;
      setConfig(loadedConfig);
      const list = await userApi.getUsers({ signal });
      if (!signal?.aborted) setUsers(list);
    } catch (err) {
      if (err.name !== 'AbortError' && !signal?.aborted) setLoadError(err.message || 'دریافت کاربران انجام نشد.');
    } finally { if (!signal?.aborted) setListLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers]);

  const change = event => {
    const { name, value, type, checked } = event.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setError(''); setSuccess('');
  };
  const reset = () => { setForm(emptyForm()); setEditID(null); setError(''); };
  const startEdit = async id => {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setDetailLoading(true); setError(''); setSuccess('');
    try {
      const user = await userApi.getUserByID(id);
      setForm({ ...user, UseType: user.UseType ?? '', Password: '' });
      setEditID(user.RowID);
      formHeading.current?.focus();
      formHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { setError(err.message || 'دریافت کاربر انجام نشد.'); }
    finally { inFlight.current = false; setDetailLoading(false); }
  };
  const save = async event => {
    event.preventDefault();
    if (inFlight.current || busy || !config) return;
    inFlight.current = true;
    setSaving(true); setError(''); setSuccess('');
    try {
      const message = isEditing ? await userApi.updateUser({ ...form, RowID: editID }) : await userApi.insertUser(form);
      const currentUser = getAuthUser();
      if (isEditing && currentUser?.RowID === editID) {
        if (!form.IsActive) { clearAuth(); return; }
        setAuth({ token: getAuthToken(), user: { ...form, RowID: editID, UseType: form.UseType === '' ? null : Number(form.UseType) } });
      }
      reset(); setSuccess(message);
      await loadUsers();
    } catch (err) { setError(err.message || 'ذخیره اطلاعات انجام نشد.'); }
    finally { inFlight.current = false; setSaving(false); }
  };
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fa');
    return users.filter(user => {
      if (status === 'active' && !user.IsActive) return false;
      if (status === 'inactive' && user.IsActive) return false;
      return [user.RowID, user.RowName, user.UserName, user.Mobile].some(value => String(value).toLocaleLowerCase('fa').includes(term));
    });
  }, [users, status, search]);
  const typeLabel = value => value === null ? 'تعیین نشده' : config?.useTypes.find(item => item.value === value)?.label || String(value);
  const passwordRequired = !isEditing || config?.updatePasswordMode === 'required';

  return (
    <div className="space-y-6" dir="rtl">
      <div className="panel-card-soft p-6 md:p-7 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="panel-title flex items-center gap-3"><Users className="text-teal-700" size={30} />مدیریت کاربران</h1><p className="panel-subtitle">افزودن، مشاهده و ویرایش اطلاعات کاربران سامانه</p></div>
        <button type="button" onClick={() => loadUsers()} disabled={busy} className="panel-btn-secondary"><RefreshCw size={16} className={listLoading ? 'animate-spin' : ''} />به‌روزرسانی لیست</button>
      </div>
      {success && <div role="status" className="panel-alert-success">{success}</div>}
      {error && <div role="alert" className="panel-alert-error flex items-center gap-2"><AlertCircle size={18} />{error}</div>}
      {loadError && <div role="alert" className="panel-alert-error">{loadError}<button type="button" onClick={() => loadUsers()} disabled={busy} className="underline mr-3">تلاش مجدد</button></div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1">
          <section className="panel-card p-5 xl:sticky xl:top-6">
            <h2 ref={formHeading} tabIndex={-1} className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">{isEditing ? <Edit2 size={18} /> : <UserPlus size={18} />}{isEditing ? 'ویرایش کاربر' : 'افزودن کاربر جدید'}</h2>
            {isEditing && <p className="text-xs text-slate-500 mb-4">شناسه: <b dir="ltr">{editID}</b></p>}
            <form onSubmit={save}>
              <fieldset disabled={busy || !config} className="space-y-4">
                <div><label htmlFor="user-name" className="panel-label">نام کامل</label><input id="user-name" name="RowName" value={form.RowName} onChange={change} className="panel-input" autoComplete="off" /></div>
                <div><label htmlFor="user-username" className="panel-label">نام کاربری *</label><input id="user-username" name="UserName" value={form.UserName} onChange={change} className="panel-input" required autoComplete="off" autoCapitalize="none" spellCheck={false} /></div>
                <div>
                  <label htmlFor="user-password" className="panel-label">رمز عبور {passwordRequired ? '*' : '(اختیاری)'}</label>
                  <input id="user-password" name="Password" type="password" value={form.Password} onChange={change} className="panel-input" required={passwordRequired} autoComplete="new-password" aria-describedby="password-hint" />
                  <p id="password-hint" className="text-xs text-slate-500 mt-2">{isEditing ? passwordRequired ? 'برای ذخیره ویرایش، رمز عبور را وارد کنید.' : 'برای حفظ رمز فعلی، این قسمت را خالی بگذارید.' : 'رمز عبور برای ورود کاربر جدید استفاده می‌شود.'}</p>
                </div>
                <div><label htmlFor="user-mobile" className="panel-label">موبایل</label><input id="user-mobile" name="Mobile" type="tel" dir="ltr" value={form.Mobile} onChange={change} className="panel-input" autoComplete="off" /></div>
                <div>
                  <label htmlFor="user-type" className="panel-label">نوع کاربر</label>
                  {config?.useTypes.length ? <select id="user-type" name="UseType" value={form.UseType} onChange={change} className="panel-select"><option value="">تعیین نشده</option>{form.UseType !== '' && !config.useTypes.some(item => item.value === Number(form.UseType)) && <option value={form.UseType}>{form.UseType}</option>}{config.useTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <input id="user-type" name="UseType" type="number" min="-2147483648" max="2147483647" step="1" value={form.UseType} onChange={change} className="panel-input" placeholder="کد عددی نوع کاربر (اختیاری)" />}
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input name="IsActive" type="checkbox" checked={form.IsActive} onChange={change} className="accent-teal-700 h-4 w-4" />حساب کاربری فعال است</label>
                <div className="flex gap-2 pt-2"><button type="submit" className="panel-btn-primary flex-1">{saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}{isEditing ? 'ذخیره تغییرات' : 'افزودن کاربر'}</button>{isEditing && <button type="button" onClick={reset} className="panel-btn-secondary" aria-label="انصراف از ویرایش"><X size={18} /></button>}</div>
              </fieldset>
            </form>
          </section>
        </div>
        <section className="xl:col-span-2 panel-card overflow-hidden self-start" aria-label="لیست کاربران">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1"><label htmlFor="users-search" className="sr-only">جستجوی کاربران</label><Search className="absolute right-3 top-3 text-slate-400" size={16} /><input id="users-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="جستجوی نام، نام کاربری، موبایل یا شناسه" className="panel-input pr-9" /></div>
              <label className="sm:w-40"><span className="sr-only">فیلتر وضعیت</span><select value={status} onChange={e => setStatus(e.target.value)} className="panel-select"><option value="all">همه کاربران</option><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></label>
            </div>
            {!loadError && <p className="text-xs text-slate-500" aria-live="polite">{listLoading ? 'در حال دریافت اطلاعات…' : `${filtered.length.toLocaleString('fa-IR')} کاربر از ${users.length.toLocaleString('fa-IR')}`}</p>}
          </div>
          <div className="panel-table-wrap max-h-[65vh]" aria-busy={listLoading}>
            <table className="panel-table"><thead><tr><th>شناسه</th><th>نام و نام کاربری</th><th>نوع کاربر</th><th>موبایل</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>
              {listLoading && users.length === 0 ? <tr><td colSpan={6} className="text-center py-8"><Loader2 className="animate-spin inline-block ml-2" size={18} />در حال بارگذاری…</td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-slate-500">{loadError ? 'لیست کاربران دریافت نشد.' : users.length ? 'نتیجه‌ای برای این جستجو پیدا نشد.' : 'هنوز کاربری ثبت نشده است.'}</td></tr> : filtered.map(user => <tr key={user.RowID}>
                <td dir="ltr">{user.RowID}</td><td><p className="font-semibold text-slate-900">{user.RowName || '—'}</p><p className="text-xs text-slate-500 mt-1">{user.UserName}</p></td><td>{typeLabel(user.UseType)}</td><td dir="ltr">{user.Mobile || '—'}</td><td><span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${user.IsActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{user.IsActive ? 'فعال' : 'غیرفعال'}</span></td><td><button type="button" onClick={() => startEdit(user.RowID)} disabled={busy} className="panel-btn-secondary px-3 py-1.5" aria-label={`ویرایش ${user.UserName}`}><Edit2 size={14} />ویرایش</button></td>
              </tr>)}
            </tbody></table>
          </div>
        </section>
      </div>
    </div>
  );
}
