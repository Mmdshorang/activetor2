import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Search, Loader2, AlertCircle, User, Inbox } from "lucide-react";
import api from "../services/api";
import { getAuthUser } from "../utils/auth";

const formatTime = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

export default function Messages() {
  const [authUser, setAuthUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  const chatEndRef = useRef(null);
  const isCustomer = authUser?.role === "customer";
  const isAgent = authUser?.role === "agent";
  const canManageCustomerConversations = authUser?.role === "admin" || authUser?.role === "user";

  const loadConversations = async () => {
    if (!canManageCustomerConversations) {
      setConversations([]);
      return;
    }

    const res = await api.get("/messages/conversations");
    const customerConversations = (res.data || []).filter((item) => item.customer?.id);
    setConversations(customerConversations);
  };

  const loadCustomers = async () => {
    if (!canManageCustomerConversations) {
      setCustomers([]);
      return;
    }

    const res = await api.get("/customers");
    setCustomers(res.data || []);
  };

  const loadMessages = async (customerIdParam) => {
    if (isCustomer || isAgent) {
      const res = await api.get("/messages");
      setMessages(res.data || []);
      return;
    }

    const customerId = customerIdParam || selectedCustomerId;
    if (!customerId) {
      setMessages([]);
      return;
    }

    const res = await api.get(`/messages?customerId=${customerId}`);
    setMessages(res.data || []);
  };

  const markRead = async (customerIdParam) => {
    if (isCustomer || isAgent) {
      await api.put("/messages/mark-read", {});
      return;
    }
    if (!customerIdParam) return;
    await api.put("/messages/mark-read", { customerId: Number(customerIdParam) });
  };

  const bootstrap = async () => {
    try {
      setLoading(true);
      setError("");
      const user = getAuthUser();
      setAuthUser(user);
      if (!user) {
        setError("اطلاعات ورود یافت نشد. دوباره وارد شوید.");
        return;
      }

      if (user.role === "customer" || user.role === "agent") {
        const messagesRes = await api.get("/messages");
        setMessages(messagesRes.data || []);
        await api.put("/messages/mark-read", {});
      } else {
        const [customersRes, conversationsRes] = await Promise.all([
          api.get("/customers"),
          api.get("/messages/conversations"),
        ]);

        setCustomers(customersRes.data || []);
        const customerConversations = (conversationsRes.data || []).filter((item) => item.customer?.id);
        setConversations(customerConversations);
      }
    } catch (err) {
      setError(err?.response?.data?.message || "خطا در بارگذاری پیام ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (canManageCustomerConversations && selectedCustomerId) {
      loadMessages(selectedCustomerId);
      markRead(selectedCustomerId).catch(() => {});
    }
  }, [selectedCustomerId, canManageCustomerConversations]);

  useEffect(() => {
    if (canManageCustomerConversations && !selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(String(customers[0].id));
    }
  }, [canManageCustomerConversations, customers, selectedCustomerId]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        if (!authUser) return;

        if (isCustomer || isAgent) {
          await loadMessages();
          await markRead();
        } else {
          await Promise.all([loadCustomers(), loadConversations()]);
          if (selectedCustomerId) {
            await loadMessages(selectedCustomerId);
            await markRead(selectedCustomerId);
          }
        }
      } catch {
      }
    }, 8000);

    return () => clearInterval(timer);
  }, [authUser, isCustomer, isAgent, selectedCustomerId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredCustomers = useMemo(() => {
    if (!canManageCustomerConversations) return [];
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;

    return customers.filter((item) => {
      const name = item.fullName?.toLowerCase() || "";
      const username = item.username?.toLowerCase() || "";
      return name.includes(term) || username.includes(term);
    });
  }, [canManageCustomerConversations, customers, searchTerm]);

  const conversationByCustomerId = useMemo(() => {
    return conversations.reduce((acc, item) => {
      if (item.customer?.id) {
        acc[String(item.customer.id)] = item;
      }
      return acc;
    }, {});
  }, [conversations]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      setSending(true);
      setError("");

      if (isCustomer || isAgent) {
        await api.post("/messages", { text: text.trim() });
        await loadMessages();
        await markRead();
      } else {
        if (!selectedCustomerId) {
          setError("ابتدا یک مشتری را انتخاب کنید");
          return;
        }

        await api.post("/messages", {
          text: text.trim(),
          customerId: Number(selectedCustomerId),
        });

        await loadMessages(selectedCustomerId);
        await Promise.all([loadConversations(), loadCustomers()]);
        await markRead(selectedCustomerId);
      }

      setText("");
    } catch (err) {
      setError(err?.response?.data?.message || "خطا در ارسال پیام");
    } finally {
      setSending(false);
    }
  };

  const selectedCustomer = customers.find((item) => String(item.id) === String(selectedCustomerId));

  if (loading) {
    return (
      <div className="panel-card h-[65vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-teal-700" size={34} />
      </div>
    );
  }

  return (
    <div className="panel-card overflow-hidden" dir="rtl">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-amber-50/40">
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <MessageCircle className="text-teal-700" size={24} />
          پیام ها و پاسخگویی
        </h1>
        <p className="text-slate-500 text-sm mt-1">{isCustomer || isAgent ? "چت مستقیم با پشتیبانی" : "مدیریت گفتگوی مشتریان"}</p>
      </div>

      {error && (
        <div className="mx-4 mt-4 panel-alert-error flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className={`grid ${canManageCustomerConversations ? "grid-cols-1 lg:grid-cols-[320px_1fr]" : "grid-cols-1"} min-h-[68vh]`}>
        {canManageCustomerConversations && (
          <aside className="border-l border-slate-100">
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute right-3 top-3 text-slate-400" size={16} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="جستجو مشتری"
                  className="panel-input pr-9"
                />
              </div>
            </div>

            <div className="max-h-[58vh] lg:max-h-[calc(68vh-65px)] overflow-y-auto">
              {filteredCustomers.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                  <Inbox size={20} />
                  مشتری یافت نشد
                </div>
              ) : (
                filteredCustomers.map((customer) => {
                  const itemConversation = conversationByCustomerId[String(customer.id)];
                  const isSelected = String(customer.id) === String(selectedCustomerId);
                  return (
                    <button
                      type="button"
                      key={customer.id}
                      onClick={() => setSelectedCustomerId(String(customer.id))}
                      className={`w-full text-right px-4 py-3 border-b border-slate-100 transition ${isSelected ? "bg-teal-50" : "hover:bg-slate-50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800">{customer.fullName || customer.username}</p>
                          <p className="text-xs text-slate-500 text-left">@{customer.username}</p>
                        </div>
                        {itemConversation?.unreadCount > 0 && (
                          <span className="min-w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center px-1.5">
                            {itemConversation.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-2 line-clamp-1">{itemConversation?.lastMessage?.text || "بدون پیام"}</p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}

        <section className="flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2 text-slate-700">
              <User size={16} />
              <span className="font-medium">
                {isCustomer || isAgent
                  ? "پشتیبانی"
                  : selectedCustomer
                    ? selectedCustomer.fullName || selectedCustomer.username
                    : "مشتری انتخاب نشده"}
              </span>
            </div>
          </div>

          <div className="flex-1 max-h-[52vh] lg:max-h-[calc(68vh-130px)] overflow-y-auto p-4 space-y-3 bg-slate-50/50">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">هنوز پیامی ثبت نشده است</div>
            ) : (
              messages.map((message) => {
                const mine = isCustomer ? message.senderType === "customer" : message.senderType === "user";
                return (
                  <div key={message.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        mine ? "bg-teal-700 text-white rounded-tr-md" : "bg-white text-slate-700 border border-slate-200 rounded-tl-md"
                      }`}
                    >
                      <p className="leading-7">{message.text}</p>
                      <p className={`text-[11px] mt-1 ${mine ? "text-teal-100" : "text-slate-400"}`}>
                        {message.sender || "ناشناس"} - {formatTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendMessage} className="p-4 border-t border-slate-100 bg-white flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="متن پیام را بنویسید..."
              className="panel-input"
            />
            <button
              type="submit"
              disabled={sending || !text.trim() || (canManageCustomerConversations && !selectedCustomerId)}
              className="panel-btn-primary px-4"
            >
              {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              ارسال
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
