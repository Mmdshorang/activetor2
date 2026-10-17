import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit2, Save, X, Loader2, AlertCircle, Package, Search, CheckCircle2 } from "lucide-react";
import api from "../services/api";

export default function Versions() {
  const [versions, setVersions] = useState([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const loadVersions = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/versions");
      setVersions(res.data || []);
    } catch {
      setError("خطا در دریافت لیست نسخه ها.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, []);

  const addVersion = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setLoading(true);
      await api.post("/versions", { name: newName });
      setNewName("");
      setSuccess("نسخه جدید اضافه شد.");
      await loadVersions();
    } catch (err) {
      setError(err.response?.data?.message || "خطا در افزودن نسخه.");
    } finally {
      setLoading(false);
    }
  };

  const removeVersion = async (id) => {
    if (!window.confirm("آیا از حذف این نسخه اطمینان دارید؟")) return;

    try {
      setLoading(true);
      await api.delete(`/versions/${id}`);
      setSuccess("نسخه حذف شد.");
      await loadVersions();
    } catch {
      setError("خطا در حذف نسخه.");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (version) => {
    setEditingId(version.id);
    setEditValue(version.name);
    setError("");
  };

  const saveEdit = async () => {
    if (!editValue.trim()) return;

    try {
      setLoading(true);
      await api.put(`/versions/${editingId}`, { name: editValue });
      setEditingId(null);
      setSuccess("نسخه ویرایش شد.");
      await loadVersions();
    } catch {
      setError("خطا در ویرایش نسخه.");
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const filteredVersions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return versions;
    return versions.filter((item) => (item.name || "").toLowerCase().includes(term));
  }, [versions, searchTerm]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="panel-card-soft p-6 md:p-7">
        <h1 className="panel-title flex items-center gap-3">
          <Package className="text-teal-700" size={30} />
          مدیریت نسخه ها
        </h1>
        <p className="panel-subtitle">افزودن و مدیریت نسخه های منتشر شده</p>
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

      <div className="panel-card p-5">
        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Plus className="text-teal-700" size={18} />
          افزودن نسخه جدید
        </h2>
        <form onSubmit={addVersion} className="flex flex-col sm:flex-row gap-3">
          <input type="text"  value={newName} onChange={(e) => setNewName(e.target.value)} className="panel-input flex-1" placeholder="مثال: v1.2.0" />
          <button type="submit" disabled={loading || !newName.trim()} className="panel-btn-primary sm:min-w-36">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            افزودن
          </button>
        </form>
      </div>

      <div className="panel-card overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative w-full md:w-80">
            <Search className="absolute right-3 top-3 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو نسخه"
              className="panel-input pr-9"
            />
          </div>
        </div>

        {loading && versions.length === 0 ? (
          <div className="py-10 text-center text-slate-500">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              در حال بارگذاری...
            </span>
          </div>
        ) : filteredVersions.length === 0 ? (
          <div className="py-10 text-center text-slate-500">نتیجه ای یافت نشد.</div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[62vh] overflow-y-auto">
            {filteredVersions.map((version) => (
              <li key={version.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-base sm:text-lg font-medium text-slate-800 bg-slate-100 px-3 py-1 rounded-lg">{version.name}</span>
                  <span className="text-xs text-slate-400">{new Date(version.createdAt).toLocaleDateString("fa-IR")}</span>
                </div>

                <div className="flex items-center gap-2">
                  {editingId === version.id ? (
                    <>
                      <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="panel-input h-9 w-40" autoFocus />
                      <button type="button" onClick={saveEdit} className="panel-btn-primary py-2 px-3">
                        <Save size={14} />
                      </button>
                      <button type="button" onClick={cancelEdit} className="panel-btn-secondary py-2 px-3">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(version)} className="panel-btn-secondary py-2 px-3">
                        <Edit2 size={14} />
                      </button>
                      <button type="button" onClick={() => removeVersion(version.id)} className="panel-btn-danger py-2 px-3">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
