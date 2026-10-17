import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import {
  Users,
  UserCheck,
  AlertCircle,
  TrendingUp,
  MessageSquare,
  UserPlus,
  FileText,
  Clock3,
  CheckCircle2,
  KeyRound,
  RefreshCcw,
} from "lucide-react";
import { getAuthUser } from "../utils/auth";

const StatCard = ({ title, value, icon: Icon, color }) => (
  <div className="panel-card p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-2xl font-extrabold text-slate-900 mt-1">{value}</p>
      </div>
      <div className={`w-11 h-11 rounded-xl text-white flex items-center justify-center ${color}`}>
        <Icon size={20} />
      </div>
    </div>
  </div>
);

const ClickableStatCard = ({ onClick, ...props }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-right w-full panel-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-slate-500">{props.title}</p>
        <p className="text-2xl font-extrabold text-slate-900 mt-1">{props.value}</p>
        <p className="text-xs text-slate-400 mt-2">برای مشاهده لیست کلیک کنید</p>
      </div>
      <div className={`w-11 h-11 rounded-xl text-white flex items-center justify-center ${props.color}`}>
        <props.icon size={20} />
      </div>
    </div>
  </button>
);

const formatContractRemaining = (days) => {
  if (typeof days !== "number") return "نامشخص";
  if (days < 0) return "منقضی شده";
  return `${days} روز`;
};

const formatDateFa = (value) => {
  if (!value) return "نامشخص";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "نامشخص";
  return date.toLocaleDateString("fa-IR");
};

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "نامشخص";
  return num.toLocaleString("fa-IR");
};

const getAxiosErrorMessage = (error, fallbackMessage, requestPath) => {
  const baseUrl = api?.defaults?.baseURL || "";

  if (error?.response) {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      fallbackMessage;
    return `${message} (HTTP ${error.response.status})`;
  }

  if (error?.request) {
    const target = requestPath ? `${baseUrl}${requestPath}` : baseUrl || "API";
    return `عدم اتصال به سرور. آدرس: ${target}`;
  }

  return error?.message || fallbackMessage;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    users: 0,
    customers: 0,
    messages: 0,
    contracts: 0,
    activeUsers: 0,
  });
  const [authUser, setAuthUser] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsLoaded, setListsLoaded] = useState(false);
  const [listsError, setListsError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [dashboardLists, setDashboardLists] = useState({
    activeSystems: [],
    activeContracts: [],
    expiringSoonContracts: [],
    soonDays: 30,
  });
  const [listModal, setListModal] = useState({ open: false, type: null });
  const [smsSettingsLoading, setSmsSettingsLoading] = useState(false);
  const [smsSettingsSaving, setSmsSettingsSaving] = useState(false);
  const [smsSettings, setSmsSettings] = useState(null);

  useEffect(() => {
    const user = getAuthUser();
    setAuthUser(user);

    const fetchData = async () => {
      try {
        setStatsError("");
        const statsReq = api.get("/stats/dashboard-stats");
        const activityReq = user?.role === "customer" ? Promise.resolve({ data: [] }) : api.get("/stats/recent-activity");

        const [statsRes, activityRes] = await Promise.all([statsReq, activityReq]);
        setStats(statsRes.data);
        setActivity(activityRes.data);
      } catch (error) {
        console.error("Error fetching data:", error);
        setStatsError(getAxiosErrorMessage(error, "خطا در دریافت آمار داشبورد", "/stats/dashboard-stats"));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!authUser || authUser.role === "customer") return;
    const bootstrapLists = async () => {
      try {
        setListsError("");
        setListsLoading(true);
        const res = await api.get("/stats/dashboard-lists?days=30");
        setDashboardLists(res.data);
        setListsLoaded(true);
      } catch (error) {
        setListsError(getAxiosErrorMessage(error, "خطا در دریافت لیست های داشبورد", "/stats/dashboard-lists?days=30"));
      } finally {
        setListsLoading(false);
      }
    };

    bootstrapLists();
  }, [authUser]);

  const loadSmsSettings = async () => {
    if (smsSettingsLoading) return;
    try {
      setSmsSettingsLoading(true);
      const res = await api.get("/settings/sms-contract-expiry");
      setSmsSettings(res.data);
    } catch (error) {
      console.error("Error fetching sms settings:", error);
    } finally {
      setSmsSettingsLoading(false);
    }
  };

  const saveSmsSettings = async (patch) => {
    if (!smsSettings) return;
    try {
      setSmsSettingsSaving(true);
      const res = await api.put("/settings/sms-contract-expiry", {
        enabled: smsSettings.enabled,
        daysBeforeEnd: smsSettings.daysBeforeEnd,
        template: smsSettings.template,
        ...patch,
      });
      setSmsSettings((prev) => ({ ...(prev || {}), ...res.data }));
    } catch (error) {
      console.error("Error saving sms settings:", error);
    } finally {
      setSmsSettingsSaving(false);
    }
  };

  const runSmsNow = async () => {
    try {
      setSmsSettingsSaving(true);
      const res = await api.post("/settings/sms-contract-expiry/run");
      // just keep lastRunAt (job updates setting too), show logs in console for now
      console.log("SMS job run result:", res.data);
      await loadSmsSettings();
    } catch (error) {
      console.error("Error running sms job:", error);
    } finally {
      setSmsSettingsSaving(false);
    }
  };

  const openList = async (type) => {
    setListModal({ open: true, type });
    if (listsLoaded) {
      return;
    }
    try {
      setListsError("");
      setListsLoading(true);
      const res = await api.get("/stats/dashboard-lists?days=30");
      setDashboardLists(res.data);
      setListsLoaded(true);
    } catch (error) {
      console.error("Error fetching dashboard lists:", error);
      setListsError(getAxiosErrorMessage(error, "خطا در دریافت لیست های داشبورد", "/stats/dashboard-lists?days=30"));
    } finally {
      setListsLoading(false);
    }
  };

  const closeList = () => setListModal({ open: false, type: null });

  const summary = useMemo(
    () => {
      if (authUser?.role === "customer") {
        return [
          { title: "لایسنس های من", value: stats.licenses || 0, icon: KeyRound, color: "bg-cyan-700" },
          { title: "قراردادهای من", value: stats.contracts || 0, icon: FileText, color: "bg-emerald-600" },
          { title: "باقی مانده قرارداد", value: formatContractRemaining(stats.contractRemainingDays), icon: Clock3, color: "bg-sky-700" },
          { title: "پیام ها", value: stats.messages || 0, icon: AlertCircle, color: "bg-amber-600" },
          { title: "تمدیدهای در انتظار", value: stats.pendingRenewals || 0, icon: RefreshCcw, color: "bg-violet-600" },
        ];
      }
      if (authUser?.role === "agent") {
        return [
          { title: "قراردادهای من", value: stats.contracts || 0, icon: FileText, color: "bg-emerald-600" },
          { title: "درخواست های تمدید", value: stats.renewalRequests || 0, icon: RefreshCcw, color: "bg-violet-600" },
          { title: "پیام ها", value: stats.messages || 0, icon: AlertCircle, color: "bg-amber-600" },
        ];
      }
      return [
        {
          title: "کل کاربران",
          value: stats.users,
          icon: Users,
          color: "bg-teal-600",
        },
        {
          title: "مشتریان فعال",
          value: stats.customers,
          icon: UserCheck,
          color: "bg-emerald-600",
        },
        {
          title: "پیام های جدید",
          value: stats.messages,
          icon: AlertCircle,
          color: "bg-amber-600",
        },
        {
          title: "کل قراردادها",
          value: stats.contracts,
          icon: FileText,
          color: "bg-cyan-700",
        },
      ];
    },
    [stats, authUser?.role],
  );

  const showListsSection = authUser?.role !== "customer";
  const showAdminSmsSettings = authUser?.role === "admin";

  if (loading) {
    return (
      <div className="panel-card h-56 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel-card-soft p-6 md:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="panel-title text-2xl">خوش آمدید، {authUser?.fullName || authUser?.username || "کاربر"}</h2>
          <p className="panel-subtitle">
            {authUser?.role === "customer" ? "نمای کلی از وضعیت حساب و قرارداد شما" : "نمای کلی از وضعیت سیستم و فعالیت های اخیر"}
          </p>
        </div>
        {(authUser?.role === "customer" || authUser?.role === "agent") ? (
          <button className="panel-btn-primary" onClick={() => navigate("/renewal-requests")}>
            <RefreshCcw size={16} />
            درخواست تمدید
          </button>
        ) : (
          <button className="panel-btn-primary">
            <TrendingUp size={16} />
            مشاهده گزارش ها
          </button>
        )}
      </div>

      {statsError && (
        <div className="panel-alert-error flex items-center gap-2">
          <AlertCircle size={16} />
          {statsError}
        </div>
      )}

      <div className={`grid grid-cols-1 md:grid-cols-2 ${summary.length > 3 ? "xl:grid-cols-4" : "xl:grid-cols-3"} gap-4`}>
        {summary.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      {showAdminSmsSettings && (
        <div className="panel-card-soft p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900">پیامک یادآوری پایان قرارداد</h3>
              <p className="text-sm text-slate-500">ارسال خودکار پیامک برای قراردادهایی که نزدیک پایان هستند</p>
            </div>
            <button
              type="button"
              className="panel-btn"
              onClick={loadSmsSettings}
              disabled={smsSettingsLoading}
            >
              {smsSettingsLoading ? "در حال دریافت..." : "بارگذاری تنظیمات"}
            </button>
          </div>

          {!smsSettings ? (
            <p className="text-sm text-slate-500">برای مشاهده و تغییر تنظیمات، روی "بارگذاری تنظیمات" کلیک کنید.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="panel-card p-4">
                <p className="text-sm text-slate-500 mb-2">وضعیت</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{smsSettings.enabled ? "فعال" : "غیرفعال"}</span>
                  <button
                    type="button"
                    className="panel-btn-primary"
                    onClick={() => saveSmsSettings({ enabled: !smsSettings.enabled })}
                    disabled={smsSettingsSaving}
                  >
                    {smsSettings.enabled ? "غیرفعال کن" : "فعال کن"}
                  </button>
                </div>
              </div>

              <div className="panel-card p-4">
                <p className="text-sm text-slate-500 mb-2">چند روز مانده</p>
                <div className="flex items-center gap-2">
                  <input
                    className="panel-input w-24"
                    type="number"
                    min="1"
                    max="60"
                    value={smsSettings.daysBeforeEnd ?? 5}
                    onChange={(e) => setSmsSettings((prev) => ({ ...prev, daysBeforeEnd: Number(e.target.value) }))}
                  />
                  <button
                    type="button"
                    className="panel-btn"
                    onClick={() => saveSmsSettings({ daysBeforeEnd: smsSettings.daysBeforeEnd })}
                    disabled={smsSettingsSaving}
                  >
                    ذخیره
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">پیشنهاد: 5 روز</p>
              </div>

              <div className="panel-card p-4">
                <p className="text-sm text-slate-500 mb-2"></p>
                <div className="flex items-center gap-2">
                  <input
                    className="panel-input flex-1"
                    type="text"
                    value={smsSettings.template || ""}
                    onChange={(e) => setSmsSettings((prev) => ({ ...prev, template: e.target.value }))}
                    placeholder="مثال: contract_expire"
                  />
                  <button
                    type="button"
                    className="panel-btn"
                    onClick={() => saveSmsSettings({ template: smsSettings.template })}
                    disabled={smsSettingsSaving}
                  >
                    ذخیره
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">آخرین اجرا: {smsSettings.lastRunAt ? formatDateFa(smsSettings.lastRunAt) : "—"}</p>
              </div>

              <div className="lg:col-span-3 flex items-center justify-between gap-3">
                {/* <p className="text-sm text-slate-500">
                  کرون: <span className="font-mono">{smsSettings.cron}</span> ، تایم‌زون: <span className="font-mono">{smsSettings.timezone}</span>
                </p> */}
                <button
                  type="button"
                  className="panel-btn"
                  onClick={runSmsNow}
                  disabled={smsSettingsSaving}
                >
                  اجرای دستی (تست)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showListsSection && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ClickableStatCard
            title="سیستم های فعال"
            value={listsLoaded ? (dashboardLists.activeSystems?.length ?? 0) : "—"}
            icon={KeyRound}
            color="bg-sky-700"
            onClick={() => openList("systems")}
          />
          <ClickableStatCard
            title="قراردادهای فعال"
            value={listsLoaded ? (dashboardLists.activeContracts?.length ?? 0) : "—"}
            icon={FileText}
            color="bg-emerald-600"
            onClick={() => openList("activeContracts")}
          />
          <ClickableStatCard
            title="قراردادهای نزدیک پایان"
            value={listsLoaded ? (dashboardLists.expiringSoonContracts?.length ?? 0) : "—"}
            icon={Clock3}
            color="bg-amber-600"
            onClick={() => openList("expiringSoon")}
          />
        </div>
      )}

      {showListsSection && listsError && (
        <div className="panel-alert-error flex items-center gap-2">
          <AlertCircle size={16} />
          {listsError}
        </div>
      )}

      {listModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-3">
          <button type="button" className="absolute inset-0 bg-slate-900/50" onClick={closeList} aria-label="بستن" />
          <div className="relative w-full max-w-5xl panel-card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Clock3 size={18} className="text-teal-700" />
                {listModal.type === "systems" && "سیستم های فعال"}
                {listModal.type === "activeContracts" && "قراردادهای فعال"}
                {listModal.type === "expiringSoon" && `قراردادهای نزدیک پایان (تا ${dashboardLists.soonDays} روز)`}
              </div>
              <button type="button" className="panel-btn" onClick={closeList}>بستن</button>
            </div>

            <div className="p-4 md:p-5 max-h-[70vh] overflow-y-auto">
              {listsLoading ? (
                <div className="h-40 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-teal-600 animate-spin" />
                </div>
              ) : (
                <>
                  {listModal.type === "systems" && (
                    <div className="panel-table-wrap">
                      <table className="panel-table">
                        <thead>
                          <tr>
                            <th>سیستم</th>
                            <th>لایسنس فعال</th>
                            <th>تعداد مشتری</th>
                            <th>آخرین انقضا</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardLists.activeSystems?.length ? (
                            dashboardLists.activeSystems.map((row) => (
                              <tr key={row.systemName}>
                                <td className="font-medium text-slate-900">{row.systemName}</td>
                                <td className="text-slate-600">{row.activeLicenses}</td>
                                <td className="text-slate-600">{row.customersCount}</td>
                                <td className="text-slate-500">{formatDateFa(row.latestExpireDate)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="4" className="text-center py-8 text-slate-500">موردی یافت نشد.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(listModal.type === "activeContracts" || listModal.type === "expiringSoon") && (
                    <div className="panel-table-wrap">
                      <table className="panel-table">
                        <thead>
                          <tr>
                            <th>عنوان</th>
                            <th>مشتری</th>
                            <th>مبلغ</th>
                            <th>پایان</th>
                            <th>باقی مانده</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(listModal.type === "activeContracts" ? dashboardLists.activeContracts : dashboardLists.expiringSoonContracts)?.length ? (
                            (listModal.type === "activeContracts" ? dashboardLists.activeContracts : dashboardLists.expiringSoonContracts).map((c) => (
                              <tr key={c.id}>
                                <td className="font-medium text-slate-900">{c.title}</td>
                                <td className="text-slate-600">{c.customer?.fullName || c.customer?.username || "—"}</td>
                                <td className="text-slate-600">{formatMoney(c.amount)}</td>
                                <td className="text-slate-500">{formatDateFa(c.endDate)}</td>
                                <td className="text-slate-600">{formatContractRemaining(c.daysRemaining)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="5" className="text-center py-8 text-slate-500">موردی یافت نشد.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {authUser?.role !== "customer" && (
        <div className="panel-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 text-slate-800 font-bold">
            <Clock3 size={18} className="text-teal-700" />
            آخرین فعالیت ها
          </div>
          <div className="panel-table-wrap max-h-[430px]">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>کاربر / فرستنده</th>
                  <th>فعالیت</th>
                  <th>تاریخ</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {activity.length > 0 ? (
                  activity.map((item, index) => (
                    <tr key={index}>
                      <td className="font-medium text-slate-900">
                        {item.type === "message" ? <MessageSquare size={15} className="inline ml-2 text-slate-400" /> : <UserPlus size={15} className="inline ml-2 text-slate-400" />}
                        {item.user}
                      </td>
                      <td className="text-slate-600 max-w-[240px] truncate">{item.action}</td>
                      <td className="text-slate-500">{item.date}</td>
                      <td>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">
                          <CheckCircle2 size={12} />
                          موفق
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="text-center py-8 text-slate-500">
                      هنوز فعالیتی ثبت نشده است.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
