import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import moment from "jalali-moment";
import { Calendar, X, ChevronLeft, ChevronRight } from "lucide-react";

// تنظیم زبان مومنت روی فارسی
moment.locale("fa", { useGregorianParser: true, dialect: "persian-modern" });

// تعریف تایپ‌ها با استفاده از JSDoc برای سازگاری با JSX
/**
 * @typedef {Object} Props
 * @property {string | null} [value]
 * @property {(jDate: string | null) => void} [onChange]
 * @property {string} [placeholder]
 * @property {string} [className]
 * @property {string} [inputClassName]
 * @property {string} [format]
 * @property {string | null} [min]
 * @property {string | null} [max]
 * @property {boolean} [disabled]
 */

const DEFAULT_FORMAT = "jYYYY/jMM/jDD";

/**
 * تبدیل رشته ورودی به آبجکت مومنت فارسی
 * @param {string | null} [input]
 * @param {string} [format]
 * @returns {moment.Moment | null}
 */
function parseJalali(input, format = DEFAULT_FORMAT) {
  if (!input) return null;
  const normalized = input.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 1776 : 1632)));
  const m = moment(normalized, format, "fa", true);
  return m.isValid() && m.format(format) === normalized ? m : null;
}

/**
 * تبدیل آبجکت مومنت به رشته فارسی
 * @param {moment.Moment | null} m
 * @param {string} [format]
 * @returns {string | null}
 */
function formatJalali(m, format = DEFAULT_FORMAT) {
  if (!m) return null;
  return m.format(format);
}

/**
 * تولید آرایه روزهای ماه برای رندر در تقویم
 * @param {number} yearJ
 * @param {number} monthJ
 * @returns {Array<number | null>}
 */
function generateMonthGrid(yearJ, monthJ) {
  const ref = moment().jYear(yearJ).jMonth(monthJ).jDate(1);
  const start = ref.clone().startOf("jMonth");
  const end = ref.clone().endOf("jMonth");
  const firstWeekday = (start.day() + 1) % 7;
  const daysInMonth = end.jDate();
  const grid = [];
  for (let i = 0; i < firstWeekday; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  while (grid.length < 42) grid.push(null);
  return grid;
}

/**
 * کامپوننت اصلی انتخابگر تاریخ شمسی
 * @param {Props} props
 */
export default function JalaliDatePicker({
  id,
  value = null,
  onChange,
  placeholder = "تاریخ را انتخاب کنید...",
  className = "",
  inputClassName = "",
  format = DEFAULT_FORMAT,
  min = null,
  max = null,
  disabled = false,
}) {
  const [input, setInput] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  
  // مقدار اولیه تقویم بر اساس مقدار ورودی یا تاریخ امروز
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = value ? parseJalali(value, format) : moment();
    return initial ?? moment();
  });

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const popupRef = useRef(null);
  const today = moment();
  
  // تعیین موقعیت پاپ‌آپ (بالا یا پایین)
  const [placement, setPlacement] = useState("bottom");
  const [popupStyle, setPopupStyle] = useState({ visibility: "hidden" });

  // همگام‌سازی اینپوت با مقدار value خارجی
  useEffect(() => {
    setInput(value ?? "");
    inputRef.current?.setCustomValidity("");
    if (value) {
      const parsed = parseJalali(value, format);
      if (parsed) setCalendarMonth(parsed);
    }
  }, [value, format]);

  // بستن پاپ‌آپ با کلیک بیرون
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        !rootRef.current?.contains(e.target) &&
        !popupRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // محاسبه موقعیت پاپ‌آپ برای جلوگیری از خروج از صفحه
  const computePlacement = () => {
    const root = rootRef.current;
    const popup = popupRef.current;
    if (!root || !popup) return;

    const rect = root.getBoundingClientRect();
    const popupHeight = popup.offsetHeight || 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let chosen = "bottom";
    if (spaceBelow < popupHeight && spaceAbove > spaceBelow) {
      chosen = "top";
    }
    setPlacement(chosen);

    const margin = 8;
    const popupWidth = Math.min(320, window.innerWidth - margin * 2);
    const left = Math.min(
      Math.max(margin, rect.right - popupWidth),
      window.innerWidth - popupWidth - margin
    );
    const top = chosen === "bottom"
      ? rect.bottom + margin
      : Math.max(margin, rect.top - popupHeight - margin);

    setPopupStyle({
      position: "fixed",
      top,
      left,
      width: popupWidth,
      visibility: "visible",
    });
  };

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => computePlacement());
    }
  }, [open, calendarMonth]);

  useEffect(() => {
    const handler = () => {
      if (open) computePlacement();
    };
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open]);

  const commitInput = (raw) => {
    if (disabled) return;
    const trimmed = raw.trim();
    inputRef.current?.setCustomValidity("");
    if (!trimmed) {
      setInput("");
      if (onChange && value != null) onChange(null);
      return;
    }
    const m = parseJalali(trimmed, format);
    if (m) {
      const minDate = min ? parseJalali(min, format) : null;
      const maxDate = max ? parseJalali(max, format) : null;
      
      // بررسی محدودیت‌های حداقل و حداکثر
      if ((minDate && m.isBefore(minDate)) || (maxDate && m.isAfter(maxDate))) {
        inputRef.current?.setCustomValidity("تاریخ خارج از محدوده مجاز است.");
        return;
      }

      const formatted = formatJalali(m, format);
      setInput(formatted);
      if (onChange && formatted !== value) onChange(formatted);
      setCalendarMonth(m);
    } else {
      inputRef.current?.setCustomValidity("تاریخ شمسی معتبر وارد کنید؛ مانند ۱۴۰۵/۰۷/۲۳.");
    }
  };

  const selectDate = (day) => {
    if (disabled) return;
    inputRef.current?.setCustomValidity("");
    const m = calendarMonth.clone().jDate(day);
    const formatted = formatJalali(m, format);
    setInput(formatted);
    if (onChange) onChange(formatted);
    setOpen(false);
  };

  const showCalendar = () => {
    if (disabled) return;
    setPopupStyle({ visibility: "hidden" });
    setOpen(true);
  };

  const grid = generateMonthGrid(calendarMonth.jYear(), calendarMonth.jMonth());

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      {/* Input & Buttons */}
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            id={id}
            disabled={disabled}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.setCustomValidity(""); }}
            onBlur={() => commitInput(input)}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); commitInput(input); setOpen(false); }
            }}
            onFocus={showCalendar}
            placeholder={placeholder}
            className={`w-full border rounded-lg px-3 py-2 pr-9 text-right placeholder-gray-400 shadow-sm 
              focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100 ${inputClassName}`}
          />
          <button
            type="button"
            className="absolute left-2 top-2.5 w-5 h-5 p-0 text-gray-500 hover:text-indigo-600 transition"
            onMouseDown={event => event.preventDefault()}
            onClick={() => {
              if (disabled) return;
              if (open) {
                setOpen(false);
              } else {
                const p = parseJalali(input, format);
                if (p) setCalendarMonth(p);
                showCalendar();
              }
            }}
            aria-label="باز کردن تقویم"
          >
            <Calendar className="w-5 h-5" />
          </button>
        </div>
        {input && (
          <button
            type="button"
            onClick={() => {
              inputRef.current?.setCustomValidity("");
              setInput("");
              if (onChange) onChange(null);
            }}
            className="p-2 rounded-md border bg-white hover:bg-gray-50 transition"
            aria-label="پاک کردن"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        )}
      </div>

      {/* Calendar Popup */}
      {open && !disabled && createPortal(
        <div
          ref={popupRef}
          role="dialog"
          aria-label="انتخاب تاریخ"
          className="z-[1000] bg-blue-100 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 p-2"
          style={{
            ...popupStyle,
            transformOrigin: placement === "bottom" ? "top right" : "bottom right",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setCalendarMonth((c) => c.clone().subtract(1, "jMonth"))}
              className="p-1 rounded-full hover:bg-blue-600 text-gray-600"
              aria-label="ماه قبلی"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="font-semibold text-gray-800 text-sm">
              {calendarMonth.format("jMMMM jYYYY")}
            </div>
            <button
              type="button"
              onClick={() => setCalendarMonth((c) => c.clone().add(1, "jMonth"))}
              className="p-1 rounded-full hover:bg-blue-600 text-gray-600"
              aria-label="ماه بعدی"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 text-center text-xs text-gray-500 mb-1">
            {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((w) => (
              <div key={w} className="py-1 font-medium">
                {w}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1 text-sm">
            {grid.map((d, idx) => {
              const dayMoment = d ? calendarMonth.clone().jDate(d) : null;
              const isToday = dayMoment?.isSame(today, "day");
              const isSelected = input === formatJalali(dayMoment, format);
              
              const minDate = min ? parseJalali(min, format) : null;
              const maxDate = max ? parseJalali(max, format) : null;
              
              const isDisabled =
                (minDate && dayMoment?.isBefore(minDate)) ||
                (maxDate && dayMoment?.isAfter(maxDate));

              return (
                <button
                  type="button"
                  key={idx}
                  disabled={!!isDisabled || !d}
                  onClick={() => d && selectDate(d)}
                  className={`h-7 flex items-center justify-center rounded-full transition
                    ${!d ? "opacity-0 pointer-events-none" : ""}
                    ${isDisabled ? "text-gray-300 cursor-not-allowed" : "hover:bg-blue-300"}
                    ${isToday ? "ring-2 ring-indigo-300" : ""}
                    ${isSelected ? "bg-indigo-500 text-white hover:bg-indigo-600" : ""}
                  `}
                  aria-label={d ? `روز ${d}` : undefined}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Today Button */}
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => {
                inputRef.current?.setCustomValidity("");
                const m = today.clone();
                const formatted = formatJalali(m, format);
                setInput(formatted);
                if (onChange) onChange(formatted);
                setCalendarMonth(m);
                setOpen(false);
              }}
              className="text-xs text-indigo-600 font-bold hover:underline"
            >
              امروز
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
