import React from "react";
import Select from "react-select";

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "انتخاب کنید",
  isClearable = true,
  isDisabled = false,
  isLoading = false,
  inputId,
  required = false,
  noOptionsMessage = "نتیجه ای یافت نشد",
}) {
  return (
    <Select
      inputId={inputId}
      required={required}
      isRtl
      isLoading={isLoading}
      loadingMessage={() => 'در حال دریافت…'}
      value={options.find((opt) => String(opt.value) === String(value)) || null}
      onChange={(selected) => onChange(selected ? selected.value : "")}
      options={options}
      placeholder={placeholder}
      isClearable={isClearable}
      isSearchable
      isDisabled={isDisabled}
      noOptionsMessage={() => noOptionsMessage}
      classNamePrefix="rs"
      styles={{
        control: (base, state) => ({
          ...base,
          minHeight: 42,
          borderRadius: 12,
          borderColor: state.isFocused ? "#0f766e" : "#cbd5e1",
          boxShadow: state.isFocused ? "0 0 0 2px #ccfbf1" : "none",
          '&:hover': { borderColor: "#0f766e" },
          direction: "rtl",
        }),
        menu: (base) => ({ ...base, zIndex: 40, direction: "rtl" }),
        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        placeholder: (base) => ({ ...base, color: "#94a3b8" }),
        singleValue: (base) => ({ ...base, color: "#0f172a" }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isSelected ? "#0f766e" : state.isFocused ? "#f1f5f9" : "white",
          color: state.isSelected ? "white" : "#0f172a",
          cursor: "pointer",
        }),
      }}
      menuPortalTarget={document.body}
    />
  );
}
