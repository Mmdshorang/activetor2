export const PAGE_DEFINITIONS = [
  { key: "dashboard", path: "/dashboard", label: "داشبورد" },
  { key: "users", path: "/users", label: "کاربران" },
  { key: "customers", path: "/customers", label: "مشتریان" },
  { key: "versions", path: "/versions", label: "نسخه ها" },
  { key: "licenses", path: "/licenses", label: "لایسنس ها" },
  { key: "contracts", path: "/contracts", label: "قراردادها" },
  { key: "messages", path: "/messages", label: "پیام ها" },
  { key: "renewalRequests", path: "/renewal-requests", label: "درخواست تمدید" },
];

export const ALL_PAGE_KEYS = PAGE_DEFINITIONS.map((item) => item.key);

export const ROLE_DEFAULT_PAGE_PERMISSIONS = {
  admin: [...ALL_PAGE_KEYS],
  user: ["dashboard", "users", "customers", "versions", "licenses", "contracts", "messages", "renewalRequests"],
  agent: ["dashboard", "customers", "contracts", "messages", "renewalRequests"],
  customer: ["dashboard", "licenses", "contracts", "messages", "renewalRequests"],
};
