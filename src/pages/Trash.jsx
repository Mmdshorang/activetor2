import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Trash2, Users } from "lucide-react";
import api from "../services/api";
import { getAuthUser } from "../utils/auth";

export default function Trash() {
  const authUser = getAuthUser();
  const isAdmin = authUser?.role === "admin";

  const [tab, setTab] = useState("users"); // users | customers
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [restoringId, setRestoringId] = useState(null);

  const loadDeleted = async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      setError("");
      const [usersRes, customersRes] = await Promise.all([
        api.get("/users/deleted"),
        api.get("/customers/deleted"),
      ]);
      setUsers(usersRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "خطا در دریافت لیست حذف شده ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeleted();
  }, []);

  const restoreUser = async (user) => {
    if (!isAdmin) return;
    try {
      setRestoringId(`user:${user.id}`);
      setError("");
      setSuccess("");
      await api.patch(`/users/${user.id}/restore`);
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
      setSuccess("کاربر بازگردانی شد.");
    } catch (err) {
      setError(err?.response?.data?.message || "خطا در بازگردانی کاربر");
    } finally {
      setRestoringId(null);
    }
  };

  const restoreCustomer = async (customer) => {
    if (!isAdmin) return;
    try {
      setRestoringId(`customer:${customer.id}`);
      setError("");
      setSuccess("");
      await api.patch(`/customers/${customer.id}/restore`);
      setCustomers((prev) => prev.filter((item) => item.id !== customer.id));
      setSuccess("مشتری بازگردانی شد.");
    } catch (err) {
      setError(err?.response?.data?.message || "خطا در بازگردانی مشتری");
    } finally {
      setRestoringId(null);
    }
  };

  const activeRows = useMemo(() => {
    return tab === "users" ? users : customers;
  }, [tab, users, customers]);

  if (!isAdmin) {
    return (
      <div className="panel-card p-5" dir="rtl">
        <div className="panel-alert-error flex items-center gap-2">
          <AlertCircle size={16} />
          فقط ادمین به این بخش دسترسی دارد.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="panel-card-soft p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Trash2 className="text-teal-700" size={30} />
          <div>
            <h1 className="panel-title">سطل زباله</h1>
            <p className="panel-subtitle">مشاهده آیتم های حذف شده و بازگردانی</p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadDeleted}
          disabled={loading}
          className="panel-btn-secondary"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
          بروزرسانی
        </button>
      </div>

      {success && (
        <div className="panel-alert-success flex items-center gap-2">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}
      {error && (
        <div className="panel-alert-error flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="panel-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("users")}
              className={tab === "users" ? "panel-btn-primary" : "panel-btn-secondary"}
            >
              <Users size={16} />
              کاربران حذف شده ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("customers")}
              className={tab === "customers" ? "panel-btn-primary" : "panel-btn-secondary"}
            >
              <Users size={16} />
              مشتریان حذف شده ({customers.length})
            </button>
          </div>
        </div>
      </div>

      <div className="panel-card overflow-hidden">
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>نام</th>
                <th>نام کاربری / موبایل</th>
                <th>تاریخ حذف</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {loading && activeRows.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-10 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      در حال بارگذاری...
                    </span>
                  </td>
                </tr>
              ) : activeRows.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-10 text-center text-slate-500">
                    موردی یافت نشد.
                  </td>
                </tr>
              ) : (
                activeRows.map((item) => (
                  <tr key={`${tab}:${item.id}`}>
                    <td className="font-semibold text-slate-900">
                      {item.fullName || "-"}
                    </td>
                    <td className="text-slate-700" dir="ltr">
                      {tab === "users" ? item.username : item.phone || item.username || "-"}
                    </td>
                    <td className="text-slate-700 whitespace-nowrap">
                      {item.deletedAt
                        ? new Date(item.deletedAt).toLocaleDateString("fa-IR")
                        : "-"}
                    </td>
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        className="panel-btn-secondary py-1.5 px-3"
                        disabled={restoringId === `${tab === "users" ? "user" : "customer"}:${item.id}`}
                        onClick={() =>
                          tab === "users" ? restoreUser(item) : restoreCustomer(item)
                        }
                      >
                        {restoringId === `${tab === "users" ? "user" : "customer"}:${item.id}` ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <RotateCcw size={14} />
                        )}
                        بازگردانی
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

