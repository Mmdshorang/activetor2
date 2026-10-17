import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Plus, Edit2, Save, X, Loader2, AlertCircle, Search, RefreshCw } from 'lucide-react';
import moment from 'jalali-moment';
import JalaliDatePicker from '../components/DatePicker';
import { contractApi } from '../services/contracts';
import { customerApi } from '../services/customers';
import SearchableSelect from '../components/SearchableSelect';

const emptyForm = () => ({ RowID: '0', Mdate: null, Fdate: '', EndDate: null, Id: null, IsActive: null, FEndDate: '' });
const customerLabel = customer => [customer.RowName, customer.ShopName, customer.MobileNumber, `شناسه: ${customer.RowID}`].filter(Boolean).join(' — ');
const toJalali = value => {
  if (!value) return null;
  const date = moment.from(value.slice(0, 10), 'en', 'YYYY-MM-DD');
  return date.isValid() ? date.locale('fa').format('jYYYY/jMM/jDD') : null;
};
const toGregorian = value => value ? moment.from(value, 'fa', 'YYYY/MM/DD').locale('en').format('YYYY-MM-DD') : null;
const statusLabel = value => value === null ? 'تعیین نشده' : value ? 'فعال' : 'غیرفعال';

export default function Contracts() {
  const [contracts, setContracts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState('');
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
  const heading = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const listController = useRef(null);
  const detailController = useRef(null);
  const customersController = useRef(null);
  const busy = saving || detailLoading || listLoading || customersLoading;
  const isEditing = editID !== null;

  const loadContracts = useCallback(async () => {
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    setListLoading(true); setLoadError('');
    try {
      const list = await contractApi.getContracts({ signal: controller.signal });
      if (mounted.current && !controller.signal.aborted) setContracts(list);
    } catch (err) {
      if (mounted.current && !controller.signal.aborted) setLoadError(err.message || 'دریافت قراردادها انجام نشد.');
    } finally {
      if (mounted.current && !controller.signal.aborted) setListLoading(false);
    }
  }, []);
  const loadCustomers = useCallback(async () => {
    customersController.current?.abort();
    const controller = new AbortController();
    customersController.current = controller;
    setCustomersLoading(true); setCustomersError('');
    try {
      const list = await customerApi.getCustomers({ signal: controller.signal });
      if (mounted.current && !controller.signal.aborted) setCustomers(list);
    } catch (err) {
      if (mounted.current && !controller.signal.aborted) setCustomersError(err.message || 'دریافت مشتریان انجام نشد.');
    } finally {
      if (mounted.current && !controller.signal.aborted) setCustomersLoading(false);
    }
  }, []);
  const refreshLists = () => { loadContracts(); loadCustomers(); };
  useEffect(() => {
    mounted.current = true;
    loadContracts();
    loadCustomers();
    return () => {
      mounted.current = false;
      listController.current?.abort();
      detailController.current?.abort();
      customersController.current?.abort();
    };
  }, [loadContracts, loadCustomers]);

  const customersByID = useMemo(() => new Map(customers.map(customer => [String(customer.RowID), customer])), [customers]);
  const customerOptions = useMemo(() => {
    const options = customers.map(customer => ({ value: String(customer.RowID), label: customerLabel(customer) }));
    // Preserve an existing relation even if the customer is no longer in the list.
    if (form.Id && !customersByID.has(String(form.Id))) {
      options.unshift({ value: String(form.Id), label: `مشتری ثبت‌شده (شناسه: ${form.Id})` });
    }
    return options;
  }, [customers, customersByID, form.Id]);

  const change = event => {
    const { name, value } = event.target;
    const next = name === 'IsActive' ? value === '' ? null : value === 'true' : value;
    setForm(previous => ({ ...previous, [name]: next }));
    setError(''); setSuccess('');
  };
  const changeDate = (gregorianField, persianField, value) => {
    setForm(previous => ({ ...previous, [gregorianField]: toGregorian(value), [persianField]: value || '' }));
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
      const contract = await contractApi.getContractByID(rowID, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      setForm(contract); setEditID(contract.RowID);
      heading.current?.focus();
      heading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      if (mounted.current && !controller.signal.aborted) setError(err.message || 'دریافت قرارداد انجام نشد.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setDetailLoading(false);
    }
  };
  const save = async event => {
    event.preventDefault();
    if (inFlight.current || busy) return;
    if (!form.Id) { setError('لطفاً مشتری قرارداد را انتخاب کنید.'); return; }
    inFlight.current = true;
    setSaving(true); setError(''); setSuccess('');
    try {
      const message = isEditing
        ? await contractApi.updateContract({ ...form, RowID: editID })
        : await contractApi.insertContract(form);
      if (!mounted.current) return;
      reset(); setSuccess(message);
      await loadContracts();
    } catch (err) {
      if (mounted.current) setError(err.message || 'ذخیره قرارداد انجام نشد.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('fa');
    return contracts.filter(contract => {
      if (status !== 'all' && String(contract.IsActive) !== status) return false;
      const customer = customersByID.get(String(contract.Id));
      return [contract.RowID, contract.Id, customer?.RowName, customer?.ShopName, customer?.MobileNumber, contract.Fdate, contract.FEndDate, contract.Mdate, contract.EndDate]
        .some(value => String(value ?? '').toLocaleLowerCase('fa').includes(term));
    });
  }, [contracts, customersByID, search, status]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="panel-card-soft p-6 md:p-7 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="panel-title flex items-center gap-3"><FileText className="text-teal-700" size={30} />مدیریت قراردادها</h1><p className="panel-subtitle">مشاهده، ثبت و ویرایش مشتری، تاریخ‌ها و وضعیت قرارداد</p></div>
        <button type="button" onClick={refreshLists} disabled={busy} className="panel-btn-secondary"><RefreshCw size={16} className={listLoading || customersLoading ? 'animate-spin' : ''} />به‌روزرسانی لیست</button>
      </div>
      {success && <div role="status" className="panel-alert-success">{success}</div>}
      {error && <div role="alert" className="panel-alert-error flex items-center gap-2"><AlertCircle size={18} />{error}</div>}
      {loadError && <div role="alert" className="panel-alert-error">{loadError}{contracts.length > 0 && <span> اطلاعات نمایش‌داده‌شده مربوط به آخرین دریافت موفق است.</span>}<button type="button" onClick={loadContracts} disabled={busy} className="underline mr-3">تلاش مجدد</button></div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <section className="panel-card p-5">
          <h2 ref={heading} tabIndex={-1} className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">{isEditing ? <Edit2 size={18} /> : <Plus size={18} />}{isEditing ? 'ویرایش قرارداد' : 'ثبت قرارداد جدید'}</h2>
          {isEditing && <p className="text-xs text-slate-500 mb-4">شناسه قرارداد: <b dir="ltr">{editID}</b></p>}
          <form onSubmit={save} autoComplete="off">
            <fieldset disabled={busy} className="space-y-4">
              <div>
                <label htmlFor="contract-customer" className="panel-label">مشتری قرارداد</label>
                <SearchableSelect inputId="contract-customer" required value={form.Id ?? ''} options={customerOptions} isDisabled={busy} isLoading={customersLoading} placeholder="جستجو و انتخاب مشتری…" noOptionsMessage="مشتری‌ای پیدا نشد" onChange={value => { setForm(previous => ({ ...previous, Id: value || null })); setError(''); setSuccess(''); }} />
                {customersError && <div role="alert" className="text-sm text-red-700 mt-2">{customersError}<button type="button" onClick={loadCustomers} disabled={busy} className="underline mr-2">تلاش مجدد دریافت مشتریان</button></div>}
                {!customersLoading && !customersError && customers.length === 0 && <p className="text-xs text-slate-500 mt-2">ابتدا از صفحه مشتریان، یک مشتری ثبت کنید.</p>}
              </div>
              <div>
                <label htmlFor="contract-start" className="panel-label">تاریخ شروع قرارداد</label>
                <JalaliDatePicker id="contract-start" value={form.Fdate || toJalali(form.Mdate)} onChange={value => changeDate('Mdate', 'Fdate', value)} disabled={busy} className="w-full" inputClassName="panel-input" />
                {form.Mdate && <p className="text-xs text-slate-500 mt-2">میلادی: <span dir="ltr">{form.Mdate.slice(0, 10)}</span></p>}
              </div>
              <div>
                <label htmlFor="contract-end" className="panel-label">تاریخ پایان قرارداد</label>
                <JalaliDatePicker id="contract-end" value={form.FEndDate || toJalali(form.EndDate)} onChange={value => changeDate('EndDate', 'FEndDate', value)} disabled={busy} className="w-full" inputClassName="panel-input" />
                {form.EndDate && <p className="text-xs text-slate-500 mt-2">میلادی: <span dir="ltr">{form.EndDate.slice(0, 10)}</span></p>}
              </div>
              <div><label htmlFor="contract-active" className="panel-label">وضعیت قرارداد</label><select id="contract-active" name="IsActive" value={form.IsActive == null ? '' : String(form.IsActive)} onChange={change} className="panel-select"><option value="">تعیین نشده</option><option value="true">فعال</option><option value="false">غیرفعال</option></select></div>
              <div className="flex gap-2 pt-2"><button type="submit" className="panel-btn-primary flex-1">{saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}{isEditing ? 'ذخیره تغییرات' : 'ثبت قرارداد'}</button>{isEditing && <button type="button" onClick={reset} className="panel-btn-secondary" aria-label="انصراف از ویرایش"><X size={18} /></button>}</div>
            </fieldset>
          </form>
        </section>
        <section className="xl:col-span-2 panel-card overflow-hidden" aria-label="لیست قراردادها">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1"><label htmlFor="contract-search" className="sr-only">جستجوی قراردادها</label><Search className="absolute right-3 top-3 text-slate-400" size={16} /><input id="contract-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="جستجوی مشتری، فروشگاه، موبایل، شناسه یا تاریخ" className="panel-input pr-9" /></div>
              <label className="sm:w-40"><span className="sr-only">فیلتر وضعیت قرارداد</span><select value={status} onChange={event => setStatus(event.target.value)} className="panel-select"><option value="all">همه قراردادها</option><option value="true">فعال</option><option value="false">غیرفعال</option><option value="null">تعیین نشده</option></select></label>
            </div>
            {!loadError && <p className="text-xs text-slate-500" aria-live="polite">{listLoading ? 'در حال دریافت اطلاعات…' : `${filtered.length.toLocaleString('fa-IR')} قرارداد از ${contracts.length.toLocaleString('fa-IR')}`}</p>}
          </div>
          <div className="panel-table-wrap max-h-[75vh]" aria-busy={listLoading}>
            <table className="panel-table"><thead><tr><th>شناسه</th><th>مشتری / فروشگاه</th><th>شروع / پایان</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>
              {listLoading && contracts.length === 0 ? <tr><td colSpan={5} className="text-center py-8"><Loader2 className="animate-spin inline-block ml-2" size={18} />در حال بارگذاری…</td></tr> : filtered.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-slate-500">{loadError ? 'لیست قراردادها دریافت نشد.' : contracts.length ? 'نتیجه‌ای برای این جستجو پیدا نشد.' : 'هنوز قراردادی ثبت نشده است.'}</td></tr> : filtered.map(contract => (
                <tr key={contract.RowID}>
                  <td dir="ltr">{contract.RowID}</td><td><p className="font-semibold text-slate-900">{customersByID.get(String(contract.Id))?.RowName || (contract.Id ? `مشتری ${contract.Id}` : '—')}</p><p className="text-xs text-slate-500 mt-1">{customersByID.get(String(contract.Id))?.ShopName || ''}</p></td>
                  <td className="text-xs"><p>شروع: <span dir="ltr">{contract.Fdate || toJalali(contract.Mdate) || '—'}</span></p><p className="mt-1">پایان: <span dir="ltr">{contract.FEndDate || toJalali(contract.EndDate) || '—'}</span></p></td>
                  <td><span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${contract.IsActive === null ? 'bg-slate-100 text-slate-600' : contract.IsActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{statusLabel(contract.IsActive)}</span></td>
                  <td><button type="button" onClick={() => startEdit(contract.RowID)} disabled={busy} className="panel-btn-secondary px-3 py-1.5" aria-label={`ویرایش قرارداد ${contract.RowID}`}><Edit2 size={14} />ویرایش</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </section>
      </div>
    </div>
  );
}
