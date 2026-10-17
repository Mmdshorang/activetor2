import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Loader2, RefreshCcw, Search, XCircle, AlertCircle } from "lucide-react";
import api from "../services/api";
import { getAuthUser } from "../utils/auth";
import SearchableSelect from "../components/SearchableSelect";
import OverflowTooltip from "../components/OverflowTooltip";

const statusStyles = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

const statusLabels = {
  pending: "در انتظار",
  approved: "تایید شده",
  rejected: "رد شده",
};

export default function RenewalRequests() {
  const [authUser, setAuthUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    title: "",
    contractId: "",
    message: "",
  });

  const canApprove = authUser?.role === "admin" || authUser?.role === "user";

  const loadData = async () => {
    try {
      setLoading(true);
      const [requestsRes, contractsRes] = await Promise.all([api.get("/renewal-requests"), api.get("/contracts")]);
      setRequests(requestsRes.data || []);
      setContracts(contractsRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "خطا در دریافت درخواست ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setAuthUser(getAuthUser());
    loadData();
  }, []);

  const submitRequest = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("عنوان درخواست الزامی است.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await api.post("/renewal-requests", {
        title: form.title.trim(),
        contractId: form.contractId ? Number(form.contractId) : null,
        message: form.message.trim() || null,
      });
      setForm({ title: "", contractId: "", message: "" });
      setSuccess("درخواست تمدید ثبت شد.");
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || "خطا در ثبت درخواست");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/renewal-requests/${id}/status`, { status });
      setSuccess("وضعیت درخواست به روزرسانی شد.");
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || "خطا در تغییر وضعیت");
    }
  };

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return requests;

    return requests.filter((item) => {
      const title = item.title?.toLowerCase() || "";
      const customer = item.customer?.fullName?.toLowerCase() || "";
      const requester = item.requesterUser?.fullName?.toLowerCase() || "";
      return title.includes(term) || customer.includes(term) || requester.includes(term);
    });
  }, [requests, searchTerm]);

  const contractOptions = useMemo(
    () =>
      contracts.map((item) => ({
        value: String(item.id),
        label: `${item.title || "-"} - ${item.customer?.fullName || "-"}`,
      })),
    [contracts],
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="panel-card-soft p-6 md:p-7">
        <h1 className="panel-title flex items-center gap-3">
          <RefreshCcw className="text-teal-700" size={30} />
          درخواست تمدید قرارداد
        </h1>
        <p className="panel-subtitle">ثبت و پیگیری درخواست های تمدید</p>
      </div>

      {success && <div className="panel-alert-success">{success}</div>}
      {error && (
        <div className="panel-alert-error flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1">
          <div className="panel-card p-5 xl:sticky xl:top-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4">ثبت درخواست جدید</h2>
            <form className="space-y-3" onSubmit={submitRequest}>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="عنوان درخواست"
                className="panel-input"
              />
              <SearchableSelect
                value={form.contractId}
                onChange={(value) => setForm({ ...form, contractId: value })}
                options={contractOptions}
                placeholder="انتخاب قرارداد (اختیاری)"
              />
              <textarea
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="توضیحات درخواست"
                className="panel-textarea"
              />
              <button type="submit" disabled={saving} className="panel-btn-primary w-full">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                ارسال درخواست
              </button>
            </form>
          </div>
        </div>

        <div className="xl:col-span-2 panel-card overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="relative w-full md:w-72">
              <Search className="absolute right-3 top-3 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="جستجو درخواست"
                className="panel-input pr-9"
              />
            </div>
          </div>

          <div className="panel-table-wrap max-h-[65vh]">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>درخواست دهنده</th>
                  <th>قرارداد</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                  {canApprove && <th>اقدام</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={canApprove ? 6 : 5} className="py-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="animate-spin" size={16} />
                        در حال بارگذاری...
                      </span>
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={canApprove ? 6 : 5} className="py-10 text-center text-slate-500">
                      درخواستی یافت نشد.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((item) => (
                    <tr key={item.id}>
                      <td className="min-w-[220px]">
                        <p className="font-medium text-slate-800">
                          <OverflowTooltip text={item.title} className="max-w-[210px]" />
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          <OverflowTooltip text={item.message || "-"} className="max-w-[210px]" />
                        </p>
                      </td>
                      <td className="min-w-[170px]">
                        <OverflowTooltip
                          text={
                            item.requesterRole === "customer"
                              ? item.customer?.fullName || "مشتری"
                              : item.requesterUser?.fullName || item.requesterUser?.username || "-"
                          }
                          className="max-w-[160px]"
                        />
                      </td>
                      <td className="min-w-[170px]">
                        <OverflowTooltip text={item.contract?.title || "-"} className="max-w-[160px]" />
                      </td>
                      <td className="whitespace-nowrap">
                        <span className={`inline-flex whitespace-nowrap px-2 py-1 rounded-full text-xs font-medium ${statusStyles[item.status] || "bg-slate-100 text-slate-700"}`}>
                          {statusLabels[item.status] || item.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{new Date(item.createdAt).toLocaleDateString("fa-IR")}</td>
                      {canApprove && (
                        <td>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => updateStatus(item.id, "approved")} className="panel-btn-secondary py-1.5 px-3" title="تایید">
                              <CheckCircle2 size={14} className="text-emerald-700" />
                            </button>
                            <button type="button" onClick={() => updateStatus(item.id, "rejected")} className="panel-btn-secondary py-1.5 px-3" title="رد">
                              <XCircle size={14} className="text-rose-700" />
                            </button>
                            <button type="button" onClick={() => updateStatus(item.id, "pending")} className="panel-btn-secondary py-1.5 px-3" title="در انتظار">
                              <Clock3 size={14} className="text-amber-700" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
