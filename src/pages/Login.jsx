import React, { useState } from 'react';
import { User, Lock, ArrowLeft, Loader2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const logoSrc = `${process.env.PUBLIC_URL || ''}/logo.jpg`;
export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (user) return <Navigate to="/users" replace />;
  const change = event => { setForm({ ...form, [event.target.name]: event.target.value }); setError(''); };
  const submit = async event => {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError('');
    try { await login(form.username, form.password); navigate('/users', { replace: true }); }
    catch (err) { setError(err.message || 'ورود انجام نشد. دوباره تلاش کنید.'); }
    finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-950" dir="rtl">
      <section className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-teal-900 via-slate-900 to-amber-900 p-12">
        <div className="absolute top-10 right-10 w-40 h-40 rounded-full bg-teal-400/20 blur-3xl animate-floaty" />
        <div className="absolute top-10 right-10 z-10 flex items-center gap-3 text-white">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white"><img src={logoSrc} alt="حساب بان" className="h-10 w-10 object-contain" /></span>
          <span className="text-lg font-extrabold">حساب بان</span>
        </div>
        <div className="relative z-10 self-end text-white max-w-md">
          <h1 className="font-display text-5xl leading-tight">مدیریت کاربران</h1>
          <p className="mt-4 text-slate-200 leading-8">ورود به سامانه و مدیریت اطلاعات کاربران در یک پنل.</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white"><img src={logoSrc} alt="حساب بان" className="h-14 w-14 object-contain" /></div>
            <h2 className="text-3xl font-extrabold text-white">ورود به پنل</h2>
            <p className="text-slate-400 text-sm mt-2">نام کاربری و رمز عبور خود را وارد کنید</p>
          </div>
          {error && <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200 break-words">{error}</div>}
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="login-username" className="block mb-2 text-sm text-slate-200">نام کاربری</label>
              <div className="relative"><User size={18} className="absolute right-3 top-3 text-slate-400" /><input id="login-username" name="username" value={form.username} onChange={change} required autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={loading} className="panel-input pr-10" /></div>
            </div>
            <div>
              <label htmlFor="login-password" className="block mb-2 text-sm text-slate-200">رمز عبور</label>
              <div className="relative"><Lock size={18} className="absolute right-3 top-3 text-slate-400" /><input id="login-password" name="password" type="password" value={form.password} onChange={change} required autoComplete="current-password" disabled={loading} className="panel-input pr-10" /></div>
            </div>
            <button type="submit" disabled={loading} className="panel-btn-primary w-full py-3">{loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowLeft size={18} />}{loading ? 'در حال ورود…' : 'ورود'}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
