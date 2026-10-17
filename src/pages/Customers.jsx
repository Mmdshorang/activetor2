import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserPlus, Edit2, Save, X, Loader2, AlertCircle, Search, RefreshCw, Asterisk } from 'lucide-react';
import moment from 'jalali-moment';
import { customerApi } from '../services/customers';

const emptyForm = () => ({
  RowID: '0', RowName: '', ShopName: '', Address: '', ContractDate: null,
  EndDate: null, ActiveToken: '', LastTry: null, UniqueCode: null,
  ID: null, UserID: null, UserName: '', Password: '', MobileNumber: '',
});
const toJalali = value => {
  if (!value) return null;
  const date = moment.from(value.slice(0, 10), 'en', 'YYYY-MM-DD');
  return date.isValid() ? date.locale('fa').format('jYYYY/jMM/jDD') : null;
};
const displayDate = value => toJalali(value) || '—';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editID, setEditID] = useState(null);
  const [search, setSearch] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const heading = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const listController = useRef(null);
  const detailController = useRef(null);
  const busy = saving || detailLoading || listLoading;
  const isEditing = editID !== null;
  const requiredMark = !isEditing && <Asterisk size={12} className="inline-block text-red-600 mr-1 align-middle" aria-hidden="true" />;

  const loadCustomers = useCallback(async () => {
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    setListLoading(true);
    setLoadError('');
    try {
      const list = await customerApi.getCustomers({ signal: controller.signal });
      if (mounted.current && !controller.signal.aborted) setCustomers(list);
    } catch (err) {
      if (mounted.current && !controller.signal.aborted) setLoadError(err.message || 'دریافت مشتریان انجام نشد.');
    } finally {
      if (mounted.current && !controller.signal.aborted) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadCustomers();
    return () => {
      mounted.current = false;
      listController.current?.abort();
      detailController.current?.abort();
    };
  }, [loadCustomers]);

  const change = event => {
    const { name, value } = event.target;
    setForm(previous => ({ ...previous, [name]: value }));
    setError(''); setSuccess('');
  };
  const reset = () => { setForm(emptyForm()); setEditID(null); setError(''); };
  const startEdit = async rowID => {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    const controller = new AbortController();
    detailController.current = controller;
    setDetailLoading(true); setError(''); setSuccess('');
    try {
      const customer = await customerApi.getCustomerByID(rowID, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      setForm(customer);
      setEditID(customer.RowID);
      heading.current?.focus();
      heading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      if (mounted.current && !controller.signal.aborted) setError(err.message || 'دریافت مشتری انجام نشد.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setDetailLoading(false);
    }
  };
  const save = async event => {
    event.preventDefault();
    if (inFlight.current || busy) return;
    if (!event.currentTarget.reportValidity()) return;
    inFlight.current = true;
    setSaving(true); setError(''); setSuccess('');
    try {
      const message = isEditing
        ? await customerApi.updateCustomer({ ...form, RowID: editID })
        : await customerApi.insertCustomer(form);
      if (!mounted.current) return;
      reset(); setSuccess(message);
      await loadCustomers();
    } catch (err) {
      if (mounted.current) setError(err.message || 'ذخیره اطلاعات انجام نشد.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fa');
    return customers.filter(customer => [customer.RowID, customer.RowName, customer.ShopName, customer.MobileNumber, customer.UserName, customer.Address]
      .some(value => String(value ?? '').toLocaleLowerCase('fa').includes(term)));
  }, [customers, search]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="panel-card-soft p-6 md:p-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="panel-title flex items-center gap-3"><Users className="text-teal-700" size={30} />مدیریت مشتریان</h1>
          <p className="panel-subtitle">مشاهده، ثبت و ویرایش اطلاعات مشتریان</p>
        </div>
        <button type="button" onClick={loadCustomers} disabled={busy} className="panel-btn-secondary"><RefreshCw size={16} className={listLoading ? 'animate-spin' : ''} />به‌روزرسانی لیست</button>
      </div>
      {success && <div role="status" className="panel-alert-success">{success}</div>}
      {error && <div role="alert" className="panel-alert-error flex items-center gap-2"><AlertCircle size={18} />{error}</div>}
      {loadError && <div role="alert" className="panel-alert-error">{loadError}{customers.length > 0 && <span> اطلاعات نمایش‌داده‌شده مربوط به آخرین دریافت موفق است.</span>}<button type="button" onClick={loadCustomers} disabled={busy} className="underline mr-3">تلاش مجدد</button></div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <section className="panel-card p-5">
          <h2 ref={heading} tabIndex={-1} className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">{isEditing ? <Edit2 size={18} /> : <UserPlus size={18} />}{isEditing ? 'ویرایش مشتری' : 'افزودن مشتری جدید'}</h2>
          {isEditing && <p className="text-xs text-slate-500 mb-4">شناسه مشتری: <b dir="ltr">{editID}</b></p>}
          {!isEditing && <p className="text-xs text-slate-500 mb-4">فیلدهای ستاره‌دار برای ثبت مشتری الزامی هستند.</p>}
          <form onSubmit={save} autoComplete="off">
            <fieldset disabled={busy} className="space-y-4">
              <div><label htmlFor="customer-name" className="panel-label">نام مشتری{requiredMark}</label><input id="customer-name" name="RowName" required={!isEditing} value={form.RowName} onChange={change} className="panel-input" /></div>
              <div><label htmlFor="customer-shop" className="panel-label">نام فروشگاه{requiredMark}</label><input id="customer-shop" name="ShopName" required={!isEditing} value={form.ShopName} onChange={change} className="panel-input" /></div>
              <div><label htmlFor="customer-mobile" className="panel-label">شماره موبایل{requiredMark}</label><input id="customer-mobile" name="MobileNumber" type="tel" dir="ltr" required={!isEditing} value={form.MobileNumber} onChange={change} className="panel-input" /></div>
              <div><label htmlFor="customer-address" className="panel-label">آدرس{requiredMark}</label><textarea id="customer-address" name="Address" required={!isEditing} value={form.Address} onChange={change} className="panel-input resize-y" rows={2} /></div>
              <div><label htmlFor="customer-username" className="panel-label">نام کاربری{requiredMark}</label><input id="customer-username" name="UserName" dir="ltr" required={!isEditing} value={form.UserName} onChange={change} className="panel-input" autoCapitalize="none" spellCheck={false} /></div>
              <div>
                <label htmlFor="customer-password" className="panel-label">رمز عبور{requiredMark}</label>
                <input id="customer-password" name="Password" type="password" required={!isEditing} value={form.Password} onChange={change} className="panel-input" autoComplete="new-password" aria-describedby={isEditing ? 'customer-password-hint' : undefined} />
                {isEditing && <p id="customer-password-hint" className="text-xs text-slate-500 mt-2">مقدار دریافتی از سرور به‌صورت مخفی در فرم قرار دارد. با پاک‌کردن آن، رمز خالی ارسال می‌شود.</p>}
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="panel-btn-primary flex-1">{saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}{isEditing ? 'ذخیره تغییرات' : 'افزودن مشتری'}</button>
                {isEditing && <button type="button" onClick={reset} className="panel-btn-secondary" aria-label="انصراف از ویرایش"><X size={18} /></button>}
              </div>
            </fieldset>
          </form>
        </section>
        <section className="xl:col-span-2 panel-card overflow-hidden" aria-label="لیست مشتریان">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative"><label htmlFor="customer-search" className="sr-only">جستجوی مشتریان</label><Search className="absolute right-3 top-3 text-slate-400" size={16} /><input id="customer-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="جستجوی نام، فروشگاه، موبایل یا شناسه" className="panel-input pr-9" /></div>
            {!loadError && <p className="text-xs text-slate-500" aria-live="polite">{listLoading ? 'در حال دریافت اطلاعات…' : `${filtered.length.toLocaleString('fa-IR')} مشتری از ${customers.length.toLocaleString('fa-IR')}`}</p>}
          </div>
          <div className="panel-table-wrap max-h-[75vh]" aria-busy={listLoading}>
            <table className="panel-table">
              <thead><tr><th>شناسه</th><th>مشتری / فروشگاه</th><th>موبایل</th><th>قرارداد</th><th>عملیات</th></tr></thead>
              <tbody>
                {listLoading && customers.length === 0 ? <tr><td colSpan={5} className="text-center py-8"><Loader2 className="animate-spin inline-block ml-2" size={18} />در حال بارگذاری…</td></tr> : filtered.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-slate-500">{loadError ? 'لیست مشتریان دریافت نشد.' : customers.length ? 'نتیجه‌ای برای این جستجو پیدا نشد.' : 'هنوز مشتری وجود ندارد.'}</td></tr> : filtered.map(customer => (
                  <tr key={customer.RowID}>
                    <td dir="ltr">{customer.RowID}</td>
                    <td><p className="font-semibold text-slate-900">{customer.RowName || '—'}</p><p className="text-xs text-slate-500 mt-1">{customer.ShopName || '—'}</p>{customer.Address && <p className="text-xs text-slate-400 mt-1 max-w-xs whitespace-normal break-words">{customer.Address}</p>}</td>
                    <td dir="ltr">{customer.MobileNumber || '—'}</td>
                    <td className="text-xs"><p>شروع: <span dir="ltr">{displayDate(customer.ContractDate)}</span></p><p className="mt-1">پایان: <span dir="ltr">{displayDate(customer.EndDate)}</span></p></td>
                    <td><button type="button" onClick={() => startEdit(customer.RowID)} disabled={busy} className="panel-btn-secondary px-3 py-1.5" aria-label={`ویرایش ${customer.RowName || customer.RowID}`}><Edit2 size={14} />ویرایش</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
